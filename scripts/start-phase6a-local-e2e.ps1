[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int] $FrontendPort = 3000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$dockerWrapper = Join-Path $PSScriptRoot 'library-docker-dev.ps1'

function Get-LocalConfiguration {
    param([Parameter(Mandatory = $true)][string] $Name)

    $processValue = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if (-not [string]::IsNullOrWhiteSpace($processValue)) {
        return $processValue
    }
    return [Environment]::GetEnvironmentVariable($Name, 'User')
}

$clientId = Get-LocalConfiguration -Name 'GOOGLE_OAUTH_CLIENT_ID'
if ([string]::IsNullOrWhiteSpace($clientId)) {
    $clientId = Read-Host (
        'Paste the public Web OAuth Client ID (never a Client Secret or token)'
    )
}
if ($clientId -notmatch '^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$') {
    throw 'The value is not a valid Google Web OAuth Client ID.'
}

$env:PHASE6_AUTH_API_ENABLED = 'true'
$env:GOOGLE_OAUTH_CLIENT_ID = $clientId
$env:GOOGLE_OAUTH_CLIENT_IDS = ''
$env:ALLOWED_GOOGLE_HOSTED_DOMAINS = 'st.kitasato-u.ac.jp'
$env:CORS_ALLOWED_ORIGINS = (
    "http://127.0.0.1:${FrontendPort},http://localhost:${FrontendPort}"
)
$env:EXTERNAL_SIDE_EFFECTS_ENABLED = 'false'
$env:NEXT_DIST_DIR = '.next-phase6a'
$env:NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE = 'google'
$env:NEXT_PUBLIC_LIBRARY_API_BASE_URL = 'http://127.0.0.1:58000'
$env:NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID = $clientId
$env:NEXT_PUBLIC_LIBRARY_GOOGLE_HOSTED_DOMAIN = 'st.kitasato-u.ac.jp'

Push-Location $root
try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
        $dockerWrapper -Action Up
    if ($LASTEXITCODE -ne 0) {
        throw 'The isolated Phase 6A Docker stack did not start.'
    }

    Write-Host ''
    Write-Host 'Phase 6A local E2E is ready:'
    Write-Host "  http://127.0.0.1:${FrontendPort}/library-registration/"
    Write-Host ''
    Write-Host 'This run is authentication-only: do not press the registration submit button.'
    Write-Host 'The verified email/sub are not persisted by /phase6/auth/verify.'
    Write-Host 'Press Ctrl+C after the university-account and personal-Gmail checks.'
    Write-Host 'The registration containers will then be stopped; its volume is kept.'
    Write-Host ''

    & npm.cmd run dev -- --port $FrontendPort
    if ($LASTEXITCODE -ne 0) {
        throw "Next.js development server exited with code $LASTEXITCODE."
    }
}
finally {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
        $dockerWrapper -Action Down
    Pop-Location
}
