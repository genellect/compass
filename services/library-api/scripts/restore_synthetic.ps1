[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:FSL_DATA_CLASSIFICATION -ne 'synthetic-only' -or
    $env:FSL_SYNTHETIC_RESTORE_CONFIRM -ne 'restore-synthetic-only') {
    throw 'Refusing restore: synthetic-only classification and confirmation are required.'
}
if ([string]::IsNullOrWhiteSpace($env:FSL_RESTORE_TARGET_BRANCH) -or
    $env:FSL_RESTORE_TARGET_CONFIRM -ne $env:FSL_RESTORE_TARGET_BRANCH -or
    $env:FSL_RESTORE_TARGET_BRANCH -notmatch '(?i)(synthetic|restore|test|dev)') {
    throw 'Restore target must be an explicitly confirmed synthetic/dev/test/restore branch.'
}
if ([string]::IsNullOrWhiteSpace($env:FSL_RESTORE_DATABASE_URL)) {
    throw 'FSL_RESTORE_DATABASE_URL must be set in the local environment.'
}
$requiredRoleBindings = @(
    'FSL_API_RUNTIME_LOGIN',
    'FSL_ADMIN_RUNTIME_LOGIN',
    'FSL_WORKER_RUNTIME_LOGIN',
    'FSL_MIGRATION_LOGIN',
    'FSL_BACKUP_RESTORE_LOGIN'
)
foreach ($name in $requiredRoleBindings) {
    $item = Get-Item "Env:$name" -ErrorAction SilentlyContinue
    if ($null -eq $item -or [string]::IsNullOrWhiteSpace($item.Value)) {
        throw "$name is required to rebuild the restored privilege boundary."
    }
}
if ([string]::IsNullOrWhiteSpace($env:PUBLIC_REGISTRATION_RPC_KEY_VERSION) -or
    [string]::IsNullOrWhiteSpace($env:PUBLIC_REGISTRATION_RPC_TOKEN)) {
    throw 'The restored public RPC key version and token are required.'
}
function Get-DockerPath {
    $command = Get-Command docker -ErrorAction SilentlyContinue
    if ($null -ne $command) { return $command.Source }
    $candidate = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
    throw 'Neither pg_restore/psql nor Docker Desktop is available.'
}

$nativePgRestore = Get-Command pg_restore -ErrorAction SilentlyContinue
$nativePsql = Get-Command psql -ErrorAction SilentlyContinue
$useNativeClients = $null -ne $nativePgRestore -and $null -ne $nativePsql
$dockerPath = if ($useNativeClients) { $null } else { Get-DockerPath }
$serviceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$python = Join-Path $serviceRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    throw 'The service .venv is required to reprovision the public RPC key.'
}

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$hashPath = "$resolvedInput.sha256"
if (-not (Test-Path -LiteralPath $hashPath)) {
    throw 'A SHA-256 sidecar produced by backup_synthetic.ps1 is required.'
}
$expectedHash = (Get-Content -LiteralPath $hashPath -Raw).Trim().ToLowerInvariant()
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedInput).Hash.ToLowerInvariant()
if ($expectedHash -ne $actualHash) { throw 'Backup SHA-256 verification failed.' }

function Set-PgEnvironment([string]$ConnectionUrl) {
    $normalized = $ConnectionUrl -replace '^postgresql\+psycopg://', 'postgresql://'
    $uri = [Uri]$normalized
    if ($uri.Scheme -ne 'postgresql' -or [string]::IsNullOrWhiteSpace($uri.Host) -or
        $uri.Host -like '*-pooler.*' -or $uri.Query -notmatch '(^|[?&])sslmode=require(&|$)') {
        throw 'A TLS-required direct PostgreSQL URL is required.'
    }
    $userInfo = $uri.UserInfo.Split(':', 2)
    if ($userInfo.Count -ne 2) { throw 'Database user and password are required.' }
    $env:PGHOST = $uri.Host
    $env:PGPORT = if ($uri.Port -gt 0) { [string]$uri.Port } else { '5432' }
    $env:PGDATABASE = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
    $env:PGUSER = [Uri]::UnescapeDataString($userInfo[0])
    $env:PGPASSWORD = [Uri]::UnescapeDataString($userInfo[1])
    $env:PGSSLMODE = 'require'
    $env:PGCONNECT_TIMEOUT = '10'
}

function Invoke-RestoreRoleScript {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptName,
        [string[]]$Variables = @()
    )
    $arguments = @('--no-psqlrc')
    foreach ($variable in $Variables) {
        $arguments += @('-v', $variable)
    }
    if ($useNativeClients) {
        $arguments += @('--file', (Join-Path $PSScriptRoot $ScriptName))
        & $nativePsql.Source @arguments
    }
    else {
        $arguments += @('--file', "/scripts/$ScriptName")
        & $dockerPath run --rm `
            --label com.compass.project=future-strategy-library-registration-restore `
            --mount "type=bind,source=$PSScriptRoot,target=/scripts,readonly" `
            --env PGHOST --env PGPORT --env PGDATABASE --env PGUSER `
            --env PGPASSWORD --env PGSSLMODE --env PGCONNECT_TIMEOUT `
            postgres:17-bookworm psql @arguments
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Restored database role script failed: $ScriptName"
    }
}

try {
    Set-PgEnvironment $env:FSL_RESTORE_DATABASE_URL
    if ($useNativeClients) {
        $tableCount = (& $nativePsql.Source --no-psqlrc --tuples-only --no-align `
            --command="SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public'" ).Trim()
    }
    else {
        $tableCount = (& $dockerPath run --rm `
            --label com.compass.project=future-strategy-library-registration-restore `
            --env PGHOST --env PGPORT --env PGDATABASE --env PGUSER `
            --env PGPASSWORD --env PGSSLMODE --env PGCONNECT_TIMEOUT `
            postgres:17-bookworm psql --no-psqlrc --tuples-only --no-align `
            --command="SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public'" ).Trim()
    }
    if ($LASTEXITCODE -ne 0) { throw "Target emptiness check failed with exit code $LASTEXITCODE." }
    if ($tableCount -ne '0') { throw 'Restore target is not empty; --clean is intentionally unsupported.' }

    if ($useNativeClients) {
        & $nativePgRestore.Source --exit-on-error --single-transaction --no-owner `
            --no-privileges --dbname=$env:PGDATABASE $resolvedInput
    }
    else {
        $inputParent = Split-Path -Parent $resolvedInput
        $inputLeaf = Split-Path -Leaf $resolvedInput
        & $dockerPath run --rm `
            --label com.compass.project=future-strategy-library-registration-restore `
            --mount "type=bind,source=$inputParent,target=/backup,readonly" `
            --env PGHOST --env PGPORT --env PGDATABASE --env PGUSER `
            --env PGPASSWORD --env PGSSLMODE --env PGCONNECT_TIMEOUT `
            postgres:17-bookworm pg_restore --exit-on-error --single-transaction `
            --no-owner --no-privileges --dbname=$env:PGDATABASE "/backup/$inputLeaf"
    }
    if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE." }

    # The archive intentionally contains neither ACLs/owners nor the private
    # capability digest. Recreate the boundary and derive the digest from the
    # environment-only token before a restored database may be accepted.
    Invoke-RestoreRoleScript -ScriptName 'bootstrap_database_roles.sql'
    Invoke-RestoreRoleScript -ScriptName 'bind_database_roles.sql' -Variables @(
        "api_runtime_login=$env:FSL_API_RUNTIME_LOGIN",
        "admin_runtime_login=$env:FSL_ADMIN_RUNTIME_LOGIN",
        "worker_runtime_login=$env:FSL_WORKER_RUNTIME_LOGIN",
        "migration_login=$env:FSL_MIGRATION_LOGIN",
        "backup_restore_login=$env:FSL_BACKUP_RESTORE_LOGIN"
    )
    $previousDatabaseUrl = Get-Item 'Env:DATABASE_URL' -ErrorAction SilentlyContinue
    $previousDirectUrl = Get-Item 'Env:DATABASE_URL_UNPOOLED' -ErrorAction SilentlyContinue
    try {
        $env:DATABASE_URL = $env:FSL_RESTORE_DATABASE_URL
        $env:DATABASE_URL_UNPOOLED = $env:FSL_RESTORE_DATABASE_URL
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
    }
    finally {
        if ($null -eq $previousDatabaseUrl) {
            Remove-Item 'Env:DATABASE_URL' -ErrorAction SilentlyContinue
        }
        else {
            $env:DATABASE_URL = $previousDatabaseUrl.Value
        }
        if ($null -eq $previousDirectUrl) {
            Remove-Item 'Env:DATABASE_URL_UNPOOLED' -ErrorAction SilentlyContinue
        }
        else {
            $env:DATABASE_URL_UNPOOLED = $previousDirectUrl.Value
        }
    }
    Invoke-RestoreRoleScript -ScriptName 'grant_database_privileges.sql'
    Invoke-RestoreRoleScript -ScriptName 'audit_database_roles.sql'
    Write-Output "restore_status=pass sha256=$actualHash"
}
finally {
    'PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT' |
        ForEach-Object { Remove-Item "Env:$_" -ErrorAction SilentlyContinue }
}
