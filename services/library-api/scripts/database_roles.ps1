[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Bootstrap', 'Bind', 'Grant', 'Audit')]
    [string]$Action,

    [switch]$RegistrationOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($RegistrationOnly -and $Action -ne 'Bind') {
    throw '-RegistrationOnly is valid only with -Action Bind.'
}

if ($env:FSL_DATABASE_ROLE_CONFIRM -ne "apply-$($Action.ToLowerInvariant())") {
    throw "Set FSL_DATABASE_ROLE_CONFIRM=apply-$($Action.ToLowerInvariant()) for this one action."
}
function Get-DockerPath {
    $command = Get-Command docker -ErrorAction SilentlyContinue
    if ($null -ne $command) { return $command.Source }
    $candidate = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
    throw 'Neither psql nor Docker Desktop is available.'
}

$nativePsql = Get-Command psql -ErrorAction SilentlyContinue
$dockerPath = if ($null -eq $nativePsql) { Get-DockerPath } else { $null }

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

$scriptByAction = @{
    Bootstrap = 'bootstrap_database_roles.sql'
    Bind      = 'bind_database_roles.sql'
    Grant     = 'grant_database_privileges.sql'
    Audit     = 'audit_database_roles.sql'
}

try {
    $connectionVariable = if ($Action -eq 'Grant') {
        'FSL_DATABASE_MIGRATION_URL'
    }
    else {
        'FSL_DATABASE_OWNER_URL'
    }
    $connectionItem = Get-Item "Env:$connectionVariable" -ErrorAction SilentlyContinue
    if ($null -eq $connectionItem -or [string]::IsNullOrWhiteSpace($connectionItem.Value)) {
        throw "$connectionVariable must be set in the local environment for $Action."
    }
    Set-PgEnvironment $connectionItem.Value
    $scriptPath = if ($null -ne $nativePsql) {
        Join-Path $PSScriptRoot $scriptByAction[$Action]
    }
    else {
        "/scripts/$($scriptByAction[$Action])"
    }
    $arguments = @('--no-psqlrc', '--file', $scriptPath)
    if ($Action -eq 'Bind') {
        $requiredLoginNames = @(
            'FSL_API_RUNTIME_LOGIN',
            'FSL_WORKER_RUNTIME_LOGIN',
            'FSL_MIGRATION_LOGIN',
            'FSL_BACKUP_RESTORE_LOGIN'
        )
        if (-not $RegistrationOnly) {
            $requiredLoginNames += 'FSL_ADMIN_RUNTIME_LOGIN'
        }
        elseif (-not [string]::IsNullOrWhiteSpace($env:FSL_ADMIN_RUNTIME_LOGIN)) {
            throw 'Registration-only binding refuses an admin runtime login.'
        }
        foreach ($name in $requiredLoginNames) {
            $item = Get-Item "Env:$name" -ErrorAction SilentlyContinue
            if ($null -eq $item -or [string]::IsNullOrWhiteSpace($item.Value)) {
                throw "$name is required for role binding."
            }
        }
        $arguments += @(
            '-v', "api_runtime_login=$env:FSL_API_RUNTIME_LOGIN",
            '-v', "worker_runtime_login=$env:FSL_WORKER_RUNTIME_LOGIN",
            '-v', "migration_login=$env:FSL_MIGRATION_LOGIN",
            '-v', "backup_restore_login=$env:FSL_BACKUP_RESTORE_LOGIN"
        )
        if (-not $RegistrationOnly) {
            $arguments += @('-v', "admin_runtime_login=$env:FSL_ADMIN_RUNTIME_LOGIN")
        }
    }
    if ($null -ne $nativePsql) {
        & $nativePsql.Source @arguments
    }
    else {
        & $dockerPath run --rm `
            --label com.compass.project=future-strategy-library-registration-db-roles `
            --mount "type=bind,source=$PSScriptRoot,target=/scripts,readonly" `
            --env PGHOST --env PGPORT --env PGDATABASE --env PGUSER `
            --env PGPASSWORD --env PGSSLMODE --env PGCONNECT_TIMEOUT `
            postgres:17-bookworm psql @arguments
    }
    if ($LASTEXITCODE -ne 0) { throw "Database role $Action failed with exit code $LASTEXITCODE." }
    Write-Output "database_role_action=$($Action.ToLowerInvariant()) status=pass"
}
finally {
    'PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT' |
        ForEach-Object { Remove-Item "Env:$_" -ErrorAction SilentlyContinue }
}
