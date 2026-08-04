# Phase 8A 実装報告

作成日: 2026-08-01<br>
判定: `LOCAL IMPLEMENTATION PASS / CLOUD AND MANUAL GATES PENDING / PRODUCTION BLOCKED`

## 実装したもの

- Docker imageを`public`、`worker`、`migration` targetへ分離した。production composite targetは
  意図的に起動せず、public/admin/workerにはAlembic migrationを含めない。Uvicorn access log、server
  header、untrusted forwarded-header処理も無効にした。
- TerraformでCloud Run public/private service、Cloud Run migration job、専用service account、
  最小secret access、worker IAM、Scheduler OIDC、有限retry、min 0/max 1、PII-free log metricを
  定義した。
- publicへpooled runtime URLだけ、workerへpooled runtime URLとDrive secretだけ、migrationへ
  direct URLだけを割り当てる契約を明文化した。
- fixed NOLOGIN capability role、API/worker別login role binding、table別runtime権限、read-only
  backup/restore権限、
  machine-failing privilege audit SQLを追加した。
- 合成データ限定の`pg_dump`、空branch restore、SHA-256、schema/count/constraint/audit列比較を追加した。
  native PostgreSQL clientがない場合は、Docker DesktopのPostgreSQL 17 clientへsecret-safeに
  fallbackする。
- secret rotation、旧version失効、monitoring、費用停止、Drive kill switch、API read-only、migration
  rollbackの順序をrunbook化した。
- production workerは、Drive/API/外部副作用OFF・kill switch ONのstandbyでもhealthを維持する。
  Terraform既定ではScheduler、関連IAM、Drive secret bindingを作らず、exact confirmation付きの
  activation objectだけが一括有効化できる。管理APIもbootstrap・MFA・host確認前は既定OFFである。

## 自動検証

Phase 8Aのplatform/static contract、Terraform format/validate、三target Docker build、三imageの
非root/read-only/migration資産分離、PostgreSQL 17でのrole bootstrap/bind/grant/auditを実行し、
すべてPASSした。統合後の全回帰も、host Python 197件、隔離Docker開発image内Python 197件、
frontend Community/Contact 57件、Library 53件、release-gate 8件、TypeScript、production build、
export verifyがPASSした。

### Local PostgreSQL統合証跡

2026-08-01の専用一時PostgreSQL 17で、合成データだけを使い次を確認した。

- 200登録、最大同時connection 2: 完了、欠落・重複なし。
- 同じidempotency key/payload 200件の再送: 完了、全件replay判定。
- 最終件数: member 200、application 200、access grant 200、operation 200。
- 全operationはDrive未実行の`pending`で、外部副作用・remote service接続なし。
- `pg_dump` custom formatから空の別databaseへrestoreし、Alembic
  `f1a2b3c4d5e6`、library table 11、主要row 800、constraint、audit列が一致。
- dump SHA-256を取得し、比較後に所有label確認済みの一時containerを削除。

sanitized machine evidence:
`outputs/library-registration/phase8a-local-postgresql-evidence.json`

当時のsourceではPhase 8A/8B/9/10Aを連続実行するcanonical local gateもPASSした。これは
historical implementation evidenceであり、現在候補の判定には最新clean HEADで再生成した
`outputs/library-registration/local-preproduction-gate.json`だけを使用する。

これはlocal transactionと復旧可能性のPASSであり、Cloud Run/Neon/Driveの実環境PASSではない。

## LOCAL IMPLEMENTATION GATE

- [x] hostと隔離Docker開発imageでPython全回帰197件がPASS。
- [x] frontend Community/Contact 57件、Library 53件、release-gate 8件、typecheck、build、verifyがPASS。
- [x] 合成200登録を最大同時connection 2で処理し、欠落・重複なし。
- [x] 同じ200件を再送し、全件replay、各主要table 200件を確認。
- [x] dumpを空の別local PostgreSQLへrestoreし、Alembic `f1a2b3c4d5e6`、11 table、
  主要row 800、constraint、audit列の一致を確認。
- [x] 外部副作用・remote service接続なし、合成データだけで実行。

- [x] public/admin/worker/migration Docker targetとentrypoint分離。
- [x] Terraformでpublicにdirect/Drive secretがなく、workerにdirect URLがなく、migrationだけがdirect
  URLを持つこと。
- [x] workerがinternal ingress、no `allUsers`、exact Scheduler SA IAM/OIDC、retry 0であること。
- [x] Secret Manager versionが数値pinされ、`latest`を使わないこと。
- [x] DB capability roleと禁止権限監査、synthetic backup/restore guardが存在すること。

## 実施していない外部操作

Google Cloud/Neon/Google Drive/Cloudflareの変更、secret作成、OAuth同意、Terraform apply、image push、
production migration job実行、production backup/restore、公開、CTA切替は実施していない。これらは本人認証、規約・
privacy承認、plan review、実公開承認を要する。

## 残るCLOUD / MANUAL PASS GATE

- [ ] production Neon上でrole auditとmigration jobを実証する。
- [ ] secretを一つずつrotateし、新revision復旧と旧credential拒否を証明する。
- [ ] 別synthetic Neon branchへ実dump/restoreし、local PostgreSQL証跡と同じ比較結果を保存する。
- [ ] deployed publicからworker routeへ到達不能、Scheduler以外のworker要求拒否を確認する。
- [ ] deployed Cloud RunとNeonで200件event/2同時submitを再実行し、実host OAuth、
  実Drive viewer/通知/revoke E2Eを完了する。
- [ ] monitoring通知、費用停止線、read-only/kill switch/rollback drillを人が確認する。

上記が完了するまでPhase 8Aのproduction PASSや本番公開完了とは表現しない。
