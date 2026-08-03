[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory,

    [switch]$IncludeAdmin
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ownerUrlVariable = 'FSL_PREVIEW_DATABASE_OWNER_URL'
$confirmationVariable = 'FSL_PREVIEW_DATABASE_PROVISION_CONFIRM'
$requiredConfirmation = 'provision-fixed-preview-login-roles'
$bundleFileName = 'fsl-preview-database-credentials.dpapi'
$fingerprintFileName = 'fsl-preview-database-credential-fingerprints.json'
$bundlePurpose = 'compass-fsl-registration-preview-neon-logins'
$bundleSchemaVersion = 1
$dpapiEntropyText = 'COMPASS-FSL-PREVIEW-DATABASE-CREDENTIALS-V1'

$roleDefinitions = @(
    [pscustomobject]@{
        key = 'api'
        name = 'fsl_preview_api_login'
        capability = 'fsl_api_runtime'
        connection_limit = 10
    },
    [pscustomobject]@{
        key = 'worker'
        name = 'fsl_preview_worker_login'
        capability = 'fsl_worker_runtime'
        connection_limit = 5
    },
    [pscustomobject]@{
        key = 'migration'
        name = 'fsl_preview_migration_login'
        capability = 'fsl_migration'
        connection_limit = 2
    },
    [pscustomobject]@{
        key = 'backup'
        name = 'fsl_preview_backup_restore_login'
        capability = 'fsl_backup_restore'
        connection_limit = 2
    }
)
if ($IncludeAdmin) {
    $roleDefinitions += [pscustomobject]@{
        key = 'admin'
        name = 'fsl_preview_admin_login'
        capability = 'fsl_admin_runtime'
        connection_limit = 5
    }
}

function Get-ProcessEnvironmentValue {
    param([Parameter(Mandatory = $true)][string]$Name)

    return [Environment]::GetEnvironmentVariable(
        $Name,
        [EnvironmentVariableTarget]::Process
    )
}

function Get-Sha256Hex {
    param([Parameter(Mandatory = $true)][byte[]]$Bytes)

    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        return -join ($algorithm.ComputeHash($Bytes) | ForEach-Object {
            $_.ToString('x2')
        })
    }
    finally {
        $algorithm.Dispose()
    }
}

function ConvertTo-Utf8Bytes {
    param([Parameter(Mandatory = $true)][string]$Value)

    return [Text.Encoding]::UTF8.GetBytes($Value)
}

function Get-SqlLiteral {
    param([Parameter(Mandatory = $true)][string]$Value)

    return "'$($Value.Replace("'", "''"))'"
}

function Get-ConnectionDetails {
    param([Parameter(Mandatory = $true)][string]$RawUrl)

    if ([string]::IsNullOrWhiteSpace($RawUrl)) {
        throw "$ownerUrlVariable must be set in the current process environment."
    }
    try {
        $uri = [Uri]$RawUrl.Trim()
    }
    catch {
        throw 'The preview database owner URL is not a valid absolute URI.'
    }
    if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne 'postgresql') {
        throw 'The preview database owner URL must use postgresql://.'
    }
    if (-not [string]::IsNullOrEmpty($uri.Fragment)) {
        throw 'The preview database owner URL must not contain a fragment.'
    }

    $hostName = $uri.DnsSafeHost.ToLowerInvariant()
    if ($hostName -notmatch '^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*\.neon\.tech$') {
        throw 'The preview database owner URL must target a Neon endpoint.'
    }
    $firstLabel = $hostName.Split('.')[0]
    if ($firstLabel.EndsWith('-pooler', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'A direct Neon owner URL is required; pooled owner URLs are refused.'
    }

    $userInfo = $uri.UserInfo.Split(':', 2)
    if ($userInfo.Count -ne 2) {
        throw 'The preview database owner URL must contain a user and password.'
    }
    $userName = [Uri]::UnescapeDataString($userInfo[0])
    $password = [Uri]::UnescapeDataString($userInfo[1])
    if ($userName -notmatch '^[a-z_][a-z0-9_]{0,62}$' -or
        [string]::IsNullOrWhiteSpace($password)) {
        throw 'The preview database owner URL contains an invalid login.'
    }

    $database = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($database) -or $database.Contains('/')) {
        throw 'The preview database owner URL must name exactly one database.'
    }

    $query = @{}
    foreach ($part in $uri.Query.TrimStart('?').Split(
        @('&'),
        [StringSplitOptions]::RemoveEmptyEntries
    )) {
        $pair = $part.Split('=', 2)
        if ($pair.Count -ne 2) {
            throw 'The preview database owner URL contains an invalid query parameter.'
        }
        $name = [Uri]::UnescapeDataString($pair[0]).ToLowerInvariant()
        $value = [Uri]::UnescapeDataString($pair[1]).ToLowerInvariant()
        if ($query.ContainsKey($name)) {
            throw 'The preview database owner URL contains a duplicate query parameter.'
        }
        $query[$name] = $value
    }
    $unexpectedParameters = @($query.Keys | Where-Object {
        $_ -notin @('sslmode', 'channel_binding')
    })
    if ($unexpectedParameters.Count -ne 0 -or
        $query['sslmode'] -ne 'require' -or
        $query['channel_binding'] -ne 'require') {
        throw 'The direct owner URL must use sslmode=require and channel_binding=require only.'
    }

    $port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
    $pooledHost = "$firstLabel-pooler.$(($hostName.Split('.')[1..($hostName.Split('.').Count - 1)]) -join '.')"
    return [pscustomobject]@{
        host = $hostName
        pooled_host = $pooledHost
        port = $port
        database = $database
        username = $userName
        password = $password
    }
}

function New-StrongPassword {
    $bytes = New-Object byte[] 48
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
        return [Convert]::ToBase64String($bytes).TrimEnd('=').
            Replace('+', '-').Replace('/', '_')
    }
    finally {
        [Array]::Clear($bytes, 0, $bytes.Length)
        $generator.Dispose()
    }
}

function New-DatabaseUrl {
    param(
        [Parameter(Mandatory = $true)][string]$HostName,
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$Database,
        [Parameter(Mandatory = $true)][string]$UserName,
        [Parameter(Mandatory = $true)][string]$Password
    )

    $encodedDatabase = [Uri]::EscapeDataString($Database)
    $encodedUserName = [Uri]::EscapeDataString($UserName)
    $encodedPassword = [Uri]::EscapeDataString($Password)
    return "postgresql://${encodedUserName}:${encodedPassword}@${HostName}:${Port}/${encodedDatabase}?sslmode=require&channel_binding=require"
}

function Set-CurrentUserOnlyAcl {
    param([Parameter(Mandatory = $true)][string]$Path)

    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($null -eq $identity) {
        throw 'The current Windows user SID could not be resolved.'
    }
    $security = New-Object Security.AccessControl.FileSecurity
    $security.SetOwner($identity)
    $security.SetAccessRuleProtection($true, $false)
    $security.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(
        $identity,
        [Security.AccessControl.FileSystemRights]::FullControl,
        [Security.AccessControl.AccessControlType]::Allow
    )))
    [IO.File]::SetAccessControl($Path, $security)
}

function Protect-BundleBytes {
    param([Parameter(Mandatory = $true)][string]$Json)

    if ($env:OS -ne 'Windows_NT') {
        throw 'Windows host-user DPAPI is required for preview database credentials.'
    }
    Add-Type -AssemblyName System.Security
    $plainBytes = ConvertTo-Utf8Bytes $Json
    $entropyBytes = ConvertTo-Utf8Bytes $dpapiEntropyText
    try {
        return [Security.Cryptography.ProtectedData]::Protect(
            $plainBytes,
            $entropyBytes,
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
    }
    finally {
        [Array]::Clear($plainBytes, 0, $plainBytes.Length)
        [Array]::Clear($entropyBytes, 0, $entropyBytes.Length)
    }
}

function Unprotect-BundleJson {
    param([Parameter(Mandatory = $true)][byte[]]$ProtectedBytes)

    if ($env:OS -ne 'Windows_NT') {
        throw 'Windows host-user DPAPI is required for preview database credentials.'
    }
    Add-Type -AssemblyName System.Security
    $entropyBytes = ConvertTo-Utf8Bytes $dpapiEntropyText
    $plainBytes = $null
    try {
        $plainBytes = [Security.Cryptography.ProtectedData]::Unprotect(
            $ProtectedBytes,
            $entropyBytes,
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        return [Text.Encoding]::UTF8.GetString($plainBytes)
    }
    catch {
        throw 'The existing credential bundle cannot be decrypted by this Windows user.'
    }
    finally {
        if ($null -ne $plainBytes) {
            [Array]::Clear($plainBytes, 0, $plainBytes.Length)
        }
        [Array]::Clear($entropyBytes, 0, $entropyBytes.Length)
    }
}

function Write-ProtectedBundle {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][object]$Bundle
    )

    $json = $Bundle | ConvertTo-Json -Depth 8 -Compress
    $protectedBytes = Protect-BundleBytes $json
    $temporaryPath = "$Path.$PID.tmp"
    try {
        [IO.File]::WriteAllBytes($temporaryPath, $protectedBytes)
        Set-CurrentUserOnlyAcl $temporaryPath
        Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
        Set-CurrentUserOnlyAcl $Path
        return Get-Sha256Hex $protectedBytes
    }
    finally {
        if (Test-Path -LiteralPath $temporaryPath) {
            Remove-Item -LiteralPath $temporaryPath -Force
        }
        [Array]::Clear($protectedBytes, 0, $protectedBytes.Length)
        $json = $null
    }
}

function Write-FingerprintFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][object]$Bundle,
        [Parameter(Mandatory = $true)][string]$BundleSha256
    )

    $fingerprints = [ordered]@{
        schema_version = 1
        purpose = $bundlePurpose
        state = $Bundle.state
        updated_at_utc = [DateTimeOffset]::UtcNow.ToString('o')
        endpoint_fingerprint_sha256 = $Bundle.endpoint_fingerprint_sha256
        protected_bundle_sha256 = $BundleSha256
        role_names = @($Bundle.roles | ForEach-Object { $_.name })
        credentials_printed = $false
    }
    $json = $fingerprints | ConvertTo-Json -Depth 5
    $temporaryPath = "$Path.$PID.tmp"
    try {
        [IO.File]::WriteAllText(
            $temporaryPath,
            $json,
            (New-Object Text.UTF8Encoding($false))
        )
        Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
    }
    finally {
        if (Test-Path -LiteralPath $temporaryPath) {
            Remove-Item -LiteralPath $temporaryPath -Force
        }
        $json = $null
    }
}

function Resolve-SafeOutputDirectory {
    param([Parameter(Mandatory = $true)][string]$RequestedPath)

    if ([string]::IsNullOrWhiteSpace($RequestedPath)) {
        throw 'OutputDirectory must be an operator-supplied path.'
    }
    $candidate = [IO.Path]::GetFullPath($RequestedPath)
    if (-not (Test-Path -LiteralPath $candidate)) {
        New-Item -ItemType Directory -Path $candidate -Force | Out-Null
    }
    $resolved = (Resolve-Path -LiteralPath $candidate).Path.TrimEnd(
        [IO.Path]::DirectorySeparatorChar,
        [IO.Path]::AltDirectorySeparatorChar
    )
    $repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path.TrimEnd(
        [IO.Path]::DirectorySeparatorChar,
        [IO.Path]::AltDirectorySeparatorChar
    )
    $repoPrefix = "$repoRoot$([IO.Path]::DirectorySeparatorChar)"
    if ($resolved.Equals($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The credential output directory cannot be the repository root.'
    }
    if ($resolved.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        $relativePath = $resolved.Substring($repoPrefix.Length).Replace('\', '/')
        $git = Get-Command git -ErrorAction SilentlyContinue
        if ($null -eq $git) {
            throw 'git is required to prove that an in-repository output directory is ignored.'
        }
        & $git.Source -C $repoRoot check-ignore --quiet --no-index -- "$relativePath/"
        if ($LASTEXITCODE -ne 0) {
            throw 'An in-repository credential output directory must be covered by .gitignore.'
        }
    }
    return $resolved
}

function Get-DatabaseClient {
    $nativePsql = Get-Command psql -ErrorAction SilentlyContinue
    if ($null -ne $nativePsql) {
        return [pscustomobject]@{ kind = 'native'; path = $nativePsql.Source }
    }

    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if ($null -eq $docker) {
        $candidate = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'
        if (Test-Path -LiteralPath $candidate) {
            $docker = [pscustomobject]@{ Source = $candidate }
        }
    }
    if ($null -eq $docker) {
        throw 'PostgreSQL 17 psql or Docker Desktop is required.'
    }
    return [pscustomobject]@{ kind = 'docker'; path = $docker.Source }
}

function Invoke-PsqlStdin {
    param(
        [Parameter(Mandatory = $true)][object]$Client,
        [Parameter(Mandatory = $true)][object]$Connection,
        [Parameter(Mandatory = $true)][string]$Sql
    )

    $startInfo = New-Object Diagnostics.ProcessStartInfo
    $startInfo.FileName = $Client.path
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    if ($Client.kind -eq 'native') {
        $startInfo.Arguments = '--no-psqlrc --set=ON_ERROR_STOP=1 --set=VERBOSITY=terse --tuples-only --no-align --quiet'
    }
    else {
        $startInfo.Arguments = @(
            'run --rm -i',
            '--label com.compass.project=future-strategy-library-registration-preview-db-logins',
            '--env PGHOST --env PGPORT --env PGDATABASE --env PGUSER',
            '--env PGPASSWORD --env PGSSLMODE --env PGCHANNELBINDING',
            '--env PGCONNECT_TIMEOUT',
            'postgres:17-bookworm psql',
            '--no-psqlrc --set=ON_ERROR_STOP=1 --set=VERBOSITY=terse',
            '--tuples-only --no-align --quiet'
        ) -join ' '
    }
    foreach ($item in @{
        PGHOST = $Connection.host
        PGPORT = [string]$Connection.port
        PGDATABASE = $Connection.database
        PGUSER = $Connection.username
        PGPASSWORD = $Connection.password
        PGSSLMODE = 'require'
        PGCHANNELBINDING = 'require'
        PGCONNECT_TIMEOUT = '10'
    }.GetEnumerator()) {
        $startInfo.EnvironmentVariables[$item.Key] = $item.Value
    }

    $process = New-Object Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) {
            throw 'The PostgreSQL client did not start.'
        }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.StandardInput.Write($Sql)
        $process.StandardInput.Close()
        if (-not $process.WaitForExit(60000)) {
            try { $process.Kill() } catch { }
            throw 'The PostgreSQL client exceeded the 60 second safety timeout.'
        }
        $stdout = $stdoutTask.GetAwaiter().GetResult()
        $null = $stderrTask.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) {
            throw "The PostgreSQL command failed with exit code $($process.ExitCode); detailed output was suppressed."
        }
        return $stdout.Trim()
    }
    finally {
        $Sql = $null
        if ($null -ne $process) {
            $process.Dispose()
        }
    }
}

function Get-EndpointFingerprint {
    param([Parameter(Mandatory = $true)][object]$Connection)

    $material = "$($Connection.host):$($Connection.port)/$($Connection.database)"
    return Get-Sha256Hex (ConvertTo-Utf8Bytes $material)
}

function Get-ExistingRoleState {
    param(
        [Parameter(Mandatory = $true)][object]$Client,
        [Parameter(Mandatory = $true)][object]$Connection
    )

    $roleNames = @($roleDefinitions | ForEach-Object { Get-SqlLiteral $_.name }) -join ', '
    $sql = @"
SELECT 'owner|' || current_user || '|' ||
       (role.rolsuper)::text || '|' ||
       (role.rolcreaterole)::text || '|' ||
       EXISTS (
           SELECT 1
           FROM pg_database AS database
           WHERE database.datname = current_database()
             AND database.datdba = role.oid
       )::text
FROM pg_roles AS role
WHERE role.rolname = current_user;
SELECT 'role|' || rolname
FROM pg_roles
WHERE rolname IN ($roleNames)
ORDER BY rolname;
"@
    $lines = @(Invoke-PsqlStdin -Client $Client -Connection $Connection -Sql $sql |
        ForEach-Object { $_ -split "`r?`n" } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $ownerLine = @($lines | Where-Object { $_.StartsWith('owner|') })
    if ($ownerLine.Count -ne 1) {
        throw 'The owner preflight did not return exactly one owner identity.'
    }
    $ownerParts = $ownerLine[0].Split('|')
    if ($ownerParts.Count -ne 5 -or
        $ownerParts[1] -ne $Connection.username -or
        $ownerParts[2] -ne 'false' -or
        $ownerParts[3] -ne 'true' -or
        $ownerParts[4] -ne 'true') {
        throw 'The connection must be the non-superuser owner of this database with CREATEROLE.'
    }
    if (@($roleDefinitions | Where-Object { $_.name -eq $ownerParts[1] }).Count -ne 0) {
        throw 'The database owner cannot be reused as a preview service login.'
    }
    return @($lines | Where-Object { $_.StartsWith('role|') } |
        ForEach-Object { $_.Substring('role|'.Length) })
}

function New-CredentialBundle {
    param(
        [Parameter(Mandatory = $true)][object]$Connection,
        [Parameter(Mandatory = $true)][string]$EndpointFingerprint
    )

    $passwords = New-Object 'Collections.Generic.HashSet[string]'
    $roles = @()
    foreach ($definition in $roleDefinitions) {
        do {
            $password = New-StrongPassword
        } while (-not $passwords.Add($password))
        $roles += [pscustomobject][ordered]@{
            key = $definition.key
            name = $definition.name
            capability = $definition.capability
            connection_limit = $definition.connection_limit
            direct_url = New-DatabaseUrl `
                -HostName $Connection.host `
                -Port $Connection.port `
                -Database $Connection.database `
                -UserName $definition.name `
                -Password $password
            pooled_url = New-DatabaseUrl `
                -HostName $Connection.pooled_host `
                -Port $Connection.port `
                -Database $Connection.database `
                -UserName $definition.name `
                -Password $password
        }
        $password = $null
    }
    return [pscustomobject][ordered]@{
        schema_version = $bundleSchemaVersion
        purpose = $bundlePurpose
        state = 'pending'
        created_at_utc = [DateTimeOffset]::UtcNow.ToString('o')
        endpoint_fingerprint_sha256 = $EndpointFingerprint
        include_admin = [bool]$IncludeAdmin
        roles = $roles
    }
}

function Test-AndHydrateExistingBundle {
    param(
        [Parameter(Mandatory = $true)][object]$Bundle,
        [Parameter(Mandatory = $true)][object]$Connection,
        [Parameter(Mandatory = $true)][string]$EndpointFingerprint
    )

    if ($Bundle.schema_version -ne $bundleSchemaVersion -or
        $Bundle.purpose -ne $bundlePurpose -or
        $Bundle.endpoint_fingerprint_sha256 -ne $EndpointFingerprint -or
        [bool]$Bundle.include_admin -ne [bool]$IncludeAdmin -or
        $Bundle.state -notin @('pending', 'provisioned')) {
        throw 'The existing credential bundle does not match this endpoint and role set.'
    }
    $expectedNames = @($roleDefinitions | ForEach-Object { $_.name } | Sort-Object)
    $actualNames = @($Bundle.roles | ForEach-Object { [string]$_.name } | Sort-Object)
    if (($actualNames -join '|') -ne ($expectedNames -join '|')) {
        throw 'The existing credential bundle has an unexpected fixed role set.'
    }

    $seenPasswords = New-Object 'Collections.Generic.HashSet[string]'
    foreach ($entry in $Bundle.roles) {
        $definition = @($roleDefinitions | Where-Object { $_.name -eq $entry.name })
        if ($definition.Count -ne 1 -or
            $entry.capability -ne $definition[0].capability -or
            [int]$entry.connection_limit -ne [int]$definition[0].connection_limit) {
            throw 'The existing credential bundle has an invalid role definition.'
        }
        try {
            $direct = [Uri]$entry.direct_url
            $pooled = [Uri]$entry.pooled_url
        }
        catch {
            throw 'The existing credential bundle contains an invalid protected URL.'
        }
        $directUserInfo = $direct.UserInfo.Split(':', 2)
        $pooledUserInfo = $pooled.UserInfo.Split(':', 2)
        if ($directUserInfo.Count -ne 2 -or $pooledUserInfo.Count -ne 2) {
            throw 'The existing credential bundle contains an incomplete protected URL.'
        }
        $directUser = [Uri]::UnescapeDataString($directUserInfo[0])
        $directPassword = [Uri]::UnescapeDataString($directUserInfo[1])
        $pooledUser = [Uri]::UnescapeDataString($pooledUserInfo[0])
        $pooledPassword = [Uri]::UnescapeDataString($pooledUserInfo[1])
        if ($direct.Scheme -ne 'postgresql' -or
            $direct.DnsSafeHost -ne $Connection.host -or
            $pooled.DnsSafeHost -ne $Connection.pooled_host -or
            $directUser -ne $entry.name -or
            $pooledUser -ne $entry.name -or
            $directPassword -ne $pooledPassword -or
            $directPassword -notmatch '^[A-Za-z0-9_-]{64}$' -or
            -not $seenPasswords.Add($directPassword)) {
            throw 'The existing credential bundle failed its protected URL boundary check.'
        }
        Add-Member -InputObject $entry -MemberType NoteProperty `
            -Name password -Value $directPassword -Force
    }
    return $Bundle
}

function Add-PasswordsToNewBundle {
    param([Parameter(Mandatory = $true)][object]$Bundle)

    foreach ($entry in $Bundle.roles) {
        $uri = [Uri]$entry.direct_url
        $password = [Uri]::UnescapeDataString($uri.UserInfo.Split(':', 2)[1])
        Add-Member -InputObject $entry -MemberType NoteProperty `
            -Name password -Value $password -Force
    }
    return $Bundle
}

function Invoke-RoleProvisioning {
    param(
        [Parameter(Mandatory = $true)][object]$Client,
        [Parameter(Mandatory = $true)][object]$Connection,
        [Parameter(Mandatory = $true)][object]$Bundle
    )

    $values = @($Bundle.roles | ForEach-Object {
        "($(Get-SqlLiteral $_.name), $(Get-SqlLiteral $_.capability), $(Get-SqlLiteral $_.password), $([int]$_.connection_limit))"
    }) -join ",`n        "
    $roleNames = @($Bundle.roles | ForEach-Object { Get-SqlLiteral $_.name }) -join ', '
    $expectedCount = @($Bundle.roles).Count
    $sql = @"
BEGIN;
SET LOCAL client_min_messages = warning;
DO `$fsl_preview_login_provision`$
DECLARE
    target record;
    existing_role pg_roles%ROWTYPE;
BEGIN
    IF (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
        RAISE EXCEPTION 'superuser provisioning is refused';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_database AS database
        JOIN pg_roles AS owner ON owner.oid = database.datdba
        WHERE database.datname = current_database()
          AND owner.rolname = current_user
    ) THEN
        RAISE EXCEPTION 'current login is not the database owner';
    END IF;

    FOR target IN
        SELECT *
        FROM (VALUES
        $values
        ) AS expected(role_name, capability_name, role_password, connection_limit)
    LOOP
        IF target.role_name = current_user THEN
            RAISE EXCEPTION 'database owner reuse is refused';
        END IF;
        SELECT * INTO existing_role
        FROM pg_roles
        WHERE rolname = target.role_name;

        IF FOUND THEN
            IF existing_role.rolsuper OR existing_role.rolcreatedb OR
               existing_role.rolcreaterole OR existing_role.rolreplication OR
               existing_role.rolbypassrls OR NOT existing_role.rolcanlogin OR
               NOT existing_role.rolinherit THEN
                RAISE EXCEPTION 'fixed preview role has unsafe attributes';
            END IF;
            IF EXISTS (
                SELECT 1
                FROM pg_auth_members AS membership
                JOIN pg_roles AS granted_role ON granted_role.oid = membership.roleid
                WHERE membership.member = existing_role.oid
                  AND granted_role.rolname <> target.capability_name
            ) THEN
                RAISE EXCEPTION 'fixed preview role has unexpected membership';
            END IF;
            IF EXISTS (SELECT 1 FROM pg_database WHERE datdba = existing_role.oid) OR
               EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = existing_role.oid) OR
               EXISTS (SELECT 1 FROM pg_class WHERE relowner = existing_role.oid) OR
               EXISTS (SELECT 1 FROM pg_proc WHERE proowner = existing_role.oid) THEN
                RAISE EXCEPTION 'fixed preview role owns database objects';
            END IF;
        ELSE
            EXECUTE format(
                'CREATE ROLE %I LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT %s PASSWORD %L',
                target.role_name,
                target.connection_limit,
                target.role_password
            );
        END IF;

        EXECUTE format(
            -- Existing roles were checked above and new roles are created with
            -- the restricted attributes. A managed PostgreSQL CREATEROLE
            -- principal cannot restate NOSUPERUSER/NOCREATEDB/etc. in ALTER
            -- ROLE because those clauses are treated as privileged attribute
            -- changes even when their values are already false.
            'ALTER ROLE %I LOGIN INHERIT CONNECTION LIMIT %s PASSWORD %L VALID UNTIL %L',
            target.role_name,
            target.connection_limit,
            target.role_password,
            'infinity'
        );
    END LOOP;
END
`$fsl_preview_login_provision`$;

SELECT count(*)::text
FROM pg_roles AS role
WHERE role.rolname IN ($roleNames)
  AND role.rolcanlogin
  AND role.rolinherit
  AND NOT role.rolsuper
  AND NOT role.rolcreatedb
  AND NOT role.rolcreaterole
  AND NOT role.rolreplication
  AND NOT role.rolbypassrls
  AND NOT EXISTS (SELECT 1 FROM pg_database WHERE datdba = role.oid)
  AND NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = role.oid)
  AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relowner = role.oid)
  AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proowner = role.oid);
COMMIT;
"@
    $result = Invoke-PsqlStdin -Client $Client -Connection $Connection -Sql $sql
    $lastLine = @($result -split "`r?`n" | Where-Object {
        -not [string]::IsNullOrWhiteSpace($_)
    })[-1]
    if ($lastLine -ne [string]$expectedCount) {
        throw 'The post-provision fixed-role audit did not return the expected count.'
    }
}

$bundle = $null
$connection = $null
try {
    $confirmation = Get-ProcessEnvironmentValue $confirmationVariable
    if ($confirmation -ne $requiredConfirmation) {
        throw "Set $confirmationVariable=$requiredConfirmation in the current process for this one operation."
    }
    $outputPath = Resolve-SafeOutputDirectory $OutputDirectory
    $bundlePath = Join-Path $outputPath $bundleFileName
    $fingerprintPath = Join-Path $outputPath $fingerprintFileName

    $connection = Get-ConnectionDetails (Get-ProcessEnvironmentValue $ownerUrlVariable)
    $endpointFingerprint = Get-EndpointFingerprint $connection
    $client = Get-DatabaseClient
    $existingRoles = @(Get-ExistingRoleState -Client $client -Connection $connection)

    if (Test-Path -LiteralPath $bundlePath) {
        $protectedBytes = [IO.File]::ReadAllBytes($bundlePath)
        try {
            $bundleJson = Unprotect-BundleJson $protectedBytes
            $bundle = Test-AndHydrateExistingBundle `
                -Bundle ($bundleJson | ConvertFrom-Json) `
                -Connection $connection `
                -EndpointFingerprint $endpointFingerprint
        }
        finally {
            [Array]::Clear($protectedBytes, 0, $protectedBytes.Length)
            $bundleJson = $null
        }
    }
    else {
        if ($existingRoles.Count -ne 0) {
            throw 'A fixed preview login already exists without this user DPAPI credential bundle.'
        }
        $bundle = Add-PasswordsToNewBundle (New-CredentialBundle `
            -Connection $connection `
            -EndpointFingerprint $endpointFingerprint)
    }

    # Persist the generated credentials before the transaction. If the network
    # outcome is ambiguous after COMMIT, a rerun uses the same passwords and
    # converges without printing or silently rotating them.
    $pendingSha256 = Write-ProtectedBundle -Path $bundlePath -Bundle $bundle
    Write-FingerprintFile `
        -Path $fingerprintPath `
        -Bundle $bundle `
        -BundleSha256 $pendingSha256

    Invoke-RoleProvisioning -Client $client -Connection $connection -Bundle $bundle

    $bundle.state = 'provisioned'
    Add-Member -InputObject $bundle -MemberType NoteProperty `
        -Name provisioned_at_utc `
        -Value ([DateTimeOffset]::UtcNow.ToString('o')) `
        -Force
    foreach ($entry in $bundle.roles) {
        $entry.PSObject.Properties.Remove('password')
    }
    $bundleSha256 = Write-ProtectedBundle -Path $bundlePath -Bundle $bundle
    Write-FingerprintFile `
        -Path $fingerprintPath `
        -Bundle $bundle `
        -BundleSha256 $bundleSha256

    Write-Output 'preview_database_login_provisioning=pass'
    Write-Output "role_count=$(@($bundle.roles).Count)"
    Write-Output "endpoint_fingerprint_sha256=$endpointFingerprint"
    Write-Output "protected_bundle_sha256=$bundleSha256"
    Write-Output "protected_bundle_file=$bundleFileName"
    Write-Output 'credentials_printed=false'
}
finally {
    if ($null -ne $bundle) {
        foreach ($entry in @($bundle.roles)) {
            if ($entry.PSObject.Properties.Name -contains 'password') {
                $entry.password = $null
            }
            if ($entry.PSObject.Properties.Name -contains 'direct_url') {
                $entry.direct_url = $null
            }
            if ($entry.PSObject.Properties.Name -contains 'pooled_url') {
                $entry.pooled_url = $null
            }
        }
    }
    if ($null -ne $connection) {
        $connection.password = $null
    }
    $bundle = $null
    $connection = $null
}
