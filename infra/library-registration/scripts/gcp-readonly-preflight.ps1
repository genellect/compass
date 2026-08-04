[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')]
  [string]$ProjectId,

  [ValidateSet('asia-southeast1')]
  [string]$Region = 'asia-southeast1',

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$')]
  [string]$StateBucket,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z][a-z0-9-]{2,62}$')]
  [string]$ArtifactRepository,

  [Parameter(Mandatory = $true)]
  [string]$PublicImage,

  [string]$AdminImage = '',

  [Parameter(Mandatory = $true)]
  [string]$WorkerImage,

  [Parameter(Mandatory = $true)]
  [string]$MigrationImage,

  [Parameter(Mandatory = $true)]
  [ValidateCount(5, 12)]
  [string[]]$SecretIds,

  [ValidateSet('registration-preview', 'full-production')]
  [string]$DeploymentProfile = 'full-production',

  [switch]$IncludeDrive,

  [Parameter(Mandatory = $true)]
  [ValidateCount(1, 20)]
  [string[]]$NotificationChannelNames,

  [string]$OutputPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
if (-not $OutputPath) {
  $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
  $OutputPath = Join-Path $repositoryRoot "outputs\library-registration\gcp-preflight-$stamp.json"
}

function Get-Sha256Fingerprint([string]$Value) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hash = $algorithm.ComputeHash($bytes)
  } finally {
    $algorithm.Dispose()
  }
  $hex = -join ($hash | ForEach-Object { $_.ToString('x2') })
  return $hex.Substring(0, 16)
}

function Invoke-GcloudReadOnly([string[]]$Arguments) {
  $captured = @(& $script:GcloudPath @Arguments 2>&1)
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    return [pscustomobject]@{ ok = $false; text = '' }
  }
  return [pscustomobject]@{
    ok = $true
    text = (($captured | ForEach-Object { [string]$_ }) -join "`n").Trim()
  }
}

function Add-Check(
  [System.Collections.Generic.List[object]]$Checks,
  [string]$Name,
  [bool]$Passed,
  [hashtable]$SafeDetails = @{}
) {
  $record = [ordered]@{ name = $Name; status = $(if ($Passed) { 'pass' } else { 'fail' }) }
  foreach ($key in $SafeDetails.Keys) {
    $record[$key] = $SafeDetails[$key]
  }
  $Checks.Add([pscustomobject]$record)
}

$gcloud = Get-Command gcloud -ErrorAction SilentlyContinue
if (-not $gcloud) {
  throw 'Google Cloud CLI (gcloud) is not installed or not on PATH.'
}
$script:GcloudPath = $gcloud.Source

$coreSecretIds = @(
  'fsl-api-database-url',
  'fsl-worker-database-url',
  'fsl-migration-database-url',
  'fsl-drive-operation-attestation-key',
  'fsl-public-registration-rpc-token'
)
$driveSecretIds = @(
  'fsl-drive-oauth-client-id',
  'fsl-drive-oauth-client-secret',
  'fsl-drive-oauth-refresh-token',
  'fsl-drive-resource-id'
)
$adminSecretIds = @(
  'fsl-admin-database-url',
  'fsl-admin-allowed-emails',
  'fsl-admin-edge-shared-secret'
)
$driveIncluded = $DeploymentProfile -eq 'full-production' -or $IncludeDrive.IsPresent
$expectedSecretIds = @($coreSecretIds)
if ($driveIncluded) {
  $expectedSecretIds += $driveSecretIds
}
if ($DeploymentProfile -eq 'full-production') {
  $expectedSecretIds += $adminSecretIds
}
if (($SecretIds | Select-Object -Unique).Count -ne $expectedSecretIds.Count) {
  throw "SecretIds must contain $($expectedSecretIds.Count) distinct containers for profile '$DeploymentProfile'."
}
$secretIdDifference = @(Compare-Object `
  -ReferenceObject ($expectedSecretIds | Sort-Object) `
  -DifferenceObject ($SecretIds | Sort-Object))
if ($secretIdDifference.Count -ne 0) {
  throw "SecretIds must exactly match the reviewed '$DeploymentProfile' capability inventory."
}

$images = [ordered]@{
  public    = $PublicImage
  worker    = $WorkerImage
  migration = $MigrationImage
}
if ($DeploymentProfile -eq 'full-production') {
  if (-not $AdminImage) {
    throw 'AdminImage is required for the full-production profile.'
  }
  $images.admin = $AdminImage
} elseif ($AdminImage) {
  throw 'AdminImage must remain empty for the registration-preview profile.'
}
$imagePrefixPattern = '^' + [regex]::Escape("$Region-docker.pkg.dev/$ProjectId/$ArtifactRepository/")
foreach ($entry in $images.GetEnumerator()) {
  if (
    $entry.Value -notmatch ($imagePrefixPattern + '.+@sha256:[0-9a-f]{64}$')
  ) {
    throw "$($entry.Key) image must be an immutable digest in the approved project, region, and repository."
  }
}

$checks = [System.Collections.Generic.List[object]]::new()

$auth = Invoke-GcloudReadOnly @(
  'auth', 'list', '--filter=status:ACTIVE', '--format=value(account)', '--quiet'
)
Add-Check $checks 'gcloud_active_auth' ($auth.ok -and [bool]$auth.text)

$project = Invoke-GcloudReadOnly @(
  'projects', 'describe', $ProjectId, '--format=value(lifecycleState)', '--quiet'
)
Add-Check $checks 'project_active' ($project.ok -and $project.text -eq 'ACTIVE') @{
  project_fingerprint_sha256_16 = Get-Sha256Fingerprint $ProjectId
}

$billing = Invoke-GcloudReadOnly @(
  'beta', 'billing', 'projects', 'describe', $ProjectId,
  '--format=value(billingEnabled)', '--quiet'
)
Add-Check $checks 'billing_enabled' (
  $billing.ok -and $billing.text.ToLowerInvariant() -eq 'true'
)

Add-Check $checks 'approved_region' ($Region -eq 'asia-southeast1') @{
  region = $Region
}

$requiredApis = [System.Collections.Generic.List[string]]@(
  'artifactregistry.googleapis.com',
  'logging.googleapis.com',
  'monitoring.googleapis.com',
  'run.googleapis.com',
  'secretmanager.googleapis.com'
)
if ($driveIncluded) {
  @(
    'cloudscheduler.googleapis.com',
    'drive.googleapis.com',
    'iamcredentials.googleapis.com',
    'picker.googleapis.com'
  ) | ForEach-Object { $requiredApis.Add($_) }
}
$enabledApiResult = Invoke-GcloudReadOnly @(
  'services', 'list', '--enabled', '--project', $ProjectId,
  '--format=value(config.name)', '--quiet'
)
$enabledApis = if ($enabledApiResult.ok) {
  @($enabledApiResult.text -split "`r?`n" | Where-Object { $_ })
} else {
  @()
}
foreach ($api in $requiredApis) {
  Add-Check $checks "api:$api" ($enabledApis -contains $api)
}

$bucket = Invoke-GcloudReadOnly @(
  'storage', 'buckets', 'describe', "gs://$StateBucket", '--project', $ProjectId,
  '--format=json', '--quiet'
)
$bucketSecure = $false
if ($bucket.ok -and $bucket.text) {
  try {
    $bucketMetadata = $bucket.text | ConvertFrom-Json
    $bucketSecure = (
      [string]$bucketMetadata.location -eq 'ASIA-SOUTHEAST1' -and
      [bool]$bucketMetadata.iamConfiguration.uniformBucketLevelAccess.enabled -and
      [string]$bucketMetadata.iamConfiguration.publicAccessPrevention -eq 'enforced'
    )
  } catch {
    $bucketSecure = $false
  }
}
Add-Check $checks 'gcs_state_bucket_secure' $bucketSecure @{
  bucket_fingerprint_sha256_16 = Get-Sha256Fingerprint $StateBucket
  expected_location            = 'ASIA-SOUTHEAST1'
}

$repository = Invoke-GcloudReadOnly @(
  'artifacts', 'repositories', 'describe', $ArtifactRepository,
  '--location', $Region, '--project', $ProjectId, '--format=json', '--quiet'
)
$repositoryValid = $false
if ($repository.ok -and $repository.text) {
  try {
    $repositoryMetadata = $repository.text | ConvertFrom-Json
    $repositoryValid = (
      [string]$repositoryMetadata.format -eq 'DOCKER' -and
      [string]$repositoryMetadata.name -match "/locations/$([regex]::Escape($Region))/repositories/"
    )
  } catch {
    $repositoryValid = $false
  }
}
Add-Check $checks 'artifact_registry_docker_repository' $repositoryValid @{
  repository_fingerprint_sha256_16 = Get-Sha256Fingerprint $ArtifactRepository
  region                            = $Region
}

for ($index = 0; $index -lt $SecretIds.Count; $index++) {
  $secretId = $SecretIds[$index]
  $secret = Invoke-GcloudReadOnly @(
    'secrets', 'describe', $secretId, '--project', $ProjectId,
    '--format=value(name)', '--quiet'
  )
  Add-Check $checks "secret_container:$($index + 1)" (
    $secret.ok -and [bool]$secret.text
  ) @{
    id_fingerprint_sha256_16 = Get-Sha256Fingerprint $secretId
    payload_accessed         = $false
  }
}

foreach ($entry in $images.GetEnumerator()) {
  $digest = ($entry.Value -split '@', 2)[1]
  $image = Invoke-GcloudReadOnly @(
    'artifacts', 'docker', 'images', 'describe', $entry.Value,
    '--project', $ProjectId, '--format=value(image_summary.digest)', '--quiet'
  )
  Add-Check $checks "image_digest:$($entry.Key)" (
    $image.ok -and $image.text.ToLowerInvariant() -eq $digest.ToLowerInvariant()
  ) @{
    uri_fingerprint_sha256_16 = Get-Sha256Fingerprint $entry.Value
    immutable_digest          = $true
  }
}

for ($index = 0; $index -lt $NotificationChannelNames.Count; $index++) {
  $channel = $NotificationChannelNames[$index]
  $notification = Invoke-GcloudReadOnly @(
    'beta', 'monitoring', 'channels', 'describe', $channel,
    '--project', $ProjectId, '--format=value(name)', '--quiet'
  )
  Add-Check $checks "notification_channel:$($index + 1)" (
    $notification.ok -and [bool]$notification.text
  ) @{
    name_fingerprint_sha256_16 = Get-Sha256Fingerprint $channel
  }
}

$failed = @($checks | Where-Object { $_.status -ne 'pass' })
$evidence = [ordered]@{
  status                    = $(if ($failed.Count -eq 0) { 'pass' } else { 'fail' })
  purpose                   = 'gcp_readonly_preflight'
  deployment_profile        = $DeploymentProfile
  drive_capability_included = $driveIncluded
  captured_at_utc           = (Get-Date).ToUniversalTime().ToString('o')
  external_mutations        = $false
  secret_payloads_accessed  = $false
  secret_container_count    = $SecretIds.Count
  image_digest_count        = $images.Count
  notification_target_count = $NotificationChannelNames.Count
  checks                    = $checks
}

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}
$evidence | ConvertTo-Json -Depth 8 | Set-Content -Path $OutputPath -Encoding utf8

Write-Host "GCP read-only preflight status=$($evidence.status); sanitized evidence: $OutputPath"
if ($failed.Count -ne 0) {
  exit 1
}
