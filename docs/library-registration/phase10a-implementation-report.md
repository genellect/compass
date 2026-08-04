# Phase 10A CSV/XLSX名簿出力 実装報告

Status: Local implementation and PostgreSQL/API/browser verification complete<br>
Scope: Phase 10A admin roster export<br>
Last verified: 2026-08-02
正式判定: `LOCAL IMPLEMENTATION PASS / DATA-HANDLING AND PRODUCTION AUTH GATES PENDING / PRODUCTION BLOCKED`

## 1. 結論

PostgreSQL正本から、adminだけが固定schemaのCSV/XLSXを一時downloadできる最小出力を
実装した。生成はserver memory内で完結し、file本体をserver filesystem、DB、Driveへ
保存しない。合成データでCSV/XLSX、hash、formula injection防止、row上限、監査の
追記専用制約を確認した。

本番host、実admin OAuth/MFA、実名簿、保管・暗号化・再共有・削除運用は未確認である。
export APIは既定で無効のため、本番利用可能とは判定しない。

## 2. 実装済み

- endpointは`POST /admin/v1/exports`。Phase 8 admin APIに加え、
  `PHASE10A_EXPORT_API_ENABLED=true`を明示しなければ`404`である。
- server-sideの有効な`admin`だけを許可し、`viewer`と`operator`を拒否する。
- requestは`csv|xlsx`、member status、任意のacademic role、allowlist済み利用目的コード、
  `confirmed=true`、`Idempotency-Key`に限定する。export専用requestから自由記述理由を除き、
  氏名、email、学籍番号等のfree-textを監査metadataへ入れない。
- 許可目的は`periodic_roster_review`、`drive_access_reconciliation`、`incident_response`の
  3値だけである。監査reasonはclient文言ではなくserverが`export_purpose:<purpose_code>`へ固定する。
- 1 statementのserver-side snapshotを学年、学籍番号、登録日時、member ID順に固定し、1回最大5,000 rows、
  service上限10 MiB、1 process同時生成1件、adminごと毎時12回を上限とする。
- 16列を固定する。氏名・大学email・学籍番号を含むため出力file自体はPIIであるが、
  Drive permission IDやOAuth識別情報は出力しない。
- CSVはUTF-8 BOM、CRLF、XLSXはinline text cellで生成する。先頭空白・control文字後を含む
  `= + - @`を無害化し、数字識別子の先頭0を保持する。
- XLSXへformula、macro、external link、PII入りdocument propertiesを作らない。
- responseは`private, no-store`、`nosniff`、file名、row数、content SHA-256、export run ID、
  推奨削除時刻をheaderで返す。browser clientもdownload後にSHA-256を再計算する。
- file bytesは保存せず、`library_export_runs`と`library_admin_audit`へ実行者、固定目的コード、条件、
  snapshot時刻、件数、byte数、hash、成否、推奨削除時刻を追記する。
- PostgreSQLでは`library_export_runs`のUPDATE/DELETEをtriggerで拒否する。同じ
  idempotency keyの再実行は、既存snapshot bytesを保存していないため`409`で拒否する。
- 管理UIへadmin専用の出力tabを追加した。通常mock buildは合成CSVだけを扱い、
  XLSXの実downloadはAPI modeだけで行う。

## 3. 出力schema v2

`library-members-v2`の列順は次で固定する。最初の4列を日常名簿の表示順と一致させる。

```text
full_name
roster_grade
student_number
registered_at_utc
member_id
record_version
university_email
academic_role
faculty_code
grade
member_status
drive_access_status
drive_permission_managed
created_at_utc
updated_at_utc
deactivated_at_utc
```

XLSXは`Members`と`Manifest`の2 sheetを持つ。Manifestにはschema version、snapshot時刻、
row数、PIIを含まないallowlist filterだけを保存する。

## 4. ローカル証跡

Phase 9/10A専用Docker gateで、合成PostgreSQL snapshotからCSV hashとXLSX生成、
row制約、`library_export_runs`のUPDATE/DELETE拒否を確認した。frontendではadmin権限、
確認・固定目的選択、filter、hash再計算、object URL破棄、mockのXLSX拒否を自動試験対象にした。

専用local PostgreSQLではexport APIをFastAPI経由で実行し、feature OFFが認証・DB依存より先に
`404`となること、admin-only RBAC、CORS、`private, no-store`、必須header、冪等性不一致、
rate limit、監査件数を確認した。ローカル合成ブラウザE2Eでは1440px/390px、viewer/admin導線、
固定目的＋確認gate、CSV受領票、safe filename、SHA-256、削除期限、実行後の再lockを確認した。
object URLの実保存eventとTab/Enter操作はin-app browserの限界により人間E2Eへ残す。

canonical統合証跡は`outputs/library-registration/local-preproduction-gate.json`、ブラウザ証跡は
`outputs/019f6667-2a38-7ef0-8ac0-3b3e0e24065e/browser-e2e/phase9-phase10a-browser-e2e.json`
を正本とする。

## 5. 未完了の実データ・本番gate

- [ ] 出力目的、許可admin、最小列、保存先、端末暗号化、再共有禁止、30日以内の削除、
  incident対応を責任者が承認する。
- [ ] production DB roleで`library_export_runs`がSELECT/INSERTのみ、UPDATE/DELETE不可であることを確認する。
- [ ] 正規hostで一般Workspace利用者、viewer、operatorが拒否され、MFA済みadminだけが実行できる。
- [ ] response header、download file SHA-256、file名、件数、snapshot時刻、監査recordを照合する。
- [ ] 実ExcelでCSV/XLSXを開き、式が実行されないこと、先頭0、文字化け、列順を人が確認する。
- [ ] Windows/Officeの保護ビューを解除せず、macroや外部接続がないことを確認する。
- [ ] download fileを承認済み暗号化領域に保存し、推奨削除日までに削除して証跡を残す。
- [ ] desktop/mobile/keyboard、二重click、上限超過、network失敗を正規hostで受け入れる。

VBAからの書戻し、Drive操作、認証email変更、Excelを正本にする同期はPhase 10Aに含めない。
詳細操作は`phase10a-export-runbook.md`を正本とする。
