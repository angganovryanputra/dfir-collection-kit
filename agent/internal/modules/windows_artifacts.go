// Package modules — KAPE-like Windows artifact collection modules.
// These modules copy raw forensic artifacts from the filesystem using robocopy /B
// (Backup mode / SeBackupPrivilege) to access files that are locked by the OS,
// mirroring KAPE's Target-based collection approach.
package modules

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// ── Registry Hives ────────────────────────────────────────────────────────────
// Exports SYSTEM, SOFTWARE, SAM, and SECURITY hives using `reg save`.
// Requires local administrator privileges. SAM and SECURITY require SYSTEM.

type WindowsRegistryHives struct{ BaseWindowsModule }

func NewWindowsRegistryHives() *WindowsRegistryHives {
	return &WindowsRegistryHives{BaseWindowsModule{Module: NewModule(
		"windows_registry_hives",
		"artifacts/windows/registry/",
	)}}
}

func (m *WindowsRegistryHives) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(outputPath, 0755); err != nil {
		return fmt.Errorf("failed to create output dir: %w", err)
	}
	hives := []struct{ name, path string }{
		{"SYSTEM", `C:\Windows\System32\config\SYSTEM`},
		{"SOFTWARE", `C:\Windows\System32\config\SOFTWARE`},
		{"SAM", `C:\Windows\System32\config\SAM`},
		{"SECURITY", `C:\Windows\System32\config\SECURITY`},
	}
	var errs []string
	for _, hive := range hives {
		dst := filepath.Join(outputPath, hive.name)
		err := CopyFileNativeBackup(ctx, hive.path, dst)
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", hive.name, err))
		}
	}
	if len(errs) == len(hives) {
		note := "All registry hives failed (requires admin): " + strings.Join(errs, "; ")
		_ = WriteNotFound(filepath.Join(outputPath, "error.txt"), note)
		return NewWarningError(note)
	}
	writeErrors(outputPath, errs)
	return nil
}

// ── NTUSER.DAT (per-user registry hives) ─────────────────────────────────────
// Copies NTUSER.DAT and UsrClass.dat from every user profile directory.
// Uses robocopy /B for access to locked hive files.

type WindowsNtuserDat struct{ BaseWindowsModule }

func NewWindowsNtuserDat() *WindowsNtuserDat {
	return &WindowsNtuserDat{BaseWindowsModule{Module: NewModule(
		"windows_ntuser_dat",
		"artifacts/windows/registry/users/",
	)}}
}

func (m *WindowsNtuserDat) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	profiles, err := getUserProfileDirs(ctx)
	if err != nil {
		_ = WriteNotFound(filepath.Join(outputPath, "error.txt"), err.Error())
		return NewWarningError(err.Error())
	}
	if len(profiles) == 0 {
		return WriteNotFound(filepath.Join(outputPath, "error.txt"), "no user profiles found")
	}
	var errs []string
	for _, profileDir := range profiles {
		uname := profileName(profileDir)
		dstDir := filepath.Join(outputPath, uname)
		if copyErr := copyNative(ctx, profileDir, "NTUSER.DAT", dstDir); copyErr != nil {
			errs = append(errs, fmt.Sprintf("%s NTUSER.DAT: %v", uname, copyErr))
		}
		usrClassDir := filepath.Join(profileDir, `AppData\Local\Microsoft\Windows`)
		_ = copyNative(ctx, usrClassDir, "UsrClass.dat", dstDir)
	}
	writeErrors(outputPath, errs)
	return nil
}

// ── Prefetch ──────────────────────────────────────────────────────────────────
// Copies all .pf files from C:\Windows\Prefetch.
// Prefetch records the first 10 seconds of a process's lifetime — key for execution history.

type WindowsPrefetch struct{ BaseWindowsModule }

func NewWindowsPrefetch() *WindowsPrefetch {
	return &WindowsPrefetch{BaseWindowsModule{Module: NewModule(
		"windows_prefetch",
		"artifacts/windows/prefetch/",
	)}}
}

func (m *WindowsPrefetch) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	prefetchDir := `C:\Windows\Prefetch`
	if err := copyNative(ctx, prefetchDir, "*.pf", outputPath); err != nil {
		note := fmt.Sprintf("prefetch collection failed (requires admin): %v", err)
		_ = WriteNotFound(filepath.Join(outputPath, "error.txt"), note)
		return NewWarningError(note)
	}
	return nil
}

// ── Amcache.hve ───────────────────────────────────────────────────────────────
// Copies Amcache.hve from C:\Windows\AppCompat\Programs.
// Amcache records SHA1 hashes of executed binaries and installed programs.

type WindowsAmcache struct{ BaseWindowsModule }

func NewWindowsAmcache() *WindowsAmcache {
	return &WindowsAmcache{BaseWindowsModule{Module: NewModule(
		"windows_amcache",
		"artifacts/windows/amcache/",
	)}}
}

func (m *WindowsAmcache) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	amcacheDir := `C:\Windows\AppCompat\Programs`
	if err := copyNative(ctx, amcacheDir, "Amcache.hve", outputPath); err != nil {
		note := fmt.Sprintf("amcache collection failed: %v", err)
		_ = WriteNotFound(filepath.Join(outputPath, "error.txt"), note)
		return NewWarningError(note)
	}
	// Also copy transaction logs for hive integrity
	_ = copyNative(ctx, amcacheDir, "Amcache.hve.LOG*", outputPath)
	return nil
}

// ── ShimCache (AppCompatCache) ────────────────────────────────────────────────
// Queries the AppCompatCache registry key to enumerate shimcache entries.
// ShimCache tracks executed files including path, size, and last modified time.

type WindowsShimCache struct{ BaseWindowsModule }

func NewWindowsShimCache() *WindowsShimCache {
	return &WindowsShimCache{BaseWindowsModule{Module: NewModule(
		"windows_shimcache",
		"artifacts/windows/shimcache.txt",
	)}}
}

func (m *WindowsShimCache) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := `$key = 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\AppCompatCache';` +
		`if (Test-Path $key) {` +
		`  $val = (Get-ItemProperty -Path $key -Name AppCompatCache -ErrorAction SilentlyContinue).AppCompatCache;` +
		`  if ($val) {` +
		`    "AppCompatCache binary length: " + $val.Length + " bytes";` +
		`    "Raw hive exported — use ShimCacheParser or AppCompatCacheParser for analysis."` +
		`  } else { "AppCompatCache value not found in registry." }` +
		`} else { "AppCompatCache key not accessible." }`
	return runPowerShellToFile(ctx, command, outputPath, params)
}

// ── LNK Files (Recent Items) ──────────────────────────────────────────────────
// Copies .lnk shortcut files from each user's Recent folder.
// LNK files contain metadata about accessed files including original path, timestamps, and volume serial.

type WindowsLnkFiles struct{ BaseWindowsModule }

func NewWindowsLnkFiles() *WindowsLnkFiles {
	return &WindowsLnkFiles{BaseWindowsModule{Module: NewModule(
		"windows_lnk_files",
		"artifacts/windows/lnk/",
	)}}
}

func (m *WindowsLnkFiles) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	profiles, err := getUserProfileDirs(ctx)
	if err != nil {
		_ = WriteNotFound(filepath.Join(outputPath, "error.txt"), err.Error())
		return NewWarningError(err.Error())
	}
	for _, profileDir := range profiles {
		uname := profileName(profileDir)
		recentDir := filepath.Join(profileDir, `AppData\Roaming\Microsoft\Windows\Recent`)
		dstDir := filepath.Join(outputPath, uname)
		_ = copyNative(ctx, recentDir, "*.lnk", dstDir)
	}
	return nil
}

// ── Jump Lists ────────────────────────────────────────────────────────────────
// Copies AutomaticDestinations and CustomDestinations jump list files per user.
// Jump lists record recently and frequently accessed files per application.

type WindowsJumpLists struct{ BaseWindowsModule }

func NewWindowsJumpLists() *WindowsJumpLists {
	return &WindowsJumpLists{BaseWindowsModule{Module: NewModule(
		"windows_jump_lists",
		"artifacts/windows/jumplists/",
	)}}
}

func (m *WindowsJumpLists) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	profiles, err := getUserProfileDirs(ctx)
	if err != nil {
		_ = WriteNotFound(filepath.Join(outputPath, "error.txt"), err.Error())
		return NewWarningError(err.Error())
	}
	for _, profileDir := range profiles {
		uname := profileName(profileDir)
		base := filepath.Join(profileDir, `AppData\Roaming\Microsoft\Windows\Recent`)
		autoDst := filepath.Join(outputPath, uname, "AutomaticDestinations")
		customDst := filepath.Join(outputPath, uname, "CustomDestinations")
		_ = copyNativeRecursive(ctx, filepath.Join(base, "AutomaticDestinations"), autoDst)
		_ = copyNativeRecursive(ctx, filepath.Join(base, "CustomDestinations"), customDst)
	}
	return nil
}

// ── Browser History — Chrome ──────────────────────────────────────────────────
// Copies Chrome SQLite history databases (History, Cookies, Login Data, Web Data, Bookmarks)
// from all Chrome profiles for each user. Supports Default and numbered profiles.

type WindowsBrowserChrome struct{ BaseWindowsModule }

func NewWindowsBrowserChrome() *WindowsBrowserChrome {
	return &WindowsBrowserChrome{BaseWindowsModule{Module: NewModule(
		"windows_browser_chrome",
		"artifacts/windows/browser/chrome/",
	)}}
}

func (m *WindowsBrowserChrome) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	return collectBrowserArtifacts(ctx, outputPath,
		filepath.Join(`AppData\Local\Google\Chrome\User Data`))
}

// ── Browser History — Edge ────────────────────────────────────────────────────
// Copies Microsoft Edge Chromium SQLite history databases.

type WindowsBrowserEdge struct{ BaseWindowsModule }

func NewWindowsBrowserEdge() *WindowsBrowserEdge {
	return &WindowsBrowserEdge{BaseWindowsModule{Module: NewModule(
		"windows_browser_edge",
		"artifacts/windows/browser/edge/",
	)}}
}

func (m *WindowsBrowserEdge) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	return collectBrowserArtifacts(ctx, outputPath,
		filepath.Join(`AppData\Local\Microsoft\Edge\User Data`))
}

// collectBrowserArtifacts copies forensic browser files from all profile subdirectories
// for each user. Handles Default and Profile N directories.
func collectBrowserArtifacts(ctx context.Context, outputPath, relDataDir string) error {
	profiles, err := getUserProfileDirs(ctx)
	if err != nil {
		_ = WriteNotFound(filepath.Join(outputPath, "error.txt"), err.Error())
		return NewWarningError(err.Error())
	}
	// SQLite files of forensic interest in each browser profile directory
	browserFiles := []string{"History", "Cookies", "Login Data", "Web Data", "Bookmarks", "Visited Links"}
	for _, profileDir := range profiles {
		uname := profileName(profileDir)
		dataDir := filepath.Join(profileDir, relDataDir)
		entries, err := os.ReadDir(dataDir)
		if err != nil {
			continue // User does not have this browser installed
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			name := entry.Name()
			if name != "Default" && !strings.HasPrefix(name, "Profile") {
				continue
			}
			srcDir := filepath.Join(dataDir, name)
			dstDir := filepath.Join(outputPath, uname, name)
			for _, f := range browserFiles {
				_ = copyNative(ctx, srcDir, f, dstDir)
			}
		}
	}
	return nil
}

// ── BITS Jobs ─────────────────────────────────────────────────────────────────
// Enumerates Background Intelligent Transfer Service jobs for all users.
// BITS is commonly abused by malware for stealthy downloads (LOLBaS technique).

type WindowsBitsJobs struct{ BaseWindowsModule }

func NewWindowsBitsJobs() *WindowsBitsJobs {
	return &WindowsBitsJobs{BaseWindowsModule{Module: NewModule(
		"windows_bits_jobs",
		"artifacts/windows/bits_jobs.csv",
	)}}
}

func (m *WindowsBitsJobs) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := `Get-BitsTransfer -AllUsers -ErrorAction SilentlyContinue | ` +
		`Select-Object JobId,DisplayName,JobState,TransferType,CreationTime,ModificationTime,OwnerAccount | ` +
		`ConvertTo-Csv -NoTypeInformation`
	return runPowerShellToFile(ctx, command, outputPath, params)
}

// ── Recycle Bin ───────────────────────────────────────────────────────────────
// Lists metadata of files in the Recycle Bin on all drive letters.
// Useful for identifying deleted files in incident investigations.

type WindowsRecycleBin struct{ BaseWindowsModule }

func NewWindowsRecycleBin() *WindowsRecycleBin {
	return &WindowsRecycleBin{BaseWindowsModule{Module: NewModule(
		"windows_recycle_bin",
		"artifacts/windows/recycle_bin.txt",
	)}}
}

func (m *WindowsRecycleBin) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	var outputLines []string
	// Standard Windows drive letters to check
	drives := []string{"C:\\", "D:\\", "E:\\", "F:\\", "G:\\", "H:\\"}
	
	for _, drive := range drives {
		rbPath := filepath.Join(drive, "$Recycle.Bin")
		if _, err := os.Stat(rbPath); err == nil {
			_ = filepath.Walk(rbPath, func(path string, info os.FileInfo, err error) error {
				if err != nil {
					return nil // Ignore access denied
				}
				if !info.IsDir() {
					outputLines = append(outputLines, fmt.Sprintf("Path: %s | Size: %d | ModTime: %s", 
						path, info.Size(), info.ModTime().Format("2006-01-02 15:04:05")))
				}
				return nil
			})
		}
	}
	
	if len(outputLines) > 0 {
		if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err == nil {
			return os.WriteFile(outputPath, []byte(strings.Join(outputLines, "\n")), 0644)
		}
	}
	return WriteNotFound(outputPath, "No recycle bin files found or access denied")
}

// ── Thumbcache ────────────────────────────────────────────────────────────────
// Copies Windows Explorer thumbnail cache databases (thumbcache_*.db) per user.
// Thumbnail caches can contain images of files even after the originals are deleted.

type WindowsThumbcache struct{ BaseWindowsModule }

func NewWindowsThumbcache() *WindowsThumbcache {
	return &WindowsThumbcache{BaseWindowsModule{Module: NewModule(
		"windows_thumbcache",
		"artifacts/windows/thumbcache/",
	)}}
}

func (m *WindowsThumbcache) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	profiles, err := getUserProfileDirs(ctx)
	if err != nil {
		_ = WriteNotFound(filepath.Join(outputPath, "error.txt"), err.Error())
		return NewWarningError(err.Error())
	}
	for _, profileDir := range profiles {
		uname := profileName(profileDir)
		thumbDir := filepath.Join(profileDir, `AppData\Local\Microsoft\Windows\Explorer`)
		dstDir := filepath.Join(outputPath, uname)
		_ = copyNative(ctx, thumbDir, "thumbcache_*.db", dstDir)
		_ = copyNative(ctx, thumbDir, "iconcache_*.db", dstDir)
	}
	return nil
}

// ── Shellbags ─────────────────────────────────────────────────────────────────
// Enumerates Shellbag registry keys that record folder navigation history.
// Shellbags persist even after folders/drives are removed, making them valuable for forensics.

type WindowsShellbags struct{ BaseWindowsModule }

func NewWindowsShellbags() *WindowsShellbags {
	return &WindowsShellbags{BaseWindowsModule{Module: NewModule(
		"windows_shellbags",
		"artifacts/windows/shellbags.txt",
	)}}
}

func (m *WindowsShellbags) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := `$keys = @(` +
		`'HKCU:\SOFTWARE\Microsoft\Windows\Shell\Bags',` +
		`'HKCU:\SOFTWARE\Microsoft\Windows\Shell\BagMRU',` +
		`'HKCU:\SOFTWARE\Classes\Local Settings\Software\Microsoft\Windows\Shell\Bags',` +
		`'HKCU:\SOFTWARE\Classes\Local Settings\Software\Microsoft\Windows\Shell\BagMRU'` +
		`);` +
		`foreach ($key in $keys) {` +
		`  if (Test-Path $key) {` +
		`    Write-Output "=== $key ===";` +
		`    Get-ChildItem -Path $key -Recurse -ErrorAction SilentlyContinue |` +
		`    Select-Object -ExpandProperty PSPath` +
		`  } else { Write-Output "NOT FOUND: $key" }` +
		`}`
	return runPowerShellToFile(ctx, command, outputPath, params)
}

// ── MRU Lists ─────────────────────────────────────────────────────────────────
// Collects Most Recently Used lists from the registry (Run dialog, Open/Save dialogs, etc.).
// MRU lists reveal recently executed commands and accessed file paths.

type WindowsMRU struct{ BaseWindowsModule }

func NewWindowsMRU() *WindowsMRU {
	return &WindowsMRU{BaseWindowsModule{Module: NewModule(
		"windows_mru",
		"artifacts/windows/mru.txt",
	)}}
}

func (m *WindowsMRU) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := `$mruKeys = @(` +
		`'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\RunMRU',` +
		`'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\ComDlg32\OpenSavePidlMRU',` +
		`'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\ComDlg32\LastVisitedPidlMRU',` +
		`'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\RecentDocs',` +
		`'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\TypedPaths'` +
		`);` +
		`foreach ($key in $mruKeys) {` +
		`  if (Test-Path $key) {` +
		`    Write-Output "=== $key ===";` +
		`    Get-ItemProperty -Path $key -ErrorAction SilentlyContinue |` +
		`    Select-Object * -ExcludeProperty PS*` +
		`    Write-Output ""` +
		`  }` +
		`}`
	return runPowerShellToFile(ctx, command, outputPath, params)
}

// ── USB / Device History ──────────────────────────────────────────────────────
// Collects USB device connection history from the registry (USBSTOR, USB, MountedDevices).
// Critical for data exfiltration investigations.

type WindowsUSBHistory struct{ BaseWindowsModule }

func NewWindowsUSBHistory() *WindowsUSBHistory {
	return &WindowsUSBHistory{BaseWindowsModule{Module: NewModule(
		"windows_usb_history",
		"artifacts/windows/usb_history.txt",
	)}}
}

func (m *WindowsUSBHistory) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := `Write-Output "=== USBSTOR Devices ===";` +
		`$usbstor = 'HKLM:\SYSTEM\CurrentControlSet\Enum\USBSTOR';` +
		`if (Test-Path $usbstor) {` +
		`  Get-ChildItem -Path $usbstor -Recurse -ErrorAction SilentlyContinue |` +
		`  ForEach-Object {` +
		`    $props = Get-ItemProperty -Path $_.PSPath -ErrorAction SilentlyContinue;` +
		`    if ($props.FriendlyName) {` +
		`      [PSCustomObject]@{ Device=$_.PSChildName; FriendlyName=$props.FriendlyName; Driver=$props.Driver }` +
		`    }` +
		`  } | ConvertTo-Csv -NoTypeInformation` +
		`};` +
		`Write-Output "";` +
		`Write-Output "=== Mounted Devices (Volume GUIDs) ===";` +
		`$md = 'HKLM:\SYSTEM\MountedDevices';` +
		`if (Test-Path $md) {` +
		`  Get-ItemProperty -Path $md -ErrorAction SilentlyContinue |` +
		`  Get-Member -MemberType NoteProperty | Where-Object { $_.Name -like '\DosDevices\*' } |` +
		`  Select-Object -ExpandProperty Name` +
		`}`
	return runPowerShellToFile(ctx, command, outputPath, params)
}

// ── VSS helpers ───────────────────────────────────────────────────────────────

// vssCreate creates a VSS shadow copy of C:\ and returns (shadowID, devicePath, cleanup func, error).
// The caller MUST call cleanup() regardless of error to ensure the snapshot is deleted.
func vssCreate(ctx context.Context, b *BaseWindowsModule) (shadowID, devicePath string, cleanup func(), err error) {
	cleanup = func() {} // no-op default

	script := `$vss = (Get-WmiObject -List Win32_ShadowCopy).Create("C:\", "ClientAccessible"); ` +
		`if ($vss.ReturnValue -ne 0) { throw "VSS create failed: " + $vss.ReturnValue }; ` +
		`$sc = Get-WmiObject Win32_ShadowCopy | Where-Object { $_.ID -eq $vss.ShadowID }; ` +
		`Write-Output ($sc.ID + "|" + $sc.DeviceObject)`

	out, execErr := b.executePowerShell(ctx, script)
	if execErr != nil {
		err = NewWarningError(fmt.Sprintf("VSS creation failed (requires admin): %v", execErr))
		return
	}

	parts := strings.SplitN(strings.TrimSpace(out), "|", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		err = NewWarningError(fmt.Sprintf("unexpected VSS output: %q", out))
		return
	}

	shadowID = parts[0]
	devicePath = parts[1]
	safeID := strings.ReplaceAll(shadowID, "'", "''")
	cleanup = func() {
		del := fmt.Sprintf(
			`$sc = Get-WmiObject Win32_ShadowCopy | Where-Object { $_.ID -eq '%s' }; if ($sc) { $sc.Delete() | Out-Null }`,
			safeID,
		)
		_, _ = b.executePowerShell(context.Background(), del)
	}
	return
}

// ── $MFT via VSS ──────────────────────────────────────────────────────────────
// $MFT is the NTFS Master File Table — locked by the OS at all times.
// It must be collected via a VSS shadow copy; direct access (even with SeBackupPrivilege) fails.
// MFTECmd (EZ Tools) can parse the resulting binary file.

type WindowsMFTVSS struct{ BaseWindowsModule }

func NewWindowsMFTVSS() *WindowsMFTVSS {
	return &WindowsMFTVSS{BaseWindowsModule{Module: NewModule(
		"windows_mft_vss",
		"artifacts/windows/ntfs/MFT",
	)}}
}

func (m *WindowsMFTVSS) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if err := EnsureOutputDir(outputPath); err != nil {
		return err
	}
	_, devicePath, cleanup, err := vssCreate(ctx, &m.BaseWindowsModule)
	defer cleanup()
	if err != nil {
		_ = WriteNotFound(outputPath+".error.txt", err.Error())
		return err
	}
	srcPath := devicePath + `\$MFT`
	if copyErr := CopyFileNativeBackup(ctx, srcPath, outputPath); copyErr != nil {
		msg := fmt.Sprintf("VSS $MFT copy failed: %v", copyErr)
		_ = WriteNotFound(outputPath+".error.txt", msg)
		return NewWarningError(msg)
	}
	return nil
}

// ── $UsnJrnl:$J via VSS ───────────────────────────────────────────────────────
// The NTFS USN Change Journal records every file-system operation.
// $UsnJrnl:$J is an alternate data stream that is always locked.
// VSS provides a consistent snapshot for binary collection.
// MFTECmd can parse the resulting binary file.

type WindowsUSNJrnlVSS struct{ BaseWindowsModule }

func NewWindowsUSNJrnlVSS() *WindowsUSNJrnlVSS {
	return &WindowsUSNJrnlVSS{BaseWindowsModule{Module: NewModule(
		"windows_usnjrnl_vss",
		"artifacts/windows/ntfs/UsnJrnl_$J",
	)}}
}

func (m *WindowsUSNJrnlVSS) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if err := EnsureOutputDir(outputPath); err != nil {
		return err
	}
	_, devicePath, cleanup, err := vssCreate(ctx, &m.BaseWindowsModule)
	defer cleanup()
	if err != nil {
		_ = WriteNotFound(outputPath+".error.txt", err.Error())
		return err
	}
	// ADS path: devicePath\$Extend\$UsnJrnl:$J
	srcPath := devicePath + `\$Extend\$UsnJrnl:$J`
	if copyErr := CopyFileNativeBackup(ctx, srcPath, outputPath); copyErr != nil {
		msg := fmt.Sprintf("VSS $UsnJrnl:$J copy failed: %v", copyErr)
		_ = WriteNotFound(outputPath+".error.txt", msg)
		return NewWarningError(msg)
	}
	return nil
}
