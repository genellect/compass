# COMPASS Repository Instructions

## Scope

このリポジトリは、COMPASS公式サイトと関連する公開導線を管理する。主な対象は、公式親サイト、COMPASS Interactive紹介・開発者紹介、未来戦略ライブラリ、COMPASS Manifesto、Community参加フォーム、Contactフォーム、および公開に必要なCloudflare Pages FunctionsとGoogle Apps Scriptである。

COMPASS Interactiveプロダクト本体、Productionデータベース、保護されたLibrary資料、利用者データ、認証情報はこの公開リポジトリに含まれない。

## Read Order

変更前に、次の順で必要な文書とソースを読む。

1. `AGENTS.md`
2. `Project.guide/PROJECT_GUIDE.md`
3. `docs/ARCHITECTURE.md`
4. `docs/CONTENT_GOVERNANCE.md`
5. 対象routeのソース、テスト、runbook

旧PDFと完了済み移行要件は履歴資料であり、現行実装の正本ではない。

## Current Identity

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

repository-wide gateは次のコマンドである。

```powershell
npm.cmd run check
```

これはform関連テスト、TypeScript検査、Production build、static export検証、全公開routeのPlaywright responsive smokeを実行する。変更範囲に応じて個別commandを使う場合も、実行したもの・省略したもの・理由を最終報告へ記載する。

## Git and Deployment

commit、push、PR、Cloudflare設定、GAS deployment、Production公開は、ユーザーが明示的に依頼した場合だけ行う。既存の未関連変更を保持し、破壊的なGit操作で消去しない。

## Cloud Development

- GitHubを正本とし、新規作業は最新`origin/main`からGitHub CodespacesまたはCodex Cloudで開始する。
- repositoryごとに環境とbranchを分離し、COMPASS Interactiveのcheckout、secret、runtimeを共有しない。
- Codespacesでは`.devcontainer/devcontainer.json`と`docs/CLOUD_DEVELOPMENT.md`を正本とする。
- 既存PCの`.env*`、credential、Production dataをcloud環境へcopyしない。
- 通常のcloud taskはnon-live testのみとし、Production form、実email、deploy、migration、secret変更を実行しない。
- Codex taskは完了前に該当testを実行し、branchへcommitしてDraft PRでreview可能な状態にする。

## Responsive Browser Gate

- UI、navigation、font、breakpoint、animationを変更した場合は、`docs/responsive-browser-qa.md`に従い`npm.cmd run check:responsive:full`を実行する。
- 物理解像度だけで合格にせず、CSS viewport、height境界、DPR、実描画行、overflow、consoleを記録する。
- responsive testを通すためにcanonical copy、背景、layoutを無関係に変更しない。意図的なcontract変更では、差分を人間が確認してからtest expectationを更新する。

## Final Report

実装後は次を報告する。

- 変更ファイル
- user-visible behaviorの有無
- 実行したtest・build・verification
- 実施したGit・Production操作
- 未確認事項と残存risk
