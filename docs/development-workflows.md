# 開発・検証コマンド

Status: Operational Runbook
Scope: 許可された開発者向けのローカル・非本番検証
Last source verification: 2026-09-10

[開発環境の選択](CLOUD_DEVELOPMENT.md) → [Agent規則](../AGENTS.md) → 対象の手順、の順に読みます。
以下のパスはリポジトリルートからの相対パスです。通常の開発に本番secretは不要です。
DB migrationは専用ローカルDBに対してだけ実行し、既存の外部DB接続を引き継がないでください。
Googleの実環境E2Eは副作用を伴うため、許可された検証アカウント・リソースに限ります。

## ローカル開発

### 必要環境

| Runtime | Version / Tooling |
|---|---|
| Node.js | `.node-version` — `24.22.1`（LTS） |
| Python | `services/library-api/.python-version` — `3.12` |
| Python package manager | `uv` |
| Container runtime | Docker Desktop / Docker Compose |
| Local database | PostgreSQL 17 container |

Windowsでは、Node.jsコマンドを`npm.cmd`で実行します。

クラウド環境はrepositoryごとに分離し、既存PCの未commit変更やProduction資格情報を引き継ぎません。ローカル環境は障害対応や特殊なデバイス検証の補助経路です。

### Webフロントエンド

```powershell
npm.cmd ci
npm.cmd run dev
```

通常のNext.js開発サーバーは、静的routeとユーザーインターフェースの確認に使用します。Cloudflare Pages Functionsを含む構成は、静的出力を生成した後にPages local runtimeで確認します。

```powershell
npm.cmd run build
npm.cmd run dev:pages
```

### FastAPI

```powershell
Set-Location services/library-api
uv sync --locked --dev
uv run python -m alembic upgrade head
uv run python -m uvicorn app.main:app --reload
```

ローカルのcomposite APIは`app.main:app`、分離されたruntime entrypointは`app.public_main:app`、`app.admin_main:app`、`app.worker_main:app`です。

### PostgreSQL / Docker

登録基盤専用wrapperは、Compose project、network、volume、ownership label、localhost portを固定し、他のCOMPASS環境から分離します。同じactionをbashとPowerShellの両方から実行できます。

Linux / Dev Container / Codespaces:

```bash
./scripts/library-docker-dev.sh Validate
./scripts/library-docker-dev.sh Up
./scripts/library-docker-dev.sh Test
./scripts/library-docker-dev.sh Down
```

Windows PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-docker-dev.ps1 -Action Validate

powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-docker-dev.ps1 -Action Up

powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-docker-dev.ps1 -Action Test

powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-docker-dev.ps1 -Action Down
```

ローカルAPIは`http://127.0.0.1:58000`、PostgreSQLは`127.0.0.1:55432`を使用します。

---

## 検証

通常の変更では[Agentの検証とPreview完了契約](agent-delivery-policy.md)に従い、変更したリスクに対応する最小の検証を選びます。以下の総合コマンドを毎回全部実行する運用ではありません。局所UIは対象Desktop/Mobileと操作、文書のみは`npm run verify:docs`と差分確認を基本とし、同じ成果物・合格済み検証を再利用します。

### Repository総合検証

```bash
npm run check
```

`check`は、公開ソース境界、Community／Contact、Library登録／管理、Habitat・Explorer、release gate、TypeScript、Production build、static export、全公開routeのPlaywright responsive smokeを順に検証します。cloud環境では同一gateの別名`npm run cloud:check`を使用します。Windows PowerShellから直接実行する場合のみ`npm.cmd run check`と読み替えます。

### Unit testとLinux CI

```bash
npm run test:unit
```

Vitestは`vitest.config.ts`のpatternで`tests/`と`src/`の`*.test.ts(x)`を自動検出します。新しいunit testをnpm scriptへ個別登録する必要はありません。既知のcontent driftで一時的に除外したfileは、同configに理由を記載します。`test:registration`等の個別scriptは対象を絞った反復用として残します。

GitHub Actions **CI**（`.github/workflows/ci.yml`）は、PRごとにLinuxでrepository契約（`npm run check:repository`）、公開ソース境界、型検査、`npm test`、lintと変更ファイルのformat check、static export build、`npm run verify`を実行します。`src/`・`public/`・`functions/`以外のMarkdownだけを変更したPRでは、build系jobをskipします。集約job **CI result**が必須checkです。このworkflowはdeployせず、secretも使用しません。

**Library Security Quality Gate**（`.github/workflows/library-security-quality.yml`）は、全PRでsecret scanと依存差分レビューを行い、未来戦略ライブラリ・Library登録・フォーム・Pages Functions・GAS・Library APIのpathを変更した場合だけrehearsalとAPI testを追加します。集約job **Library security result**が必須checkです。**Repository Maintenance**は週次の依存advisory監査で、PRでは実行しません。

### Lint・Format・変更に関係するtest

局所変更の反復では、次の4つで変更範囲を確認します。`*:changed`は`base`を省略すると`origin/main`とのmerge-base以降の変更（commit済み・staged・unstaged・untracked）を対象にします。stackしたPRでは`npm run format:check:changed -- origin/<base branch>`のようにbaseを渡します。

```bash
npm run lint                  # ESLint（eslint.config.mjs）。errorで失敗し、段階導入中のruleはwarn
npm run format:check:changed  # 変更ファイルだけPrettier check
npm run format:changed        # 変更ファイルだけPrettierで整形
npm run test:changed          # 変更に関係するVitest unit testだけ実行
```

- ESLintは`eslint`を直接呼びます（`next lint`は使いません）。`eslint-config-next`（core-web-vitals・typescript）、ESLint recommended、`jsx-a11y` recommended、`react-hooks`で、実バグ・hook契約・a11y違反を検出します。
- 既存コードに違反が残るruleは、`eslint.config.mjs`の`stagedWarnings`に導入時の件数付きでwarnとして列挙しています。あるruleの違反を0件にしたPRで、そのruleを`stagedWarnings`から外してerrorへ戻します。
- Prettierは`.prettierrc.json`（2 space、LF。`.editorconfig`と同じ）を使います。repositoryは一括整形していないため、新規fileと、merge-base時点で整形済みだったfileが未整形の場合だけerrorにします。
- merge-base時点で未整形だった既存file（legacy）はwarningだけで強制せず、`format:changed`も書き換えません。file全体を整形してよい場合だけ`npm run format:changed -- --include-legacy`を使います。Markdown・YAMLは今回の対象外です（`.prettierignore`）。
- `test:changed`は`vitest run --changed <merge-base>`を実行し、Vitestがmodule graphから関係するtestを選びます（例: `src/library-registration/admin/adminMock.ts`だけの変更では`adminMock.test.ts`だけを実行）。`package.json`・lockfile・`vitest.config.ts`の変更では全体を再実行しないため、依存や設定を変えた場合は`npm run test:unit`を使います。node:testのrelease gate（`npm run test:library-release-gate`）とPlaywrightも対象外なので、該当範囲を変えた場合は個別に実行します。
- Library APIはRuffでlintします（`services/library-api/pyproject.toml`の`[tool.ruff]`）。

```bash
cd services/library-api
uv sync --locked --dev
uv run ruff check
```

VS Codeで推奨拡張（ESLint、Prettier、Ruff）を入れると、保存時に**変更行だけ**を整形します（`editor.formatOnSaveMode: "modifications"`）。Markdown・Pythonは保存時に整形しません。

CIの**Lint and changed-file format** job（`ci.yml`、**CI result**に集約）は、`npm run lint`、PRで変更されたfileの`format:check:changed`、`services/library-api/`を変更したPRだけ`ruff check`を実行します。他のbuild系jobと同じく、Markdownだけを変更したPRではskipします。

#### 一括整形の手順（未実施）

一括整形は他branchとの大量の衝突を招くため、実施時期を決めてから1回で行います。

1. 進行中のbranch・PRの担当者と実施時刻を合意し、直前に可能な限りmergeします。
2. 最新`origin/main`から専用branchを作り、`npx prettier --write .`だけを実行して、挙動変更を含まない1 commitにします。Pythonを整形する場合は別commitで`uv run ruff format`を使います。`npm run check`で差分が整形だけであることを確認します。
3. merge後、そのcommitの完全なSHAを`.git-blame-ignore-revs`へ追記します。GitHubのblameは自動で読み込みます。localでは`git config blame.ignoreRevsFile .git-blame-ignore-revs`を一度設定します。
4. `scripts/format-changed.mjs`のlegacy扱いを外し、変更fileが未整形なら常にerrorにする運用へ切り替えます。

### PRの自動化

以下はreviewを助ける補助で、必須checkではありません。deploy、secret、repository設定の変更は行いません。

**Preview対象routeコメント**（`.github/workflows/preview-links.yml`）は、PRごとに1件のcommentを作成し、以後は同じcommentを更新します。deployの詳細はCloudflare自身のcommentとcheck runが示すため、このcommentは対象routeのlink一覧に絞ります。URLは「Cloudflare Pages」check runの出力から転記し、branch名から組み立てません。

- 冒頭の1行が対象commitと基底URLです。route linkは対象commit固定のPreview URLを基底にします。Branch Preview（branchの最新commitを指すalias）はcheck run出力にある場合だけ併記します。
- 「変更pathに対応するroute」は、変更fileを`docs/WEBSITE_BOUNDARIES.md`のroute・source対応（実装は`.github/scripts/preview-links.mjs`）で照合した結果です。build設定、`_redirects`、`functions/_middleware.ts`、`src/styles/`は全routeに、`(official)`のlayoutはFounder JPにも影響すると扱います。独立surfaceには「独立surface」と表示します。
- 全9 routeのlinkは折りたたみ内にあります。deploy待ち・失敗時はURLを出さず、状態だけを表示します。
- `check_run`起点の更新はdefault branch上のworkflow定義だけで動きます。mainへ入る前のPRやstacked PRでは、`pull_request`起点のjobがcheck run完了を最大18分待って更新します。fork・Dependabotのpull_request runはread-only tokenのためskipします。

**自動ラベル**（`.github/labeler.yml`、`.github/workflows/labeler.yml`）は、変更pathから次の`area:*`ラベルを付け、該当しなくなったラベルを外します。

| ラベル | 意味 |
| --- | --- |
| `area:official` | 親サイト`/`、Messages、共通header・footer・style |
| `area:library` | 未来戦略ライブラリ、Library登録、Library API、infra、contracts |
| `area:forms` | Community参加、Contact、`functions/api/`、フォーム用GAS |
| `area:interactive` | Interactive紹介・開発者紹介（独立surface） |
| `area:founder` | yuto-matsui.com JP/EN（独立surface） |
| `area:ci` | `.github/`配下 |
| `area:docs` | `docs/`、build入力ではないMarkdown |
| `area:deps` | npm・uv lockfile、Dockerfile、Terraform lock |
| `area:env` | Dev Container、`.codex/`、`.claude/`、toolchain pin |

`area:interactive`または`area:founder`が付いたPRは、Independent Website Boundariesの対象を変更しています。依頼がそのsurfaceを明示しているか確認します。labelerは公式推奨の`pull_request_target`・checkoutなし構成のため、base branchにworkflowがあるPRで動きます。

**CODEOWNERS**（`.github/CODEOWNERS`）は、Functions、GAS、Library API、infra、contracts、Library・フォームのroute、`.github/`、`AGENTS.md`、`CLAUDE.md`、`scripts/*library*`のownerを指定し、PRでreview依頼を自動化します。現状は単独開発のため、Rulesetsでcode owner reviewを必須にするかは別判断であり、このfileはrepository設定を変更しません。

### API検証

```bash
cd services/library-api
uv run python -m pytest
```

APIテストでは、認証token検証、利用資格判定、データアクセス、RBAC、rate limit、冪等性、Outbox、Drive operation、管理者操作、旧名簿移行、CSV/XLSX出力、障害時挙動を検証します。

### マイグレーション検証

```bash
cd services/library-api
uv run python -m alembic upgrade head
uv run python -m alembic downgrade -1
uv run python -m alembic upgrade head
uv run python -m alembic check
```

### PostgreSQL統合検証

```bash
./scripts/library-docker-dev.sh Phase9Phase10Test
```

このgateは、PostgreSQL migration、database role、旧名簿移行、監査制約、API競合、CSV/XLSX生成を専用container上で検証します。Windowsからは`scripts/library-docker-dev.ps1 -Action Phase9Phase10Test`が同じactionを提供します。

### Infrastructure as Code

```bash
./scripts/library-docker-dev.sh TerraformValidate
```

Terraformのformat、backendを使用しないinitialization、validation、activation contract testを実行します。

### レスポンシブ監査

広範囲のresponsive変更または明示された完全監査では、cloud（Codespaces / Codex Cloud / Claude Code / Dev Container）で次を実行します。局所変更は対象spec・操作・viewportに絞ります。

```bash
npm run check:responsive:cloud
```

visual regression baselineはWindowsで生成された`*-win32.png`のため、Windows専用の完全監査は次になります。

```powershell
npm.cmd run check:responsive:full
```

完全監査では、正式なviewport matrix、Windows表示倍率、browser chromeを考慮した実効表示領域、意味を損なわない改行、Mobile menu、CTA hit test、clipping、visual regression、failure artifactを検証します。ブラウザー検査はCIでは実行しません。表示の受入はCloudflare Previewの実表示で行います。

詳細は[`docs/responsive-browser-qa.md`](responsive-browser-qa.md)を参照してください。

### Google実環境E2E

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\start-phase6a-local-e2e.ps1

powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\start-phase7-drive-e2e.ps1
```

Google OAuthとGoogle DriveのE2Eでは、次の経路を確認します。

1. Googleアカウントで認証
2. IDトークンをFastAPIで検証
3. 登録申請をPostgreSQLへ保存
4. Outbox operationを作成
5. WorkerがGoogle Drive APIを実行
6. Drive権限状態をデータベースへ反映
7. Clientが処理結果を取得
8. 権限を取消し、OAuth grantとテスト資産をclean up

実環境E2Eでは、本番利用者の資料や資格情報を使用せず、検証専用のGoogleアカウントとDrive resourceを使用します。

---
