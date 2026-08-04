[CmdletBinding()]
param(
    [ValidateSet('Validate', 'Build', 'BuildProductionImages', 'TerraformValidate', 'Up', 'Test', 'Phase9Phase10Test', 'Ps', 'Logs', 'Down')]
    [string] $Action = 'Validate'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $root 'compose.library-dev.yaml'
$projectName = 'compass-library-registration-dev'
$resourceLabel = 'future-strategy-library-registration'
$networkName = 'fsl-registration-dev-network'
$volumeName = 'fsl-registration-dev-postgres-data'
$terraformImage = 'hashicorp/terraform:1.9.8'
$terraformDirectory = Join-Path $root 'infra\library-registration\terraform'
$terraformCacheDirectory = Join-Path $root '.terraform-plugin-cache'
$ownedPorts = @(55432, 58000)
$interactivePorts = @(54321, 54322, 54323, 54324, 54327)

function Resolve-DockerCommand {
    $fromPath = Get-Command docker -ErrorAction SilentlyContinue
    if ($null -ne $fromPath) {
        return $fromPath.Source
    }

    $desktopDocker = Join-Path $env:LOCALAPPDATA `
        'Programs\DockerDesktop\resources\bin\docker.exe'
    if (Test-Path -LiteralPath $desktopDocker) {
        return $desktopDocker
    }

    throw 'Docker CLI was not found. Start Docker Desktop and retry.'
}

function Invoke-Docker {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]] $Arguments)

    & $script:docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker command failed with exit code $LASTEXITCODE."
    }
}

function Get-ExistingResourceLabel {
    param(
        [ValidateSet('network', 'volume')][string] $Kind,
        [string] $Name
    )

    $resourceNames = & $script:docker $Kind ls --format '{{.Name}}'
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to list Docker $Kind resources."
    }
    if ($Name -notin $resourceNames) {
        return $null
    }

    $exists = & $script:docker $Kind inspect $Name
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to inspect Docker $Kind '$Name'."
    }
    $inspection = $exists | ConvertFrom-Json
    return $inspection[0].Labels.'com.compass.project'
}

function Assert-Isolation {
    if (-not (Test-Path -LiteralPath $composeFile)) {
        throw "Compose file is missing: $composeFile"
    }
    if ($projectName -match 'compass-interactive') {
        throw 'The registration Compose project name overlaps COMPASS Interactive.'
    }

    $composeText = Get-Content -LiteralPath $composeFile -Raw
    if ($composeText -match '(?i)compass[\s_-]*interactive') {
        throw 'The registration Compose file references COMPASS Interactive.'
    }
    foreach ($port in $interactivePorts) {
        $protectedPortPattern = ('(?m)^\s*-\s*[''"]?(?:127\.0\.0\.1:)?{0}:' -f $port)
        if ($composeText -match $protectedPortPattern) {
            throw "The registration Compose file attempts to bind protected port $port."
        }
    }

    $targetContainers = & $script:docker ps -a --quiet `
        --filter "label=com.docker.compose.project=$projectName"
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to inspect existing Docker containers.'
    }
    foreach ($containerId in $targetContainers) {
        if ([string]::IsNullOrWhiteSpace($containerId)) { continue }
        $container = (& $script:docker inspect $containerId) | ConvertFrom-Json
        $label = $container[0].Config.Labels.'com.compass.project'
        if ($label -ne $resourceLabel) {
            throw "Container '$containerId' is not owned by the registration project."
        }
    }

    foreach ($resource in @(
        @{ Kind = 'network'; Name = $networkName },
        @{ Kind = 'volume'; Name = $volumeName }
    )) {
        $label = Get-ExistingResourceLabel -Kind $resource.Kind -Name $resource.Name
        if ($null -ne $label -and $label -ne $resourceLabel) {
            throw "$($resource.Kind) '$($resource.Name)' exists without the expected ownership label."
        }
    }

    Invoke-Docker compose --project-name $projectName `
        --file $composeFile config --quiet
}

function Assert-OwnedPortsAvailable {
    $containerRows = & $script:docker ps --format '{{json .}}'
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to inspect Docker port ownership.'
    }

    foreach ($port in $ownedPorts) {
        $listener = Get-NetTCPConnection -State Listen -LocalPort $port `
            -ErrorAction SilentlyContinue
        if ($null -eq $listener) { continue }

        $ownedByProject = $false
        foreach ($row in $containerRows) {
            $containerSummary = $row | ConvertFrom-Json
            $hasProjectLabel = $containerSummary.Labels -match `
                "(?:^|,)com\.docker\.compose\.project=$([regex]::Escape($projectName))(?:,|$)"
            if ($hasProjectLabel -and $containerSummary.Ports -match `
                "(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]):$port->") {
                $ownedByProject = $true
                break
            }
        }
        if (-not $ownedByProject) {
            throw "Local port $port is already in use outside the registration project."
        }
    }
}

function Wait-ComposeServiceHealthy {
    param(
        [Parameter(Mandatory = $true)][string] $Service,
        [int] $TimeoutSeconds = 90
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $containerId = (& $script:docker compose --project-name $projectName `
            --file $composeFile ps --quiet $Service).Trim()
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to inspect the isolated $Service container."
        }
        if (-not [string]::IsNullOrWhiteSpace($containerId)) {
            $state = (& $script:docker inspect --format `
                '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' `
                $containerId).Trim()
            if ($LASTEXITCODE -ne 0) {
                throw "Unable to inspect the isolated $Service health state."
            }
            if ($state -eq 'running|healthy') {
                return
            }
            if ($state -match '^(?:dead|exited)\|') {
                throw "The isolated $Service container stopped before becoming healthy."
            }
        }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)

    throw "The isolated $Service container did not become healthy."
}

$docker = Resolve-DockerCommand
& $docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Desktop is not running or the engine is unavailable.'
}

Assert-Isolation

switch ($Action) {
    'Validate' {
        Write-Host 'PASS: registration Docker configuration is isolated.'
    }
    'Build' {
        Invoke-Docker compose --project-name $projectName `
            --file $composeFile build
    }
    'BuildProductionImages' {
        foreach ($target in @('public', 'admin', 'worker', 'migration')) {
            Invoke-Docker build `
                --file (Join-Path $root 'services\library-api\Dockerfile') `
                --target $target `
                --label "com.compass.project=$resourceLabel" `
                --label 'com.compass.environment=local-synthetic-only' `
                --tag "compass-library-registration-$target`:local-gate" `
                $root
        }
        Write-Host 'PASS: isolated public, admin, worker, and migration images built locally.'
    }
    'TerraformValidate' {
        if (-not (Test-Path -LiteralPath $terraformDirectory)) {
            throw "Terraform directory is missing: $terraformDirectory"
        }
        if (-not (Test-Path -LiteralPath $terraformCacheDirectory)) {
            New-Item -ItemType Directory -Path $terraformCacheDirectory | Out-Null
        }
        $workspaceMount = "$root`:/workspace"
        $terraformWorkingDirectory = '/workspace/infra/library-registration/terraform'
        $terraformEnvironment = 'TF_PLUGIN_CACHE_DIR=/workspace/.terraform-plugin-cache'
        $dockerArguments = @(
            'run', '--rm',
            '--volume', $workspaceMount,
            '--workdir', $terraformWorkingDirectory,
            '--env', $terraformEnvironment,
            $terraformImage
        )
        Invoke-Docker -Arguments ($dockerArguments + @(
            'fmt', '-check', '-recursive'
        ))
        Invoke-Docker -Arguments ($dockerArguments + @(
            'init', '-backend=false', '-input=false'
        ))
        Invoke-Docker -Arguments ($dockerArguments + @(
            'validate', '-no-color'
        ))
        Invoke-Docker -Arguments ($dockerArguments + @(
            'test', '-no-color'
        ))
        Write-Host 'PASS: Terraform format, offline-backend init, validation, and activation-contract tests completed.'
    }
    'Up' {
        Assert-OwnedPortsAvailable
        Invoke-Docker compose --project-name $projectName `
            --file $composeFile up --build --detach
        Invoke-Docker compose --project-name $projectName `
            --file $composeFile ps
    }
    'Test' {
        Assert-OwnedPortsAvailable
        Invoke-Docker compose --project-name $projectName `
            --file $composeFile up --build --detach

        # An internal Docker network intentionally has no host-published route.
        # Poll the container health state rather than weakening that isolation.
        Wait-ComposeServiceHealthy -Service 'api'

        Invoke-Docker compose --project-name $projectName `
            --file $composeFile run --rm --no-deps `
            --env 'PHASE5_LOCAL_API_ENABLED=false' `
            api python -m pytest
        Write-Host 'PASS: Docker health and Python regression tests completed.'
    }
    'Phase9Phase10Test' {
        Assert-OwnedPortsAvailable
        Invoke-Docker compose --project-name $projectName `
            --file $composeFile up --build --detach
        $cleanupArguments = @(
            'compose', '--project-name', $projectName,
            '--file', $composeFile,
            'run', '--rm', '--no-deps',
            '--env', 'FSL_DATA_CLASSIFICATION=synthetic-only',
            '--env', 'FSL_PHASE9_10A_LOCAL_EVIDENCE=confirmed',
            '--env', 'FSL_PHASE9_10A_CLEANUP_ONLY=confirmed',
            'api', 'python', '-m', 'scripts.verify_phase9_phase10a_postgres'
        )
        Invoke-Docker -Arguments $cleanupArguments
        Invoke-Docker compose --project-name $projectName `
            --file $composeFile run --rm --no-deps migrate `
            python -m alembic downgrade f8b0a1c2d3e4
        Invoke-Docker compose --project-name $projectName `
            --file $composeFile run --rm --no-deps migrate `
            python -m alembic upgrade head
        Invoke-Docker compose --project-name $projectName `
            --file $composeFile run --rm --no-deps migrate `
            python -m alembic check
        Invoke-Docker compose --project-name $projectName `
            --file $composeFile run --rm --no-deps roles-finalize
        $evidenceArguments = @(
            'compose', '--project-name', $projectName,
            '--file', $composeFile,
            'run', '--rm', '--no-deps',
            '--env', 'FSL_DATA_CLASSIFICATION=synthetic-only',
            '--env', 'FSL_PHASE9_10A_LOCAL_EVIDENCE=confirmed',
            'api', 'python', '-m', 'scripts.verify_phase9_phase10a_postgres'
        )
        Invoke-Docker -Arguments $evidenceArguments
        $apiRaceEvidenceArguments = @(
            'compose', '--project-name', $projectName,
            '--file', $composeFile,
            'run', '--rm', '--no-deps',
            '--env', 'FSL_DATA_CLASSIFICATION=synthetic-only',
            '--env', 'FSL_PHASE9_10A_LOCAL_EVIDENCE=confirmed',
            'api', 'python', '-m', 'scripts.verify_phase10a_api_races_postgres'
        )
        Invoke-Docker -Arguments $apiRaceEvidenceArguments
        Write-Host 'PASS: Phase 9/10A PostgreSQL migration and integration evidence completed.'
    }
    'Ps' {
        Invoke-Docker compose --project-name $projectName `
            --file $composeFile ps
    }
    'Logs' {
        Invoke-Docker compose --project-name $projectName `
            --file $composeFile logs --tail 200
    }
    'Down' {
        Invoke-Docker compose --project-name $projectName `
            --file $composeFile down
        Write-Host 'Registration containers stopped. The registration data volume was preserved.'
    }
}
