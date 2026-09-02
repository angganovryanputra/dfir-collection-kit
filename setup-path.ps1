# Setup Environment PATH
$goPath = "C:\Users\angga\go\bin"
$pythonPath = "C:\Users\angga\AppData\Local\Programs\Python\Python313"
$pythonScripts = "C:\Users\angga\AppData\Local\Programs\Python\Python313\Scripts"
$codeGraphPath = "C:\Users\angga\AppData\Local\codegraph\current\bin"

$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")

# Add Go
if ($currentPath -notlike "*$goPath*") {
    $currentPath = "$goPath;$currentPath"
    Write-Host "Added Go to PATH"
}

# Add Python
if ($currentPath -notlike "*$pythonPath*") {
    $currentPath = "$pythonPath;$currentPath"
    Write-Host "Added Python to PATH"
}

# Add Python Scripts
if ($currentPath -notlike "*$pythonScripts*") {
    $currentPath = "$pythonScripts;$currentPath"
    Write-Host "Added Python Scripts to PATH"
}

# Add CodeGraph
if ($currentPath -notlike "*$codeGraphPath*") {
    $currentPath = "$codeGraphPath;$currentPath"
    Write-Host "Added CodeGraph to PATH"
}

[Environment]::SetEnvironmentVariable("Path", $currentPath, "User")
Write-Host "PATH updated successfully"

# Set Go environment
[Environment]::SetEnvironmentVariable("GOROOT", "C:\Users\angga\go", "User")
[Environment]::SetEnvironmentVariable("GOPATH", "C:\Users\angga\go-workspace", "User")

Write-Host "`nSetup complete! Open a NEW terminal and verify:"
Write-Host "  go version"
Write-Host "  python --version"
Write-Host "  pytest --version"
Write-Host "  codegraph --version"
