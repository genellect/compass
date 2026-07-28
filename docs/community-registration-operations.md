# Community登録フォーム運用設定

`/community/join/` はNext.jsの静的ページ、`/api/community-registration` はCloudflare Pages Functionです。登録データはデータベースやファイルへ保存せず、Turnstile検証後にResend経由で2通のメールを送ります。

## Cloudflare / Resendで必要な設定

1. Cloudflare Turnstileでウィジェットを作成し、許可ホストに本番Pagesドメインを登録する。
2. 本番サイトキーはクライアント側の既定値として設定済み。別ウィジェットを使う場合のみ、Pagesのビルド環境変数 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` で上書きする。
3. Resendで送信元ドメインを検証し、送信元を決める（例: `COMPASS <community@登録済みドメイン>`）。
4. Pagesの暗号化済みSecretsに次を設定する。
   - `TURNSTILE_SECRET_KEY`
   - `RESEND_API_KEY`
   - `REGISTRATION_FROM_EMAIL`

運営者の受信先は要件に従い `matsui.yuto@st.kitasato-u.ac.jp` にサーバー側で固定しています。ブラウザーから変更できません。

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
- Resendの送信元ドメイン検証が完了していることを確認する。
- 運営者メールと申請者メールの2通が、本文・返信先を含めて届くことをテスト申請で確認する。
- Cloudflare Pages上の `/community/join/` と `/api/community-registration` を実機確認する。
- 秘密値、登録内容、メール本文がログやGit差分に含まれていないことを確認する。

再送時は同一受付IDをResendのIdempotency-Keyに使用するため、途中失敗後の再試行でも先に受理されたメールを重複送信しません。
