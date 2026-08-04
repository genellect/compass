# Community登録フォーム運用設定

Status: Operational Runbook
Scope: `/community/join/`と`/api/community-registration`
Last source verification: 2026-08-01 (`origin/main`)
External configuration: Operator verification required
Owner: COMPASS representative / designated operator
Data classification: Public-safe procedure; no secret values or applicant data

`/community/join/` はNext.jsの静的ページ、`/api/community-registration` はCloudflare Pages Functionです。登録データはデータベースやファイルへ保存せず、Turnstile検証後にGoogle Apps Script（GAS）へ転送し、大学Googleアカウントから2通のメールを送ります。

## Google Apps Scriptの設定

1. 大学Googleアカウントで作成したスタンドアロンApps Scriptプロジェクトへ `google-apps-script/Code.gs` の内容を貼り付け、保存する。
2. Apps Scriptの「プロジェクトの設定」→「スクリプト プロパティ」に次を追加する。
   - プロパティ: `FORM_SHARED_SECRET`
   - 値: パスワード生成機能などで作った32文字以上のランダム文字列
   - プロパティ: `COMMUNITY_ADMIN_RECIPIENT_EMAIL`
   - 値: 運営者が承認した受信先メールアドレス。チャット、Git、ソースコード、スクリーンショットには載せず、この画面へ直接入力する
3. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」を選び、次の内容で公開する。
   - 次のユーザーとして実行: `自分`
   - アクセスできるユーザー: `全員`
4. 初回の権限確認で、スクリプトからのメール送信を許可する。
5. 発行された末尾 `/exec` のウェブアプリURLをコピーする。`/dev` URLは本番に使用しない。

大学Google Workspaceの管理設定により「全員」を選べない場合、この方式ではCloudflareからGASを呼び出せません。その時点で公開を止め、管理者へApps Scriptウェブアプリの外部実行可否を確認します。

## Cloudflare Pagesの設定

1. Cloudflare Turnstileの許可ホストが `compass-official.pages.dev` であることを確認する。
2. 本番Turnstileサイトキーはクライアント側の既定値を使用する。別ウィジェットを使う場合のみ、Pagesのビルド環境変数 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` で上書きする。
3. Pagesプロジェクト `compass-official` のProduction用暗号化済みSecretsに次を設定し、release時に存在を確認する。
   - `TURNSTILE_SECRET_KEY`: Turnstileの秘密鍵
   - `GOOGLE_APPS_SCRIPT_URL`: GASが発行した末尾 `/exec` のURL
   - `GOOGLE_APPS_SCRIPT_SECRET`: GASの `FORM_SHARED_SECRET` と同一の値

運営者の受信先はGASのScript Property `COMMUNITY_ADMIN_RECIPIENT_EMAIL` だけから読み取ります。ブラウザーから変更できません。未設定またはメール形式が不正な場合、GASは `configuration` を返し、運営者・申請者のどちらにもメールを送りません。

## GASコード更新時の再デプロイ

Apps Scriptは保存しただけでは本番デプロイへ反映されません。

1. 「デプロイ」→「デプロイを管理」を開く。
2. 対象デプロイの鉛筆アイコンを押す。
3. 「バージョン」で「新バージョン」を選ぶ。
4. 「デプロイ」を押す。

既存デプロイを更新すれば `/exec` URLは変わりません。新しいデプロイを別に作った場合は、Cloudflareの `GOOGLE_APPS_SCRIPT_URL` も新しいURLへ更新します。

## ローカル確認

公開用の秘密値はリポジトリへ保存しません。`.env.example` と `.dev.vars.example` をそれぞれローカル専用ファイルへコピーして値を設定します。

```powershell
npm.cmd run test:registration
npm.cmd run typecheck
npm.cmd run build
npm.cmd run verify
npm.cmd run dev:pages
```

## 公開前ゲート

- Turnstileの許可ホストと本番の `action=community_registration` を確認する。
- GASのウェブアプリが「自分として実行」「全員がアクセス可能」で、URLが `/exec` で終わることを確認する。
- GASの `FORM_SHARED_SECRET` とCloudflareの `GOOGLE_APPS_SCRIPT_SECRET` が一致することを確認する。
- GASの `COMMUNITY_ADMIN_RECIPIENT_EMAIL` が承認済み受信先に設定され、値がGit差分や操作記録へ含まれていないことを確認する。
- 運営者メールと申請者メールの2通が、本文・返信先を含めて届くことをテスト申請で確認する。
- Cloudflare Pages上の `/community/join/` と `/api/community-registration` を実機確認する。
- 秘密値、登録内容、メール本文がログやGit差分に含まれていないことを確認する。

GASは受付IDと各メールの送信完了状態だけをスクリプト プロパティに最大50件保持します。氏名、メールアドレス、学籍番号、回答本文は保存しません。途中失敗後の再試行では、先に送信済みのメールを可能な限り重複送信しません。
