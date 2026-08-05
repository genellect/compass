[CmdletBinding()]
param(
    [string] $ProjectId = 'compass-auth-502802'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$apiDirectory = Join-Path $root 'services\library-api'
$python = Join-Path $apiDirectory '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    throw 'The library-api Python environment was not found.'
}

$gcloud = (Get-Command gcloud.cmd -ErrorAction Stop).Source
$listener = Get-NetTCPConnection -LocalPort 8769 -State Listen -ErrorAction SilentlyContinue
if ($null -ne $listener) {
    throw 'TCP port 8769 is already in use. Stop the existing listener first.'
}

$previousProject = [Environment]::GetEnvironmentVariable(
    'PHASE7_PRODUCTION_GCP_PROJECT_ID',
    'Process'
)
$previousGcloud = [Environment]::GetEnvironmentVariable(
    'PHASE7_PRODUCTION_GCLOUD_EXECUTABLE',
    'Process'
)
$previousAccessToken = [Environment]::GetEnvironmentVariable(
    'CLOUDSDK_AUTH_ACCESS_TOKEN',
    'Process'
)
$accessToken = (& $gcloud auth application-default print-access-token 2>$null)
$accessToken = (($accessToken -join '').Trim())
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($accessToken)) {
    throw 'ADC token acquisition failed. Re-run Google Cloud application-default login.'
}

try {
    [Environment]::SetEnvironmentVariable(
        'PHASE7_PRODUCTION_GCP_PROJECT_ID',
        $ProjectId,
        'Process'
    )
    [Environment]::SetEnvironmentVariable(
        'PHASE7_PRODUCTION_GCLOUD_EXECUTABLE',
        $gcloud,
        'Process'
    )
    [Environment]::SetEnvironmentVariable(
        'CLOUDSDK_AUTH_ACCESS_TOKEN',
        $accessToken,
        'Process'
    )
    Push-Location $apiDirectory
    try {
        & $python -m scripts.phase7_production_drive_reauth_server
        if ($LASTEXITCODE -ne 0) {
            throw "Production Drive re-authorization stopped with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    [Environment]::SetEnvironmentVariable(
        'PHASE7_PRODUCTION_GCP_PROJECT_ID',
        $previousProject,
        'Process'
    )
    [Environment]::SetEnvironmentVariable(
        'PHASE7_PRODUCTION_GCLOUD_EXECUTABLE',
        $previousGcloud,
        'Process'
    )
    [Environment]::SetEnvironmentVariable(
        'CLOUDSDK_AUTH_ACCESS_TOKEN',
        $previousAccessToken,
        'Process'
    )
    $accessToken = $null
}
