[CmdletBinding()]
param(
    [ValidateSet("Validate", "Run")]
    [string]$Action = "Run"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$ProtectedInteractiveRoot = [IO.Path]::GetFullPath((Join-Path (
    [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
) "OneDrive\Desktop\COMPASS Interactive"))
$RehearsalApiOrigin = "https://192.0.2.1"
$RehearsalAdminApiBaseUrl = "/library-registration/admin/api"
$RehearsalRegistrationGoogleClientId = "999999999999-registration-rehearsal.apps.googleusercontent.com"
$RehearsalAdminGoogleClientId = "888888888888-admin-rehearsal.apps.googleusercontent.com"
$AdminPreviewArtifactMarkers = @(
    "admin-mock-login",
    "mock-admin-role",
    "app-synthetic-",
    "member-synthetic-",
    "operation-synthetic-",
    "audit-synthetic-",
    "request-synthetic-",
    "export-synthetic-",
    "future-strategy-library-members-synthetic",
    "hanako@example.invalid",
    "taro@example.invalid",
    "jiro@example.invalid"
)
$CurrentStage = "initialization"

function Test-PathIsOrWithin {
    param(
        [Parameter(Mandatory = $true)][string]$Candidate,
        [Parameter(Mandatory = $true)][string]$Boundary
    )

    $candidateFull = [IO.Path]::GetFullPath($Candidate).TrimEnd('\', '/')
    $boundaryFull = [IO.Path]::GetFullPath($Boundary).TrimEnd('\', '/')
    if ($candidateFull.Equals($boundaryFull, [StringComparison]::OrdinalIgnoreCase)) {
        return $true
    }
    return $candidateFull.StartsWith(
        "$boundaryFull$([IO.Path]::DirectorySeparatorChar)",
        [StringComparison]::OrdinalIgnoreCase
    )
}

function Assert-SafeRepository {
    if (
        (Test-PathIsOrWithin -Candidate $RepoRoot -Boundary $ProtectedInteractiveRoot) -or
        (Test-PathIsOrWithin -Candidate $ProtectedInteractiveRoot -Boundary $RepoRoot) -or
        $RepoRoot -match '(?i)(^|[\\/])COMPASS Interactive([\\/]|$)'
    ) {
        throw "Refusing to run in or above the protected COMPASS Interactive project."
    }

    $packagePath = Join-Path $RepoRoot "package.json"
    $nextConfigPath = Join-Path $RepoRoot "next.config.ts"
    $productionVerifierPath = Join-Path $RepoRoot "scripts\verify-library-production-build.mjs"
    $mockVerifierPath = Join-Path $RepoRoot "scripts\verify-library-mock-build.mjs"
    foreach ($required in @(
        $packagePath,
        $nextConfigPath,
        $productionVerifierPath,
        $mockVerifierPath
    )) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
            throw "Required frontend rehearsal file is missing."
        }
    }

    $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
    if ($package.name -ne "compass-official-site") {
        throw "Refusing to run outside the COMPASS official-site checkout."
    }
}

function Get-EnvironmentSnapshot {
    param([Parameter(Mandatory = $true)][string[]]$Names)

    $snapshot = @{}
    foreach ($name in $Names) {
        $item = Get-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
        if ($null -eq $item) {
            $snapshot[$name] = [pscustomobject]@{ Exists = $false; Value = $null }
        } else {
            $snapshot[$name] = [pscustomobject]@{ Exists = $true; Value = $item.Value }
        }
    }
    return $snapshot
}

function Set-ProcessEnvironmentValue {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [AllowEmptyString()][string]$Value
    )
    Set-Item -LiteralPath "Env:$Name" -Value $Value
}

function Restore-EnvironmentSnapshot {
    param([Parameter(Mandatory = $true)][hashtable]$Snapshot)

    foreach ($name in $Snapshot.Keys) {
        $entry = $Snapshot[$name]
        if ($entry.Exists) {
            Set-Item -LiteralPath "Env:$name" -Value $entry.Value
        } else {
            Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
        }
    }
}

function Set-ProductionRehearsalEnvironment {
    Set-ProcessEnvironmentValue "LIBRARY_RELEASE_TARGET" "production"
    Set-ProcessEnvironmentValue "LIBRARY_RELEASE_APPROVED_API_ORIGIN" $RehearsalApiOrigin
    Set-ProcessEnvironmentValue "NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE" "google"
    Set-ProcessEnvironmentValue "NEXT_PUBLIC_LIBRARY_ADMIN_MODE" "google"
    Set-ProcessEnvironmentValue "NEXT_PUBLIC_LIBRARY_API_BASE_URL" $RehearsalApiOrigin
    Set-ProcessEnvironmentValue "NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL" $RehearsalAdminApiBaseUrl
    Set-ProcessEnvironmentValue "NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID" $RehearsalRegistrationGoogleClientId
    Set-ProcessEnvironmentValue "NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID" $RehearsalAdminGoogleClientId
    Set-ProcessEnvironmentValue "NEXT_PUBLIC_LIBRARY_GOOGLE_HOSTED_DOMAIN" "st.kitasato-u.ac.jp"
    Set-ProcessEnvironmentValue "NEXT_DIST_DIR" ".next"
    Set-ProcessEnvironmentValue "NEXT_TELEMETRY_DISABLED" "1"
    Set-ProcessEnvironmentValue "NPM_CONFIG_OFFLINE" "true"
    Set-ProcessEnvironmentValue "NPM_CONFIG_UPDATE_NOTIFIER" "false"
    Set-ProcessEnvironmentValue "NPM_CONFIG_AUDIT" "false"
    Set-ProcessEnvironmentValue "NPM_CONFIG_FUND" "false"
}

function Set-ExplicitMockEnvironment {
    Set-ProcessEnvironmentValue "LIBRARY_RELEASE_TARGET" "local"
    Set-ProcessEnvironmentValue "LIBRARY_RELEASE_APPROVED_API_ORIGIN" ""
    Set-ProcessEnvironmentValue "NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE" "mock"
    Set-ProcessEnvironmentValue "NEXT_PUBLIC_LIBRARY_ADMIN_MODE" "mock"
    Set-ProcessEnvironmentValue "NEXT_PUBLIC_LIBRARY_API_BASE_URL" ""
    Set-ProcessEnvironmentValue "NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL" ""
    Set-ProcessEnvironmentValue "NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID" ""
    Set-ProcessEnvironmentValue "NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID" ""
    Set-ProcessEnvironmentValue "NEXT_PUBLIC_LIBRARY_GOOGLE_HOSTED_DOMAIN" "st.kitasato-u.ac.jp"
    Set-ProcessEnvironmentValue "NEXT_DIST_DIR" ".next"
    Set-ProcessEnvironmentValue "NEXT_TELEMETRY_DISABLED" "1"
    Set-ProcessEnvironmentValue "NPM_CONFIG_OFFLINE" "true"
    Set-ProcessEnvironmentValue "NPM_CONFIG_UPDATE_NOTIFIER" "false"
    Set-ProcessEnvironmentValue "NPM_CONFIG_AUDIT" "false"
    Set-ProcessEnvironmentValue "NPM_CONFIG_FUND" "false"
}

function Invoke-ExternalStep {
    param(
        [Parameter(Mandatory = $true)][string]$Stage,
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $script:CurrentStage = $Stage
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Stage failed with exit code $LASTEXITCODE."
    }
}

function Read-Utf8TextFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    # Get-Content -Raw returns $null for an empty file in Windows PowerShell 5.1.
    # Next.js can emit an empty, tree-shaken JavaScript chunk, so always return
    # a string before running marker scans over the exported artifact set.
    return [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8)
}

function Get-FileSha256 {
    param([Parameter(Mandatory = $true)][string]$Path)

    $stream = [IO.File]::OpenRead($Path)
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        $hash = $sha256.ComputeHash($stream)
        return ([BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
    }
    finally {
        $stream.Dispose()
        $sha256.Dispose()
    }
}

function Get-SanitizedFailureMessage {
    param([Parameter(Mandatory = $true)][Exception]$Exception)

    $message = [string]$Exception.Message
    if ([string]::IsNullOrWhiteSpace($message)) {
        return "No exception message was provided."
    }
    return $message.Replace($RepoRoot, "<repo>") -replace '[\r\n]+', ' '
}

function Get-OutputEvidence {
    param([Parameter(Mandatory = $true)][ValidateSet("production", "mock")][string]$Mode)

    $registrationPath = Join-Path $RepoRoot "out\library-registration\index.html"
    $adminPath = Join-Path $RepoRoot "out\library-registration\admin\index.html"
    $headersPath = Join-Path $RepoRoot "out\_headers"
    $registration = Read-Utf8TextFile -Path $registrationPath
    $admin = Read-Utf8TextFile -Path $adminPath
    $headers = Read-Utf8TextFile -Path $headersPath
    $textArtifacts = @(
        Get-ChildItem -LiteralPath (Join-Path $RepoRoot "out") -Recurse -File |
            Where-Object {
                $_.Extension -eq ".html" -or
                $_.Extension -eq ".js" -or
                $_.Name -eq "_headers"
            }
    )
    $rehearsalApiOriginOccurrences = 0
    $rehearsalRegistrationClientOccurrences = 0
    $rehearsalAdminClientOccurrences = 0
    $adminPreviewMarkerOccurrences = 0
    $emptyTextArtifactCount = 0
    foreach ($artifact in $textArtifacts) {
        if ($artifact.Length -eq 0) {
            $emptyTextArtifactCount += 1
            $contents = [string]::Empty
        } else {
            $contents = [string](Read-Utf8TextFile -Path $artifact.FullName)
        }
        $rehearsalApiOriginOccurrences += [regex]::Matches(
            $contents,
            [regex]::Escape($RehearsalApiOrigin)
        ).Count
        $rehearsalRegistrationClientOccurrences += [regex]::Matches(
            $contents,
            [regex]::Escape($RehearsalRegistrationGoogleClientId)
        ).Count
        $rehearsalAdminClientOccurrences += [regex]::Matches(
            $contents,
            [regex]::Escape($RehearsalAdminGoogleClientId)
        ).Count
        foreach ($marker in $AdminPreviewArtifactMarkers) {
            $adminPreviewMarkerOccurrences += [regex]::Matches(
                $contents,
                [regex]::Escape($marker)
            ).Count
        }
    }

    return [ordered]@{
        mode = $Mode
        registration_google_api = $registration.Contains("GOOGLE API")
        registration_local_mock = $registration.Contains("LOCAL MOCK")
        admin_authentication = $admin.Contains("管理者ログイン")
        admin_static_fail_closed = $admin.Contains('class="admin-alert is-error"') -and -not $admin.Contains('class="admin-mock-login"')
        inspected_text_artifact_count = $textArtifacts.Count
        empty_text_artifact_count = $emptyTextArtifactCount
        admin_preview_marker_occurrences = $adminPreviewMarkerOccurrences
        rehearsal_api_origin_text_occurrences = $rehearsalApiOriginOccurrences
        rehearsal_registration_client_text_occurrences = $rehearsalRegistrationClientOccurrences
        rehearsal_admin_client_text_occurrences = $rehearsalAdminClientOccurrences
        registration_sha256 = Get-FileSha256 -Path $registrationPath
        admin_sha256 = Get-FileSha256 -Path $adminPath
        headers_sha256 = Get-FileSha256 -Path $headersPath
    }
}

Assert-SafeRepository
if ($Action -eq "Validate") {
    Write-Output "PASS: frontend rehearsal repository and COMPASS Interactive boundary validated."
    exit 0
}

$explicitNames = @(
    "LIBRARY_RELEASE_TARGET",
    "LIBRARY_RELEASE_APPROVED_API_ORIGIN",
    "NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE",
    "NEXT_PUBLIC_LIBRARY_ADMIN_MODE",
    "NEXT_PUBLIC_LIBRARY_API_BASE_URL",
    "NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL",
    "NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID",
    "NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID",
    "NEXT_PUBLIC_LIBRARY_GOOGLE_HOSTED_DOMAIN",
    "NEXT_DIST_DIR",
    "NEXT_TELEMETRY_DISABLED",
    "NPM_CONFIG_OFFLINE",
    "NPM_CONFIG_UPDATE_NOTIFIER",
    "NPM_CONFIG_AUDIT",
    "NPM_CONFIG_FUND"
)
$processEnvironment = [Environment]::GetEnvironmentVariables(
    [EnvironmentVariableTarget]::Process
)
$discoveredNames = $processEnvironment.Keys | Where-Object {
    $_ -match '^(NEXT_PUBLIC_LIBRARY_|LIBRARY_RELEASE_)' -or
    $_ -eq 'NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID'
}
$trackedNames = @($explicitNames + $discoveredNames | Sort-Object -Unique)
$environmentSnapshot = Get-EnvironmentSnapshot -Names $trackedNames

$timestamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssfffZ")
$evidenceDirectory = Join-Path $RepoRoot "outputs\frontend-production-rehearsal\$timestamp"
$evidencePath = Join-Path $evidenceDirectory "evidence.json"
New-Item -ItemType Directory -Path $evidenceDirectory -Force | Out-Null

$productionFailure = $null
$productionFailureStage = $null
$mockRestorationFailure = $null
$mockRestorationFailureStage = $null
$environmentRestoreFailure = $null
$evidenceWriteFailure = $null
$productionOutput = $null
$mockOutput = $null
$productionStatus = "not_started"
$mockRestorationStatus = "not_started"
$environmentRestored = $false

Push-Location $RepoRoot
try {
    try {
        Set-ProductionRehearsalEnvironment
        Invoke-ExternalStep "production_build" "npm.cmd" @("run", "build")
        Invoke-ExternalStep "production_normal_verify" "npm.cmd" @("run", "verify")
        Invoke-ExternalStep "production_function_bundle" "node.exe" @(
            "scripts/finalize-cloudflare-git-build.mjs",
            "--production-rehearsal"
        )
        Invoke-ExternalStep "production_dedicated_verify" "node.exe" @("scripts/verify-library-production-build.mjs")
        $script:CurrentStage = "production_evidence"
        $productionOutput = Get-OutputEvidence -Mode "production"
        $productionStatus = "pass"
    } catch {
        $productionFailure = $_.Exception
        $productionFailureStage = $CurrentStage
        $productionStatus = "fail"
    } finally {
        try {
            Set-ExplicitMockEnvironment
            Invoke-ExternalStep "mock_restore_build" "npm.cmd" @("run", "build")
            Invoke-ExternalStep "mock_restore_normal_verify" "npm.cmd" @("run", "verify")
            Invoke-ExternalStep "mock_restore_dedicated_verify" "node.exe" @("scripts/verify-library-mock-build.mjs")
            $script:CurrentStage = "mock_restore_evidence"
            $mockOutput = Get-OutputEvidence -Mode "mock"
            $mockRestorationStatus = "pass"
        } catch {
            $mockRestorationFailure = $_.Exception
            $mockRestorationFailureStage = $CurrentStage
            $mockRestorationStatus = "fail"
        }
    }
} finally {
    try {
        Restore-EnvironmentSnapshot -Snapshot $environmentSnapshot
        $environmentRestored = $true
    } catch {
        $environmentRestoreFailure = $_.Exception
    }

    $overallStatus = if (
        $productionStatus -eq "pass" -and
        $mockRestorationStatus -eq "pass" -and
        $environmentRestored
    ) { "pass" } else { "fail" }
    $evidence = [ordered]@{
        schema_version = 1
        captured_at_utc = [DateTime]::UtcNow.ToString("o")
        status = $overallStatus
        classification = "local-only synthetic production-shaped rehearsal"
        repository = "compass-official-site"
        protected_project = [ordered]@{
            name = "COMPASS Interactive"
            touched = $false
        }
        rehearsal_profile = [ordered]@{
            api_origin = "RFC 5737 TEST-NET-1 HTTPS origin"
            oauth_clients = "separate non-secret registration and administrator Google OAuth client ID shapes"
            real_credentials_used = $false
            real_personal_data_used = $false
        }
        external_activity = [ordered]@{
            deployment_invoked = $false
            google_or_library_api_request_invoked = $false
            next_telemetry_disabled = $true
            npm_offline = $true
        }
        production_rehearsal = [ordered]@{
            status = $productionStatus
            failure_stage = $productionFailureStage
            failure_type = if ($productionFailure) { $productionFailure.GetType().FullName } else { $null }
            failure_message = if ($productionFailure) {
                Get-SanitizedFailureMessage -Exception $productionFailure
            } else { $null }
            output = $productionOutput
        }
        final_mock_restoration = [ordered]@{
            status = $mockRestorationStatus
            failure_stage = $mockRestorationFailureStage
            failure_type = if ($mockRestorationFailure) { $mockRestorationFailure.GetType().FullName } else { $null }
            failure_message = if ($mockRestorationFailure) {
                Get-SanitizedFailureMessage -Exception $mockRestorationFailure
            } else { $null }
            output = $mockOutput
        }
        caller_environment = [ordered]@{
            tracked_variable_count = $trackedNames.Count
            values_recorded = $false
            restored = $environmentRestored
            restore_failure_type = if ($environmentRestoreFailure) {
                $environmentRestoreFailure.GetType().FullName
            } else { $null }
            restore_failure_message = if ($environmentRestoreFailure) {
                Get-SanitizedFailureMessage -Exception $environmentRestoreFailure
            } else { $null }
        }
        production_acceptance = $false
    }

    try {
        $evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $evidencePath -Encoding utf8
    } catch {
        $evidenceWriteFailure = $_.Exception
    }
    Pop-Location
}

if ($mockRestorationFailure) {
    $failureType = $mockRestorationFailure.GetType().FullName
    $failureMessage = Get-SanitizedFailureMessage -Exception $mockRestorationFailure
    throw "Final out/ mock restoration failed at $mockRestorationFailureStage [$failureType]: $failureMessage Evidence: $evidencePath"
}
if ($environmentRestoreFailure) {
    $failureType = $environmentRestoreFailure.GetType().FullName
    $failureMessage = Get-SanitizedFailureMessage -Exception $environmentRestoreFailure
    throw "Caller environment restoration failed [$failureType]: $failureMessage Evidence: $evidencePath"
}
if ($evidenceWriteFailure) {
    $failureType = $evidenceWriteFailure.GetType().FullName
    $failureMessage = Get-SanitizedFailureMessage -Exception $evidenceWriteFailure
    throw "Sanitized evidence could not be written [$failureType]: $failureMessage"
}
if ($productionFailure) {
    $failureType = $productionFailure.GetType().FullName
    $failureMessage = Get-SanitizedFailureMessage -Exception $productionFailure
    throw "Production-shaped rehearsal failed at $productionFailureStage [$failureType]: $failureMessage Final out/ was restored to mock. Evidence: $evidencePath"
}

Write-Output "PASS: production-shaped frontend rehearsal completed locally."
Write-Output "PASS: final out/ is an explicitly verified mock build."
Write-Output "Evidence: $evidencePath"
