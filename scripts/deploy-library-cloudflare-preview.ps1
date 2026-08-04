[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^library-registration-preview(?:-[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?)?$')]
  [string]$PreviewBranch,

  [switch]$SkipPreviouslyPassedChecks
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repositoryRoot

$expectedConfirmation = 'I_APPROVED_LIBRARY_PREVIEW_DEPLOYMENT_V1'
if ($env:CLOUDFLARE_LIBRARY_PREVIEW_CONFIRMATION -cne $expectedConfirmation) {
  throw 'Set CLOUDFLARE_LIBRARY_PREVIEW_CONFIRMATION to the exact reviewed Preview confirmation.'
}

$localBranch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or -not $localBranch) {
  throw 'Unable to identify the local Git branch.'
}
if ($localBranch -in @('main', 'master', 'production')) {
  throw 'Preview deployment is forbidden from a protected local branch.'
}

function Get-CleanReviewedCommit {
  $dirty = @(& git status --porcelain=v1 --untracked-files=all)
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to inspect the Git worktree.'
  }
  if ($dirty.Count -ne 0) {
    throw 'Preview deployment requires a clean, reviewed Git commit.'
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
    $parsedProjects = $projectJsonText | ConvertFrom-Json
    $projects = @($parsedProjects | ForEach-Object { $_ })
  } catch {
    throw 'Cloudflare project metadata was not valid JSON.'
  }
  # Wrangler 4.114 emits table-shaped JSON ("Project Name"), while older
  # versions emitted the API field ("name"). Support both and fail closed.
  $matches = @($projects | Where-Object {
    $apiName = $_.PSObject.Properties['name']
    $tableName = $_.PSObject.Properties['Project Name']
    ($null -ne $apiName -and [string]$apiName.Value -ceq 'compass-official') -or
      ($null -ne $tableName -and [string]$tableName.Value -ceq 'compass-official')
  })
  if ($matches.Count -ne 1) {
    throw 'Exactly one compass-official Cloudflare Pages project is required.'
  }

  # The current list command no longer exposes production_branch. Read only
  # production deployments and require every returned branch to agree. The
  # operator must also verify the dashboard Branch control value immediately
  # before invoking this wrapper, as documented in the Preview runbook.
  $deploymentJsonText = (& $wrangler pages deployment list `
    --project-name compass-official `
    --environment production `
    --json | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $deploymentJsonText) {
    throw 'Cloudflare production deployment metadata could not be read.'
  }
  try {
    $parsedDeployments = $deploymentJsonText | ConvertFrom-Json
    $deployments = @($parsedDeployments | ForEach-Object { $_ })
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

# This metadata read is mandatory. Together with the runbook's immediate
# dashboard check, it keeps the reviewed production-branch invariant explicit.
$productionBranch = Get-CloudflareProductionBranch

$previewOrigin = "https://$PreviewBranch.compass-official.pages.dev"
$env:LIBRARY_RELEASE_TARGET = 'registration_preview'
$env:LIBRARY_RELEASE_APPROVED_FRONTEND_ORIGIN = $previewOrigin
$env:NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE = 'google'
$env:NEXT_PUBLIC_LIBRARY_ADMIN_MODE = 'mock'
$env:NEXT_PUBLIC_LIBRARY_GOOGLE_HOSTED_DOMAIN = 'st.kitasato-u.ac.jp'
$env:NEXT_PUBLIC_FSL_REGISTRATION_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSf8gLujuK-giYnkCnv-Cxp7qon1kY8mhnGvfkA62hOlrJgAHA/viewform'
foreach ($name in @(
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
if ($LASTEXITCODE -ne 0) { throw 'Production-shaped static build failed.' }
& npm.cmd run verify
if ($LASTEXITCODE -ne 0) { throw 'Static export verification failed.' }

$stageRoot = Join-Path $repositoryRoot "outputs\library-registration-preview\$commitHash"
$siteDirectory = Join-Path $stageRoot 'site'
& node scripts\prepare-library-registration-preview-artifact.mjs `
  --source (Join-Path $repositoryRoot 'out') `
  --stage $siteDirectory
if ($LASTEXITCODE -ne 0) { throw 'Registration Preview staging preparation failed.' }
& node scripts\verify-library-registration-preview-build.mjs --stage $siteDirectory
if ($LASTEXITCODE -ne 0) { throw 'Registration Preview staging verification failed.' }
& node scripts\verify-library-cloudflare-preview.mjs `
  --preview-branch $PreviewBranch `
  --production-branch $productionBranch
if ($LASTEXITCODE -ne 0) { throw 'Preview branch or legacy CTA verification failed.' }

# Re-read immediately before upload so a changed production-deployment branch
# cannot silently invalidate the reviewed invariant during the build.
$productionBranch = Get-CloudflareProductionBranch
& node scripts\verify-library-cloudflare-preview.mjs `
  --preview-branch $PreviewBranch `
  --production-branch $productionBranch
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare production branch safety verification failed.' }

# The build runs image optimization and other repository-local tooling. Refuse
# upload if any source or artifact generation changed the reviewed commit or
# left the worktree dirty after the initial provenance check.
$postBuildCommitHash = Get-CleanReviewedCommit
if ($postBuildCommitHash -cne $commitHash) {
  throw 'The reviewed Git commit changed during the Preview build.'
}

# The isolated output is intentionally Git-ignored. Re-verify it immediately
# before upload so an intervening local write cannot bypass the first scan.
& node scripts\verify-library-registration-preview-build.mjs --stage $siteDirectory
if ($LASTEXITCODE -ne 0) {
  throw 'Final Registration Preview staging verification failed.'
}

& $wrangler --cwd $stageRoot pages deploy site `
  --project-name compass-official `
  --branch $PreviewBranch `
  --commit-hash $commitHash `
  --commit-message "Library registration protected registration-only Preview $commitHash" `
  --commit-dirty=false
if ($LASTEXITCODE -ne 0) {
  throw 'Cloudflare Preview deployment failed.'
}
