[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$SkipHealthCheck,
    [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

function Invoke-Compose {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    & docker compose @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

if (-not $SkipBuild) {
    # Pull only external base images; local application images are rebuilt below.
    Invoke-Compose pull
    Invoke-Compose build --pull backend frontend celery_worker celery_beat
}

# `up` replaces changed containers but preserves named volumes. It never uses
# `down -v`, so PostgreSQL data and the evidence vault survive an update.
Invoke-Compose up --detach --remove-orphans

if ($SkipHealthCheck) {
    Write-Host "Update completed. Health checks were skipped by request."
    exit 0
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
    $services = Invoke-Compose ps --format json | ConvertFrom-Json
    $unhealthy = @($services | Where-Object {
        $_.State -ne "running" -or ($_.Health -and $_.Health -ne "healthy")
    })
    if ($unhealthy.Count -eq 0 -and $services.Count -ge 7) {
        Write-Host "Update completed. All services are running and healthy."
        exit 0
    }
    Start-Sleep -Seconds 3
} while ((Get-Date) -lt $deadline)

Invoke-Compose ps
throw "Timed out waiting for healthy services. Inspect logs with: docker compose logs --tail=200"
