[CmdletBinding()]
param(
  [switch]$SkipPreviouslyPassedChecks
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repositoryRoot

$expectedConfirmation = 'I_APPROVED_LIBRARY_REGISTRATION_ONLY_PRODUCTION_V1'
if ($env:LIBRARY_RELEASE_CONFIRMATION -cne $expectedConfirmation) {
  throw 'Set LIBRARY_RELEASE_CONFIRMATION to the exact reviewed registration-only production approval.'
}
$reviewedCommit = [string]$env:LIBRARY_RELEASE_REVIEWED_COMMIT
if ($reviewedCommit -cnotmatch '^[0-9a-f]{40}$') {
  throw 'Set LIBRARY_RELEASE_REVIEWED_COMMIT to the exact reviewed origin/main commit SHA.'
}

$wrangler = Join-Path $repositoryRoot 'node_modules\.bin\wrangler.cmd'
if (-not (Test-Path -LiteralPath $wrangler -PathType Leaf)) {
  throw 'Project-local Wrangler is unavailable. Run npm.cmd ci before this workflow.'
}

function Get-CleanReviewedOriginMainCommit {
  $localBranch = (& git branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0 -or $localBranch -cne 'main') {
    throw 'Registration production deployment must run from the local main branch.'
  }
  $dirty = @(& git status --porcelain=v1 --untracked-files=all)
  if ($LASTEXITCODE -ne 0 -or $dirty.Count -ne 0) {
    throw 'Registration production deployment requires a clean worktree.'
  }
  $head = (& git rev-parse HEAD).Trim()
  $originMain = (& git rev-parse refs/remotes/origin/main).Trim()
  $invalidCommit = $LASTEXITCODE -ne 0 -or `
    $head -cnotmatch '^[0-9a-f]{40}$' -or `
    $originMain -cnotmatch '^[0-9a-f]{40}$' -or `
    $head -cne $originMain -or `
    $head -cne $reviewedCommit
  if ($invalidCommit) {
    throw 'HEAD, the reviewed commit, and the freshly fetched origin/main commit must be identical.'
  }
  return $head
}

function Get-CloudflareProductionBranch {
  $projectJsonText = (& $wrangler pages project list --json | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $projectJsonText) {
    throw 'Cloudflare project metadata could not be read. Authenticate Wrangler and retry.'
  }
  try {
    $projects = @(($projectJsonText | ConvertFrom-Json) | ForEach-Object { $_ })
  } catch {
    throw 'Cloudflare project metadata was not valid JSON.'
  }
  $matches = @($projects | Where-Object {
    $apiName = $_.PSObject.Properties['name']
    $tableName = $_.PSObject.Properties['Project Name']
    ($null -ne $apiName -and [string]$apiName.Value -ceq 'compass-official') -or
      ($null -ne $tableName -and [string]$tableName.Value -ceq 'compass-official')
  })
  if ($matches.Count -ne 1) {
    throw 'Exactly one compass-official Cloudflare Pages project is required.'
  }

  $deploymentJsonText = (& $wrangler pages deployment list `
    --project-name compass-official `
    --environment production `
    --json | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $deploymentJsonText) {
    throw 'Cloudflare production deployment metadata could not be read.'
  }
  try {
    $deployments = @(($deploymentJsonText | ConvertFrom-Json) | ForEach-Object { $_ })
  } catch {
    throw 'Cloudflare production deployment metadata was not valid JSON.'
  }
  $productionBranches = @(
    $deployments | ForEach-Object {
      $property = $_.PSObject.Properties['Branch']
      if ($null -eq $property) { $property = $_.PSObject.Properties['branch'] }
      if ($null -ne $property -and [string]$property.Value) {
        ([string]$property.Value).Trim()
      }
    } | Where-Object { $_ } | Sort-Object -Unique
  )
  if ($productionBranches.Count -ne 1 -or $productionBranches[0] -cne 'main') {
    throw 'The exact compass-official Cloudflare production branch must be main.'
  }
  return $productionBranches[0]
}

function Assert-PublicApiCanonicalCors {
  $apiOrigin = 'https://fsl-registration-public-eq64wn4f4a-as.a.run.app'
  $frontendOrigin = 'https://compass-official.pages.dev'
  try {
    $response = Invoke-WebRequest `
      -UseBasicParsing `
      -Method Options `
      -Uri "$apiOrigin/phase6/auth/verify" `
      -Headers @{
        Origin = $frontendOrigin
        'Access-Control-Request-Method' = 'POST'
        'Access-Control-Request-Headers' = 'authorization,x-request-id'
      }
  } catch {
    throw 'The public registration API did not accept the canonical production CORS preflight.'
  }
  $allowedOrigin = [string]$response.Headers['Access-Control-Allow-Origin']
  $allowedMethods = [string]$response.Headers['Access-Control-Allow-Methods']
  $allowedHeaders = [string]$response.Headers['Access-Control-Allow-Headers']
  $invalidCors = $response.StatusCode -notin @(200, 204) -or `
    $allowedOrigin -cne $frontendOrigin -or `
    $allowedMethods -notmatch '(?i)(?:^|,\s*)POST(?:\s*,|$)' -or `
    $allowedHeaders -notmatch '(?i)(?:^|,\s*)authorization(?:\s*,|$)' -or `
    $allowedHeaders -notmatch '(?i)(?:^|,\s*)x-request-id(?:\s*,|$)'
  if ($invalidCors) {
    throw 'The public registration API CORS response does not exactly authorize the canonical frontend.'
  }
}

# Refresh origin/main before accepting provenance. A stale local remote-tracking
# reference is not sufficient for a production publication.
& git fetch --quiet origin main
if ($LASTEXITCODE -ne 0) { throw 'Unable to refresh origin/main.' }
$commitHash = Get-CleanReviewedOriginMainCommit
$productionBranch = Get-CloudflareProductionBranch
Assert-PublicApiCanonicalCors

$env:LIBRARY_RELEASE_TARGET = 'production'
$env:LIBRARY_RELEASE_SCOPE = 'registration_only'
$env:LIBRARY_RELEASE_APPROVED_FRONTEND_ORIGIN = 'https://compass-official.pages.dev'
$env:LIBRARY_RELEASE_APPROVED_API_ORIGIN = 'https://fsl-registration-public-eq64wn4f4a-as.a.run.app'
$env:NEXT_PUBLIC_LIBRARY_API_BASE_URL = 'https://fsl-registration-public-eq64wn4f4a-as.a.run.app'
$env:NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE = 'google'
$env:NEXT_PUBLIC_LIBRARY_ADMIN_MODE = 'mock'
$env:NEXT_PUBLIC_LIBRARY_GOOGLE_HOSTED_DOMAIN = 'st.kitasato-u.ac.jp'
foreach ($name in @(
  'NEXT_PUBLIC_FSL_REGISTRATION_URL',
  'NEXT_PUBLIC_LIBRARY_UI_REVIEW',
  'NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL',
  'NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID'
)) {
  Remove-Item "Env:$name" -ErrorAction SilentlyContinue
}

if (-not $SkipPreviouslyPassedChecks) {
  & npm.cmd run test
  if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed.' }
  & npm.cmd run typecheck
  if ($LASTEXITCODE -ne 0) { throw 'TypeScript validation failed.' }
}
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Registration production static build failed.' }
& npm.cmd run verify
if ($LASTEXITCODE -ne 0) { throw 'Static export verification failed.' }

$stageRoot = Join-Path $repositoryRoot "outputs\library-registration-production\$commitHash"
$siteDirectory = Join-Path $stageRoot 'site'
& node scripts\prepare-library-registration-production-artifact.mjs `
  --source (Join-Path $repositoryRoot 'out') `
  --stage $siteDirectory
if ($LASTEXITCODE -ne 0) { throw 'Registration production staging preparation failed.' }
& node scripts\verify-library-registration-production-build.mjs --stage $siteDirectory
if ($LASTEXITCODE -ne 0) { throw 'Registration production staging verification failed.' }

# Re-read both external metadata and local provenance immediately before upload.
$productionBranch = Get-CloudflareProductionBranch
if ($productionBranch -cne 'main') { throw 'Cloudflare production branch changed.' }
Assert-PublicApiCanonicalCors
& git fetch --quiet origin main
if ($LASTEXITCODE -ne 0) { throw 'Unable to refresh origin/main before upload.' }
$postBuildCommit = Get-CleanReviewedOriginMainCommit
if ($postBuildCommit -cne $commitHash) {
  throw 'The reviewed origin/main commit changed during the production build.'
}
& node scripts\verify-library-registration-production-build.mjs --stage $siteDirectory
if ($LASTEXITCODE -ne 0) { throw 'Final registration production verification failed.' }

& $wrangler --cwd $stageRoot pages deploy site `
  --project-name compass-official `
  --branch main `
  --commit-hash $commitHash `
  --commit-message "Future Strategy Library registration-only production $commitHash" `
  --commit-dirty=false
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare registration production deployment failed.' }
