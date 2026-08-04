# Cloudflare 保護付き UI レビュー公開手順

Status: ローカル実装済み・外部公開は承認待ち

Classification: **UI REVIEW ONLY / Production Gate 非該当**

対象: `/library-registration/` の表示確認のみ

## この公開でできること

- PC・モバイルで登録画面の配色、余白、文字切れ、規約開閉、入力欄を確認する。
- Cloudflare Access で認証した関係者だけが Preview URL を閲覧する。
- 現行公開サイトの Google Form CTA が変更されていないことを確認する。

## この公開ではできないこと

- Google OAuth、大学アカウント確認、登録送信、PostgreSQL保存、Drive権限付与。
- 管理画面、管理API、Pages Functions、名簿、合成名簿の閲覧。
- Production Preview、Production Gate PASS、正式な登録導線切替。

登録画面は HTTPS 上で fail-closed になり、認証・送信CTAは利用できません。
管理画面のHTMLと固有chunk、Pages Functionsのroute map、Worker bundle、管理画面用の
合成データを staging artifact から除去してからアップロードします。

## 公開前の必須確認

1. Cloudflare Dashboard の **Settings > General > Preview access** が
   `Restricted` であること。初期状態のPreviewは公開されるため、未設定ではアップロードしない。
2. **Settings > Branch control > Production branch** が厳密に `main` であること。
3. ローカルbranchが `main`、`master`、`production` ではなく、worktreeがcleanであること。
4. 公開branch名を
   `library-registration-ui-review-<lowercase-suffix>` にすること。
5. 外部公開直前に、担当者が次の確認値を現在のPowerShell processだけへ設定すること。

```powershell
$env:CLOUDFLARE_LIBRARY_UI_REVIEW_CONFIRMATION = `
  'I_APPROVED_LIBRARY_UI_REVIEW_DEPLOYMENT_V1'
```

この確認値は秘密情報ではありません。OAuth Client ID、OAuth secret、token、
DATABASE_URL、Drive ID、個人情報は設定しません。

## 承認後の実行

```powershell
npm.cmd run deploy:cloudflare:library-ui-review -- `
  -PreviewBranch library-registration-ui-review-20260803
```

専用wrapperは次を自動実行します。

1. Cloudflare projectを`compass-official`へ固定し、production branch=`main`を確認。
2. 全frontend test、typecheck、fail-closed build、通常verify、mock artifact verify。
3. `outputs/library-ui-review/<commit>/site`へ隔離コピー。
4. 管理画面、Pages Functions関連ファイル、管理用合成データchunkを削除。
5. staging artifactを再走査し、秘密情報・OAuth Client ID・管理用markerが0件であることを確認。
6. production branchとclean commitを再確認。
7. staging directoryをWranglerの`--cwd`にして、branch-scoped Previewだけを公開。

## 公開後の受入確認

- 未認証状態ではbranch alias URLとhash URLの双方が表示されない。
- Access認証後は`/library-registration/`が200、管理画面URLは404。
- 大学アカウント認証と登録送信は利用不可のまま。
- Desktop 1440x900、Tablet 1024x768、Mobile 390x844で文字切れ・横overflowがない。
- Console error、CSP error、予期しないnetwork requestがない。
- 現行Production URLとProduction deployment SHAが変化していない。
- 公開サイトの既存Google Form CTAが変化していない。

UIレビュー終了後はCloudflare Preview deploymentを削除し、Access設定の扱いを
運用記録へ残します。
