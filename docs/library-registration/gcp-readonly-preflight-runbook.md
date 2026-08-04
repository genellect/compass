# GCP read-only preflight 実行手順

対象: 未来戦略ライブラリ登録基盤のProduction GCP Gate事前確認<br>
対象script: `infra/library-registration/scripts/gcp-readonly-preflight.ps1`<br>
固定region: Singapore (`asia-southeast1`)

## 1. 目的と安全境界

このpreflightは、初回Terraform backend初期化・plan・applyより前に、承認済みGCP projectへ
必要な基盤resourceが存在し、安全条件を満たすことを**読取り専用**で確認する。GCP APIの有効化、
billing link、bucket/repository/secret/notification channelの作成、image push、IAM変更、Terraform
applyは行わない。

ただし、実行結果としてlocalの`outputs/library-registration/`配下へsanitized JSONを1件作成する。
従って`external_mutations=false`は「GCP外部状態を変更していない」という意味であり、local証跡fileを
作成しないという意味ではない。

このscriptはSecret Managerに対してcontainer metadataの`describe`だけを行う。secret versionの
列挙・追加・有効化・無効化・破棄、およびpayloadの読取りは行わない。実行者もConsoleの
**Secret valueを表示**、`gcloud secrets versions access`、screen capture、clipboard転記を行わない。

## 2. 現在のlocal CLI状態

Google Cloud CLI本体はworkspace共通の`.tools`へ導入済みである。一方、現在の隔離worktreeの
PowerShell sessionでは、`gcloud`へのPATH追加とGoogle account認証は未実施である。この状態のまま
preflightを実行すると、`Google Cloud CLI (gcloud) is not installed or not on PATH.`で停止する。

恒久的なUser/Machine PATHを変更せず、repository rootから実行するPowerShell sessionだけへ
検証済みv577のCLIと隔離configを設定する。`<WORKSPACE_ROOT>`は、このrepositoryを置いた
`new-chat` directoryの絶対pathへ置換する。

```powershell
$gcloudBin = (Resolve-Path '<WORKSPACE_ROOT>\.tools\google-cloud-cli-577.0.0-final\google-cloud-sdk\bin').Path
$env:CLOUDSDK_CONFIG = (Resolve-Path '<WORKSPACE_ROOT>\.tools\gcloud-config').Path
$env:CLOUDSDK_PYTHON = (Resolve-Path '.\services\library-api\.venv\Scripts\python.exe').Path
$env:CLOUDSDK_CORE_DISABLE_PROMPTS = '0'
$env:Path = "$gcloudBin;$env:Path"
gcloud version
```

認証はoperator本人がbrowserで行う。service-account key JSONをdownload・保存して代用しない。

```powershell
gcloud auth login
gcloud auth list --filter='status:ACTIVE' --format='value(account)'
```

表示されたactive accountが対象projectの読取り権限を持つ本人であることを画面上だけで確認する。
account emailはterminal capture、証跡JSON、Git、chatへ転記しない。scriptは全project照会に
`--project`を指定するため、`gcloud config set project`は必須ではない。認証追加・切替は人間Gateで
あり、本runbook作成時点では実行しない。

## 3. preflightより前に存在すべきGCP基盤

以下の作成・有効化は外部変更である。対象project、費用、data location、resource名、通知先を人が
reviewし、それぞれの操作を明示承認した後に別手順で行う。preflightは不足分を自動作成しない。

### 3.1 projectとbilling

- 専用GCP projectが`ACTIVE`である。
- billingが有効である。無料枠内を想定していてもbilling link自体は必要であり、budget/alertと
  利用状況監視を別途設定する。カード・billing linkは本runbook作成だけでは不要であり、本人が
  費用境界を直前承認した外部Gateでのみ設定する。
- Future Strategy Library専用resourceだけを置き、COMPASS Interactiveのproject、repository、
  image、secret、network、database、deploymentを共有・変更しない。

### 3.2 必須9 API

次の9 APIが対象projectで有効であること。表記・件数を変更しない。

1. `artifactregistry.googleapis.com`
2. `cloudscheduler.googleapis.com`
3. `drive.googleapis.com`
4. `iamcredentials.googleapis.com`
5. `logging.googleapis.com`
6. `monitoring.googleapis.com`
7. `picker.googleapis.com`
8. `run.googleapis.com`
9. `secretmanager.googleapis.com`

### 3.3 Singapore GCS Terraform backend

Terraform state用GCS bucketが事前に存在し、次の全条件を満たすこと。

- location: `ASIA-SOUTHEAST1`（Singapore、multi-regionの`ASIA`は不可）
- Uniform bucket-level access: enabled
- Public access prevention: `enforced`
- bucket名は対象project専用であり、実行時の`-StateBucket`と完全一致する

preflight PASS前にこのbucketをTerraform backendとして`init`しない。state、plan、tfvarsは証跡へ
添付せず、public化しない。

### 3.4 Artifact Registryと4 immutable images

`asia-southeast1`にDocker形式のArtifact Registry repositoryが存在すること。次の4 imageをbuild・
pushし、tagではなくregistryが確定したdigest URIを取得する。

- public API image
- dedicated admin API image
- private worker image
- migration job image

4 URIはすべて次の形式でなければならない。

```text
asia-southeast1-docker.pkg.dev/<PROJECT_ID>/<REPOSITORY>/<IMAGE>@sha256:<64桁の小文字hex>
```

`latest`、任意tagだけのURI、別project、別region、別repository、短縮digestはGate対象にしない。
preflightは各digestがregistryに実在し、指定URIのdigestと一致することを確認する。

### 3.5 exact 12 Secret Manager containers

次の11 containerが**このIDで完全一致**して存在すること。別名、重複、10件以下、12件以上を入力すると
scriptは照会前に停止する。

1. `fsl-api-database-url`
2. `fsl-admin-database-url`
3. `fsl-admin-allowed-emails`
4. `fsl-admin-edge-shared-secret`
5. `fsl-worker-database-url`
6. `fsl-migration-database-url`
7. `fsl-drive-oauth-client-id`
8. `fsl-drive-oauth-client-secret`
9. `fsl-drive-oauth-refresh-token`
10. `fsl-drive-resource-id`
11. `fsl-drive-operation-attestation-key`
12. `fsl-public-registration-rpc-token`

preflightが証明するのはcontainerの存在だけである。versionの存在、有効状態、payloadの正しさ、
runtime IAM、rotationは証明しない。4 DB secret、private管理者allowlist、Pagesと共有するadmin edge secret、
専用operation attestation keyへの値登録と、後述する4 Drive secretへのproduction bootstrapは別の承認済み手順で行う。

### 3.6 notification channel

Cloud Monitoringの承認済みnotification channelを1件以上用意し、resource nameを確認する。
scriptは1〜20件を受け付ける。

```text
projects/<PROJECT_ID>/notificationChannels/<CHANNEL_ID>
```

通知先本人が受信先と運用責任を承認する。channel作成、verification、test notification送信は
preflightの範囲外である。メールアドレスや電話番号を証跡へ書かず、resource nameも共有証跡では
fingerprintだけにする。

### 3.7 Cloud Run spend capとproject budget

Cloud Run runtime作成より前に、Cloud Billing Consoleで次の2つを別々に設定する。

1. 対象project・Service=`Cloud Run`・Monthlyの**Spend cap enforcement**。初期提案は`$0.20`。
2. 対象project全体の**Alerts only** budget。初期提案は`$1`。

spend capは2026-08-02時点でPreviewであり、consoleが`$0.20`を受理するか、対象billing accountで
利用できるかを本人が確認する。額を上げる必要がある場合は別の直前承認を取る。spend capの
status=`Configured`、project fingerprint、service、target額、確認時刻だけをsanitized evidenceへ残し、
billing account ID、カード情報、account email、console screenshotを共有証跡へ入れない。

alerts-only budgetは課金を停止しない。spend capも反映は瞬時でなく、in-flight request、遅延超過、
Cloud Run外のSecret Manager、GCS、Artifact Registry等を止めない。`cost_guardrails_review`はこの
人間確認をTerraformでfail-closedにするlatchであり、preflight scriptがbudgetの存在を自動証明する
ものではない。

## 4. Google Auth、Phase 7B、production Drive bootstrapとの固定順序

OAuth入口認証とDrive owner資格情報を同一credentialとして扱わない。推奨は、少なくとも次のWeb
OAuth clientを分離することである。

1. public登録画面のGoogle identity確認用client
2. 管理画面のGoogle identity確認用client（public登録用audienceと分離）
3. Phase 7Bの使い捨て実Drive E2E用client
4. production Drive owner bootstrap用client

順序は次で固定する。

1. 対象GCP project、billing、Singapore data location、Google Auth PlatformのAudience・scope・
   origin/redirect URIを人がreviewする。public identity側はGoogle署名ID tokenの`aud`、`iss`、期限、
   `email_verified`、組織domainをserver側で検証し、`hd` hintだけを認可根拠にしない。
2. Phase 7Bを`phase7-google-drive-e2e-runbook.md`に従い、空の専用テストfolder、owner、別viewer、
   `http://localhost:8767/oauth2/callback`で実施する。grant、viewer閲覧、編集拒否、冪等性、revoke、
   folder cleanup、OAuth grant失効まで確認する。
3. Phase 7Bのcleanup完了後、承認済み外部操作としてspend cap、project budget、必須9 API、GCS
bucket、Artifact Registry、exact 12 secret containers、notification channelを作成し、4 imageを
   pushしてimmutable digestを確定する。
4. 本runbookのGCP read-only preflightを実行し、sanitized evidenceが`status=pass`であることを
   reviewする。
5. production Drive owner clientは、長期運用条件を満たすAudience publishing status
   **In production**とexact redirect URI `http://localhost:8769/oauth2/callback`を人が確認する。
   External/Testingで得た`drive.file` refresh tokenを長期本番credentialとして固定しない。
6. preflight PASS後に限り、`phase7b-production-drive-oauth-bootstrap-runbook.md`に従って
   production Drive bootstrapを実施する。承認済み本番folderをPickerで選び、folder fingerprintを
   reviewし、既存4 Drive secret containerへ新numeric versionを追加する。このbootstrapはDrive
   permissionを変更せず、worker/Scheduler/side effectを有効にしない。
7. bootstrap結果のsecret ID、numeric version、value fingerprintだけをreviewし、Terraformの
   `secret_versions`へnumeric versionをpinする。その後にGCS backend init、migration-onlyの全体
   plan、明示承認後のapply、migration、DB role auditへ進む。standby runtime activation前に
   `cost_guardrails_review`の額がsanitized budget evidenceと一致し、notification channelが1件以上
   planへ渡されていることを再確認する。public ingressは別gateまでOFFに保つ。
8. deployed workerのDrive side effect有効化と、本番folderでのgrant/idempotency/revoke人間E2Eは、
   別のexact confirmationとProduction Gateで行う。Production Cutover直前まで既存Google Form CTAを
   維持する。

Phase 7Bとproduction bootstrapで同一OAuth client・同一owner grantを再利用せざるを得ない場合は、
**必ずPhase 7Bを先、production bootstrapを最後**にする。Phase 7Bは最後にOAuth grantを失効するため、
先に取得したproduction refresh tokenも無効化し得る。client分離ができない状態で順序を逆転させない。

## 5. read-only preflightの実行

repository rootから、実resourceの非secret識別子とdigest URIをlocal変数へ設定する。secret payload、
OAuth token、client secret、database URLは入力しない。

For the registration-only Preview, omit every administrator artifact and use
the five-secret standby inventory:

```powershell
$projectId = '<PROJECT_ID>'
$stateBucket = '<SINGAPORE_STATE_BUCKET>'
$artifactRepository = '<ARTIFACT_REPOSITORY>'
$publicImage = 'asia-southeast1-docker.pkg.dev/<PROJECT_ID>/<REPOSITORY>/<PUBLIC_IMAGE>@sha256:<64_HEX>'
$workerImage = 'asia-southeast1-docker.pkg.dev/<PROJECT_ID>/<REPOSITORY>/<WORKER_IMAGE>@sha256:<64_HEX>'
$migrationImage = 'asia-southeast1-docker.pkg.dev/<PROJECT_ID>/<REPOSITORY>/<MIGRATION_IMAGE>@sha256:<64_HEX>'
$notificationChannels = @(
  'projects/<PROJECT_ID>/notificationChannels/<CHANNEL_ID>'
)

$secretIds = @(
  'fsl-api-database-url',
  'fsl-worker-database-url',
  'fsl-migration-database-url',
  'fsl-drive-operation-attestation-key',
  'fsl-public-registration-rpc-token'
)

& .\infra\library-registration\scripts\gcp-readonly-preflight.ps1 `
  -DeploymentProfile registration-preview `
  -ProjectId $projectId `
  -Region 'asia-southeast1' `
  -StateBucket $stateBucket `
  -ArtifactRepository $artifactRepository `
  -PublicImage $publicImage `
  -WorkerImage $workerImage `
  -MigrationImage $migrationImage `
  -SecretIds $secretIds `
  -NotificationChannelNames $notificationChannels
```

Add `-IncludeDrive` and the four Drive-only secret IDs only for the reviewed
real-Drive E2E window. The full-production profile below remains the default and
requires the administrator image and all twelve secret containers.

```powershell
$projectId = '<PROJECT_ID>'
$stateBucket = '<SINGAPORE_STATE_BUCKET>'
$artifactRepository = '<ARTIFACT_REPOSITORY>'

$publicImage = 'asia-southeast1-docker.pkg.dev/<PROJECT_ID>/<REPOSITORY>/<PUBLIC_IMAGE>@sha256:<64_HEX>'
$adminImage = 'asia-southeast1-docker.pkg.dev/<PROJECT_ID>/<REPOSITORY>/<ADMIN_IMAGE>@sha256:<64_HEX>'
$workerImage = 'asia-southeast1-docker.pkg.dev/<PROJECT_ID>/<REPOSITORY>/<WORKER_IMAGE>@sha256:<64_HEX>'
$migrationImage = 'asia-southeast1-docker.pkg.dev/<PROJECT_ID>/<REPOSITORY>/<MIGRATION_IMAGE>@sha256:<64_HEX>'

$secretIds = @(
  'fsl-api-database-url',
  'fsl-admin-database-url',
  'fsl-admin-allowed-emails',
  'fsl-admin-edge-shared-secret',
  'fsl-worker-database-url',
  'fsl-migration-database-url',
  'fsl-drive-oauth-client-id',
  'fsl-drive-oauth-client-secret',
  'fsl-drive-oauth-refresh-token',
  'fsl-drive-resource-id',
  'fsl-drive-operation-attestation-key',
  'fsl-public-registration-rpc-token'
)

$notificationChannels = @(
  'projects/<PROJECT_ID>/notificationChannels/<CHANNEL_ID>'
)

& .\infra\library-registration\scripts\gcp-readonly-preflight.ps1 `
  -ProjectId $projectId `
  -Region 'asia-southeast1' `
  -StateBucket $stateBucket `
  -ArtifactRepository $artifactRepository `
  -PublicImage $publicImage `
  -AdminImage $adminImage `
  -WorkerImage $workerImage `
  -MigrationImage $migrationImage `
  -SecretIds $secretIds `
  -NotificationChannelNames $notificationChannels
```

array bindingを保つため、上記のように現在のPowerShellから`&`でscriptを呼ぶ。placeholderを含む
commandを実行しない。必要なら`-OutputPath`へ承認済みlocal pathを明示する。省略時は
`outputs/library-registration/gcp-preflight-<UTC>.json`へ出力される。

終了code `0`かつterminal summaryが`status=pass`であることを確認する。終了code `1`または例外時は
不足条件を外部変更手順へ戻してreviewし、修正後に新しい証跡を生成する。preflight自身に作成・修正を
させない。

## 6. sanitized evidenceのreview

共有・Gate記録へ使用できるのは、生成JSONを人が再確認し、次を満たしたsanitized evidenceだけである。

- `status`が`pass`
- `purpose`が`gcp_readonly_preflight`
- `deployment_profile`が承認済みの`registration-preview`または`full-production`
- `drive_capability_included`が承認済み入力と一致
- `external_mutations`が`false`
- `secret_payloads_accessed`が`false`
- `secret_container_count`がprofileに応じて`5`、`9`、または`12`
- `image_digest_count`がregistration Previewでは`3`、full productionでは`4`
- `notification_target_count`が承認済み入力件数と一致し、1〜20件
- `checks`の全行が`pass`
- regionが`asia-southeast1`
- project、bucket、repository、secret ID、image URI、notification channelは生値ではなく
  `sha256_16` fingerprintまたは件数だけで記録されている

scriptはactive Google accountをPASS/FAIL判定にだけ使い、emailをJSONへ書かない。console全体の
screenshot、shell history、`gcloud ... --format=json`のraw出力を証跡として添付しない。JSONに想定外の
生identifier、account、PII、token、secret、database URL、Drive IDが含まれていた場合は共有せず、
Gateを`BLOCKED`として原因を確認する。

## 7. FAIL・中断条件

次のいずれかはpreflight `FAIL/BLOCKED`であり、Terraform backend init、plan、apply、production
Drive bootstrapへ進まない。

- `gcloud`がPATHにない、active authがない、対象projectが`ACTIVE`でない、billingが無効
- 必須9 APIのいずれかが無効
- bucketがSingapore以外、Uniform bucket-level access無効、またはPublic access preventionが
  `enforced`でない
- Artifact Registryが別region/非Docker、または4 imageのいずれかがdigest固定されていない・存在しない
- exact 12 secret containerの不足、別名、重複
- 承認済みnotification channelが0件、存在しない、または入力resource nameが誤っている
- Cloud Run spend capが利用不可、`Configured`でない、target額が未承認、またはproject/service scopeが不一致
- project alerts-only budget、通知recipient、`cost_guardrails_review`との額一致が未確認
- evidence生成失敗、いずれかのcheckが`fail`、またはsanitization境界に違反

なお、preflight PASSはsecret version/payload、OAuth publishing status、production refresh token、
Terraform plan/apply、Cloud Run稼働、Neon migration、Drive permission、通知到達、管理者MFA、Limited
Pilot、Production Cutoverを証明しない。これらを一括してPASS扱いにせず、それぞれの人間Gateと
実host/E2E証跡が揃うまで総合状態を`PRODUCTION BLOCKED`に保つ。
