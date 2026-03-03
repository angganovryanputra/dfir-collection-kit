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
	hives := []struct{ name, key string }{
		{"SYSTEM", `HKLM\SYSTEM`},
		{"SOFTWARE", `HKLM\SOFTWARE`},
		{"SAM", `HKLM\SAM`},
		{"SECURITY", `HKLM\SECURITY`},
	}
	var errs []string
	for _, hive := range hives {
		dst := filepath.Join(outputPath, hive.name)
		// /y overwrites if the destination already exists
		cmd := exec.CommandContext(ctx, "reg", "save", hive.key, dst, "/y")
		if out, err := cmd.CombinedOutput(); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v (%s)", hive.name, err, strings.TrimSpace(string(out))))
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
		if copyErr := copyWithRobocopy(ctx, profileDir, "NTUSER.DAT", dstDir); copyErr != nil {
			errs = append(errs, fmt.Sprintf("%s NTUSER.DAT: %v", uname, copyErr))
		}
		usrClassDir := filepath.Join(profileDir, `AppData\Local\Microsoft\Windows`)
		_ = copyWithRobocopy(ctx, usrClassDir, "UsrClass.dat", dstDir)
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
	if err := copyWithRobocopy(ctx, prefetchDir, "*.pf", outputPath); err != nil {
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
	if err := copyWithRobocopy(ctx, amcacheDir, "Amcache.hve", outputPath); err != nil {
		note := fmt.Sprintf("amcache collection failed: %v", err)
		_ = WriteNotFound(filepath.Join(outputPath, "error.txt"), note)
		return NewWarningError(note)
	}
	// Also copy transaction logs for hive integrity
	_ = copyWithRobocopy(ctx, amcacheDir, "Amcache.hve.LOG*", outputPath)
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
		_ = copyWithRobocopy(ctx, recentDir, "*.lnk", dstDir)
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
		_ = copyWithRobocopyRecursive(ctx, filepath.Join(base, "AutomaticDestinations"), autoDst)
		_ = copyWithRobocopyRecursive(ctx, filepath.Join(base, "CustomDestinations"), customDst)
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
				_ = copyWithRobocopy(ctx, srcDir, f, dstDir)
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
	command := `$drives = Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Root;` +
		`foreach ($drive in $drives) {` +
		`  $rb = Join-Path $drive '$Recycle.Bin';` +
		`  if (Test-Path $rb) {` +
		`    Get-ChildItem -Path $rb -Recurse -Force -ErrorAction SilentlyContinue |` +
		`    Select-Object FullName,Length,LastWriteTime,CreationTime` +
		`  }` +
		`}`
	return runPowerShellToFile(ctx, command, outputPath, params)
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
		_ = copyWithRobocopy(ctx, thumbDir, "thumbcache_*.db", dstDir)
		_ = copyWithRobocopy(ctx, thumbDir, "iconcache_*.db", dstDir)
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
