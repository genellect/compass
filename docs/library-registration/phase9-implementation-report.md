# Phase 9 旧名簿移行 実装報告

Status: Four-source local implementation complete; PostgreSQL rerun pending
Scope: Phase 9 private legacy migration  
Last verified: 2026-08-02
正式判定: `LOCAL HOST PASS / FOUR-SOURCE POSTGRES AND REAL SNAPSHOT GATES PENDING / PRODUCTION BLOCKED`

## 1. 結論

旧Google Form、管理Sheet、ドライブ利用者名簿、Drive permissionの四つのsnapshotを、公開uploadを経由せず
PostgreSQLへ段階移行するローカル実装を完了した。合成データ専用PostgreSQL 17で、
migrationのdowngrade・再upgrade、同時apply、冪等性、rollback・re-import、raw snapshotの
改変拒否、Phase 10A監査の追記専用制約まで確認した。

実利用者データは取得・投入していない。Google、Drive、メール、Neon、Cloud Runへの
外部操作も行っていない。このためPhase 9は本番完了ではない。

## 2. 実装済みの境界

- 実行経路は`services/library-api/scripts/phase9_legacy_migration.py`だけである。
  public API、worker、ブラウザからraw snapshotを投入するrouteは存在しない。
- `google-form.csv`、`management-sheet.csv`、`member-roster.csv`、`drive-permissions.csv`の
  exact bytes、header、
  row数を`sha256`付きmanifestへ固定し、manifest作成後の差替えを拒否する。
- raw payload、正規化payload、変換rule versionを分離して保存する。row fingerprintは
  version付きHMAC-SHA256で作成し、keyは32 bytes以上を環境変数だけから受け取る。
- Drive resource identifier自体は保存・表示せず、そのHMAC fingerprintをmanifest、source hash、
  dry-run report、batch、承認、applyへ一貫して固定する。正規化済み全rowもrow別hashと
  aggregate hashで承認前に固定し、差替えを拒否する。
- roster/Driveのemailは`st.kitasato-u.ac.jp`完全一致だけを許可する。末尾一致による偽装domainを
  拒否し、NFKC・trim後の`薬学部`だけを`pharmacy`へ正規化する。
- sourceごとの必須CSV headerと重複headerを厳格に検査する。欠損・重複・未知のschemaを
  推測して続行しない。
- `ready`、`manual_resolution`、`excluded`を分離する。曖昧な学年・区分、所属欠損、
  email競合、重複、Driveだけ／名簿だけ、既存DBとの衝突を自動補完しない。
- approvalは有効な`admin`、10文字以上の理由、source hash、dry-run hash、normalized hash、
  Drive resource fingerprint、idempotency keyを必要とする。apply時に承認者がまだ有効な
  adminであることと全hashを再確認する。
- apply済み既存Drive permissionは`already_granted`かつ`managed_by_system=false`として
  取り込み、Drive operationを作成しない。招待、削除、通知メールの副作用は0件である。
- 運営責任者が既存登録者と確認した名簿行は、emailが対応しない場合も
  `normalized_email=NULL`の会員として取り込む。Google identity、application、Drive grant、
  operationは作らず、空学籍番号・同名候補・既存profile競合を推測で解決しない。
- batchが新規作成したmember/grantだけをlineage付きrollback対象にする。既存member、
  変更済みrecord、application・identity・operation等の依存があるrecordは削除しない。
- approve、reject、apply、rollbackはPIIを含まない管理監査を追記する。
- raw snapshot保持値は1〜3650日の範囲でmanifest/source hashへ固定する。既定90日は
  暫定値であり、本番承認値ではない。有効admin・理由・idempotency keyを伴う監査付き
  `hold`/`unhold`と期限後の明示purgeだけを許可する。
- purgeはraw/normalized PIIを消去する一方、旧規約・privacy同意が記録されていた事実と、
  version/timestampが旧sourceでは不明であるという来歴を非PII列として保持する。
- `row-report`はsource row番号、HMAC fingerprint、分類、issue、apply statusだけを含む
  非PII照合artifactを保護permissionで一度だけ作成し、上書きを拒否する。
- Phase 9 dataが存在する状態で、情報を失うAlembic downgradeを拒否する。

## 3. 合成PostgreSQL証跡

repository rootから次を実行する専用gateを実装した。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-docker-dev.ps1 -Action Phase9Phase10Test
```

2026-08-01の合成データ試験では、Alembic
`e0f1a2b3c4d5 -> f1a2b3c4d5e6`、
`f1a2b3c4d5e6 -> e0f1a2b3c4d5 -> c9d1e2f3a4b5 -> f8b0a1c2d3e4`、
`f8b0a1c2d3e4 -> f1a2b3c4d5e6`と`alembic check`を実行した。既存Phase 9 batchがある
旧`e0`は推測backfillせずupgradeをfail-closedとし、batchがない旧`e0`だけを安全に追補する。
過去のpre-release `e0`にexport payload制約が欠けていたschema driftも、履歴fileを書き換えず
`f1`で互換修復した。backend全回帰197件がhostと隔離Dockerの双方でPASSした。さらに、
3 source rows、別connection 2 workerの同時apply、member/permission重複0、
Drive operation 0、rollback・re-import、raw payload改変拒否、export監査UPDATE/DELETE拒否、
CSV hash、XLSX生成を確認した。専用local PostgreSQLの実API/race gateでは、deactivate先行時に
grantが副作用0で停止し、grant先行後のrevokeでは最終`inactive + revoked`となることを確認した。
一時databaseは試験後に削除した。guardは専用Compose DBと
`synthetic-only`以外の実行を拒否する。

2026-08-02にはhost上の合成SQLiteで、名簿40名、email対応18名、email未紐付け22名、
空学籍番号1名を一括applyし、会員40、既存権限18、identity/application/operation 0、同一batch
再applyの重複0、40会員・18権限のrollbackと再applyを確認した。null email時のDrive無通信、
CSV/XLSX空欄、危険なAlembic downgrade拒否も回帰試験に含めた。新しい四source経路と
`c3d4e5f6a7b8`のPostgreSQL/Docker gateは、この記録時点では未再実行である。

Phase 8A/8B/9/10Aのcanonical統合gateもPASSした。証跡は
`outputs/library-registration/local-preproduction-gate.json`を正本とする。

## 4. 未完了の実データ・本番gate

- [ ] 旧データを扱う法的根拠、目的、担当者、保管場所、暗号化、access、正確な保持日数、
  legal hold、削除記録を責任者が承認する。
- [ ] 同一基準時刻でGoogle Form response、管理Sheet、利用者名簿、Drive permissionを読み取り専用取得する。
- [ ] 四snapshotを保護されたrepository外領域へ置き、作業端末・backup・再共有範囲を承認する。
- [ ] 実snapshotのdry-run reportでsource、ready、manual、excluded、skip、conflictの総和、
  `drive_only`、`sheet_only`、`both`、`mismatch`、unkeyedを人が全件説明する。
- [ ] source、dry-run、normalizedの各hashとDrive resource fingerprintを別表示で照合し、
  有効なadminが理由付きで承認する。
- [ ] production direct接続でmigrationを適用し、public/worker roleからraw tableへ
  accessできないことを実証する。
- [ ] apply後の件数・lineage・監査を照合し、必要ならrollback・re-importを訓練する。
- [ ] 移行処理がDrive permission、通知メール、operationを1件も変更していないことを確認する。
- [ ] 原本・作業copy・raw DB payloadを承認した期限と方法で削除し、削除証跡を残す。

詳細操作は`phase9-legacy-migration-runbook.md`を正本とする。
