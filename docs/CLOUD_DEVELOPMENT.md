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

## 自動プロビジョニング契約

新PCや新メンバーは、選んだ経路のhost前提だけを用意する。言語runtimeやglobal packageを手作業で揃えない。

| 層 | 人が用意するもの | repositoryが自動で揃えるもの |
|---|---|---|
| Codespaces | GitHub access、repository access、Codespaces利用権 | Linux、Node 22.16.0、Python 3.12、独立Docker daemon、Compose、GitHub CLI、Copilot CLI、VS Code extensions、npm、Playwright、uv、Library API環境 |
| VS Code + Docker | Git、Docker Desktop/Engine、VS Code、Dev Containers extension | Codespacesと同じDev Container内容 |
| Dev Container CLI | Git、Docker Desktop/Engine、Node.js（固定CLI起動用） | Codespacesと同じDev Container内容 |
| Codex Cloud | GitHub接続とCodex environment | Node/npm/Python/uv依存、Playwright、repository instructions。Docker作業はCodespacesへhandoff |

環境定義は`.devcontainer/devcontainer.json`、Feature digestは`.devcontainer/devcontainer-lock.json`、JavaScript/Python依存は各lockfile、Codex setupは`.codex/setup.sh`が正本である。`.gitattributes`はWindows checkoutでもshell scriptをLFに固定する。

`postCreateCommand`は依存導入後に環境doctorを実行する。doctorはNode、Python、GitHub CLI、Copilot CLI、Docker daemon、Compose、Playwright、uv、Library API virtual environmentをfail-closedで検査する。初回作成後、Dev Container変更後、別PCでの初回利用時は次を受入証跡にする。

```bash
npm run dev:doctor
npm run cloud:check
```

不足を個人PCへのglobal installで回避しない。必要packageはDev Container Featureまたはrepository lockfileへ追加し、再buildとdoctorを通す。これにより次の参加者にも自動適用される。

### 新PC／新メンバーの受入チェック

1. repository accessを確認し、最新`main`からCodespaceまたは専用branchを作る。
2. container作成が自動完了し、doctorが`READY`を返すことを確認する。
3. `npm run dev:cloud`でprivate port `3000`を開く。
4. 小さな非本番変更で`npm run cloud:check`、commit、push、Draft PRを実行する。
5. PR checksとreview権限を確認し、Production権限や秘密値なしで通常開発できることを記録する。

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

Bash（Linux / macOS / Dev Container / Codespaces）:

```bash
./scripts/devcontainer.sh config
./scripts/devcontainer.sh up
./scripts/devcontainer.sh setup
./scripts/devcontainer.sh doctor
./scripts/devcontainer.sh shell
./scripts/devcontainer.sh check
```

PowerShell（Windows host）:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/devcontainer.ps1 -Action config
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/devcontainer.ps1 -Action up
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/devcontainer.ps1 -Action setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/devcontainer.ps1 -Action doctor
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/devcontainer.ps1 -Action shell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/devcontainer.ps1 -Action check
```

| Action | 内容 |
|---|---|
| `config` | Docker daemonへ接続し、containerを作成せずDev Container定義を解決・検査する |
| `up` | lock済みfeaturesでcontainerを作成し、setupを完了する |
| `setup` | 依存導入を再実行し、doctorまで完了する。初回setup中断時の回復にも使う |
| `doctor` | 起動済みcontainerのruntime、CLI、独立Docker、依存をfail-closedで検査する |
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

UI、navigation、font、breakpoint、animationを変更した場合はcloudで実行可能なresponsive gateを使う。

```bash
npm run check:responsive:cloud
```

FastAPIはVS Code task **Library: start FastAPI**、composite PostgreSQL環境は`compose.library-dev.yaml`と次のwrapperを使用する。wrapperはCompose project、network、volume、ownership label、localhost portを固定し、COMPASS Interactiveと分離する。

```bash
./scripts/library-docker-dev.sh Validate
./scripts/library-docker-dev.sh Up
./scripts/library-docker-dev.sh Test
./scripts/library-docker-dev.sh Down
```

`scripts/library-docker-dev.sh`と`scripts/library-docker-dev.ps1`は同じactionとisolation assertionを持つ。片方にactionを追加した場合は両方へ反映する。

### cloudで実行しないもの

| 対象 | 理由 | 判定元 |
|---|---|---|
| `npm run check:responsive:full` | visual regression baselineがWindows生成の`*-win32.png` | GitHub Actions `Responsive Quality Gate` |
| `npm run test:responsive:update-snapshots` | Windows baselineの横にLinux baselineを作ってしまう | UI承認後にWindowsで人が実行 |
| `npm run rehearse:library-production` | PowerShell script | GitHub Actions `Library Security Quality Gate` |
| `npm run deploy:*` | Production side effect | ユーザーの明示承認を伴う別workflow |

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
bash .codex/setup.sh
```

推奨maintenance script:

```bash
bash .codex/maintenance.sh
```

Codex CloudはDev Containerそのものを起動する経路ではないため、Node.jsは`.node-version`、Pythonは`3.12`へ固定する。DockerやProduction接続を必要としない通常の実装・review・非live testに使用する。

Codex Cloud環境では`.devcontainer/doctor.sh`のDev Container専用checkが失敗する。これは想定挙動であり、doctorは全項目を報告してからexit 1する。Codex Cloudの受入基準は`npm run cloud:check`である。

## Claude Codeから参加する

Claude CodeはCodexを主環境とする前提の上で、review・focusした微修正・監査に使用する副次的なagentである。`CLAUDE.md` → `AGENTS.md`の順に読み、Codexと同じ検証コマンドを使う。

repository側で共有するもの:

| 資産 | 内容 |
|---|---|
| `CLAUDE.md` | 入口。`AGENTS.md`へ委譲し、gateとworkspace資産だけを示す |
| `.claude/settings.json.example` | SessionStart hook登録と権限境界のtemplate。`.claude/settings.json`へcopyして有効化する |
| `.claude/hooks/session-start.sh` | cloud session開始時にnpm・Playwright・Library API環境を用意する |
| `.claude/agents/` | read-onlyの`repo-mapper`、`quality-reviewer`、`security-reviewer` |
| `.claude/commands/` | `/cloud-check`、`/responsive-check`、`/handoff` |

`.claude/settings.json`はrepositoryへcommitしていない。権限のallowlistを共有するかは各利用者の判断とし、有効化する場合は`.claude/settings.json.example`の全ruleをreviewしてからcopyする。`deny`はAGENTS.mdの安全境界（deploy、wrangler secret、terraform apply、force push、`.env*`とcredentialの読み取り）をpermission層へ写したものである。

Claude CodeのsubscriptionログインはGitへ保存しない。`.claude/settings.local.json`は個人設定であり共有しない。

## 複数エージェント運用

| Agent / IDE | 読む指示 | 標準コマンド | repository資産 |
|---|---|---|---|
| Codex（主） | `AGENTS.md`, `.codex/config.toml` | `npm run dev:cloud`, `npm run cloud:check` | `.codex/agents/` |
| Claude Code（副） | `CLAUDE.md` → `AGENTS.md` | 同上 | `.claude/agents/`, `.claude/commands/` |
| GitHub Copilot | `.github/copilot-instructions.md` → `AGENTS.md` | 同上 | — |
| VS Code agent | workspace recommendations + `AGENTS.md` | VS Code tasks | `.vscode/tasks.json` |

複数のwrite-capable agentを同じbranchまたはworktreeで同時実行しない。並列実装はagentごとにbranch/worktreeを分離し、main agentがdiff、test、commitを統合する。並列reviewは`.codex/agents/`または`.claude/agents/`のread-only agentを使用できる。両者は同じreview観点を持つため、片方を更新した場合はもう片方も更新する。

agent別の設定fileは実行設定のみを持ち、方針を複製しない。`AGENTS.md`と食い違った場合は`AGENTS.md`を優先し、差分を報告する。

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
