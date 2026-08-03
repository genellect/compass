[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$apiDirectory = Join-Path $root 'services\library-api'
$serverScript = Join-Path $apiDirectory 'scripts\phase7_drive_e2e_server.py'
$outputDirectory = Join-Path $root 'outputs\phase7-drive-e2e'

function Read-RequiredValue {
    param(
        [string] $Prompt,
        [switch] $Secret
    )

    if ($Secret) {
        $secure = Read-Host -Prompt $Prompt -AsSecureString
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try {
            $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        }
        finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        }
    }
    else {
        $value = Read-Host -Prompt $Prompt
    }
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "$Prompt is required."
    }
    return $value.Trim()
}

function Resolve-PythonCommand {
    $candidate = Join-Path $apiDirectory '.venv\Scripts\python.exe'
    if (Test-Path -LiteralPath $candidate) {
        return $candidate
    }
    throw 'The library-api Python environment was not found.'
}

$clientId = Read-RequiredValue 'Google Web OAuth Client ID'
$clientSecret = Read-RequiredValue 'Google Web OAuth Client Secret' -Secret
$pickerApiKey = Read-RequiredValue 'Restricted Google Picker API key' -Secret
$pickerAppId = Read-RequiredValue 'Google Cloud project number (Picker App ID)'
$recipientEmail = Read-RequiredValue 'Test recipient email (not the folder owner)'
if ($recipientEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
    throw 'Test recipient email is invalid.'
}

$listener = Get-NetTCPConnection -LocalPort 8767 -State Listen -ErrorAction SilentlyContinue
if ($null -ne $listener) {
    throw 'TCP port 8767 is already in use. Stop the existing listener before this one-time E2E.'
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$temporaryValues = [ordered]@{
    PHASE7_GOOGLE_OAUTH_CLIENT_ID = $clientId
    PHASE7_GOOGLE_OAUTH_CLIENT_SECRET = $clientSecret
    PHASE7_GOOGLE_PICKER_API_KEY = $pickerApiKey
    PHASE7_GOOGLE_PICKER_APP_ID = $pickerAppId
    PHASE7_DRIVE_TEST_RECIPIENT = $recipientEmail.ToLowerInvariant()
    PHASE7_DRIVE_E2E_OUTPUT_DIR = $outputDirectory
}
$previousValues = @{}
foreach ($name in $temporaryValues.Keys) {
    $existing = [Environment]::GetEnvironmentVariable($name, 'Process')
    if ($null -ne $existing) {
        $previousValues[$name] = $existing
    }
    [Environment]::SetEnvironmentVariable($name, $temporaryValues[$name], 'Process')
}

Write-Host 'Open http://localhost:8767/ in Edge.'
Write-Host 'Select only a newly-created empty test folder in Google Picker.'
Write-Host 'Use Ctrl+C for an orderly interruption; the helper will attempt managed-permission and OAuth cleanup.'
Write-Host 'Force-killing the process cannot guarantee cleanup. If that happens, inspect the test folder Share dialog manually.'

$python = Resolve-PythonCommand
Push-Location $apiDirectory
try {
    & $python $serverScript
    if ($LASTEXITCODE -ne 0) {
        throw "Phase 7 Drive E2E failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
    foreach ($name in $temporaryValues.Keys) {
        if ($previousValues.ContainsKey($name)) {
            [Environment]::SetEnvironmentVariable($name, $previousValues[$name], 'Process')
        }
        else {
            [Environment]::SetEnvironmentVariable($name, $null, 'Process')
        }
    }
}
