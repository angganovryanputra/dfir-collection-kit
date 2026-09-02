# Setup-DevEnvironment.ps1
# Run this script in PowerShell as Administrator to set up Go and Python/pytest

Write-Host "=== DFIR Collection Kit - Dev Environment Setup ===" -ForegroundColor Cyan

# 1. Install Go (using zip file method to avoid admin rights)
$goVersion = "1.23.0"
$goZip = "$env:USERPROFILE\Downloads\go$goVersion.windows-amd64.zip"
$goInstallDir = "$env:USERPROFILE\go"

if (-not (Test-Path "$goInstallDir\bin\go.exe")) {
    Write-Host "`n[1/4] Downloading Go $goVersion..." -ForegroundColor Yellow
    if (-not (Test-Path $goZip)) {
        Invoke-WebRequest -Uri "https://go.dev/dl/go$goVersion.windows-amd64.zip" -OutFile $goZip -UseBasicParsing
    }
    
    Write-Host "Extracting Go to $goInstallDir..." -ForegroundColor Yellow
    if (Test-Path $goInstallDir) { Remove-Item $goInstallDir -Recurse -Force }
    Expand-Archive -Path $goZip -DestinationPath $env:USERPROFILE -Force
    
    Write-Host "Go installed to $goInstallDir" -ForegroundColor Green
} else {
    Write-Host "`n[1/4] Go already installed at $goInstallDir" -ForegroundColor Green
}

# 2. Set Go environment variables
$goPath = "$goInstallDir\bin"
if ($env:Path -notlike "*$goPath*") {
    $env:Path = "$goPath;$env:Path"
}
$GOPATH = "$env:USERPROFILE\go-workspace"
if (-not (Test-Path $GOPATH)) { New-Item -ItemType Directory -Path $GOPATH -Force }
$env:GOPATH = $GOPATH
$env:GOROOT = $goInstallDir

# Set permanent environment variables
[Environment]::SetEnvironmentVariable("Path", "$goPath;" + [Environment]::GetEnvironmentVariable("Path", "User"), "User")
[Environment]::SetEnvironmentVariable("GOPATH", $GOPATH, "User")
[Environment]::SetEnvironmentVariable("GOROOT", $goInstallDir, "User")

# 3. Verify Python and pytest
Write-Host "`n[2/4] Verifying Python and pytest..." -ForegroundColor Yellow
$pythonCmd = "python"
try {
    $pythonVersion = & $pythonCmd --version 2>&1
    Write-Host "Python: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "Python not found in PATH. Installing..." -ForegroundColor Red
    winget install --id Python.Python.3.13 --accept-source-agreements --accept-package-agreements
}

# Ensure pytest is installed
& $pythonCmd -m pip install --quiet pytest pytest-asyncio pytest-cov
Write-Host "pytest installed: $(& $pythonCmd -m pytest --version 2>&1)" -ForegroundColor Green

# 4. Add Python Scripts to PATH
$pythonScripts = "$env:APPDATA\Python\Python313\Scripts"
if (Test-Path $pythonScripts) {
    if ($env:Path -notlike "*$pythonScripts*") {
        [Environment]::SetEnvironmentVariable("Path", "$pythonScripts;" + [Environment]::GetEnvironmentVariable("Path", "User"), "User")
        $env:Path = "$pythonScripts;$env:Path"
    }
    Write-Host "Python Scripts added to PATH: $pythonScripts" -ForegroundColor Green
}

# 5. Add CodeGraph to PATH
$codeGraphPath = "$env:LOCALAPPDATA\codegraph\current\bin"
if (Test-Path $codeGraphPath) {
    if ($env:Path -notlike "*$codeGraphPath*") {
        [Environment]::SetEnvironmentVariable("Path", "$codeGraphPath;" + [Environment]::GetEnvironmentVariable("Path", "User"), "User")
        $env:Path = "$codeGraphPath;$env:Path"
    }
    Write-Host "CodeGraph added to PATH: $codeGraphPath" -ForegroundColor Green
}

# 6. Add PostgreSQL bin to PATH (if installed)
$pgPaths = @(
    "C:\Program Files\PostgreSQL\16\bin",
    "C:\Program Files\PostgreSQL\15\bin",
    "C:\Program Files\PostgreSQL\14\bin"
)
foreach ($pgPath in $pgPaths) {
    if (Test-Path $pgPath) {
        if ($env:Path -notlike "*$pgPath*") {
            [Environment]::SetEnvironmentVariable("Path", "$pgPath;" + [Environment]::GetEnvironmentVariable("Path", "User"), "User")
            $env:Path = "$pgPath;$env:Path"
        }
        Write-Host "PostgreSQL added to PATH: $pgPath" -ForegroundColor Green
        break
    }
}

# 7. Verify everything
Write-Host "`n=== Verification ===" -ForegroundColor Cyan
Write-Host "Go: $((Get-Command go -ErrorAction SilentlyContinue).Source) - $(go version 2>&1)"
Write-Host "Python: $((Get-Command python -ErrorAction SilentlyContinue).Source) - $(python --version 2>&1)"
Write-Host "pytest: $(python -m pytest --version 2>&1)"
Write-Host "CodeGraph: $((Get-Command codegraph -ErrorAction SilentlyContinue).Source) - $(codegraph --version 2>&1)"
Write-Host "Docker: $((Get-Command docker -ErrorAction SilentlyContinue).Source) - $(docker --version 2>&1)"

Write-Host "`n=== Setup Complete! ===" -ForegroundColor Green
Write-Host "Open a NEW PowerShell terminal and run:" -ForegroundColor White
Write-Host "  go version" -ForegroundColor Yellow
Write-Host "  python --version" -ForegroundColor Yellow
Write-Host "  pytest --version" -ForegroundColor Yellow
Write-Host "  codegraph --version" -ForegroundColor Yellow
Write-Host "`nTo test the project:" -ForegroundColor White
Write-Host "  cd D:\DFIRCollectionKit" -ForegroundColor Yellow
Write-Host "  go test ./..." -ForegroundColor Yellow
Write-Host "  python -m pytest backend/tests/" -ForegroundColor Yellow
