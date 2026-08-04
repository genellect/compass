# COMPASSお問い合わせフォーム 設定・運用手順

Status: Operational Runbook
Scope: `/contact/`と`/api/contact`
Last source verification: 2026-08-01 (`origin/main`)
External configuration: Operator verification required
Owner: COMPASS representative / designated operator
Data classification: Public-safe procedure; no secret values or inquiry data

## 1. 構成

- 画面: `/contact/`（Next.js静的ページ）
- 受付API: `/api/contact`（Cloudflare Pages Function）
- 確認コードとメール送信: Contact専用Google Apps Script
- Bot対策: Contact専用Cloudflare Turnstile
- データベース: 使用しない

問い合わせ本文はデータベースやScript Propertiesへ保存しません。GASが一時保存するのは、10分間のメール確認状態、レート制限情報、送信の冪等性情報です。確認コード、確認証明、メールアドレス、IPアドレスは平文保存せず、必要な識別値だけをHMAC化します。

稼働中のCommunity登録フォームとは、Pages Function、GASプロジェクト、共有シークレット、Turnstileウィジェットとactionを分離しています。既存のCommunity用 `google-apps-script/Code.gs` は変更しません。

## 2. Cloudflareで必要なProduction設定

次の4項目をCloudflare Pagesプロジェクト `compass-official` のProductionシークレットへ登録し、release時に存在を確認します。値は暗号化され、再表示できません。

- `CONTACT_TURNSTILE_SECRET_KEY`
- `CONTACT_RATE_LIMIT_SECRET`
- `CONTACT_GOOGLE_APPS_SCRIPT_URL`
- `CONTACT_GOOGLE_APPS_SCRIPT_SECRET`

本番Turnstileウィジェットは次の構成を使用します。Cloudflare dashboard上の現在値はoperatorが確認します。

- 名前: `COMPASS Contact Form`
- モード: Managed
- 許可ホスト名: `compass-official.pages.dev`
- Clearance: `no_clearance`
- 表示: 常時表示（画面実装側で `appearance: always`）

公開サイトキーは画面コードへ設定済みです。秘密鍵をブラウザーへ渡す実装にはしていません。

## 3. GASコードを貼り付ける

1. 大学Googleアカウントで [Google Apps Script](https://script.google.com/home) を開く。
2. 「新しいプロジェクト」を選ぶ。
3. プロジェクト名を `COMPASS Contact Form` など、Community用と区別できる名前にする。
4. エディタの `Code.gs` を全選択して削除する。
5. このリポジトリの `google-apps-script/contact/Code.gs` を先頭から末尾まで貼り付ける。
6. 保存する。

このコードは次の3操作を受け付けます。

- `request_code`: 6桁コードを発行して入力メールアドレスへ送信
- `verify_code`: 入力されたコードを検証
- `submit`: 所有確認済みの問い合わせだけを管理者と問い合わせ者へ送信

管理者宛先はGASのScript Property `CONTACT_ADMIN_RECIPIENT_EMAIL` だけから読み取ります。未設定またはメール形式が不正な場合、GASは `configuration` を返してメール処理を開始しません。
確認コードメールだけはGoogle Workspaceの `noReply` オプションを使用し、管理者の実メールアドレスを送信元として表示しません。問い合わせ受付メールは返信できるよう、従来どおり管理者アドレスを返信先にします。

## 4. GASのスクリプトプロパティを設定する

Apps Script左側の歯車「プロジェクトの設定」を開き、「スクリプト プロパティ」から3項目を追加します。

### 4-1. 共有シークレット

プロパティ名:

```text
CONTACT_FORM_SHARED_SECRET
```

Windows PowerShellで次を実行すると、32バイトのランダム値が表示されずにクリップボードへ入ります。

```powershell
$contactBytes = New-Object byte[] 32
$contactRng = [Security.Cryptography.RandomNumberGenerator]::Create()
$contactRng.GetBytes($contactBytes)
$contactRng.Dispose()
$contactSharedSecret = [Convert]::ToBase64String($contactBytes)
Set-Clipboard -Value $contactSharedSecret
```

値欄へ貼り付けて保存します。この値は後でCloudflareの `CONTACT_GOOGLE_APPS_SCRIPT_SECRET` にも同じものを設定します。チャット、Git、ソースコード、スクリーンショットには載せません。

### 4-2. 確認コード用Pepper

プロパティ名:

```text
CONTACT_OTP_PEPPER
```

先ほどと同じPowerShellをもう一度実行し、新しい別の値を生成して貼り付けます。この値はGASだけが使用し、Cloudflareへは設定しません。

### 4-3. 管理者メール受信先

プロパティ名:

```text
CONTACT_ADMIN_RECIPIENT_EMAIL
```

値欄には運営者が承認した受信先メールアドレスを入力します。値はチャット、Git、ソースコード、スクリーンショットへ載せず、Apps Scriptの設定画面へ直接入力します。

3項目を保存したら、値を画面上で再確認できない場合に備え、プロパティ名を取り違えていないことだけ確認します。

## 5. GASをウェブアプリとしてデプロイする

1. 右上の「デプロイ」→「新しいデプロイ」を選ぶ。
2. 「種類の選択」から「ウェブアプリ」を選ぶ。
3. 説明へ `Contact form v1` などを入力する。
4. 「次のユーザーとして実行」は「自分」にする。
5. 「アクセスできるユーザー」は「全員」にする。`Googleアカウントを持つ全員` ではありません。
6. 「デプロイ」を選ぶ。
7. 権限確認が出たら、コード内容と要求権限を確認し、大学アカウントでメール送信を許可する。
8. 発行された `/exec` で終わるウェブアプリURLを控える。

`/exec` URLへブラウザーでGETアクセスした場合、次のJSONが返れば到達確認として正常です。

```json
{"ok":false,"code":"method_not_allowed"}
```

このJSONは、フォームAPIがPOST専用であることを示します。メール送信成功を示すものではありません。

コードを後日変更した場合は、保存だけでは本番へ反映されません。「デプロイを管理」から既存デプロイを編集し、「新しいバージョン」を選んで再デプロイします。通常は同じ `/exec` URLを維持できます。

## 6. GASデプロイ後にCloudflareへ接続情報を設定する

[Cloudflare dashboard](https://dash.cloudflare.com/) で次の順に開きます。

1. `Workers & Pages`
2. `compass-official`
3. `Settings`
4. `Variables and Secrets`
5. Production環境の「Add」

### 6-1. GAS URL

- 名前: `CONTACT_GOOGLE_APPS_SCRIPT_URL`
- 値: 手順5で発行された `/exec` URL
- 種類: Secret（Encryptを有効）

### 6-2. GAS共有シークレット

- 名前: `CONTACT_GOOGLE_APPS_SCRIPT_SECRET`
- 値: GASの `CONTACT_FORM_SHARED_SECRET` と完全に同じ値
- 種類: Secret（Encryptを有効）

共有シークレットがクリップボードに残っていない場合は、新しい値を生成し直し、GASの `CONTACT_FORM_SHARED_SECRET` とCloudflareの `CONTACT_GOOGLE_APPS_SCRIPT_SECRET` の両方を同じ新しい値で上書きします。片側だけを変更すると、GASはすべての要求を `unauthorized` として拒否します。

CLIを使う場合は、値をコマンド引数に書かず、次のコマンドを1つずつ実行して表示された入力欄へ貼り付けます。

```powershell
npx.cmd wrangler pages secret put CONTACT_GOOGLE_APPS_SCRIPT_URL --project-name compass-official
npx.cmd wrangler pages secret put CONTACT_GOOGLE_APPS_SCRIPT_SECRET --project-name compass-official
```

シークレット設定後、その値を利用するデプロイを新たに実行する必要があります。今回の変更を本番公開するときに、そのデプロイを行います。

## 7. ローカル確認

通常のNext.js開発サーバーでは画面だけを確認できます。

```powershell
npm.cmd run dev -- --hostname 127.0.0.1 --port 3100
```

確認URL:

```text
http://127.0.0.1:3100/contact/
```

ローカルではCloudflare公式テストキーを使います。本番用Turnstileに `localhost` や `127.0.0.1` は許可していません。ローカルNext.jsサーバーだけではPages Functionが動かないため、実際の確認コード送信は行わないでください。

## 8. 検証と公開順序

1. `npm.cmd run test:registration`
2. `npm.cmd run typecheck`
3. `npm.cmd run build`
4. `npm.cmd run verify`
5. Cloudflare previewでUIとAPIレスポンスを確認する。自動テストから実メールは送らない。
6. 明示的に承認した1件だけで、確認コードメール、確認完了表示、管理者メール、問い合わせ受付メールを確認する。
7. 本番 `/contact/` を確認する。
8. 公式siteのheader、本文、footerにあるContact導線が `/contact/` を指すことを確認する。

`/contact/`と公式siteのContact導線は現行sourceへ統合済みです。今後のreleaseでは、実メール疎通と導線のregression確認を分けて記録します。

## 9. 制限と安全設計

- お名前2〜20文字、所属2〜20文字、メール5〜50文字かつ有効形式をすべて満たさない限り、コード発行APIを呼び出せません。
- 同一メールへの再送は60秒待機、15分に3回までです。
- 同一IP由来の発行は1時間に10回までです。生IPはGASへ送らず、Cloudflare側のHMACだけを利用します。
- Contact全体では24時間に100回までです。
- コードは6桁、有効期限10分、誤入力5回で失効します。
- コード入力後に「メールアドレスを確認」を実行し、GASで検証できた場合だけ、一回限りの確認証明をブラウザーへ返します。
- 最終送信は6桁コードではなく確認証明を使用します。確認証明もGASにはHMACだけを保存します。
- 新しいコードを発行すると、同じメールの以前のコードは失効します。
- お名前、所属、メールアドレスを変更すると確認状態を破棄します。
- 最終送信はrequestIdごとに冪等化し、片方のメールだけ送信できた場合も、再試行で未送信分だけを送ります。
- TurnstileはCloudflareのSiteverify APIでサーバー検証し、hostnameとaction `contact_verification` も照合します。
- メール本文、確認コード、秘密鍵、入力メールアドレス、生IPをログへ出力しません。
