# Phase 4ブロッカー解除・手動引渡しパック

> **履歴文書・実行非推奨:** 第二管理者をブロッカーとする記述はADR-0003と`phase-roadmap-v3.md`で廃止された。現行Gateの判断や作業指示には使用しない。

最終更新: 2026-07-19<br>
状態: `P4-B01 PASS / P4-B02-P4-B04 READY FOR HUMAN ACTION`

## 1. 固定境界

Phase 5 PostgreSQL統合は`PASS`済みである。本作業はPhase 4を解除し、Phase 6の
Google本番認証へ進めるかを判断するためのもので、実PII保存、RLS、Drive本番権限
変更、Gmail送信は行わない。

Google OAuthは`st.kitasato-u.ac.jp`のWorkspaceアカウントを本人が操作できる
ことだけを確認する。OAuth第1層では学生・教員を分岐せず、同じ許可`hd`なら通過
させる。実際のDrive付与可否は、フォームの薬学部、学年、在籍区分、同意、
`PP/PL/MP + 数字5桁`等の固定ロジックが決定する。この責務境界は変更しない。

## 2. 現在の判定

| ID | 状態 | Codex側 | 人にだけ残る操作 |
| --- | --- | --- | --- |
| P4-B01 組織`hd` | `PASS` | 実ID tokenのサニタイズ証跡取得済み | なし |
| P4-B02 第二管理者 | `READY` | role固定server、別人物比較、テスト43件PASS | 指名、本人ログイン、MFA・連絡確認 |
| P4-B03 OAuth引継ぎ | `READY` | read-only失効・再認可server、安全証跡 | Cloud設定、2名の同意、空folder共有 |
| P4-B04 国外保存 | `READY` | region/DPA/security/sub-processor/削除調査 | 内容確認、記名、日付、承認 |

P4-B01証跡は`phase4-hd-evidence-record.md`を正本とする。代表実測で得た`hd`は
`st.kitasato-u.ac.jp`であり、fingerprintの一致結果は非公開証跡に保管する。学生用・教員用
に分けた追加実測は不要である。

## 3. P4-B02: 第二管理者の指名と証跡

### 3.1 先に決めること

第二管理者を1名指名する。次をすべて満たす人物を選ぶ。

- 現Drive所有者とは別人物である。
- `st.kitasato-u.ac.jp`の本人管理Googleアカウントを持つ。
- OAuth再認可、緊急停止、料金・障害確認を引き受けられる。
- 管理用途のMFAを有効にでき、緊急連絡が取れる。

パスワード、2段階認証code、tokenを運営者へ渡してもらわない。本人がブラウザを
直接操作する。氏名と連絡先は非公開の運営者名簿に保存し、Gitへ入れない。

### 3.2 Primary証跡

repository rootでPowerShellを開き、次を実行する。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\start-phase4-admin-evidence.ps1 -Role Primary
```

ブラウザで`http://localhost:8765/`を開き、現Drive所有者の大学アカウントを選ぶ。
画面が`status: pass`、`expected_hd_match: true`になったことを確認する。

### 3.3 Secondary証跡

Primaryのserver終了後、次を実行する。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\start-phase4-admin-evidence.ps1 -Role Secondary
```

InPrivate/Guest windowを使い、第二管理者本人が自分の大学アカウントで操作する。
Primaryのsessionが自動選択されないことをaccount chooserで確認する。

### 3.4 2名比較

`outputs/phase4-oidc-evidence/`にできた2つの最新file名を確認し、実値を次へ指定する。

```powershell
Set-Location .\services\library-api
& '.\.venv-trusted\Scripts\python.exe' `
  '.\scripts\verify_phase4_admin_pair.py' `
  '..\..\outputs\phase4-oidc-evidence\<primary-file>.json' `
  '..\..\outputs\phase4-oidc-evidence\<secondary-file>.json' `
  --output '..\..\outputs\phase4-oidc-evidence\phase4-admin-pair.json'
```

`status: pass`、`distinct_subjects: true`、`expected_hd_match: true`を確認する。
その後、`phase4-admin-oauth-succession-record.md`へfile名、MFA確認日、緊急連絡
確認日、指名日だけを記入する。

## 4. P4-B03: OAuth失効・再認可ドリル

### 4.1 Google Cloudで手動設定

Google Cloud Consoleのproject `compass-auth`を選択する。英語UIでは次の順で操作する。

1. `APIs & Services` > `Library`を開く。
2. `Google Drive API`を検索し、`Enable`を押す。すでにEnabledなら変更不要。
3. `Google Auth Platform` > `Clients`を開く。
4. Phase 4専用の`Web application` clientを新規作成する。推奨名は
   `compass-phase4-handoff-local`。本番用clientへ流用しない。
5. `Authorized redirect URIs`へ次を完全一致で追加する。

```text
http://localhost:8766/oauth2/callback
```

6. `Audience`でpublishing statusが`Testing`なら、PrimaryとSecondaryの大学メールを
   `Test users`へ追加する。メールはConsoleへ直接入力し、チャットへ貼らない。
7. client JSONを自分のPCへdownloadするか、Client IDとClient SecretをConsoleで
   確認する。download fileはGit外に保管し、試験後に安全に削除する。

専用clientにする理由は、revoke drillがそのclientの既存OAuth grantへ影響するため
である。運用中のclientやcredentialでこの試験を行わない。

参考:

- [Google OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google OAuth security best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- [Google Drive files.get](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/get)

### 4.2 空のDriveテストフォルダ

1. PrimaryのMy Driveに`COMPASS OAuth Handoff Test - EMPTY`を新規作成する。
2. 個人情報、既存資料、shortcutを一切入れない。
3. Secondaryの大学アカウントだけへViewerで共有する。
4. URLの`/folders/`より後ろのfolder IDを自分のPC内だけで控える。

本番の未来戦略ライブラリfolderを使わない。Viewer共有はこの準備で唯一のDrive
権限変更であり、ユーザー本人が対象を確認して手動実施する。

### 4.3 秘密情報をWindows User環境へ保存

Client Secretをcommand historyへ残さないため、PowerShellで次を実行する。

```powershell
$secret = Read-Host 'OAuth Client Secret' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  [Environment]::SetEnvironmentVariable(
    'PHASE4_HANDOFF_GOOGLE_OAUTH_CLIENT_SECRET', $plain, 'User'
  )
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable plain, secret -ErrorAction SilentlyContinue
}
```

専用clientのClient IDも、P4-B01用の既存Client IDとは別のWindows User環境変数へ
設定する。Client IDは秘密ではないが、用途の異なるclientを混同しない。

```powershell
$clientId = Read-Host 'Phase 4 handoff Client ID'
[Environment]::SetEnvironmentVariable(
  'PHASE4_HANDOFF_GOOGLE_OAUTH_CLIENT_ID', $clientId.Trim(), 'User'
)
$folderId = Read-Host 'Empty Drive test folder ID'
[Environment]::SetEnvironmentVariable(
  'PHASE4_DRIVE_TEST_FOLDER_ID', $folderId.Trim(), 'User'
)
Remove-Variable clientId, folderId
```

Client Secret、folder ID、tokenはチャット、Markdown、Gitへ貼らない。

### 4.4 ドリル実行

repository rootで次を実行する。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\start-phase4-oauth-handoff.ps1
```

ブラウザで`http://localhost:8766/`を開く。

1. Primary本人が認証・同意する。
2. 画面がSecondaryへ進んだらInPrivate/Guest windowを使う。
3. Secondary本人が認証・同意する。
4. `outputs/phase4-oauth-handoff/`のJSONで`status: pass`、
   `distinct_subjects: true`、両stageの`drive_read_pass: true`、
   `old_credential_rejected: true`を確認する。

toolは`drive.metadata.readonly`だけを要求する。Primary/Secondaryのrefresh tokenを
順にrevokeし、旧tokenのrefreshが`invalid_grant`になることを確認する。token、
認可code、メール全文、Google `sub`はdiskへ保存しない。

終了後、Windows User環境の`PHASE4_HANDOFF_GOOGLE_OAUTH_CLIENT_SECRET`と
`PHASE4_DRIVE_TEST_FOLDER_ID`を削除する。Client Secret自体のrotationは不要だが、
専用clientを今後使わない場合はGoogle Cloud Consoleで削除する。空テストfolderも
証跡確認後に削除してよい。

```powershell
[Environment]::SetEnvironmentVariable(
  'PHASE4_HANDOFF_GOOGLE_OAUTH_CLIENT_SECRET', $null, 'User'
)
[Environment]::SetEnvironmentVariable(
  'PHASE4_HANDOFF_GOOGLE_OAUTH_CLIENT_ID', $null, 'User'
)
[Environment]::SetEnvironmentVariable(
  'PHASE4_DRIVE_TEST_FOLDER_ID', $null, 'User'
)
```

## 5. P4-B04: 国外保存の承認

`phase4-data-residency-approval-record.md`には、Codexが公式資料から次を記入済み。

- Singapore `aws-ap-southeast-1`とproject内resourceのregion固定。
- TLS 1.2以上、AES-256、KMS、第三者監査。
- DPAのbreach通知、削除・返却、sub-processor、国際移転条項。
- sub-processor一覧と更新通知、security/privacy問い合わせ先。
- project削除と7日間のrecovery期間。

運営責任者は、Singaporeがprimary regionであり、Neonまたはsub-processorが米国等
から処理する可能性がある点を含めて確認する。承認できる場合だけ、記録票を
Git対象外の`outputs/phase4-approvals/`へcopyし、そのlocal copyへ6つのcheckbox、
氏名、役割、承認日、レビュー担当者、次回レビュー日を記入する。repository側には
氏名を記入せず、役割、日付、local署名copyのSHA-256だけを記録する。

```powershell
New-Item -ItemType Directory -Force `
  '.\outputs\phase4-approvals' | Out-Null
Copy-Item `
  '.\docs\library-registration\phase4-data-residency-approval-record.md' `
  '.\outputs\phase4-approvals\phase4-data-residency-approval-signed.md'
Get-FileHash `
  '.\outputs\phase4-approvals\phase4-data-residency-approval-signed.md' `
  -Algorithm SHA256
```

参考:

- [Neon regions](https://neon.com/docs/introduction/regions)
- [Neon Security](https://neon.com/security)
- [Neon DPA](https://neon.com/pdf/DPA.pdf)
- [Neon sub-processors](https://neon.com/subprocessors)
- [個人情報保護委員会 外国にある第三者への提供編](https://www.ppc.go.jp/personalinfo/legal/guidelines_offshore/)

## 6. Phase 4再判定

次が揃った後、Codexへサニタイズ済み結果だけを知らせる。token、Client Secret、
メール、folder IDは知らせない。

1. `phase4-admin-pair.json`の`status`。
2. `phase4-oauth-handoff-*.json`の`status`。
3. P4-B04 local署名copyのcheckbox完了、役割、承認日、SHA-256。氏名は知らせない。

3件すべてPASSになるまでPhase 4は`BLOCKED`。実PII保存、Google本番認証、
Drive本番権限付与、Gmail送信、Phase 6実装は開始しない。
