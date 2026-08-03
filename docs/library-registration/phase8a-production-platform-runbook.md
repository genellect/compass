# Phase 8A Production Platform Hardening Runbook

作成日: 2026-08-01  
適用範囲: 未来戦略ライブラリ登録基盤のみ  
現状態: `LOCAL IMPLEMENTATION COMPLETE / CLOUD AND MANUAL GATES PENDING / PRODUCTION BLOCKED`

## 1. 不変の境界

- OAuth第一段階はGoogle ID tokenの署名、`aud`、`iss`、期限、`email_verified`、
  `hd=st.kitasato-u.ac.jp`をserver側で確認する。同じ組織の学生・教員をこの段階で
  分岐しない。個人Google accountはserverが拒否する。
- OAuth通過はDrive承認ではない。Drive付与はフォーム内容、薬学部、区分・学年、
  学生の場合の`PP|PL|MP + 数字5桁`、同意、既存登録をserver/DBで判定する。
- public API、dedicated admin API、private worker、migration jobを別surfaceとし、runtimeへ
  direct DB URLを渡さない。Drive OAuthと実Drive resource IDはworker以外へ渡さない。
- 本runbookはCOMPASS Interactiveのrepository、container、network、volume、DB、secretを
  対象外とする。検出しても停止・変更・削除しない。
- 氏名、メール、学籍番号、Google `sub`、token、Drive ID、接続文字列をlog、evidence、
  Terraform変数、Git、チャットへ出さない。

## 2. 実装済みtopology

```text
Cloudflare Pages static registration UI
  -> Cloud Run public API (public image, max 1, pooled runtime role)
       -> identity verification / registration transaction / status
       -> admin routes are not mounted; no admin/audit/export DB access
       -> no Drive credential, no direct URL, no internal worker route

Cloudflare Access + same-origin Pages admin proxy
  -> Cloud Run dedicated admin API (admin image, max 1, separate pooled runtime role)
       -> private edge secret / admin-only OAuth / exact email allowlist / sub RBAC
       -> no registration OAuth, no Drive credential, no direct URL

Cloud Scheduler (15分間隔、retry 0、exact service account、stable custom OIDC audience)
  -> Cloud Run private worker (worker image, internal ingress, max 1)
       -> pooled runtime role / finite outbox batch / Google Drive API

Operator-approved Cloud Run Job (migration image, retry 0)
  -> Neon direct connection with migration role
```

Cloud SchedulerはSecret Managerからcustom headerを注入できないため、worker requestの
認証はCloud Run IAMとGoogle署名OIDCを正とする。workerに`allUsers`を付けず、指定した
Scheduler service account以外へ`roles/run.invoker`を付けない。共有secretをScheduler
設定またはTerraform stateへ保存してはならない。

Terraformの既定はstandbyである。runtime作成後のstandbyではpublic/worker serviceだけがhealthを返し、Drive API、
外部副作用、worker処理routeは無効、kill switchは有効とする。Scheduler、Scheduler用IAM、
Drive secret access/injectionも作成しない。管理serviceは別activationまで作成しない。これにより初回applyや
kill switch revisionが、credential未準備を理由に起動失敗したり、未承認のDrive処理を開始したり
しない。

Google公式仕様上、同一projectのCloud SchedulerはCloud Run internal ingressの許可元であり、
Cloud RunはTerraformの`custom_audiences`をsupportする。本構成はこの二条件を固定する。
参考: [Cloud Run ingress](https://cloud.google.com/run/docs/securing/ingress)、
[custom audiences](https://cloud.google.com/run/docs/configuring/custom-audiences)、
[Cloud Scheduler trigger](https://cloud.google.com/run/docs/triggering/using-scheduler)

## 3. 手動ゲートと自動化可能範囲

人が行う作業は次に限定する。

1. 専用Google Cloud project、billing、data location、利用規約・privacy文面を承認する。カード/billingは
   外部費用Gate直前まで登録しない。
2. Google Cloud、Neon、Google OAuthへ本人としてloginし、API有効化、secret値入力、
   Drive owner OAuth同意、通知先承認を行う。
3. `terraform plan`、DB role差分、migration SQL、公開origin、OAuth originをreviewし、
   `apply`、migration実行、Limited Pilot、CTA切替を直前承認する。
4. 実Drive viewer付与・通知・revokeと、管理者画面の人間受入を確認する。

Codex/CIが行えるのはimage build、unit/static test、Terraform format/validate、合成負荷、
合成DB backup/restore、sanitized evidence生成までである。上記手動ゲートを自動通過扱いに
してはならない。

初回applyは二段階に分ける。`runtime_services_activation`を既定OFFにしたmigration-onlyの
full planを先にapplyし、migration jobを人が実行してAlembic headとDB role auditを確認する。
その後だけ、次をreview済みの第二full planへ設定する。

```hcl
runtime_services_activation = {
  enabled      = true
  confirmation = "I_APPROVED_PRODUCTION_RUNTIME_SERVICES_AFTER_MIGRATION_V1"
}
cost_guardrails_review = {
  enabled                  = true
  cloud_run_spend_cap_usd  = 0.20
  project_alert_budget_usd = 1
  confirmation             = "I_VERIFIED_CLOUD_RUN_SPEND_CAP_AND_NEAR_ZERO_COST_GUARDRAILS_V1"
}
public_ingress_activation = {
  enabled      = false
  confirmation = ""
}
```

これによりfresh DBに対してruntime startup probeがmigrationより先に走ることを防ぐ。
`terraform -target`をbootstrapの正規手順にしてはならない。runtime作成後はこのobjectを
ONのまま維持し、incident停止には使わない。`prevent_destroy`が誤ったOFF applyを拒否する。
初回apply前には`infra/library-registration/scripts/gcp-readonly-preflight.ps1`のsanitized
PASS証跡を確認し、GCS backendを`-backend-config`で初期化する。runtime plan前にはCloud Run
spend cap、project alerts-only budget、1件以上のnotification channelを本人が確認する。上記の
`0.20`と`1`は初期提案であり、consoleが受理した本人承認額と一致させる。runtime standbyでは
public `allUsers` invokerを作らず、Preview/Pilotの別planでのみpublic ingressを有効にする。

Drive workerを有効化するplanでは、同じ`worker_drive_activation` objectに
`enabled=true`と
`confirmation=I_APPROVED_PRODUCTION_DRIVE_SIDE_EFFECTS_V1`を設定する。これによりworker API、
Drive API、外部副作用、Scheduler、必要なIAM/Drive secret bindingが同じ差分で有効になり、
kill switchだけがOFFになる。一部flagだけの変更はapplication startupが拒否する。
このplanではSchedulerが15分間隔、body limit 20、retry 0、worker timeout 120秒であることも
確認する。頻度またはbatchを変更する場合は、Neon CU-hourと通常15分・event backlog 3時間の
招待SLOを再実測し、本人が費用と待ち時間を再承認する。
管理APIも、初期管理者bootstrap、MFA、正規hostの拒否系確認後に限り
`admin_api_activation.enabled=true`と
`I_APPROVED_PRODUCTION_ADMIN_API_AFTER_MFA_BOOTSTRAP_V1`を同じreview済みplanへ設定する。

## 4. buildとlocal verification

repository rootで四つのtargetを個別buildする。

```powershell
docker build --target public -f services/library-api/Dockerfile -t fsl-public:local .
docker build --target admin -f services/library-api/Dockerfile -t fsl-admin:local .
docker build --target worker -f services/library-api/Dockerfile -t fsl-worker:local .
docker build --target migration -f services/library-api/Dockerfile -t fsl-migration:local .
```

必須確認:

- public OpenAPI/routerに`/phase7/internal/`がない。
- public OpenAPI/routerに`/phase6/admin/authorization`と`/admin/v1/*`がなく、admin routerに
  公開登録routeとworker routeがない。
- worker routerは`POST /phase7/internal/operations/process`とhealthだけで、認証・登録・
  管理者routeがない。
- `APP_ENV=production`のSQLite、wildcard/localhost CORS、空OAuth client ID、空`hd`、
  composite/local API、publicへのDrive secret/direct URL、workerへのdirect URL、
  非OIDC worker、不整合なworker activation flag、確認文字列なしの有効化が起動時失敗する。
- standby workerはDrive credentialなしで`/health/live`を返し、処理routeを閉じたままにする。
- imageは非rootで起動し、public/workerのread-only filesystemとSIGTERM終了を確認する。
- Uvicorn access log/server headerとuntrusted forwarded-header処理が無効である。Cloud Runの
  platform request log対策として、氏名・email・学籍番号をURL path/queryへ入れない。

## 5. DB least privilege導入順

実接続文字列はlocal environmentだけに置く。SQL fileやcommand lineへ書かない。

1. NeonでAPI runtime、admin runtime、worker runtime、migration、backup/restoreのlogin roleを別々に作成する。
2. owner direct URLを`FSL_DATABASE_OWNER_URL`へ設定する。
3. `database_roles.ps1 -Action Bootstrap`を実行し、NOLOGIN capability roleを作成する。
   `public` schemaと既存の`alembic_version`、`library_*` table/sequence、Library用trigger
   functionの所有者も`fsl_migration`へ統一する。確認値は実行ごとに`apply-bootstrap`だけを
   一時設定する。
4. 五つのlogin名を`FSL_API_RUNTIME_LOGIN`、`FSL_ADMIN_RUNTIME_LOGIN`、
   `FSL_WORKER_RUNTIME_LOGIN`、`FSL_MIGRATION_LOGIN`、`FSL_BACKUP_RESTORE_LOGIN`へ置き、
   `-Action Bind`を実行する。passwordは渡さない。
5. migration loginのdirect URLだけを`DATABASE_URL_UNPOOLED`へ設定し、Alembic upgradeを
   実行する。Alembicは接続直後に`SET ROLE fsl_migration`を行い、role bindingがなければ
   DDL実行前に失敗する。migration login自身をobject ownerにしてはならない。
6. 同じmigration loginのdirect URLを`FSL_DATABASE_MIGRATION_URL`へ一時設定し、
   `-Action Grant`を実行する。Grant処理も`SET ROLE fsl_migration`に失敗した場合は変更前に
   停止する。
7. owner direct URLで`-Action Audit`を実行する。schema、全application table、存在する全
   application sequence、Library用trigger functionの所有者が`fsl_migration`であること、
   runtime/backup roleに禁止権限がないことをmachine-failing auditで確認する。

例:

```powershell
$env:FSL_DATABASE_ROLE_CONFIRM='apply-audit'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  services/library-api/scripts/database_roles.ps1 -Action Audit
```

PASS条件:

- API/admin/worker/backup roleは`NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`。
- API runtimeはmember/application/grant/operationの`SELECT/INSERT`とidentityの
  `SELECT/INSERT/UPDATE`だけを持つ。identity `UPDATE`は再認証時の検証属性・時刻更新に限定し、
  member/application/grant/operationの`UPDATE`、schema `CREATE`、DDL、role変更、import/export・
  resource lease参照、admin・audit・export table accessを持たない。
- admin runtimeは管理routeに必要なmember/application/grant/operationの参照・限定更新、
  `library_admins`参照、audit/exportの`SELECT/INSERT`だけを持ち、新規登録やidentity変更を持たない。
- worker runtimeはmember/application/identityの参照、grant/operationの参照・更新、resource leaseの参照・作成・更新
  だけを持つ。applicationとidentityは署名済みDrive operationの承認状態・active link再検証に限って参照し、
  identity変更、admin、auditへ到達できない。
- API/admin/workerはreadiness用に`alembic_version`の`SELECT`だけを持ち、変更権限を持たない。
- backup/restoreは全tableの`SELECT`だけで、write/delete/schema `CREATE`を持たない。
- `public` schema、`alembic_version`、全`library_*` table/sequence、Library用trigger
  functionのownerはlogin roleではなく`fsl_migration`である。
- migrationだけがschema `CREATE`とapplication object所有を持つ。database owner URLと
  migration direct URLはどのruntime serviceにも渡さない。

## 6. Secret Managerとrotation

Terraformへ渡すのはsecret IDと数値versionだけで、payloadは渡さない。各versionは次の
順でrotationする。

1. 人が新credential/tokenを発行し、Secret Managerへ新versionとして入力する。
2. `secret_versions`の対象だけを新しい数値へ変更し、planで対象service/job以外が変わらない
   ことを確認する。
3. apply承認後、新revisionの`/health/live`、`/health/ready`、正規/拒否、有限worker batchを
   synthetic dataで確認する。
4. 旧revisionへtrafficがなく、rollback不要と人が確認してから旧secret versionをdisableする。
5. 旧credential自体をNeon/Google側で失効し、旧versionによる接続が拒否されることを確認する。

public registration RPC tokenはDB URLとは独立させる。例として`v1`から`v2`へ回す場合、
新しいtokenを`PUBLIC_REGISTRATION_RPC_TOKEN`、`v2`を
`PUBLIC_REGISTRATION_RPC_KEY_VERSION`としてmigration jobで先にdigest登録し、新しいpublic
revisionのreadinessと正規/拒否を確認する。旧`v1`の停止はその後に限り、migration jobへ
`PUBLIC_REGISTRATION_RPC_RETIRE_VERSION=v1`と
`PUBLIC_REGISTRATION_RPC_RETIRE_CONFIRMATION=retire-v1-after-v2-ready`を渡す。失敗時は旧versionを
activeのまま旧revisionへ戻す。token値やdigestをcommand line、SQL literal、log、証跡へ書かない。

Drive refresh token再発行はowner本人のGoogle login・OAuth同意が必須であり自動化しない。
本番Driveの4 credential versionは、Drive permissionを変更せず既存containerへstdin streamする
`phase7b-production-drive-oauth-bootstrap-runbook.md`の独立gateを使用する。
同時に全secretをrotateせず、API DB、worker DB、migration、Driveの順に一つずつ行う。失敗時は旧versionを
一時再enableし、前revisionへ戻してから原因調査する。

## 7. 合成データbackup/restore rehearsal

### 7.1 完全localの自動証跡

次のwrapperは登録基盤専用の一時PostgreSQL 17をlocalhost `55438`へ作り、Alembic head、
合成200登録/最大同時2、同じ200件の冪等再送、custom-format `pg_dump`、同じcontainer内の
空の別databaseへのrestore、revision/件数/constraint/監査列比較を順番に行う。remote host、
非synthetic DB、Drive flag有効、既存container名、port競合はfail-closedで拒否する。終了時は
所有labelを確認した当該containerだけを削除する。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  services/library-api/scripts/phase8a_local_postgres_evidence.ps1
```

sanitized結果は`outputs/library-registration/phase8a-local-postgresql-evidence.json`へ保存する。
この試験は年500件・event日200件・同時2件のlocal transaction/冪等性/backup復旧基準を覆うが、
Cloud Run latency、Neon cold start、実network egress、Scheduler/Drive E2Eの代替にはならない。

### 7.2 別synthetic Neon branch rehearsal

本scriptは`synthetic-only`宣言がないと停止し、Git worktree内へのdump、既存dump上書き、
pooler URL、TLSなしURL、名前未確認branch、非empty target、`pg_restore --clean`を拒否する。
nativeの`psql/pg_dump/pg_restore`がないWindows環境では、既存Docker Desktopから
`postgres:17-bookworm` clientを一時`--rm`起動する。password値はDocker引数へ展開せず、
process環境名だけを渡す。COMPASS Interactiveのcontainer/network/volumeは参照・再利用しない。

```powershell
$env:FSL_DATA_CLASSIFICATION='synthetic-only'
$env:FSL_SYNTHETIC_BACKUP_CONFIRM='backup-synthetic-only'
$env:FSL_BACKUP_DATABASE_URL='<local environment only: source direct URL>'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  services/library-api/scripts/backup_synthetic.ps1 `
  -OutputPath 'C:\private-evidence\fsl-synthetic.dump'

$env:FSL_SYNTHETIC_RESTORE_CONFIRM='restore-synthetic-only'
$env:FSL_RESTORE_TARGET_BRANCH='fsl-restore-synthetic-YYYYMMDD'
$env:FSL_RESTORE_TARGET_CONFIRM=$env:FSL_RESTORE_TARGET_BRANCH
$env:FSL_RESTORE_DATABASE_URL='<local environment only: empty target direct URL>'
$env:FSL_API_RUNTIME_LOGIN='<target public runtime login name>'
$env:FSL_ADMIN_RUNTIME_LOGIN='<target admin runtime login name>'
$env:FSL_WORKER_RUNTIME_LOGIN='<target worker runtime login name>'
$env:FSL_MIGRATION_LOGIN='<target migration login name>'
$env:FSL_BACKUP_RESTORE_LOGIN='<target backup login name>'
$env:PUBLIC_REGISTRATION_RPC_KEY_VERSION='v1'
$env:PUBLIC_REGISTRATION_RPC_TOKEN='<local environment only: independent token>'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  services/library-api/scripts/restore_synthetic.ps1 `
  -InputPath 'C:\private-evidence\fsl-synthetic.dump'

python -m scripts.verify_synthetic_restore
```

最後の比較はAlembic revision、全`library_*` table、件数、constraint集計、監査列を照合し、
URLやrow内容を出力しない。dumpとhash sidecarはprivate evidence領域で保存期限を決め、期限後に
人の承認で削除する。production PII backupへ本scriptを転用しない。
dumpは`fsl_private.public_registration_rpc_keys`のdataを明示除外する。restore後は同scriptが
所有権・role binding・ACLを再適用し、環境変数から現行digestを再投入し、role auditが通るまで
PASSを返さない。

## 8. monitoringと費用停止線

Terraformはpublic 5xxとDrive dead operationのPII-free log metricを用意する。runtime activationは
人が確認した既存notification channel 1件以上を必須とする。追加でconsole上に次を設定し、通知testを
人が受領する。

- public 5xx: 5分で3件以上。
- dead operation: 1件以上で即時。
- Cloud Run instance/latency: max instance 1、timeout増加、p95の継続悪化。
- Neon: storage 250MB、月compute 50%/80%、connection上限。
- Google Cloud: Cloud Run spend cap初期`$0.20`、project alert初期`$1`、quota 50%/80%、
  Secret active version exact 12（billing account全体の無料6が未使用なら約`$0.36/月`。RPC token追加分は約`$0.06/月`、rotation中の一時13は約`$0.42/月`）、
  Artifact Registry 0.4GB、Singapore GCS state byte。
- log量: PIIがないことをsample reviewし、retentionを必要最小限にする。

alerts-only budgetは強制停止ではない。Cloud Run spend capは新規Cloud Run利用を自動pauseするが、
Previewで反映は瞬時ではなく、in-flight request、遅延超過、Cloud Run外費用を止めない。料金・quotaが
停止線へ達したら`public_ingress_activation.enabled=false`・空confirmationでpublic invokerを外し、
`public_api_write_activation.enabled=false`へ戻し、Schedulerをpauseして原因を調べる。

## 9. incident / recovery

順序は外部副作用を先に止め、証拠を保全してから復旧する。

1. `public_ingress_activation`を`enabled=false`・空confirmationへ戻し、新規public requestを閉じる。
   runtimeは削除せず、health確認と証跡保全を続ける。
2. `worker_drive_activation`を既定standbyへ戻すreview済みrevisionを反映する。これにより
   kill switchがON、Drive/API/外部副作用がOFFとなり、Scheduler/IAM/Drive secret bindingも
   planから除外される。緊急時にconsoleでSchedulerを先にpauseした場合も、その状態を維持する。
3. `public_api_write_activation`を`enabled=false`・空confirmationへ戻す。結果としてpublicは
   `API_READ_ONLY_MODE=true`となる。health、status、管理者のread-only確認は残し、
   新規registration POSTは`503 api_read_only`にする。復旧後のwrite再開には
   `I_APPROVED_PRODUCTION_API_WRITES_AFTER_RECOVERY_REVIEW_V1`を含む別planをreviewする。
4. request ID、時刻、revision、operation UUID、HTTP statusだけを記録する。氏名・email・学籍番号・
   token・Drive ID・request bodyは記録しない。
5. DB不整合時はwriteを再開せず、合成restore rehearsal済み手順を基に別branchへ復元・照合する。
6. migration rollbackは対象revisionのdowngrade可否とdata lossをreviewし、backup取得後に専用jobで
   一段ずつ行う。runtime起動時Alembicは禁止する。
7. 復旧後はworkerをsynthetic operation 1件で確認し、Scheduler、public write、public ingressの順に戻す。

## 10. Phase 8A判定

local codeだけで確認できる項目は実装・自動test対象である。ただし次は本人認証または実環境変更を
伴うため未完了であり、Phase 8Aをproduction PASSにはしない。

- Google Cloud API有効化、IAM/Secret Manager/Cloud Run/Scheduler/alertの実apply。
- production Neon role audit、migration、secret rotation、旧credential失効。
- 別Neon branchへの実`pg_dump`/restore照合。
- Cloud Run/Neon実hostでの200件/日・2同時submit、実host OAuth、実Drive E2E。
- notification recipient、規約、privacy、data location、Limited Pilotの人間承認。

従って公開判定は、これらの証跡が揃うまで`PRODUCTION BLOCKED`を維持する。
