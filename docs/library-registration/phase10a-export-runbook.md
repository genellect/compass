# Phase 10A CSV/XLSX名簿出力 Runbook

Status: Operational Runbook  
Scope: Phase 10A admin-only one-way roster download  
Last verified: 2026-08-03
現在状態: local実装済み・production機能flag OFF

## 1. 実行前gate

次を満たさない環境ではexport flagを有効にしない。

- 規約・privacyと別に、名簿出力の目的、列、実行者、保存先、暗号化、再共有、削除期限が承認済み。
- 正規host OAuth、初期private 2-account allowlist、両方の`admin` bootstrap、MFA・recovery、
  全未許可Google account拒否が成立。
- production migration `e9f0a1b2c3d4`とDB role監査がPASS。
- HTTPS/CORS/CSPがexact hostで、responseをproxy/CDN/browser cacheへ保存しない。
- download先が組織または運営責任者の承認済み暗号化領域である。

## 2. local合成確認

repository rootで次を実行する。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-docker-dev.ps1 -Action Phase9Phase10Test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-docker-dev.ps1 -Action Down
```

これは合成PostgreSQLと外部副作用OFFを強制する。実PII、Google、Drive、Neon、Cloud Runを
使わない。通常frontend mockでは合成CSVだけを確認し、XLSX buttonは有効化しない。

## 3. production enable前確認

専用admin APIのPhase 8管理境界が成立した後、review済み設定でだけ次を有効にする。

Terraformでは、先に`admin_api_activation`を承認済みにし、次のobjectを同じreview済みplanで指定する。

```hcl
phase10a_export_activation = {
  enabled      = true
  confirmation = "I_APPROVED_PRODUCTION_PHASE10A_EXPORT_AFTER_DATA_HANDLING_REVIEW_V1"
}
```

confirmation不一致、export有効かつadmin無効、またはruntime bootstrap前の有効化はplanで拒否する。
緊急停止はこのobjectを`enabled=false`・空confirmationへ戻す。再開には再度exact confirmationとplan reviewが必要である。

```text
PHASE8_ADMIN_API_ENABLED=true
PHASE10A_EXPORT_API_ENABLED=true
PHASE10A_EXPORT_ACTIVATION_CONFIRMATION=I_APPROVED_PRODUCTION_PHASE10A_EXPORT_AFTER_DATA_HANDLING_REVIEW_V1
PHASE10A_EXPORT_MAX_ROWS=5000
PHASE10A_EXPORT_MAX_BYTES=10485760
PHASE10A_EXPORT_RATE_LIMIT_PER_HOUR=12
PHASE10A_DOWNLOAD_RETENTION_DAYS=30
```

30日は推奨削除日の暫定値であり、法務・個人情報方針の承認値を優先する。値の変更は
Terraform plan、runbook、UI表示、規約・運用記録を同時reviewする。enable/disableは
本番設定変更なので、実行直前に責任者承認を取る。

## 4. 管理画面からの出力

1. 正規hostの`/library-registration/admin/`を公開siteのリンクではなく承認済み運用手順から開き、
   allowlist済み・MFA済みのowner-controlled admin accountでloginする。
2. session表示が`admin`であることを確認する。一般利用者、viewer、operatorでは続行しない。
3. 「名簿出力」でCSVまたはXLSX、member status、必要な場合だけacademic roleを選ぶ。
4. 承認済みの固定利用目的から1つを選ぶ。自由記述はできず、氏名、email、学籍番号を目的へ追加しない。
   - `periodic_roster_review`: 定期的な利用者名簿の確認
   - `drive_access_reconciliation`: 登録状態とDrive閲覧権限の照合
   - `incident_response`: 承認済みの情報セキュリティ事故対応
5. PII fileの取扱いと削除期限を確認し、確認checkboxを選択する。
6. 一度だけ実行し、連打しない。重複keyは安全のため`409`となる。
7. 画面に表示されたrow数、SHA-256、推奨削除時刻を、download fileと監査記録で照合する。

APIを直接呼ぶ必要は通常ない。直接試験する場合もBearer token、接続先、出力bodyを
shell history、log、screenshotへ残さない。

## 5. file受入

- fileは承認済み暗号化directoryへ直ちに移し、Downloadsに残さない。
- email、個人Drive、一般共有folder、USBへ再共有しない。
- OS/Officeの保護ビューを維持し、macro・外部connectionの警告を許可しない。
- CSVはUTF-8、列順、先頭0、改行を確認する。XLSXは`Members`と`Manifest`だけを確認する。
- `= + - @`で始まる合成test値が数式として実行されないことを、本番PIIを使わず別に確認する。
- Drive permission ID、OAuth token、Google `sub`、秘密情報が含まれないことを確認する。

hash不一致、列数不一致、row数不一致、formula実行、macro/外部link警告があればfileを使用せず、
export flagをOFFにしてincidentとして扱う。

## 6. 監査と削除

成功時は`library_export_runs`と`library_admin_audit`の次の非PII metadataを照合する。

- actor admin、role、serverが確定した`export_purpose:<purpose_code>`、request ID、実行結果。
- schema version、format、allowlist filters、snapshot時刻、row/byte数。
- content SHA-256、推奨削除時刻。

file本体はserverに保存されない。したがって監査recordを消してもfile削除にはならず、
端末・backup・同期先を含めて運用者が削除する。推奨削除日までに削除し、日時、担当者、
対象export run IDだけを削除記録へ残す。監査tableをUPDATE/DELETEしてはならない。

## 7. 異常時

| 状態 | 対応 |
|---|---|
| `404` | feature flagがOFF。承認なしに有効化しない。 |
| `403` | admin権限なし。roleを迂回せず管理者recordを確認する。 |
| `409` | 同じidempotency keyの再実行またはpayload不一致。選択目的と条件を再確認する。 |
| `413` | 5,000 rowsまたは10 MiB超過。上限を上げず、承認済み条件で分割設計をreviewする。 |
| `429` | 同時生成中または毎時上限。待機し、連続retryしない。 |
| `503` | API read-only。復旧承認まで出力しない。 |
| hash不一致 | fileを隔離・削除し、使用停止、logのPII混入なしを確認して調査する。 |

緊急停止は`phase10a_export_activation.enabled=false`と空confirmationのreview済み
Terraform revisionで行う。結果として`PHASE10A_EXPORT_API_ENABLED=false`となる。
登録・Drive workerの状態を変更せず、exportだけを停止する。

## 8. Phase 10Aの非対象

- Excel/VBAからPostgreSQLへの書戻し。
- exported fileを再取込する双方向同期。
- Drive permissionのgrant/revoke。
- 認証emailやGoogle identityの変更。
- 自動mail添付・自動Drive保存。

これらが必要になった場合はPhase 10Bとして、別の脅威分析、承認、rollbackを設計する。
