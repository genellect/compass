# Phase 9 旧名簿移行 Runbook

Status: Operational Runbook  
Scope: Phase 9 private migration job  
Last verified: 2026-08-02
現在状態: 実snapshot未取得・本番実行禁止

## 1. 実行前の停止条件

次のいずれかが未成立なら、実データ作業を開始しない。

- 個人情報の利用目的、担当者、保管場所、暗号化、保持・削除、incident対応が承認済み。
- snapshot取得時刻と対象sourceが確定し、Google/Drive所有者による読み取りが許可済み。
- production DBのdirect migration credentialと、実行する有効な`admin` recordが準備済み。
- rollback時間、作業停止条件、Google Form継続受付との整合が決まっている。
- HMAC keyをSecret Managerまたは同等のlocal secret storeへ保存できる。

このrunbookは大学Workspace管理者権限を要求しない。所有者が閲覧できるForm/Sheet/Drive
情報だけを対象にする。ただし、実Google exportやOAuth同意は所有者本人が手動で行う。

## 2. snapshot bundle

repository、OneDrive同期領域、共有folder、チャット、issue、CI artifactの外に、暗号化された
作業directoryを作る。四fileを同一基準時刻で読み取り専用exportし、名前を固定する。

```text
<protected-bundle>/
  google-form.csv
  management-sheet.csv
  member-roster.csv
  drive-permissions.csv
```

UTF-8 CSVとし、利用者名簿は`氏名,学籍番号,学年,登録日時`、Driveは少なくとも
`id,emailAddress,role,type`を含める。snapshot取得後は
旧sourceを編集せず、基準時刻、取得者、取得方法だけを別のPIIなし作業記録へ残す。

## 3. manifest作成

repository rootからAPI directoryへ移動し、snapshot内容を画面表示しない。

```powershell
Set-Location .\services\library-api
$env:PHASE9_DRIVE_RESOURCE_ID = '<APPROVED_DRIVE_RESOURCE_ID>'
$env:PHASE9_FINGERPRINT_HMAC_KEY_B64 = '<BASE64_KEY_FROM_SECRET_STORE>'
python -m scripts.phase9_legacy_migration prepare-manifest `
  <protected-bundle> `
  --reference-at <UTC_ISO_8601> `
  --fingerprint-key-version <KEY_VERSION> `
  --raw-retention-days <APPROVED_1_TO_3650_DAYS>
```

生成される`snapshot-manifest.json`はfile名、exact-byte SHA-256、byte数、row数、header、
基準時刻、rule/key version、保持日数、Drive resourceのHMAC fingerprintだけを含み、
Drive identifier自体は含まない。暗黙上書きは拒否される。再作成が正当な場合だけ、
旧manifestを証跡化したうえで`--overwrite`を明示する。

## 4. secretとDB接続

値をコマンド履歴、terminal出力、Git、チャットへ貼らず、ローカル環境変数または承認済み
secret注入で設定する。

```text
APP_ENV=production
SERVICE_SURFACE=migration
DATABASE_URL=<TLS付きpooled PostgreSQL URL>
DATABASE_URL_UNPOOLED=<TLS付きdirect PostgreSQL URL>
PHASE9_FINGERPRINT_HMAC_KEY_B64=<32 bytes以上をbase64化したkey>
PHASE9_DRIVE_RESOURCE_ID=<approved resource identifier>
```

Alembicとmigration jobは`DATABASE_URL_UNPOOLED`を使う。production owner credentialを
public APIやworkerへ渡さない。接続文字列やkeyを確認目的で表示しない。

## 5. stageとdry-run確認

```powershell
python -m alembic upgrade head
python -m scripts.phase9_legacy_migration stage <protected-bundle>
python -m scripts.phase9_legacy_migration status <BATCH_UUID>
python -m scripts.phase9_legacy_migration row-report <BATCH_UUID> <protected-bundle>
```

`stage`と`status`はraw rowを出力しない。次を照合する。

- source別row数の合計とbatch `row_count`が一致。
- `ready + manual_resolution + excluded`が全rowを説明する。
- `drive_only + sheet_only + both + mismatch`とunkeyedが説明可能。
- ambiguous role、faculty欠損、email/student number競合を推測で`ready`にしていない。
- owner確認済み名簿行は、email対応済み件数とemail未紐付け件数に分けて説明できる。
- email未紐付け会員にidentity、application、Drive grant、operationを作らない。
- `apply_status_count_matches_rows=true`。
- `staged_normalized_hash`と`target_drive_resource_fingerprint`がmanifest/statusで一致。
- `operational_side_effects=false`。

`row-report`はdirect PIIを含まず、row番号、HMAC fingerprint、分類、issue、apply statusだけを
保護permissionで一度だけ書き出す。既存fileの上書きは拒否される。aggregateだけでなく、
このartifactで全source rowが一度ずつ説明されることを人が確認する。

不明なrowが1件でもあれば、原本を上書きせずbatchをrejectするか、別snapshot・別batchとして
やり直す。DB上のraw/normalized payloadを直接修正して解決してはならない。

## 6. 人間承認

承認者は`status`に表示されたsource hash、dry-run hash、分類件数と手元の承認記録を照合する。
環境変数はその一回の承認processだけに注入する。

```text
PHASE9_ADMIN_ID=<active admin UUID>
PHASE9_REASON=<10から500文字の具体的理由>
PHASE9_CONFIRMED_SOURCE_HASH=<statusのsource_hash>
PHASE9_CONFIRMED_REPORT_HASH=<statusのdry_run_hash>
PHASE9_CONFIRMED_NORMALIZED_HASH=<statusのstaged_normalized_hash>
PHASE9_CONFIRMED_DRIVE_RESOURCE_FINGERPRINT=<statusのtarget_drive_resource_fingerprint>
PHASE9_IDEMPOTENCY_KEY=<8から128文字の一意key>
```

```powershell
python -m scripts.phase9_legacy_migration approve <BATCH_UUID>
python -m scripts.phase9_legacy_migration status <BATCH_UUID>
```

承認しない場合は`PHASE9_ADMIN_ID`と`PHASE9_REASON`を設定し、次を実行する。

```powershell
python -m scripts.phase9_legacy_migration reject <BATCH_UUID>
```

## 7. apply

apply直前に受付停止または差分取扱いを確認し、承認hashと対象Drive resourceを再入力する。
`PHASE9_DRIVE_RESOURCE_ID`は既存permissionの照合先であり、Drive API呼出しを有効化しない。

```text
PHASE9_CONFIRMED_SOURCE_HASH=<approved source hash>
PHASE9_DRIVE_RESOURCE_ID=<approved resource identifier>
PHASE9_APPLY_CONFIRM=APPLY_APPROVED_BATCH_WITHOUT_DRIVE_SIDE_EFFECTS
```

```powershell
python -m scripts.phase9_legacy_migration apply <BATCH_UUID>
python -m scripts.phase9_legacy_migration status <BATCH_UUID>
```

apply後はcreated/reused/skipped、lineage、管理監査、member/grant件数を照合する。
既存permissionは`already_granted`、`managed_by_system=false`であり、operation、Drive変更、
招待メールが0件でなければ失敗として停止する。

## 8. rollbackと再取込

rollbackはbatchが作成し、かつapply後に変更・参照されていないrecordだけを削除する。

```text
PHASE9_ADMIN_ID=<active admin UUID>
PHASE9_REASON=<10から500文字の具体的理由>
PHASE9_ROLLBACK_CONFIRM=<BATCH_UUID>
```

```powershell
python -m scripts.phase9_legacy_migration rollback <BATCH_UUID>
python -m scripts.phase9_legacy_migration status <BATCH_UUID>
```

`imported_member_changed`、`imported_grant_changed`、`imported_member_has_dependents`等は
安全停止であり、強制削除しない。原因を人が確認する。同じbatchを再承認・再applyした場合も
重複がないことを照合する。

## 9. raw snapshot purge

既定90日は暫定値であり、manifest作成時に本番承認値へ置き換える。terminal stateで期限超過、
`legal_hold=false`のbatchだけが対象になる。

```text
PHASE9_ADMIN_ID=<active admin UUID>
PHASE9_REASON=<10から500文字の具体的理由>
PHASE9_IDEMPOTENCY_KEY=<8から128文字の一意key>
PHASE9_PURGE_CONFIRM=PURGE_EXPIRED_TERMINAL_RAW_SNAPSHOTS
```

```powershell
python -m scripts.phase9_legacy_migration purge-expired --now <UTC_ISO_8601>
```

purge前に対象batch、法的保全、backup、原本の保持義務を確認する。purge後はraw payloadを
復元できない。HMAC key、環境変数、作業CSV、temporary copyも承認した方法で破棄し、
件数・日時・担当者だけを削除証跡へ残す。

期限到来前に法的保全が必要な場合は、同じadmin/reason/idempotency keyを設定して次を使う。

```powershell
python -m scripts.phase9_legacy_migration hold <BATCH_UUID>
python -m scripts.phase9_legacy_migration unhold <BATCH_UUID>
```

`unhold`は保持義務の終了を人が確認した場合だけ実行する。purge後も、旧sourceに同意記録が
存在した事実と、同意version/timestampが不明であるという非PII来歴は監査目的で残る。

## 10. ローカル合成gate

実snapshot作業前にrepository rootから次をPASSさせる。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-docker-dev.ps1 -Action Phase9Phase10Test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-docker-dev.ps1 -Action Down
```

このgateは専用Compose PostgreSQL、`synthetic-only`、Drive OFF、外部副作用OFFを強制する。
PASSしても実snapshot・production・Drive E2Eの承認にはならない。
