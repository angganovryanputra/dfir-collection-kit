param(
    [switch]$Force
)

$root = Split-Path -Parent $PSScriptRoot
$hook = Join-Path $root '.githooks/pre-commit'
if (-not (Test-Path -LiteralPath $hook)) {
    throw "Hook template not found: $hook"
}

if (-not $Force -and -not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'git is required to enable repository hooks.'
}

git -C $root config core.hooksPath .githooks
Write-Host 'Enabled DFIRCollectionKit pre-commit private-key scan.' -ForegroundColor Green
