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
| Node.js | `.node-version` — `22.16.0` |
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

### Repository総合検証

```bash
npm run check
```

`check`は、公開ソース境界、Community／Contact、Library登録／管理、release gate、TypeScript、Production build、static export、全公開routeのPlaywright responsive smokeを順に検証します。cloud環境では同一gateの別名`npm run cloud:check`を使用します。Windows PowerShellから直接実行する場合のみ`npm.cmd run check`と読み替えます。

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

cloud（Codespaces / Codex Cloud / Claude Code / Dev Container）では次を実行します。

```bash
npm run check:responsive:cloud
```

visual regression baselineはWindowsで生成された`*-win32.png`のため、Windows専用の完全監査は次になります。

```powershell
npm.cmd run check:responsive:full
```

完全監査では、正式なviewport matrix、Windows表示倍率、browser chromeを考慮した実効表示領域、意味を損なわない改行、Mobile menu、CTA hit test、clipping、visual regression、failure artifactを検証します。cloudからはGitHub Actions **Responsive Quality Gate** の結果をvisual regressionの判定に使用します。

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
