[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:FSL_DATA_CLASSIFICATION -ne 'synthetic-only' -or
    $env:FSL_SYNTHETIC_BACKUP_CONFIRM -ne 'backup-synthetic-only') {
    throw 'Refusing backup: synthetic-only classification and confirmation are required.'
}
if ([string]::IsNullOrWhiteSpace($env:FSL_BACKUP_DATABASE_URL)) {
    throw 'FSL_BACKUP_DATABASE_URL must be set in the local environment.'
}
function Get-DockerPath {
    $command = Get-Command docker -ErrorAction SilentlyContinue
    if ($null -ne $command) { return $command.Source }
    $candidate = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
    throw 'Neither pg_dump nor Docker Desktop is available.'
}

$nativePgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
$dockerPath = if ($null -eq $nativePgDump) { Get-DockerPath } else { $null }

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
if ($resolvedOutput.StartsWith($repositoryRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Backup artifacts must be stored outside the Git worktree.'
}
if (Test-Path -LiteralPath $resolvedOutput) {
    throw 'Refusing to overwrite an existing backup artifact.'
}

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

try {
    Set-PgEnvironment $env:FSL_BACKUP_DATABASE_URL
    $parent = Split-Path -Parent $resolvedOutput
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent | Out-Null
    }
    if ($null -ne $nativePgDump) {
        & $nativePgDump.Source --format=custom --compress=9 --no-owner --no-privileges `
            --exclude-table-data=fsl_private.public_registration_rpc_keys `
            --file=$resolvedOutput
    }
    else {
        $leaf = Split-Path -Leaf $resolvedOutput
        & $dockerPath run --rm `
            --label com.compass.project=future-strategy-library-registration-backup `
            --mount "type=bind,source=$parent,target=/backup" `
            --env PGHOST --env PGPORT --env PGDATABASE --env PGUSER `
            --env PGPASSWORD --env PGSSLMODE --env PGCONNECT_TIMEOUT `
            postgres:17-bookworm pg_dump --format=custom --compress=9 `
            --no-owner --no-privileges `
            --exclude-table-data=fsl_private.public_registration_rpc_keys `
            --file="/backup/$leaf"
    }
    if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE." }
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedOutput).Hash.ToLowerInvariant()
    Set-Content -LiteralPath "$resolvedOutput.sha256" -Value $hash -Encoding ascii -NoNewline
    Write-Output "backup_status=pass sha256=$hash"
}
finally {
    'PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT' |
        ForEach-Object { Remove-Item "Env:$_" -ErrorAction SilentlyContinue }
}
