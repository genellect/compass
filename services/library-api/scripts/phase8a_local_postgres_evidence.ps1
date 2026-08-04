[CmdletBinding()]
param(
    [string]$EvidencePath = 'outputs/library-registration/phase8a-local-postgresql-evidence.json'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$serviceRoot = Join-Path $repositoryRoot 'services\library-api'
$python = Join-Path $serviceRoot '.venv\Scripts\python.exe'
$docker = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'
$containerName = 'fsl-phase8a-local-evidence'
$containerLabel = 'future-strategy-library-registration-phase8a-local-evidence'
$port = 55438
$password = 'fsl-phase8a-synthetic-only'
$sourceDatabase = 'fsl_phase8a_synthetic'
$targetDatabase = 'fsl_phase8a_restore_synthetic'
$sourceUrl = "postgresql+psycopg://postgres:$password@127.0.0.1:$port/$sourceDatabase"
$targetUrl = "postgresql+psycopg://postgres:$password@127.0.0.1:$port/$targetDatabase"
$resolvedEvidence = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $EvidencePath))
if (-not $resolvedEvidence.StartsWith($repositoryRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'EvidencePath must stay inside this repository.'
}
$evidenceParent = Split-Path -Parent $resolvedEvidence
if (-not (Test-Path -LiteralPath $evidenceParent)) {
    New-Item -ItemType Directory -Path $evidenceParent | Out-Null
}

function Write-SanitizedEvidence {
    param([Parameter(Mandatory = $true)] $Evidence)

    $temporaryPath = "$resolvedEvidence.tmp"
    $Evidence | ConvertTo-Json -Depth 8 | Set-Content `
        -LiteralPath $temporaryPath -Encoding utf8
    Move-Item -LiteralPath $temporaryPath -Destination $resolvedEvidence -Force
}

# Fail closed before any Docker work. An interrupted run must never leave a stale
# PASS artifact from an earlier execution at the canonical evidence path.
Write-SanitizedEvidence -Evidence ([ordered]@{
    status = 'fail'
    classification = 'synthetic-only'
    captured_at_utc = [DateTime]::UtcNow.ToString('o')
    failure_code = 'incomplete_or_interrupted'
    external_side_effects = $false
    remote_services_contacted = $false
    production_acceptance = $false
})

if (-not (Test-Path -LiteralPath $docker)) { throw 'Docker Desktop is required.' }
if (-not (Test-Path -LiteralPath $python)) { throw 'The service .venv is required.' }
if (& $docker ps -a --filter "name=^/$containerName$" --format '{{.ID}}') {
    throw "Refusing to reuse existing container $containerName."
}
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    throw "Refusing to use occupied localhost port $port."
}

$environmentNames = @(
    'APP_ENV','DATABASE_URL','DATABASE_URL_UNPOOLED','FSL_DATA_CLASSIFICATION',
    'FSL_PHASE8A_LOCAL_EVIDENCE','EXTERNAL_SIDE_EFFECTS_ENABLED',
    'PHASE7_DRIVE_API_ENABLED','PHASE7_DRIVE_KILL_SWITCH',
    'FSL_BACKUP_DATABASE_URL','FSL_RESTORE_DATABASE_URL',
    'PUBLIC_REGISTRATION_RPC_KEY_VERSION','PUBLIC_REGISTRATION_RPC_TOKEN'
)
$previousEnvironment = @{}
foreach ($name in $environmentNames) {
    $item = Get-Item "Env:$name" -ErrorAction SilentlyContinue
    $previousEnvironment[$name] = if ($null -eq $item) { $null } else { $item.Value }
}

function Invoke-DatabaseRoleScript {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptName,
        [string]$DatabaseName = $sourceDatabase,
        [string[]]$Variables = @()
    )
    $arguments = @(
        'exec', $containerName,
        'psql', '--no-psqlrc', '-U', 'postgres', '-d', $DatabaseName
    )
    foreach ($variable in $Variables) {
        $arguments += @('-v', $variable)
    }
    $arguments += @('--file', "/scripts/$ScriptName")
    & $docker @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Database role script failed: $ScriptName"
    }
}

$containerId = $null
try {
    $containerId = & $docker run -d --name $containerName `
        --label "com.compass.project=$containerLabel" `
        --memory 1g --cpus 1.0 --publish "127.0.0.1:${port}:5432" `
        --mount "type=bind,source=$PSScriptRoot,target=/scripts,readonly" `
        --env "POSTGRES_PASSWORD=$password" --env "POSTGRES_DB=$sourceDatabase" `
        postgres:17-bookworm
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic PostgreSQL container failed to start.' }

    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        # The official image starts a socket-only temporary server while it
        # initializes a fresh data directory. TCP succeeds only for the final
        # server and avoids racing its planned fast shutdown.
        & $docker exec $containerName pg_isready -h 127.0.0.1 `
            -U postgres -d $sourceDatabase *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Synthetic PostgreSQL container was not ready.' }

    Invoke-DatabaseRoleScript -ScriptName 'bootstrap_database_roles.sql'
    Invoke-DatabaseRoleScript -ScriptName 'bind_database_roles.sql' -Variables @(
        'api_runtime_login=postgres',
        'admin_runtime_login=postgres',
        'worker_runtime_login=postgres',
        'migration_login=postgres',
        'backup_restore_login=postgres'
    )

    $env:APP_ENV = 'phase8a-local-synthetic'
    $env:DATABASE_URL = $sourceUrl
    $env:DATABASE_URL_UNPOOLED = $sourceUrl
    $env:FSL_DATA_CLASSIFICATION = 'synthetic-only'
    $env:FSL_PHASE8A_LOCAL_EVIDENCE = 'confirmed'
    $env:EXTERNAL_SIDE_EFFECTS_ENABLED = 'false'
    $env:PHASE7_DRIVE_API_ENABLED = 'false'
    $env:PHASE7_DRIVE_KILL_SWITCH = 'true'
    $env:PUBLIC_REGISTRATION_RPC_KEY_VERSION = 'v1'
    $env:PUBLIC_REGISTRATION_RPC_TOKEN = `
        'local-synthetic-public-rpc-token-v1-000000'

    Push-Location $serviceRoot
    try {
        & $python -m alembic upgrade head
        if ($LASTEXITCODE -ne 0) { throw 'Alembic upgrade failed.' }
        & $python -m scripts.provision_public_rpc_key
        if ($LASTEXITCODE -ne 0) { throw 'Public RPC key provisioning failed.' }
        Invoke-DatabaseRoleScript -ScriptName 'grant_database_privileges.sql'
        Invoke-DatabaseRoleScript -ScriptName 'audit_database_roles.sql'
        $loadLine = (& $python -m scripts.verify_phase8a_local_load | Select-Object -Last 1)
        if ($LASTEXITCODE -ne 0) { throw 'Synthetic load verification failed.' }
        $loadEvidence = $loadLine | ConvertFrom-Json
    }
    finally {
        Pop-Location
    }

    & $docker exec $containerName pg_dump --format=custom --compress=9 `
        --no-owner --no-privileges -U postgres -d $sourceDatabase `
        --exclude-table-data=fsl_private.public_registration_rpc_keys `
        --file=/tmp/fsl-phase8a-synthetic.dump
    if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed.' }
    $dumpHash = (& $docker exec $containerName sha256sum /tmp/fsl-phase8a-synthetic.dump).Split(' ')[0]

    & $docker exec $containerName createdb -U postgres $targetDatabase
    if ($LASTEXITCODE -ne 0) { throw 'Restore target database creation failed.' }
    & $docker exec $containerName pg_restore --exit-on-error --single-transaction `
        --no-owner --no-privileges -U postgres -d $targetDatabase `
        /tmp/fsl-phase8a-synthetic.dump
    if ($LASTEXITCODE -ne 0) { throw 'pg_restore failed.' }

    # --no-owner/--no-privileges deliberately strips the source trust boundary,
    # and the capability digest is deliberately absent from the dump. Rebuild
    # ownership/ACLs and provision the digest from environment-only material.
    Invoke-DatabaseRoleScript -ScriptName 'bootstrap_database_roles.sql' `
        -DatabaseName $targetDatabase
    Invoke-DatabaseRoleScript -ScriptName 'bind_database_roles.sql' `
        -DatabaseName $targetDatabase -Variables @(
            'api_runtime_login=postgres',
            'admin_runtime_login=postgres',
            'worker_runtime_login=postgres',
            'migration_login=postgres',
            'backup_restore_login=postgres'
        )
    $env:DATABASE_URL = $targetUrl
    $env:DATABASE_URL_UNPOOLED = $targetUrl
    Push-Location $serviceRoot
    try {
        & $python -m scripts.provision_public_rpc_key
        if ($LASTEXITCODE -ne 0) {
            throw 'Restored public RPC key provisioning failed.'
        }
    }
    finally {
        Pop-Location
    }
    Invoke-DatabaseRoleScript -ScriptName 'grant_database_privileges.sql' `
        -DatabaseName $targetDatabase
    Invoke-DatabaseRoleScript -ScriptName 'audit_database_roles.sql' `
        -DatabaseName $targetDatabase

    $env:FSL_BACKUP_DATABASE_URL = $sourceUrl
    $env:FSL_RESTORE_DATABASE_URL = $targetUrl
    Push-Location $serviceRoot
    try {
        $restoreLine = (& $python -m scripts.verify_synthetic_restore | Select-Object -Last 1)
        if ($LASTEXITCODE -ne 0) { throw 'Restore comparison failed.' }
        $restoreEvidence = $restoreLine | ConvertFrom-Json
    }
    finally {
        Pop-Location
    }

    $evidence = [ordered]@{
        status = 'pass'
        classification = 'synthetic-only'
        captured_at_utc = [DateTime]::UtcNow.ToString('o')
        docker_postgresql = '17-bookworm'
        source_database_label = 'local-synthetic-source'
        target_database_label = 'local-synthetic-restore'
        load = $loadEvidence
        backup = [ordered]@{ format = 'custom'; sha256 = $dumpHash }
        restore = $restoreEvidence
        external_side_effects = $false
        remote_services_contacted = $false
    }
    Write-SanitizedEvidence -Evidence $evidence
    Write-Output "phase8a_local_postgresql_evidence=pass path=$resolvedEvidence"
}
catch {
    Write-SanitizedEvidence -Evidence ([ordered]@{
        status = 'fail'
        classification = 'synthetic-only'
        captured_at_utc = [DateTime]::UtcNow.ToString('o')
        failure_code = 'phase8a_local_evidence_failed'
        external_side_effects = $false
        remote_services_contacted = $false
        production_acceptance = $false
    })
    throw
}
finally {
    foreach ($name in $environmentNames) {
        $value = $previousEnvironment[$name]
        if ($null -eq $value) {
            Remove-Item "Env:$name" -ErrorAction SilentlyContinue
        }
        else {
            Set-Item "Env:$name" $value
        }
    }
    if ($containerId) {
        $labelsJson = & $docker inspect --format '{{json .Config.Labels}}' $containerName 2>$null
        if ($labelsJson -and ($labelsJson | ConvertFrom-Json).'com.compass.project' -eq $containerLabel) {
            & $docker rm -f $containerName *> $null
        }
    }
}
