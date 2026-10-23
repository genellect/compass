# Phase 7 Drive閲覧権限・招待通知 実装報告

> **履歴文書:** 実装証跡は保持するが、第二管理者を未完了条件とする記述はADR-0003と`phase-roadmap-v3.md`で廃止済みである。

実施日: 2026-07-28（Phase 7B helper hardening: 2026-08-01）<br>
判定: `LOCAL PASS / REAL DRIVE E2E PENDING`

## 1. 固定した責務境界

Google OAuthの第1層は、検証済みID tokenの`hd`が許可Workspace組織かだけを
確認する。学生・教員でOAuthを分岐しない。Drive付与の第2層は従来どおり、
フォーム入力の所属、在籍区分、学年、`PP/PL/MP + 数字5桁`、同意、既存登録
状態をFastAPIが再判定する。Phase 7はこの固定ロジックを変更していない。

## 2. 実装した処理

承認済み登録時は、利用者・申請・`pending` access grant・`drive_grant` outboxを
同一DB transactionで保存する。HTTP応答は`pending`を返し、Drive API成功前に
「付与済み」または「通知済み」を表示しない。

workerは次を行う。

1. `pending`、期限到来`failed`、lease期限切れ`running` operationをclaimする。
2. Drive resource単位のDB leaseを取得し、同一フォルダのpermission変更を直列化する。
3. 既存permissionを全ページ照合し、既存reader/commenter/writerを変更・降格しない。
4. 未付与の場合だけ`reader`を作成し、Google Drive標準通知を要求する。
5. 成功応答のpermission ID、role、付与時刻、通知状態を保存する。
6. retryable errorは指数backoffで最大3回、以後`dead`にする。
7. 内部retry APIにより`failed/dead`を明示的に再queueできる。
8. revokeは成功応答を記録した`managed_by_system=true`のpermissionだけを削除する。

作成要求の応答を失った後にpermissionが見つかった場合、それが人手付与かを
証明できないため`already_granted`かつsystem管理外として保護する。この経路は
自動削除しない。

## 3. APIとUI

- `GET /phase7/registrations/{application_id}/status`
- `POST /phase7/internal/operations/process`
- `POST /phase7/internal/operations/{operation_id}/retry`
- `POST /phase7/internal/members/{member_id}/revoke`

利用者status APIは同一Google subject hashに結び、別主体からの照会を404にする。
内部APIは32文字以上のworker secret、外部副作用flag、Drive flag、kill switchを
すべて検証する。デフォルトはworker OFF、Drive OFF、kill switch ONである。

UIは`pending`、`granted`、`already_granted`、`failed`、`revoked`、`not_enqueued`
を区別し、登録後に認証済みstatusを再確認できる。Phase 7表記へ更新し、付与結果を
未確認の段階で招待済みと表示しない。

## 4. Schema

Phase 7 base revision: `a8c4d7e219bf`

Current hardening head: `e9f0a1b2c3d4`

- `library_access_grants`: system管理flag、通知状態、通知時刻。
- `library_operations`: worker lease、external action開始、完了時刻、due index。
- `target_alias`: public/admin producerは固定論理aliasだけを保存し、実Drive IDを保持しない。
- `library_operations.resource_id`: 後方互換列。workerは値を認可・Drive対象に使用しない。
- `library_operations.attestation_*`: version、発行時刻、one-time nonce、HMAC-SHA256署名、消費時刻。
- 既存の未署名operationはmigrationで署名を捏造せず、workerがDrive API前にdeadへ移す。明示的な
  管理者review/retryだけが新nonceと署名を発行する。
- `library_resource_leases`: Drive resource単位の排他lease。

## 5. 検証結果

| 検証 | 結果 |
| --- | --- |
| Python全回帰 | `83 passed` |
| TypeScript/Vitest | `20 passed` |
| TypeScript型検査 | PASS |
| Next.js静的build/export検証 | PASS |
| Desktop DOM | Phase 7表記、h1 1件、横overflowなし、console warning/error 0件 |
| Mobile 390px相当DOM | h1 1件、submit 1件、横overflowなし、console warning/error 0件 |
| Docker隔離 | 専用projectでPostgreSQL 17、API health、Python 83件PASS |
| Docker Alembic | `a8c4d7e219bf -> d4e8f2a901c7 -> a8c4d7e219bf` PASS |
| Neon direct migration | `6bb0eb9832ab -> d4e8f2a901c7 -> a8c4d7e219bf` PASS |
| Neon pooled read verification | Phase 7 columns/table、Drive OFF、kill switch ONを確認 |
| 新規付与/通知 | 合成Drive clientでPASS |
| 既存writer保持 | PASS |
| response lost後の重複防止 | PASS、system管理外として保守的に保護 |
| 有限retry/dead/手動requeue | PASS |
| resource lease競合 | attemptを消費せずdefer、PASS |
| system管理permissionの冪等削除 | PASS |
| 既存system管理外permissionの削除拒否 | PASS |
| DB上のDrive target ID改変 | worker固定targetだけを使用、PASS |
| 署名欠損・改変・期限切れ・再利用 | Drive API call 0でdead、PASS |
| DB上のpermission ID改変 | attested recipientのlive permissionと不一致なら削除0、PASS |
| 同一申請10回 | grant 1件、operation 1件、PASS |
| API合成E2E | 認証登録→pending→grant→status→revoke→status、PASS |

Docker構成は`compass-library-registration-dev`、host port `55432/58000`、専用
network/volume/ownership labelだけを使用した。COMPASS Interactiveは停止、再作成、
削除、変更していない。

## 6. 実Google Drive E2E補助

`scripts/start-phase7-drive-e2e.ps1`を追加した。所有者OAuthは非機密scope
`drive.file`だけを要求する。既存My DriveフォルダはID直指定ではなくGoogle Pickerで
明示選択し、OAuth appへ対象ファイル単位のアクセスを与える。

補助toolは、空・共有可能・既存受信者permissionなしを確認後、実Phase 7 workerで
readerを作成する。2回目worker実行が0件であることを確認し、別アカウントによる
Viewer範囲と標準通知確認で一時停止する。確認後は実revoke workerでpermissionを
削除し、OAuth grantも失効する。証跡へ保存するのは各ID/emailの16桁SHA-256
fingerprint、domain、成否だけである。

Phase 7B hardeningでは次を追加した。

- Picker選択folderはID一致、folder MIME、未削除、`ownedByMe=true`、共有可能、
  作成24時間以内、空をDrive APIで強制確認する。
- OAuth所有者とテスト受信者が同じメールなら、permission作成前に拒否する。
- helperによる中断cleanupは、DBが`managed_by_system=true`と記録し、作成応答と
  一致するpermission IDだけを削除対象にする。管理外permissionは削除しない。
- 通知受信、閲覧可能、編集等不可を別々に人が確認する。revoke後はテスト受信者が
  閲覧不能になったことを追加確認してから証跡を確定する。
- OAuth revocation endpointの成功だけでなく、同じrefresh tokenの再利用が
  `invalid_grant`で拒否されたことを失効PASS条件にした。
- loopback Host制限、CSP/no-store/frame拒否、20,000 bytesのrequest上限、CSRF、
  変更stageのsingle-useを強制した。
- 正常終了と通常の`Ctrl+C`はcleanupを通る。process強制終了や電源断は保証外なので、
  runbookにDrive ShareとGoogle Account側の手動cleanupを明記した。

helper限定の構文検査とunit/in-process HTTP境界試験は`13 passed`。この結果は実Google
Driveへの外部副作用を伴わず、実Drive E2Eの代替証跡ではない。

## 7. 未完了ゲート

次の3点が正式Phase 7 `PASS`に必要である。

1. Drive所有者がローカル補助画面でGoogle OAuthへログインし、Google Pickerから
   新規の空テストフォルダを選択する。
2. 別のテスト受信者が招待通知、フォルダ閲覧、編集不可を確認した後、補助画面で
   managed permissionだけを削除する。
3. テスト受信者が削除後に閲覧不能であることを確認し、OAuth refreshが
   `invalid_grant`となるsanitized evidenceを保存する。

このE2Eが完了するまで、本番Drive IDを設定せず、外部副作用flagとDrive flagをOFF、
kill switchをONに維持する。Phase 6B、第二管理者、国外保存正式承認、Cloud Run、
Secret Manager、rate limit/1日200件負荷試験はProduction前の別ゲートであり、
Phase 7ローカル実装完了を理由に省略しない。
