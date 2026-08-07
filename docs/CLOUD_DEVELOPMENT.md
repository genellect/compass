# COMPASS Cloud Development

Status: canonical development workflow

GitHubを正本とし、日常開発はクラウドを優先する。既存PCのcheckout、未commit変更、`.env*`、Production資格情報、Cloudflare、Google Apps Script、Production databaseへ依存しない。

## 推奨する実行経路

| 優先度 | 経路 | 主な用途 | 環境の正本 |
|---|---|---|---|
| 1 | GitHub Codespaces | ブラウザ中心の実装、実行、テスト、commit、PR | `.devcontainer/devcontainer.json` |
| 1 | Codex Cloud | Codexによる非同期実装、review、Draft PR | Codex環境設定 + `AGENTS.md` |
| 2 | VS Code + Docker Desktop | ローカルDocker上で同一環境を再現 | `.devcontainer/devcontainer.json` |
| 2 | Dev Container CLI | GUIなしのDocker起動、CI相当検証 | `.devcontainer/devcontainer.json` |
| 3 | DevPod等の互換サービス | 別クラウド／SSH host上のDev Container | `.devcontainer/devcontainer.json` |

Dev Container Specificationを唯一の環境正本とする。別のDockerfileや手作業のmachine setupを標準経路にしない。Dev Container CLIはfeatures、VS Code設定、`postCreateCommand`まで適用するため、素の`docker build` / `docker run`よりCodespacesとの再現性が高い。

## 5分で開始する

### GitHub Codespaces

1. GitHub repositoryで **Code** → **Codespaces** → **Create codespace on main** を選ぶ。
2. Container作成後、専用branchを作る。`main`へ直接commitしない。
3. **Tasks: Run Task** → **COMPASS: start Next.js** を実行する。
4. private port `3000`のpreviewを開く。
5. 変更後に **COMPASS: run repository check** を実行する。
6. commit、pushし、Draft Pull Requestを作成する。

同じCodespaceは別PCのブラウザまたはVS Codeから再開でき、filesystemとbranch状態が保持される。COMPASS Interactiveには別Codespaceを使用する。

### VS Code + Docker Desktop

1. Docker Desktopを起動する。
2. VS Codeへ **Dev Containers** extensionを導入する。
3. repositoryを開き、**Dev Containers: Reopen in Container** を選ぶ。
4. Codespacesと同じVS Code task、port、検証コマンドを使用する。

Windows hostにNode.jsを入れたくない場合は、VS Codeが提供するDev Container CLIまたは下記の固定CLI経路を使う。

### Docker / Dev Container CLI

Dev Container CLI `0.88.0`を固定して使用する。必要なのはDocker EngineまたはDocker Desktopと、CLI起動用のNode.jsだけである。

PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/devcontainer.ps1 -Action config
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/devcontainer.ps1 -Action up
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/devcontainer.ps1 -Action shell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/devcontainer.ps1 -Action check
```

Bash:

```bash
./scripts/devcontainer.sh config
./scripts/devcontainer.sh up
./scripts/devcontainer.sh shell
./scripts/devcontainer.sh check
```

| Action | 内容 |
|---|---|
| `config` | Docker daemonへ接続し、containerを作成せずDev Container定義を解決・検査する |
| `up` | lock済みfeaturesでcontainerを作成し、setupを完了する |
| `shell` | 起動済みcontainerへ入る |
| `check` | container内で`npm run cloud:check`を実行する |

`.devcontainer/devcontainer-lock.json`はfeature digestを固定する。feature更新は意図したPRでのみ行い、`devcontainer upgrade`後にcontainerを再構築して検証する。

## 共通コマンド

```bash
npm run dev:cloud
npm run cloud:check
```

個別の最小確認:

```bash
npm run typecheck
npm run test:registration
npm run build
npm run verify
```

UI、navigation、font、breakpoint、animationを変更した場合は`docs/responsive-browser-qa.md`に従う。FastAPIはVS Code task **Library: start FastAPI**、composite PostgreSQL環境は既存`compose.library-dev.yaml`とrunbookを使用する。

## Codexを主要開発環境にする

### Codex Desktop

新規Codex chatの実行先で **Cloud** を選ぶ。Codex Desktopの現行仕様では実行先は`Local / Worktree / Cloud`からchat開始時に選択するため、repository側からアカウント全体の既定値を強制しない。

repositoryでは次を共有する。

- `AGENTS.md`: scope、security、検証、Git運用の正本
- `.codex/config.toml`: project単位の複数agent設定
- `.codex/agents/`: read-onlyの探索、品質review、security review
- `.vscode/settings.json`: VS Code起動時にCodexを開き、実行中follow-upをsteerする

Codex Cloud environmentのsetup script:

```bash
bash .devcontainer/post-create.sh
```

推奨maintenance script:

```bash
git fetch --prune
npm ci
```

Codex CloudはDev Containerそのものを起動する経路ではないため、Node.jsは`.node-version`、Pythonは`3.12`へ固定する。DockerやProduction接続を必要としない通常の実装・review・非live testに使用する。

## 複数エージェント運用

| Agent / IDE | 読む指示 | 標準コマンド |
|---|---|---|
| Codex | `AGENTS.md`, `.codex/config.toml` | `npm run dev:cloud`, `npm run cloud:check` |
| Claude Code | `CLAUDE.md` → `AGENTS.md` | 同上 |
| GitHub Copilot | `.github/copilot-instructions.md` → `AGENTS.md` | 同上 |
| VS Code agent | workspace recommendations + `AGENTS.md` | VS Code tasks |

複数のwrite-capable agentを同じbranchまたはworktreeで同時実行しない。並列実装はagentごとにbranch/worktreeを分離し、main agentがdiff、test、commitを統合する。並列reviewは`.codex/agents/`のread-only agentを使用できる。

各agentの個人認証はGitへ保存しない。Codex、Claude Code、GitHub Copilotのsubscription loginは各サービスの安全な認証UIで行う。

## スマートフォンから監督する

### Codex Cloud task

ChatGPT mobileからCodex taskを開き、指示、follow-up、進捗、diff、test結果を確認する。GitHub Mobileまたはmobile browserでDraft PR、checks、review commentを確認する。

### Codex Remote

PCまたはSSH host上の作業を監督する場合は、ChatGPT Desktopで **Settings → Connections → Control this Mac or PC** を設定し、ChatGPT mobileの **Remote** からQR pairingする。Remoteでは指示、承認、diff、test、terminal、screenshotを確認できる。

QR、MFA、SSO、passkeyは本人だけが扱う。pairing情報、認証code、credentialをpromptやrepositoryへ貼らない。Remote hostをpublic internetへ直接公開せず、公式Remote relayまたはSSH/VPNを使用する。

## Security boundary

- `.env*`、secret、credential、token、OTP、個人情報、保護資料、Production dataをcommitまたはcloudへcopyしない。
- Codespacesの転送portはprivateを既定とする。
- 通常taskからProduction form、実email、Cloudflare deploy、GAS deploy、Terraform apply、database migration、secret変更を行わない。
- COMPASSとCOMPASS Interactiveのcontainer、branch、secret、port、volumeを共有しない。
- 外部AIの出力は人間reviewと該当testが完了するまで公開事実として扱わない。

## 完了基準

cloud taskは次を満たしてからhandoffする。

1. 最新`origin/main`から専用branchを使用している。
2. 変更範囲が明確で、runtime/deployへの不要な影響がない。
3. `npm run cloud:check`または変更範囲に対応するgateが完了している。
4. secret scanと`git diff`を確認している。
5. commitとpushが完了し、Draft PRでreview可能である。
6. Local、CI、Hosted、Human、Productionの確認結果を混同していない。

## Troubleshooting

- Dev Container変更後: **Rebuild Container**を実行する。
- feature lock mismatch: 意図した更新であることを確認後、固定CLIの`upgrade`でlockfileを更新する。
- Dockerが起動しない: Docker Desktop/Engineの状態を確認し、Codespacesへ切り替えて作業を継続する。
- Codespaceが重い: 不要なprocessを止める。repositoryやProduction dataを同じCodespaceへ追加して解決しない。
- Codex Cloud cacheが古い: environment設定でcacheをresetする。
- GitHub Actionsが外部障害中: local/Codespaces gateを保持し、公式status回復後に失敗jobだけを再実行する。
