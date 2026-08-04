[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^library-registration-ui-review-[a-z0-9](?:[a-z0-9-]{0,31}[a-z0-9])?$')]
  [string]$PreviewBranch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repositoryRoot

$expectedConfirmation = 'I_APPROVED_LIBRARY_UI_REVIEW_DEPLOYMENT_V1'
if ($env:CLOUDFLARE_LIBRARY_UI_REVIEW_CONFIRMATION -cne $expectedConfirmation) {
  throw 'Set CLOUDFLARE_LIBRARY_UI_REVIEW_CONFIRMATION to the exact reviewed UI Preview confirmation.'
}

$localBranch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or -not $localBranch) {
  throw 'Unable to identify the local Git branch.'
}
if ($localBranch -in @('main', 'master', 'production')) {
  throw 'UI review deployment is forbidden from a protected local branch.'
}

function Get-CleanReviewedCommit {
  $dirty = @(& git status --porcelain=v1 --untracked-files=all)
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to inspect the Git worktree.'
  }
  if ($dirty.Count -ne 0) {
    throw 'UI review deployment requires a clean, reviewed Git commit.'
  }
  $hash = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $hash -notmatch '^[0-9a-f]{40}$') {
    throw 'Unable to resolve the reviewed Git commit.'
  }
  return $hash
}

$commitHash = Get-CleanReviewedCommit
$wrangler = Join-Path $repositoryRoot 'node_modules\.bin\wrangler.cmd'
if (-not (Test-Path -LiteralPath $wrangler -PathType Leaf)) {
  throw 'Project-local Wrangler is unavailable. Run npm.cmd ci before this workflow.'
}

function Get-CloudflareProductionBranch {
  $projectJsonText = (& $wrangler pages project list --json | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $projectJsonText) {
    throw 'Cloudflare project metadata could not be read. Authenticate Wrangler and retry.'
  }
  try {
    $projects = @($projectJsonText | ConvertFrom-Json)
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
    $deployments = @($deploymentJsonText | ConvertFrom-Json)
  } catch {
    throw 'Cloudflare production deployment metadata was not valid JSON.'
  }
  $productionBranches = @(
    $deployments | ForEach-Object {
      $branchProperty = $_.PSObject.Properties['Branch']
      if ($null -eq $branchProperty) {
        $branchProperty = $_.PSObject.Properties['branch']
      }
      $branch = if ($null -ne $branchProperty) {
        [string]$branchProperty.Value
      } else {
        ''
      }
      if ($branch) { $branch.Trim() }
    } | Where-Object { $_ } | Sort-Object -Unique
  )
  if ($productionBranches.Count -ne 1) {
    throw 'Production deployments do not identify exactly one branch; refusing deployment.'
  }
  if ($productionBranches[0] -cne 'main') {
    throw 'The reviewed compass-official production branch invariant is no longer main.'
  }
  return $productionBranches[0]
}

$productionBranch = Get-CloudflareProductionBranch

$env:LIBRARY_RELEASE_TARGET = 'ui_review'
$env:NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE = 'mock'
$env:NEXT_PUBLIC_LIBRARY_ADMIN_MODE = 'mock'
$env:NEXT_PUBLIC_LIBRARY_UI_REVIEW = 'true'
$env:NEXT_PUBLIC_FSL_REGISTRATION_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSf8gLujuK-giYnkCnv-Cxp7qon1kY8mhnGvfkA62hOlrJgAHA/viewform'
foreach ($name in @(
  'LIBRARY_RELEASE_APPROVED_API_ORIGIN',
  'LIBRARY_RELEASE_APPROVED_FRONTEND_ORIGIN',
  'NEXT_PUBLIC_LIBRARY_API_BASE_URL',
  'NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL',
  'NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID',
  'NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID'
)) {
  Remove-Item "Env:$name" -ErrorAction SilentlyContinue
}

& npm.cmd run test
if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed.' }
& npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw 'TypeScript validation failed.' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Fail-closed UI review build failed.' }
& npm.cmd run verify
if ($LASTEXITCODE -ne 0) { throw 'Static export verification failed.' }
& npm.cmd run verify:library-mock
if ($LASTEXITCODE -ne 0) { throw 'Fail-closed Library artifact verification failed.' }

$stageRoot = Join-Path $repositoryRoot "outputs\library-ui-review\$commitHash"
$siteDirectory = Join-Path $stageRoot 'site'
& node scripts\prepare-library-ui-review-artifact.mjs `
  --source (Join-Path $repositoryRoot 'out') `
  --stage $siteDirectory
if ($LASTEXITCODE -ne 0) { throw 'UI review staging preparation failed.' }
& node scripts\verify-library-ui-review-build.mjs --stage $siteDirectory
if ($LASTEXITCODE -ne 0) { throw 'UI review staging verification failed.' }

$productionBranch = Get-CloudflareProductionBranch
& node scripts\verify-library-cloudflare-preview.mjs `
  --preview-branch $PreviewBranch `
  --production-branch $productionBranch
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare branch or legacy CTA verification failed.' }

$postBuildCommitHash = Get-CleanReviewedCommit
if ($postBuildCommitHash -cne $commitHash) {
  throw 'The reviewed Git commit changed during the UI review build.'
}

& $wrangler --cwd $stageRoot pages deploy site `
  --project-name compass-official `
  --branch $PreviewBranch `
  --commit-hash $commitHash `
  --commit-message "Library registration protected UI review $commitHash" `
  --commit-dirty=false
if ($LASTEXITCODE -ne 0) {
  throw 'Cloudflare protected UI review deployment failed.'
}
