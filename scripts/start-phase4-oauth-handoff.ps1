[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$apiDirectory = Join-Path $root 'services\library-api'
$drillServer = Join-Path $apiDirectory `
    'scripts\phase4_oauth_handoff_server.py'
$outputDirectory = Join-Path $root 'outputs\phase4-oauth-handoff'
$requiredHostedDomain = 'st.kitasato-u.ac.jp'

function Read-RequiredUserEnvironmentVariable {
    param([string] $Name)

    $value = [Environment]::GetEnvironmentVariable($Name, 'User')
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "$Name is not set in the Windows User environment."
    }
    return $value.Trim()
}

function Resolve-PythonCommand {
    foreach ($candidate in @(
        (Join-Path $apiDirectory '.venv-trusted\Scripts\python.exe'),
        (Join-Path $apiDirectory '.venv\Scripts\python.exe')
    )) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }
    $fromPath = Get-Command python -ErrorAction SilentlyContinue
    if ($null -ne $fromPath) {
        return $fromPath.Source
    }
    throw 'Python was not found for the Phase 4 OAuth handoff drill.'
}

$clientId = Read-RequiredUserEnvironmentVariable `
    'PHASE4_HANDOFF_GOOGLE_OAUTH_CLIENT_ID'
$clientSecret = Read-RequiredUserEnvironmentVariable `
    'PHASE4_HANDOFF_GOOGLE_OAUTH_CLIENT_SECRET'
$testFolderId = Read-RequiredUserEnvironmentVariable `
    'PHASE4_DRIVE_TEST_FOLDER_ID'
$expectedHostedDomain = Read-RequiredUserEnvironmentVariable `
    'EXPECTED_GOOGLE_HD'
if ($expectedHostedDomain.ToLowerInvariant() -ne $requiredHostedDomain) {
    throw "EXPECTED_GOOGLE_HD must be '$requiredHostedDomain'."
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$env:GOOGLE_OAUTH_CLIENT_ID = $clientId
$env:GOOGLE_OAUTH_CLIENT_SECRET = $clientSecret
$env:EXPECTED_GOOGLE_HD = $requiredHostedDomain
$env:PHASE4_DRIVE_TEST_FOLDER_ID = $testFolderId
$env:PHASE4_OAUTH_HANDOFF_OUTPUT_DIR = $outputDirectory

Write-Host 'Open http://localhost:8766/ to run the Phase 4 handoff drill.'
Write-Host 'Use only the empty test folder. No Drive permissions are changed.'
Write-Host 'Tokens remain in memory only and are revoked during the drill.'

$python = Resolve-PythonCommand
Push-Location $apiDirectory
try {
    & $python $drillServer
    if ($LASTEXITCODE -ne 0) {
        throw "OAuth handoff drill failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
    Remove-Item Env:\GOOGLE_OAUTH_CLIENT_SECRET -ErrorAction SilentlyContinue
    Remove-Item Env:\PHASE4_DRIVE_TEST_FOLDER_ID -ErrorAction SilentlyContinue
}
