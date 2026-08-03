# Cloudflare 登録機能 Preview 公開手順

Status: local implementation complete / external configuration and deployment pending approval

Release target: `registration_preview`

Preview scope: `/library-registration/` の Google 認証・実 API 接続
Excluded scope: 管理画面、Pages Functions、Drive 副作用、公開サイト CTA 切替

表示だけを確認する fail-closed Preview は
[cloudflare-ui-review-deployment-runbook.md](./cloudflare-ui-review-deployment-runbook.md)
を使う。この文書の Preview は、登録画面を Google 認証と実 API へ接続するための別ゲートである。

## 1. 公開境界

`registration_preview` は次の固定構成とする。

- `registration=google`: Google Identity Services と承認済み FastAPI origin を使う。
- `admin=mock`: build 後に管理画面の HTML、route chunk、合成管理データを削除する。
- `_routes.json`、`_worker.js`、`functions/`、Wrangler 設定、dotenv を staging artifact から除外する。
- Wrangler は repository root ではなく、隔離した staging root を `--cwd` にして実行する。
- したがって Preview の `/library-registration/admin/` と
  `/library-registration/admin/api/*` は 404 とし、Pages Functions を一切 upload しない。
- 現行 `/future-strategy-library/` の登録 CTA は Google Form のままとし、Preview へのリンクを公開サイトへ追加しない。

この Preview は Production PASS ではない。管理画面公開、実 PII、Drive 権限変更、公開 CTA 切替は、
それぞれ別の Production Gate と承認を必要とする。

## 2. wrapper の機械的保護

実行コマンドは次の一つだけである。

```powershell
npm.cmd run deploy:cloudflare:library-preview -- `
  -PreviewBranch library-registration-preview-20260804
```

wrapper は次を満たさない場合、upload 前に停止する。

- branch 名が `library-registration-preview` または `library-registration-preview-<lowercase-suffix>` である。
- local branch が `main`、`master`、`production` ではない。
- worktree と reviewed commit が clean で、build の前後で `HEAD` が変わっていない。
- project-local Wrangler が利用できる。
- `CLOUDFLARE_LIBRARY_PREVIEW_CONFIRMATION` が完全一致する。
- Cloudflare project は固定の `compass-official` である。
- production deployment metadata が一意に `main` を示す。
- release target が `registration_preview`、registration が `google`、admin が `mock` である。
- API origin と承認済み API origin が完全一致する。
- Preview frontend origin が branch alias と完全一致する。
- registration OAuth client ID が実 artifact にあり、未承認の OAuth client ID がない。
- 管理画面、Functions、Worker、secret/config ファイルが staging artifact にない。
- Git 管理外の staging artifact を upload 直前に再検証し、途中書換えを拒否する。
- 公開 CTA が既存 Google Form のままである。

generic `npm.cmd run deploy:cloudflare` は引き続き無効であり、この手順から production deploy はできない。
Dashboard の production branch 設定は API response だけでは完全確認できないため、実行直前に人が
**Settings > Branch control > Production branch = main** を確認する。

## 3. Preview origin を先に固定する

既存の固定Preview branch `library-registration-preview-20260804` を使用する場合、Cloudflareが
割り当て済みの認証と CORS に使う安定originは
次の一つだけである。

```text
https://library-registration-preview.compass-official.pages.dev
```

Cloudflare が生成する commit-hash URL は Access で保護するが、Google OAuth と API CORS の
対応 origin にはしない。hash URL は deploy ごとに変わるため、認証 E2E は常に上記 branch alias で行う。
wildcard、path、末尾 slash、localhost、production canonical origin との混同を禁止する。

## 4. Google Auth Platform の手動設定

登録用 Web OAuth Client の **Authorized JavaScript origins** に、上記 branch alias origin を一時追加する。
現在の実装は Google Identity Services の JavaScript callback で ID token を受け取る方式であり、
この Preview 用の redirect URI は追加しない。

次も確認する。

1. frontend に設定する client ID と、FastAPI の `GOOGLE_OAUTH_CLIENT_IDS` に設定する audience が一致する。
2. client secret は static frontend、Cloudflare Pages variables、Git、ログへ入れない。
3. `hd` chooser hint だけを認可根拠にしない。FastAPI が issuer、audience、expiry、
   `email_verified`、hosted domain を server-side で検証する。
4. 個人 Gmail が server-side で拒否されることを human E2E で確認する。

OAuth client ID は public configuration であり、client secret、token、database URL、Drive ID、PII は
public artifact に含めない。

## 5. FastAPI / CORS の手動設定

Preview 用 public API は、上記 branch alias origin だけを `CORS_ALLOWED_ORIGINS` に追加する。
wildcard と commit-hash origin は追加しない。registration Web OAuth client ID は
`GOOGLE_OAUTH_CLIENT_IDS` にも追加する。

初回 hosted gate は次の安全状態を維持する。

```text
API_READ_ONLY_MODE=true
API_WRITES_ACTIVATION_CONFIRMATION=
EXTERNAL_SIDE_EFFECTS_ENABLED=false
PHASE7_DRIVE_API_ENABLED=false
PHASE7_DRIVE_KILL_SWITCH=true
PHASE7_DRIVE_ACTIVATION_CONFIRMATION=
```

この状態では Google 認証・CORS・読み取り境界を確認できるが、登録 write は意図的に拒否される。
実登録 write の hosted E2E は、別途明示承認した短時間の gate としてのみ行う。その場合も
合成データ専用 Neon branch を使い、Drive と外部副作用は OFF のままにし、
`API_READ_ONLY_MODE=false` と
`API_WRITES_ACTIVATION_CONFIRMATION=I_APPROVED_PRODUCTION_API_WRITES_AFTER_RECOVERY_REVIEW_V1`
を同時に設定する。試験後は直ちに read-only へ戻す。実利用者 PII を Preview へ投入しない。

管理 API、admin OAuth、admin edge secret、export、worker、Scheduler はこの Preview に設定しない。

## 6. Cloudflare Access の手動確認

Preview deployment は既定では公開され得るため、upload 前に Dashboard の
**Settings > General > Preview access** で Preview Access を有効にする。

browser をログアウトした状態で次を確認する。

- branch alias が Access challenge または deny になり、HTML を返さない。
- 直近の commit-hash URL も同様に未認証拒否される。
- Access 認証後だけ branch alias の登録画面を表示できる。

`noindex` と非公開リンクはアクセス制御ではない。

## 7. local terminal に設定する public build 値

`.env` を作らず、現在の PowerShell process または承認済み CI variable store だけに設定する。
`LIBRARY_RELEASE_TARGET`、frontend origin、mode、hosted domain
`st.kitasato-u.ac.jp` は wrapper が固定する。

```text
LIBRARY_RELEASE_APPROVED_API_ORIGIN=https://<exact-approved-api-origin>
NEXT_PUBLIC_LIBRARY_API_BASE_URL=https://<same-exact-approved-api-origin>
NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=<registration-web-client-id>.apps.googleusercontent.com
CLOUDFLARE_LIBRARY_PREVIEW_CONFIRMATION=I_APPROVED_LIBRARY_PREVIEW_DEPLOYMENT_V1
```

admin client ID、admin API base、OAuth client secret、database URL、Drive credential は設定しない。

## 8. hosted acceptance

upload 後は branch alias で Desktop と Mobile を確認し、証跡には日時、commit SHA、branch alias、
API revision、合成 DB branch を記録する。

1. Access 未認証時に alias/hash の両方が拒否される。
2. 登録画面が 1 つの H1、Google 認証、入力、規約 disclosure、確認 CTA を正しく表示する。
3. 大学 Workspace account の認証が成功し、個人 Gmail は拒否される。
4. CSP/CORS、console error、横 overflow、keyboard focus を確認する。
5. read-only gate では submit が fail-closed であり、DB/Drive を変更しない。
6. 別承認の write E2E では、合成 1 件について登録、冪等 replay、結果確認を行う。
7. `/library-registration/admin/` と `/library-registration/admin/api/*` が 404 である。
8. production canonical site の Google Form CTA が変わっていない。

## 9. Preview 終了時

1. API を read-only に戻し、Drive/worker kill switch を再確認する。
2. Google OAuth Authorized JavaScript origins から一時 branch alias を削除する。
3. API CORS から一時 branch alias を削除する。
4. Preview deployment を停止または削除する。古い commit-hash URL が残る間は Access を解除しない。
5. alias/hash の双方が認証不能または 404 になった証跡を残す。

Preview の upload、Access 変更、OAuth origin 変更、API/CORS 変更、write activation は外部状態変更であり、
各操作の直前に人の明示承認を必要とする。
