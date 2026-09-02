# DFIR Collection Kit - Dev Environment Setup (Windows)
# Run this script to set up Go, Python, pytest, and CodeGraph

Write-Host "=== DFIR Collection Kit - Dev Environment Setup ===" -ForegroundColor Cyan

# 1. Go Setup
$goPath = "C:\Users\angga\go\bin"
$goRoot = "C:\Users\angga\go"
$goWorkspace = "C:\Users\angga\go-workspace"

# Create Go workspace
if (-not (Test-Path $goWorkspace)) { New-Item -ItemType Directory -Path $goWorkspace -Force }

# Set Go environment variables
[Environment]::SetEnvironmentVariable("GOROOT", $goRoot, "User")
[Environment]::SetEnvironmentVariable("GOPATH", $goWorkspace, "User")
$env:GOROOT = $goRoot
$env:GOPATH = $goWorkspace

# 2. Python Setup
$pythonPath = "C:\Users\angga\AppData\Local\Programs\Python\Python313"
$pythonScripts = "C:\Users\angga\AppData\Local\Programs\Python\Python313\Scripts"

# 3. CodeGraph Setup
$codeGraphPath = "C:\Users\angga\AppData\Local\codegraph\current\bin"

# 4. Update PATH
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
$pathsToAdd = @($goPath, $pythonPath, $pythonScripts, $codeGraphPath)

foreach ($p in $pathsToAdd) {
    if ($currentPath -notlike "*$p*") {
        $currentPath = "$p;$currentPath"
        Write-Host "Added to PATH: $p" -ForegroundColor Green
    } else {
        Write-Host "Already in PATH: $p" -ForegroundColor Gray
    }
}

[Environment]::SetEnvironmentVariable("Path", $currentPath, "User")

# 5. Verify
Write-Host "`n=== Verification ===" -ForegroundColor Cyan
Write-Host "Go: $(go version 2>&1)" -ForegroundColor Yellow
Write-Host "Python: $(python --version 2>&1)" -ForegroundColor Yellow
Write-Host "pytest: $(python -m pytest --version 2>&1)" -ForegroundColor Yellow
Write-Host "CodeGraph: $(codegraph --version 2>&1)" -ForegroundColor Yellow

Write-Host "`n=== Setup Complete! ===" -ForegroundColor Green
Write-Host "Open a NEW PowerShell terminal and run:" -ForegroundColor White
Write-Host "  go version" -ForegroundColor Cyan
Write-Host "  python --version" -ForegroundColor Cyan
Write-Host "  pytest --version" -ForegroundColor Cyan
Write-Host "  codegraph --version" -ForegroundColor Cyan
Write-Host "`nTo test the project:" -ForegroundColor White
Write-Host "  cd D:\DFIRCollectionKit" -ForegroundColor Cyan
Write-Host "  go test ./..." -ForegroundColor Cyan
Write-Host "  python -m pytest backend/tests/" -ForegroundColor Cyan
