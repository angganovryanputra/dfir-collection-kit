[CmdletBinding()]
param(
    [switch]$Development,
    [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$composeFiles = @("-f", "docker-compose.yml")
if ($Development) {
    $composeFiles += @("-f", "docker-compose.dev.yml")
    $healthUrl = "http://localhost:8000/api/v1/status/health"
    $frontendUrl = "http://localhost:5173/"
} else {
    $healthUrl = "https://localhost/api/v1/status/health"
    $frontendUrl = "https://localhost/"
}

function Invoke-Compose {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    & docker compose @composeFiles @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose command failed with exit code $LASTEXITCODE."
    }
}

function Invoke-HttpProbe {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [switch]$TextResponse
    )

    # Windows PowerShell 5 lacks -SkipCertificateCheck and can fail while
    # parsing modern Vite HTML. Use the inbox curl binary there; PowerShell 7
    # uses native cmdlets.
    if ($PSVersionTable.PSVersion.Major -lt 7) {
        $curlArgs = @("--fail", "--silent", "--show-error")
        if (-not $Development) { $curlArgs += "--insecure" }
        $response = & curl.exe @curlArgs $Uri
        if ($LASTEXITCODE -ne 0) {
            throw "HTTP probe failed for $Uri with exit code $LASTEXITCODE."
        }
        return ($response -join [Environment]::NewLine)
    }

    $webArgs = @{ Uri = $Uri; TimeoutSec = 10; ErrorAction = "Stop" }
    if (-not $Development) {
        $webArgs.SkipCertificateCheck = $true
    }
    if ($TextResponse) {
        return (Invoke-WebRequest @webArgs).Content
    }
    return Invoke-RestMethod @webArgs
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
    try {
        $health = Invoke-HttpProbe -Uri $healthUrl
        if ($health) { break }
    } catch {
        Start-Sleep -Seconds 3
    }
} while ((Get-Date) -lt $deadline)

if (-not $health) {
    Invoke-Compose ps
    throw "Health endpoint did not respond before timeout: $healthUrl"
}

$page = Invoke-HttpProbe -Uri $frontendUrl -TextResponse
if ($page -notmatch '<div id="root">') {
    throw "Frontend smoke test failed: expected the React root document."
}

$services = Invoke-Compose ps --format json | ConvertFrom-Json
$failed = @($services | Where-Object { $_.State -ne "running" })
if ($failed.Count -gt 0) {
    Invoke-Compose ps
    throw "One or more services are not running."
}

Write-Host "Smoke test passed: health API, frontend document, and service states verified."
