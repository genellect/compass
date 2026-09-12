# COMPASS Repository Instructions

## Scope

通常のCOMPASS依頼では、次を編集対象とする。

- 公式親サイト、未来戦略ライブラリ、COMPASS Manifesto
- Community参加フォーム、Contactフォーム
- 上記の公開に必要なCloudflare Pages FunctionsとGoogle Apps Script

Interactive紹介、開発者紹介、yuto-matsui.comは独立した編集範囲である。
各対象を指定した依頼がない限り変更しない。詳細は以下のIndependent Website Boundariesを参照する。

COMPASS Interactiveプロダクト本体、Productionデータベース、保護されたLibrary資料、利用者データ、認証情報はこの公開リポジトリに含まれない。

## Read Order

変更前に、次の順で必要な文書とソースを読む。

1. `AGENTS.md`
2. `Project.guide/PROJECT_GUIDE.md`
3. `docs/ARCHITECTURE.md`
4. `docs/CONTENT_GOVERNANCE.md`
5. 対象routeのソース、テスト、runbook

旧PDFと完了済み移行要件は履歴資料であり、現行実装の正本ではない。

## Independent Website Boundaries (user instruction, 2026-09-09)

「COMPASSプロジェクトを編集」「親・子サイトを統一」などの依頼で既定の対象となるのは、公式親サイト、未来戦略ライブラリ、Manifesto、Community参加、Contact等のCOMPASS公式surfaceである。**Interactive、開発者紹介、yuto-matsui.comは含めない。** 詳細なroute/source対応は `docs/WEBSITE_BOUNDARIES.md` を参照。

- Interactive紹介・開発者紹介とInteractiveプロダクトは独立した編集範囲。ユーザーがそのsurfaceを明示して依頼しない限り、文章・デザイン・導線・実装・公開設定を変更しない。開発者紹介をCOMPASS編集の当然の対象や新規導線の候補として扱わない。
- `yuto-matsui.com`（日本語・英語）は、COMPASSとはドメイン・提供価値の異なる独立Web。親子関係はない。同一repository、Next.js、Pages成果物の共有は運用上の配置であり、従属関係や変更権限を意味しない。
- 共通CSS・layout・配信設定の変更では、これら独立surfaceへの波及を確認する。通常のCOMPASS依頼から全体一括リブランド・移設・ドメイン/redirect変更を推定しない。
- 既存routeの存在は編集許可ではない。削除・公開停止・別repository移設は別途明示依頼が必要。

## Rights and Documentation

- 権利者が許可した作業は、その範囲で実行する。既に得た同一作業の許可を繰り返し求めない。
- ソース公開は第三者への一般的な改変・商用利用・再配布の許諾ではない。`LICENSE`と`THIRD_PARTY_NOTICES.md`を参照する。
- 文書は日本語を基調とし、識別子・状態語を統一する。1段落1論点、規則の適用条件を明記する。
- 文章整理では規則・承認条件・理念・canonical copyを保持する。事実訂正には現行sourceの根拠を添える。
- READMEは人間向けに、価値・技術構成・実装箇所・検証方法を説明する。AGENTSは条件と行動を短い規則で示す。
- 非本番の依存監査は`docs/dependency-maintenance.md`、開発コマンドは`docs/development-workflows.md`を参照する。

## Current Identity (COMPASS)

- Brand: COMPASS
- Definition: 学生主導型 教育・テクノロジープラットフォーム
- Hero: `Don’t Just Learn. Build What’s Next.`
- Vision: `学びを、意思決定の力へ。`
- Core transition: 学生の「知る」を、「選ぶ」「動く」へ変える。
- Origin: 北里大学薬学部
- Status: 学生有志による任意の学生支援活動。大学公式組織ではない。

活動領域はTechnology / Resources / Education / Community。主要な公開導線はInteractive / Library / Manifesto / Community。この2つの分類を混同しない。

## Repository Boundaries

- 公式サイト・紹介route: Next.js static export
- 公開フォーム: Cloudflare Pages Functions + Turnstile + Google Apps Script
- COMPASS Interactive本体: 別リポジトリ・別デプロイ
- 保護されたLibrary資料とProduction利用者データ: 公開ソース外

別リポジトリの実装や数値を、このリポジトリ自身の実装として記述しない。

## Active Parent-Site Composition

現行の親サイトは次の経路で構成される。

`src/app/(official)/page.tsx` → `src/App.tsx` → `src/LegacyPageBody.tsx`

`LegacyPageBody.tsx`は名称に反して本番で使用されている。`src/components/Hero/index.tsx`は現在`NewHero.tsx`を選択している。ファイル名だけでlegacy・未使用と判断せず、import graphとbuild出力を確認する。

## Content Status Vocabulary

実装状態は次の語彙で表す。

- `Production`: Production環境へ反映済み
- `Operationally verified`: 明示した実環境・条件で動作確認済み
- `Implemented, verification pending`: コードは存在するが、必要な実環境確認が未完了
- `Planned`: 承認済みの方向性で、実装未完了
- `Historical`: 過去の判断・実装記録としてのみ保持

設計上の容量、目標値、mock data、planned workをProduction実績として扱わない。定量値には基準日・対象system・除外範囲を付ける。

## Editing Rules

- ユーザーの明示指示を最優先する。
- 対象route、import先、関連テスト、現行Production挙動を確認してから編集する。
- 変更範囲を限定し、無関係なcopy・file・architectureを整理しない。
- 承認済みの中核copyを、技術変更のついでに書き換えない。
- 既存component、design token、responsive pattern、content sourceを優先して再利用する。
- one `h1`、論理的なheading順、keyboard focus、reduced motion、Mobile可読性を維持する。
- 同一domainの導線は原則同一tab。外部formや別productはroute契約に従う。
- `Join`や`Register`等の一般ラベルから遷移先を推測しない。`CODEX_LINKS.md`と対象sourceを確認する。

## Security and Privacy

- secret、credential、token、OTP、lecture code、個人情報、保護資料をcommitしない。
- 氏名、メール、学籍番号、問い合わせ本文、生IP、確認コードをlogやanalyticsへ送らない。
- CommunityとContactのendpoint、schema、Turnstile action、GAS project、secretを明示承認なく統合しない。
- Production form送信や実メール送信は、ユーザーの明示承認なしに自動実行しない。
- 外部AI出力は、検証と人間のreviewが完了するまで公開事実として扱わない。

## Verification

検証は変更のリスクとROIから選ぶ。通常の局所変更にrepository-wide gateを毎回適用しない。詳細は`docs/agent-delivery-policy.md`を正本とする。

- 着手時に、壊れ得る契約、最小の検証、Preview作成経路を決める。テストの数ではなく、重要な失敗を検出できるかで判断する。
- 局所的なUI変更は対象routeのDesktop/Mobile・変更した境界・操作に絞る。合格済みの無関係な機能を繰り返し検証しない。
- 文書だけの変更は文書リンク・差分確認を基本とする。型検査・build・ブラウザー・依存監査を一律には実行しない。
- buildはPreview用成果物の作成時にまとめて1回行い、静的検証・対象ブラウザー確認・Previewへ同じ成果物を使用する。反復調整には開発サーバーを使う。
- 同じ変更に対する合格済み検証は、関連する追加変更・新しい失敗・未解決リスクがない限り繰り返さない。失敗時は原因に関係する最小ケースへ絞る。
- 無関係な既存失敗は一度切り分けて記録する。期待値・timeout・retryを緩めたり、無変更で総合テストを反復したりしない。
- 検証が実装に比べ過大、または局所変更の検証が約5分を超える場合、追加実行前に対象と費用対効果を見直す。時間超過を合格扱いや検証省略の理由にはしない。

repository-wide gate（広範囲変更、明示された総合監査、CI向け）は次のコマンドである。

```bash
npm run check
```

`npm run cloud:check`は同一gateのcloud向けaliasである。どのOS・どのagentからも、この形式を正本とする。Windows PowerShellから直接実行する場合だけ`npm.cmd run check`と読み替える。文書・PR・報告には`npm run`形式で記載する。

これはform関連テスト、TypeScript検査、Production build、static export検証、全公開routeのPlaywright responsive smokeを実行する。変更範囲に応じて個別commandを使う場合も、実行したもの・省略したもの・理由を最終報告へ記載する。

環境・依存・権利インベントリ・保守ツール変更では`npm run check:repository`を実行する。文書のみの変更では`npm run verify:docs`と差分確認を行う。
Python依存の監査・テストは`docs/dependency-maintenance.md`に従う。

## Git and Deployment

- commit、push、PR、Cloudflare設定、GAS deployment、Production公開は、ユーザーが明示的に依頼した範囲で行う。
- Git操作の許可から本番公開の許可を推定しない。mainへのpush/mergeがCDを起動する場合は本番操作として扱う。
- 既存CDを無断で解除しない。依頼で指定された公開条件を守る。
- 既存の未関連変更を保持する。破壊的なGit操作で消去しない。

このrepository内のWeb UI実装・改装依頼は、対象surfaceの実装、必要な検証、専用branchへのcommit/push、PR作成、Cloudflare Preview作成、Preview URLでの実表示確認までを一つの完了契約とする。これは明示的に依頼されたyuto-matsui.comのJP/EN、Interactive紹介・開発者紹介にも適用する。Independent Website Boundariesは編集対象の境界であり、依頼済みsurfaceをPreview契約から除外する理由ではない。

- 上記の非本番PR/Preview操作は実装依頼に含まれる。ユーザーが禁止・ローカル限定・調査のみと指定した場合はその指定を優先する。既存の認証と非本番設定を使い、同じ操作の許可を再度求めない。
- localhost、パッチ、スクリーンショットだけをCloudflare Previewの代わりとして完了報告しない。PR URLと実際に開けるPreview URLを報告する。JP/EN等の対象routeをそれぞれ確認する。
- 着手時にPreview経路・認証・非本番branchを確認する。権限不足などの実在する障害は早期に具体的に報告し、実装を進めながら解消する。未作成を作成済みと扱わない。
- PreviewではProduction branchを指定しない。PR/Previewの許可からmerge、Production公開、secret/認証設定変更を推定しない。Production公開はユーザーの明示指示を必要とする。

文言、リンク、CTA、余白、軽微なレスポンシブ調整など、影響範囲が限定された微調整についてユーザーがProduction公開を明示した場合は、Cloudflare Previewを省略し、必要な検証、PR、merge、Production公開、canonical URL確認までを最速経路で完了してよい。Previewを省略した場合は、最終報告にその旨とProduction検証結果を記載する。

## Cloud Development

- GitHubを正本とし、新規作業は最新`origin/main`からGitHub CodespacesまたはCodex Cloudで開始する。
- Dev Container Specificationを環境の唯一の正本とし、Codespaces、VS Code + Docker Desktop、Dev Container CLIで同じ`.devcontainer/devcontainer.json`を使用する。
- repositoryごとに環境とbranchを分離し、COMPASS Interactiveのcheckout、secret、runtimeを共有しない。
- Codespacesでは`.devcontainer/devcontainer.json`と`docs/CLOUD_DEVELOPMENT.md`を正本とする。
- 既存PCの`.env*`、credential、Production dataをcloud環境へcopyしない。
- 通常のcloud taskはnon-live testを基本とし、Production form、実email、Production deploy、migration、secret変更を実行しない。Web UI依頼の非本番PR/Cloudflare Previewは上記の完了契約に従う。
- Codex taskは完了前に該当testを実行する。Git操作まで依頼された実装taskではbranchへcommitし、Draft PRでreview可能にする。調査・提案だけの依頼や、本番影響を伴うGit操作にはこの自動実行規則を適用しない。
- Dev Containerの初回作成後と環境定義変更後は`npm run dev:doctor`を実行し、手作業のglobal package導入で不足を隠さない。
- cloud経路はLinuxである。`.ps1` script、`npm.cmd`、`Get-NetTCPConnection`等のWindows専用手順をcloud taskの前提にしない。Docker composeを使うLibrary環境は`scripts/library-docker-dev.sh`を使用する。

## Agent Interoperability

- `AGENTS.md`を全エージェント共通の正本とする。`CLAUDE.md`と`.github/copilot-instructions.md`はこの文書と`docs/CLOUD_DEVELOPMENT.md`へ従う。
- Codex、Claude Code、GitHub Copilot、VS Code上のエージェントは、同じDev Container、同じnpm/uv lockfile、同じ検証コマンドを使用する。
- agent別の実行設定は正本を分けない。`.codex/`はCodex、`.claude/`はClaude Codeの起動・権限・read-only agent定義のみを持ち、方針は`AGENTS.md`が唯一の正本である。両者の内容が食い違った場合は`AGENTS.md`を優先し、差分を報告する。
- 複数のwrite-capable agentを同じbranch・worktreeで同時実行しない。並列実装はagentごとにbranchまたはworktreeを分離する。
- 明示的に並列reviewを依頼された場合は、`.codex/agents/`または`.claude/agents/`のread-only agentを使い、main agentが判断と最終統合を担当する。両者は同じreview観点（repo mapping、quality、security）を持つ。

## Responsive Browser Gate

- UI、navigation、font、breakpoint、animationを変更した場合は、`docs/responsive-browser-qa.md`に従い責任gateを実行する。
- 局所的な変更では対象route・操作・viewportの検証を選ぶ。Linux・cloudで全responsive contractが必要な変更や明示的な総合監査では`npm run check:responsive:cloud`を使う。CIの責任gateは維持し、同じ全範囲をローカルとCIで機械的に重複実行しない。
- visual regression baselineはWindowsで生成された`*-win32.png`であり、Linuxからは実行も更新もしない。`npm run check:responsive:full`はWindows専用gateであり、cloudからの合格判定にはGitHub Actions `Responsive Quality Gate`の結果を使う。
- 物理解像度だけで合格にせず、CSS viewport、height境界、DPR、実描画行、overflow、consoleを記録する。
- responsive testを通すためにcanonical copy、背景、layoutを無関係に変更しない。意図的なcontract変更では、差分を人間が確認してからtest expectationを更新する。

## Final Report

実装後は次を報告する。

- 変更ファイル
- user-visible behaviorの有無
- 実行したtest・build・verification
- 実施したGit・Production操作
- PR URL、対象routeのCloudflare Preview URLと確認結果（未作成なら具体的な障害）
- 未確認事項と残存risk
