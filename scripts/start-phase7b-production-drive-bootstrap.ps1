[CmdletBinding()]
param(
    [switch] $FingerprintReview
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$apiDirectory = Join-Path $root 'services\library-api'

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

function Get-Sha256 {
    param([string] $Value)

    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        $hash = $sha256.ComputeHash($bytes)
        return ([BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
    }
    finally {
        $sha256.Dispose()
        [Array]::Clear($bytes, 0, $bytes.Length)
    }
}

if ($FingerprintReview) {
    $folderId = Read-RequiredValue 'Production Drive folder ID (hidden; type manually, do not use clipboard)' -Secret
    try {
        if ($folderId -notmatch '^[A-Za-z0-9_-]{10,200}$') {
            throw 'The Drive folder ID format is invalid.'
        }
        $fingerprint = Get-Sha256 $folderId
        Write-Host "approved_folder_sha256=$fingerprint"
        Write-Host "approved_folder_sha256_16=$($fingerprint.Substring(0, 16))"
    }
    finally {
        $folderId = $null
    }
    return
}

function Resolve-PythonCommand {
    $candidate = Join-Path $apiDirectory '.venv\Scripts\python.exe'
    if (Test-Path -LiteralPath $candidate) {
        return $candidate
    }
    throw 'The library-api Python environment was not found.'
}

function Resolve-GcloudCommand {
    foreach ($name in @('gcloud.cmd', 'gcloud.exe', 'gcloud')) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($null -ne $command) {
            return $command.Source
        }
    }
    throw 'Google Cloud CLI was not found. Install it before this production handoff.'
}

$listener = Get-NetTCPConnection -LocalPort 8769 -State Listen -ErrorAction SilentlyContinue
if ($null -ne $listener) {
    throw 'TCP port 8769 is already in use. Stop the existing listener first.'
}

$projectId = Read-RequiredValue 'Dedicated Google Cloud project ID (hidden)' -Secret
$clientId = Read-RequiredValue 'Production Web OAuth Client ID (hidden)' -Secret
$clientSecret = Read-RequiredValue 'Production Web OAuth Client Secret' -Secret
$pickerApiKey = Read-RequiredValue 'Restricted Google Picker API key' -Secret
$pickerAppId = Read-RequiredValue 'Google Cloud project number / Picker App ID (hidden)' -Secret
$approvedFingerprint = Read-RequiredValue 'Human-approved production folder SHA-256 (64 lowercase hex)'
if ($approvedFingerprint -notmatch '^[0-9a-f]{64}$') {
    throw 'Human-approved folder fingerprint must be 64 lowercase hexadecimal characters.'
}

$temporaryValues = [ordered]@{
    PHASE7_PRODUCTION_GCP_PROJECT_ID = $projectId
    PHASE7_PRODUCTION_OAUTH_CLIENT_ID = $clientId
    PHASE7_PRODUCTION_OAUTH_CLIENT_SECRET = $clientSecret
    PHASE7_PRODUCTION_PICKER_API_KEY = $pickerApiKey
    PHASE7_PRODUCTION_PICKER_APP_ID = $pickerAppId
    PHASE7_PRODUCTION_APPROVED_FOLDER_SHA256 = $approvedFingerprint
    PHASE7_PRODUCTION_GCLOUD_EXECUTABLE = (Resolve-GcloudCommand)
}
$previousValues = @{}
foreach ($name in $temporaryValues.Keys) {
    $existing = [Environment]::GetEnvironmentVariable($name, 'Process')
    if ($null -ne $existing) {
        $previousValues[$name] = $existing
    }
    [Environment]::SetEnvironmentVariable($name, $temporaryValues[$name], 'Process')
}

Write-Host 'Open http://localhost:8769/ in the same local browser.'
Write-Host 'The helper will verify the approved folder and add versions only to existing Secret Manager containers.'
Write-Host 'It cannot create/delete Drive permissions or activate the production worker.'

$python = Resolve-PythonCommand
Push-Location $apiDirectory
try {
    & $python -m scripts.phase7_production_drive_bootstrap_server
    if ($LASTEXITCODE -ne 0) {
        throw "Production Drive bootstrap stopped with exit code $LASTEXITCODE."
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
    $projectId = $null
    $clientId = $null
    $clientSecret = $null
    $pickerApiKey = $null
    $pickerAppId = $null
}
