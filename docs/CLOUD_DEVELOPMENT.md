# COMPASS Cloud Development

Status: Development environment

GitHubを正本とし、通常の開発はGitHub CodespacesまたはCodex Cloudから開始する。既存のローカルcheckout、未commit変更、Cloudflare Production、Google Apps Script、Production databaseには依存しない。

## GitHub Codespaces

1. GitHubのrepository pageで **Code** → **Codespaces** → **Create codespace on main** を選ぶ。
2. Container作成後、`npm ci`、Playwright Chromium、Python 3.12、`uv`、FastAPI依存関係が自動で準備される。
3. Command Paletteから **Tasks: Run Task** → **COMPASS: start Next.js** を実行する。
4. 自動転送されたprivate port `3000`をブラウザで開く。
5. 変更は専用branchへcommitし、Draft Pull Requestを作成する。

CodespaceのfilesystemとbranchはGitHub側に保持されるため、別PCでは同じCodespaceを再開する。repositoryごとに別Codespaceを使い、COMPASS Interactiveの環境と共有しない。

## Verification

最小確認:

```bash
npm run typecheck
npm run test:registration
npm run build
npm run verify
```

repository-wide gate:

```bash
npm run check
```

UI、navigation、font、breakpoint、animationを変更した場合は、`docs/responsive-browser-qa.md`に従い追加のbrowser gateを実行する。

## Backend development

Docker-in-DockerとPython 3.12を含む。Library APIはCommand Paletteの **Library: start FastAPI** で起動できる。PostgreSQLを含むcomposite環境は、既存の`compose.library-dev.yaml`とrunbookに従う。

Production database、Google Cloud、Cloudflare、GASへ接続する資格情報はCodespaceへ自動投入しない。Production rehearsal、deploy、migration、form送信、実email送信は別の明示承認とrunbookを必要とする。

## Codex Cloud

Codex環境ではNode.jsを`.node-version`、Pythonを`3.12`へ固定し、setup commandを次のようにする。

```bash
npm ci
npx playwright install --with-deps chromium
python -m pip install uv==0.11.28
cd services/library-api && uv sync --locked --dev
```

通常のCodex taskは非Production・非deployとし、`AGENTS.md`の検証・security boundaryを適用する。秘密値をagent prompt、Git diff、logへ貼り付けない。

## Mobile workflow

- ChatGPT mobileからCodex Cloud taskへ指示し、進捗、diff、test結果を確認する。
- GitHub Mobileまたはmobile browserでDraft PR、checks、review commentを確認する。
- merge、Production deploy、database migration、secret変更はスマートフォンからでも通常の承認gateを省略しない。

## Isolation rules

- 一つのCodespaceで複数repositoryを混在させない。
- `main`へ直接commitしない。
- ローカルPCの`.env*`、credential、Production dataをcopyしない。
- Codespacesの転送portはprivateのまま使用する。
- Cloudflare deploy script、GAS deploy、Terraform applyを通常の開発taskから実行しない。
