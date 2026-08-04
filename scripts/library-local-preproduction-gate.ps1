[CmdletBinding()]
param(
    [ValidateSet('Validate', 'Run')]
    [string] $Action = 'Validate',
    [string] $EvidencePath = 'outputs/library-registration/local-preproduction-gate.json'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$dockerWrapper = Join-Path $PSScriptRoot 'library-docker-dev.ps1'
$frontendRehearsal = Join-Path $PSScriptRoot `
    'library-frontend-production-rehearsal.ps1'
$phase8aEvidence = Join-Path $root `
    'services\library-api\scripts\phase8a_local_postgres_evidence.ps1'
$python = Join-Path $root 'services\library-api\.venv\Scripts\python.exe'
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$currentStep = 'validate'
$results = [ordered]@{}
$preSourceSnapshot = $null
$postSourceSnapshot = $null
$runFailedStep = $null

if ($root -match '(?i)COMPASS[ _-]*Interactive') {
    throw 'Refusing to run from the protected COMPASS Interactive project.'
}
foreach ($required in @(
    $dockerWrapper,
    $frontendRehearsal,
    $phase8aEvidence,
    $python
)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required local preflight asset is missing: $required"
    }
}

$resolvedEvidence = [System.IO.Path]::GetFullPath((Join-Path $root $EvidencePath))
$outputRoot = [System.IO.Path]::GetFullPath((Join-Path $root 'outputs')) + `
    [System.IO.Path]::DirectorySeparatorChar
if (-not $resolvedEvidence.StartsWith(
    $outputRoot,
    [StringComparison]::OrdinalIgnoreCase
)) {
    throw 'EvidencePath must stay under this repository outputs directory.'
}

function Invoke-CheckedStep {
    param(
        [Parameter(Mandatory = $true)][string] $Name,
        [Parameter(Mandatory = $true)][scriptblock] $Command
    )
    $script:currentStep = $Name
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "Local preflight step failed: $Name"
    }
    $script:results[$Name] = 'pass'
}

function Get-Sha256Text {
    param([Parameter(Mandatory = $true)][string] $Value)
    $hasher = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
        return -join ($hasher.ComputeHash($bytes) | ForEach-Object {
            $_.ToString('x2')
        })
    }
    finally {
        $hasher.Dispose()
    }
}

function Get-SourceIntegritySnapshot {
    Push-Location $root
    try {
        & git diff --check
        if ($LASTEXITCODE -ne 0) {
            throw 'Tracked source whitespace validation failed.'
        }

        $allFiles = @(& git ls-files --cached --others --exclude-standard)
        if ($LASTEXITCODE -ne 0) {
            throw 'Unable to enumerate repository source files.'
        }
        $excludedPrefix = '^(?:node_modules|\.next(?:-[^/]+)?|out|outputs|\.git|\.terraform-plugin-cache)/'
        $allowedName = '(?:^|/)(?:Dockerfile|_headers|_redirects|\.env\.example)$'
        $allowedExtension = '\.(?:css|hcl|html|js|json|mjs|md|py|ps1|sql|tf|toml|ts|tsx|txt|ya?ml)$'
        $sourceFiles = @($allFiles | ForEach-Object { $_ -replace '\\', '/' } |
            Where-Object {
                $_ -notmatch $excludedPrefix -and
                ($_ -match $allowedName -or $_ -match $allowedExtension)
            } | Sort-Object -Unique)
        if ($sourceFiles.Count -eq 0) {
            throw 'No source files were selected for integrity validation.'
        }

        $secretRules = [ordered]@{
            private_key = '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'
            neon_password = 'npg_[A-Za-z0-9]{8,}'
            neon_credential_url = 'postgres(?:ql)?(?:\+psycopg)?://[^\s:''"@]+:[^\s:''"@]+@[^\s:''"]*\.neon\.tech(?:[/?#][^\s''"]*)?'
            google_client_secret = 'GOCSPX-[A-Za-z0-9_-]{10,}'
            google_api_key = 'AIza[0-9A-Za-z_-]{35}'
            oauth_refresh_token = '1//[0-9A-Za-z_-]{20,}'
            oauth_access_token = 'ya29\.[0-9A-Za-z_-]{20,}'
            openai_api_key = 'sk-(?:proj-)?[0-9A-Za-z_-]{20,}'
            aws_access_key = 'AKIA[0-9A-Z]{16}'
            github_token = 'gh[pousr]_[0-9A-Za-z]{20,}'
            absolute_windows_user_path = '(?i)[A-Z]:[\\/]Users[\\/][^\\/\s''"]+'
            committed_admin_allowlist = '(?im)^\s*GOOGLE_ADMIN_ALLOWED_EMAILS\s*=\s*[^\s#][^\r\n]*$'
            hardcoded_gas_recipient = '(?i)\b(?:ADMIN_EMAIL|ADMIN_RECIPIENT_EMAIL)\s*[:=]\s*["''][^"'']+@[^"'']+["'']'
        }
        $findings = [Collections.Generic.List[string]]::new()
        $manifest = [Collections.Generic.List[string]]::new()
        foreach ($relative in $sourceFiles) {
            $absolute = Join-Path $root ($relative -replace '/', '\')
            if (-not (Test-Path -LiteralPath $absolute -PathType Leaf)) {
                throw "Source manifest entry is unavailable: $relative"
            }
            $text = [IO.File]::ReadAllText($absolute)
            foreach ($rule in $secretRules.GetEnumerator()) {
                if ($text -match $rule.Value) {
                    $findings.Add("$relative [$($rule.Key)]")
                }
            }
            if ($relative -notmatch '\.md$') {
                $lineNumber = 0
                foreach ($line in [IO.File]::ReadAllLines($absolute)) {
                    $lineNumber += 1
                    if ($line -match '[\t ]+$') {
                        $findings.Add("$relative [${lineNumber}:trailing_whitespace]")
                    }
                    if ($line -match '^(?:<<<<<<<|>>>>>>>)(?: |$)') {
                        $findings.Add("$relative [${lineNumber}:merge_marker]")
                    }
                }
            }
            $hash = (Get-FileHash -LiteralPath $absolute -Algorithm SHA256).Hash.ToLowerInvariant()
            $manifest.Add("$relative|$hash")
        }
        if ($findings.Count -gt 0) {
            # Only path and rule identifiers are emitted; matching values are never printed.
            throw "Source integrity findings: $($findings -join ', ')"
        }

        $sourceManifestSha256 = Get-Sha256Text `
            -Value (($manifest.ToArray() -join "`n") + "`n")
        $headCommit = (& git rev-parse HEAD).Trim()
        if ($LASTEXITCODE -ne 0 -or $headCommit -notmatch '^[0-9a-f]{40}$') {
            throw 'Unable to resolve the repository HEAD commit.'
        }
        $status = @(& git status --porcelain=v1 --untracked-files=normal)
        if ($LASTEXITCODE -ne 0) {
            throw 'Unable to inspect the repository worktree state.'
        }
        $normalizedStatus = @($status | Sort-Object)
        $statusFingerprint = Get-Sha256Text `
            -Value (($normalizedStatus -join "`n") + "`n")
        return [pscustomobject]@{
            SourceManifestSha256 = $sourceManifestSha256
            SourceFileCount = $sourceFiles.Count
            HeadCommit = $headCommit
            WorktreeDirty = $status.Count -gt 0
            WorktreeStatusSha256 = $statusFingerprint
        }
    }
    finally {
        Pop-Location
    }
}

function Assert-SourceSnapshotUnchanged {
    param(
        [Parameter(Mandatory = $true)] $Before,
        [Parameter(Mandatory = $true)] $After
    )
    if (
        $Before.SourceManifestSha256 -ne $After.SourceManifestSha256 -or
        $Before.SourceFileCount -ne $After.SourceFileCount -or
        $Before.HeadCommit -ne $After.HeadCommit -or
        $Before.WorktreeStatusSha256 -ne $After.WorktreeStatusSha256 -or
        $Before.WorktreeDirty -ne $After.WorktreeDirty
    ) {
        throw 'source_changed_during_gate'
    }
}

Invoke-CheckedStep 'docker_isolation' {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
        $dockerWrapper -Action Validate
}
Invoke-CheckedStep 'frontend_rehearsal_isolation' {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
        $frontendRehearsal -Action Validate
}

if ($Action -eq 'Validate') {
    Invoke-CheckedStep 'source_integrity_and_provenance' {
        $snapshot = Get-SourceIntegritySnapshot
        if ($snapshot.WorktreeDirty) {
            throw 'worktree_must_be_clean'
        }
    }
    Write-Output 'PASS: local pre-Production-Gate prerequisites, source integrity, and Docker isolation validated.'
    exit 0
}

# Every inherited value that can select a release/auth/worker surface is captured,
# forced into the synthetic profile, and restored without being printed.
$environmentNames = @(
    'NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE',
    'NEXT_PUBLIC_LIBRARY_ADMIN_MODE',
    'NEXT_PUBLIC_LIBRARY_API_BASE_URL',
    'NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL',
    'NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID',
    'NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID',
    'NEXT_PUBLIC_LIBRARY_GOOGLE_HOSTED_DOMAIN',
    'NEXT_DIST_DIR',
    'LIBRARY_RELEASE_TARGET',
    'LIBRARY_RELEASE_APPROVED_API_ORIGIN',
    'DATABASE_URL',
    'DATABASE_URL_UNPOOLED',
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_IDS',
    'ALLOWED_GOOGLE_HOSTED_DOMAINS',
    'CORS_ALLOWED_ORIGINS',
    'GOOGLE_DRIVE_OAUTH_CLIENT_ID',
    'GOOGLE_DRIVE_OAUTH_CLIENT_SECRET',
    'GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN',
    'PHASE6_AUTH_API_ENABLED',
    'PHASE7_WORKER_API_ENABLED',
    'PHASE7_WORKER_SECRET',
    'PHASE7_DRIVE_API_ENABLED',
    'PHASE7_DRIVE_KILL_SWITCH',
    'PHASE8_ADMIN_API_ENABLED',
    'PHASE10A_EXPORT_API_ENABLED',
    'WORKER_AUTH_MODE',
    'WORKER_OIDC_AUDIENCE',
    'WORKER_INVOKER_SERVICE_ACCOUNT',
    'EXTERNAL_SIDE_EFFECTS_ENABLED',
    'FSL_LOCAL_POSTGRES_PASSWORD',
    'FSL_DATA_CLASSIFICATION',
    'NEXT_TELEMETRY_DISABLED',
    'NPM_CONFIG_OFFLINE'
)
$previousEnvironment = @{}
foreach ($name in $environmentNames) {
    $item = Get-Item "Env:$name" -ErrorAction SilentlyContinue
    $previousEnvironment[$name] = if ($null -eq $item) { $null } else { $item.Value }
}

$env:NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE = 'mock'
$env:NEXT_PUBLIC_LIBRARY_ADMIN_MODE = 'mock'
$env:NEXT_PUBLIC_LIBRARY_GOOGLE_HOSTED_DOMAIN = 'st.kitasato-u.ac.jp'
$env:ALLOWED_GOOGLE_HOSTED_DOMAINS = 'st.kitasato-u.ac.jp'
$env:CORS_ALLOWED_ORIGINS = 'http://127.0.0.1:3000,http://localhost:3000'
$env:PHASE6_AUTH_API_ENABLED = 'false'
$env:PHASE7_WORKER_API_ENABLED = 'false'
$env:PHASE7_DRIVE_API_ENABLED = 'false'
$env:PHASE7_DRIVE_KILL_SWITCH = 'true'
$env:PHASE8_ADMIN_API_ENABLED = 'false'
$env:PHASE10A_EXPORT_API_ENABLED = 'false'
$env:EXTERNAL_SIDE_EFFECTS_ENABLED = 'false'
$env:FSL_LOCAL_POSTGRES_PASSWORD = 'fsl-local-synthetic-only'
$env:FSL_DATA_CLASSIFICATION = 'synthetic-only'
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:NPM_CONFIG_OFFLINE = 'true'
foreach ($name in @(
    'NEXT_PUBLIC_LIBRARY_API_BASE_URL',
    'NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL',
    'NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID',
    'NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID',
    'NEXT_DIST_DIR',
    'LIBRARY_RELEASE_TARGET',
    'LIBRARY_RELEASE_APPROVED_API_ORIGIN',
    'DATABASE_URL',
    'DATABASE_URL_UNPOOLED',
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_IDS',
    'GOOGLE_DRIVE_OAUTH_CLIENT_ID',
    'GOOGLE_DRIVE_OAUTH_CLIENT_SECRET',
    'GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN',
    'PHASE7_WORKER_SECRET',
    'WORKER_AUTH_MODE',
    'WORKER_OIDC_AUDIENCE',
    'WORKER_INVOKER_SERVICE_ACCOUNT'
)) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
}

$runError = $null
$cleanupError = $null
$sourceIntegrityError = $null
$sourceIntegrityState = 'not_captured'
$locationPushed = $false
try {
    Push-Location $root
    $locationPushed = $true
    Invoke-CheckedStep 'source_integrity_pre_run' {
        $script:preSourceSnapshot = Get-SourceIntegritySnapshot
        if ($script:preSourceSnapshot.WorktreeDirty) {
            throw 'worktree_must_be_clean'
        }
    }
    Invoke-CheckedStep 'frontend_repository_check' {
        & $npm run check
    }
    Invoke-CheckedStep 'frontend_production_shaped_rehearsal' {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
            $frontendRehearsal -Action Run
    }
    Invoke-CheckedStep 'backend_compile' {
        & $python -m compileall -q `
            services\library-api\app `
            services\library-api\scripts `
            services\library-api\migrations `
            services\library-api\tests
    }
    Invoke-CheckedStep 'production_image_builds' {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
            $dockerWrapper -Action BuildProductionImages
    }
    Invoke-CheckedStep 'terraform_format_init_validate' {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
            $dockerWrapper -Action TerraformValidate
    }
    Invoke-CheckedStep 'docker_backend_regression' {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
            $dockerWrapper -Action Test
    }
    Invoke-CheckedStep 'phase9_phase10a_postgresql' {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
            $dockerWrapper -Action Phase9Phase10Test
    }
    Invoke-CheckedStep 'phase8a_load_backup_restore' {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
            $phase8aEvidence
    }
}
catch {
    $runError = $_
    $runFailedStep = $currentStep
}
finally {
    if ($locationPushed) {
        Pop-Location
    }
    try {
        $script:currentStep = 'docker_cleanup'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
            $dockerWrapper -Action Down
        if ($LASTEXITCODE -ne 0) {
            throw 'Registration Docker cleanup returned a nonzero status.'
        }
        $results['docker_cleanup'] = 'pass'
    }
    catch {
        $cleanupError = $_
        $results['docker_cleanup'] = 'fail'
    }
    foreach ($name in $environmentNames) {
        $value = $previousEnvironment[$name]
        if ($null -eq $value) {
            Remove-Item "Env:$name" -ErrorAction SilentlyContinue
        }
        else {
            Set-Item "Env:$name" $value
        }
    }
    if ($null -ne $preSourceSnapshot) {
        try {
            $script:currentStep = 'source_integrity_post_cleanup'
            $script:postSourceSnapshot = Get-SourceIntegritySnapshot
            Assert-SourceSnapshotUnchanged `
                -Before $script:preSourceSnapshot `
                -After $script:postSourceSnapshot
            $script:sourceIntegrityState = 'unchanged'
            $results['source_integrity_post_cleanup'] = 'pass'
        }
        catch {
            $sourceIntegrityError = $_
            $script:sourceIntegrityState = if (
                $_.Exception.Message -eq 'source_changed_during_gate'
            ) { 'changed' } else { 'check_failed' }
            $results['source_integrity_post_cleanup'] = 'fail'
        }
    }
}

$failed = $null -ne $runError -or $null -ne $cleanupError -or `
    $null -ne $sourceIntegrityError
$sourceIntegrityUnchanged = $sourceIntegrityState -eq 'unchanged'
$preHeadCommit = if ($null -eq $preSourceSnapshot) { $null } else { $preSourceSnapshot.HeadCommit }
$preManifestSha256 = if ($null -eq $preSourceSnapshot) { $null } else { $preSourceSnapshot.SourceManifestSha256 }
$preSourceFileCount = if ($null -eq $preSourceSnapshot) { 0 } else { $preSourceSnapshot.SourceFileCount }
$preWorktreeDirty = if ($null -eq $preSourceSnapshot) { $null } else { $preSourceSnapshot.WorktreeDirty }
$preStatusSha256 = if ($null -eq $preSourceSnapshot) { $null } else { $preSourceSnapshot.WorktreeStatusSha256 }
$postHeadCommit = if ($null -eq $postSourceSnapshot) { $null } else { $postSourceSnapshot.HeadCommit }
$postManifestSha256 = if ($null -eq $postSourceSnapshot) { $null } else { $postSourceSnapshot.SourceManifestSha256 }
$postSourceFileCount = if ($null -eq $postSourceSnapshot) { 0 } else { $postSourceSnapshot.SourceFileCount }
$postWorktreeDirty = if ($null -eq $postSourceSnapshot) { $null } else { $postSourceSnapshot.WorktreeDirty }
$postStatusSha256 = if ($null -eq $postSourceSnapshot) { $null } else { $postSourceSnapshot.WorktreeStatusSha256 }
$parent = Split-Path -Parent $resolvedEvidence
if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent | Out-Null
}
$evidence = [ordered]@{
    status = if ($failed) { 'fail' } else { 'pass' }
    classification = 'synthetic-only'
    captured_at_utc = [DateTime]::UtcNow.ToString('o')
    repository = 'compass-library-registration-release'
    head_commit = $preHeadCommit
    source_manifest_sha256 = $preManifestSha256
    source_file_count = $preSourceFileCount
    worktree_dirty = $preWorktreeDirty
    source_integrity_unchanged = $sourceIntegrityUnchanged
    source_integrity_state = $sourceIntegrityState
    source_snapshot_pre = [ordered]@{
        head_commit = $preHeadCommit
        source_manifest_sha256 = $preManifestSha256
        source_file_count = $preSourceFileCount
        worktree_dirty = $preWorktreeDirty
        worktree_status_sha256 = $preStatusSha256
    }
    source_snapshot_post = [ordered]@{
        head_commit = $postHeadCommit
        source_manifest_sha256 = $postManifestSha256
        source_file_count = $postSourceFileCount
        worktree_dirty = $postWorktreeDirty
        worktree_status_sha256 = $postStatusSha256
    }
    steps = $results
    failed_step = if ($null -ne $cleanupError) {
        'docker_cleanup'
    } elseif ($null -ne $runError) {
        $runFailedStep
    } elseif ($null -ne $sourceIntegrityError) {
        'source_integrity_post_cleanup'
    } else {
        $null
    }
    failure_code = if ($null -ne $cleanupError) {
        'docker_cleanup_failed'
    } elseif ($null -ne $runError -and $runError.Exception.Message -eq 'worktree_must_be_clean') {
        'worktree_must_be_clean'
    } elseif ($null -ne $runError) {
        'local_gate_step_failed'
    } elseif ($null -ne $sourceIntegrityError -and $sourceIntegrityState -eq 'changed') {
        'source_changed_during_gate'
    } elseif ($null -ne $sourceIntegrityError) {
        'source_integrity_check_failed'
    } else {
        $null
    }
    external_side_effects = $false
    google_drive_neon_cloudrun_contacted = $false
    container_registry_access_may_occur = $true
    terraform_registry_access_may_occur = $true
    real_pii_used = $false
    production_acceptance = $false
}
$evidence | ConvertTo-Json -Depth 6 | Set-Content `
    -LiteralPath $resolvedEvidence -Encoding utf8

if ($failed) {
    $reportedStep = if ($null -ne $cleanupError) {
        'docker_cleanup'
    } elseif ($null -ne $runError) {
        $runFailedStep
    } else {
        'source_integrity_post_cleanup'
    }
    throw "Local pre-Production-Gate failed at '$reportedStep'; sanitized evidence was written."
}
Write-Output "PASS: local pre-Production-Gate evidence written to $resolvedEvidence"
