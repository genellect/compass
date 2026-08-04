[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Primary', 'Secondary')]
    [string] $Role
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$apiDirectory = Join-Path $root 'services\library-api'
$evidenceServer = Join-Path $apiDirectory `
    'scripts\phase4_oidc_evidence_server.py'
$outputDirectory = Join-Path $root 'outputs\phase4-oidc-evidence'
$requiredHostedDomain = 'st.kitasato-u.ac.jp'

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
    throw 'Python was not found for the Phase 4 evidence helper.'
}

$clientId = [Environment]::GetEnvironmentVariable(
    'GOOGLE_OAUTH_CLIENT_ID',
    'User'
)
if ([string]::IsNullOrWhiteSpace($clientId)) {
    throw 'GOOGLE_OAUTH_CLIENT_ID is not set in the Windows User environment.'
}

$expectedHostedDomain = [Environment]::GetEnvironmentVariable(
    'EXPECTED_GOOGLE_HD',
    'User'
)
if ($expectedHostedDomain.Trim().ToLowerInvariant() -ne $requiredHostedDomain) {
    throw "EXPECTED_GOOGLE_HD must be '$requiredHostedDomain'."
}

$roleLabel = if ($Role -eq 'Primary') {
    'primary-admin'
}
else {
    'secondary-admin'
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$env:GOOGLE_OAUTH_CLIENT_ID = $clientId
$env:EXPECTED_GOOGLE_HD = $requiredHostedDomain
$env:OIDC_EVIDENCE_ROLE = $roleLabel
$env:OIDC_EVIDENCE_OUTPUT_DIR = $outputDirectory

Write-Host "Phase 4 evidence role: $roleLabel"
Write-Host 'Open http://localhost:8765/ and let only the named administrator sign in.'
Write-Host 'The helper does not save the token, full email address, or raw Google sub.'

$python = Resolve-PythonCommand
& $python $evidenceServer
if ($LASTEXITCODE -ne 0) {
    throw "Phase 4 evidence helper failed with exit code $LASTEXITCODE."
}
