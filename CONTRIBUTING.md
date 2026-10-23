# COMPASSへの参加

Status: Canonical
Scope: このrepositoryで作業する人間の参加者
Last verified: 2026-10-23

この文書は、新しく参加したメンバーが最初の変更をPRにするまでの道順を示す。規則の本文は[`AGENTS.md`](AGENTS.md)と各文書にあり、ここではそこへの案内だけを置く。食い違う場合は`AGENTS.md`を優先する。

このrepositoryのソース公開は、改変・再配布・商用利用の許諾ではない。参加者も[`LICENSE`](LICENSE)と[利用許可](docs/legal/permissions.md)の範囲で作業する。

## 1. 開発環境を用意する

推奨はGitHub Codespacesである。repositoryの`.devcontainer/devcontainer.json`が環境の唯一の正本で、Node、Python、uv、Playwright、Dockerなどは自動で揃う。個人PCへのglobal installで不足を補わない。

ローカルで作業する場合は、VS Code + Docker DesktopまたはDev Container CLIで同じDev Containerを使う。手順、初回の受入check（`npm run dev:doctor`）、cloudで実行しないWindows専用手順は[`docs/CLOUD_DEVELOPMENT.md`](docs/CLOUD_DEVELOPMENT.md)にある。

よく使うコマンドと、それぞれの副作用の有無は[`docs/development-workflows.md`](docs/development-workflows.md)にある。

## 2. 最初に読むもの

1. [`README.md`](README.md): COMPASSの価値、技術構成、実装の場所
2. [`AGENTS.md`](AGENTS.md): 作業範囲、編集・検証・承認の規則（人もagentも同じ規則に従う）
3. [`docs/PROJECT_GUIDE.md`](docs/PROJECT_GUIDE.md): COMPASSの理念、identity、project間の関係、experience原則
4. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)と[`docs/CONTENT_GOVERNANCE.md`](docs/CONTENT_GOVERNANCE.md): 技術境界と、正式な文言・CTA・状態語
5. 変更する対象routeのsource、test、runbook

Interactive紹介、開発者紹介、yuto-matsui.comは、COMPASS公式サイトとは独立した編集範囲である。依頼で名指しされない限り変更しない。境界は`AGENTS.md`のIndependent Website Boundariesと[`docs/WEBSITE_BOUNDARIES.md`](docs/WEBSITE_BOUNDARIES.md)にある。

## 3. ブランチとPRの流れ

1. 最新の`origin/main`から、作業ごとに専用branchを作る。`main`へ直接pushしない。
2. 変更範囲を依頼された内容に限定する。無関係なcopy・file・architectureを「ついでに」整理しない。
3. 変更のリスクに見合った検証を手元で行う。何を確認すべきかは[`docs/agent-delivery-policy.md`](docs/agent-delivery-policy.md)の表で選ぶ。
4. commitしてpushし、PRを作る。PR本文は`.github/pull_request_template.md`の見出しを埋める。実行していない検証は「未実行」と書く。
5. 必須checkが通り、reviewを受けた後、権利者の承認でmergeする。

同じbranchやworktreeを、複数の人やagentが同時に書き換えない。別のagentが作業中のbranchがある場合は、そのdiffを読んでから進める。

## 4. 必須check

全PRの必須checkは`CI result`と`Library security result`の2つである。何を実行し、いつ追加のjobが走るかは`AGENTS.md`の「GitHub Actionsの必須check」に書かれている。

CIが失敗したら放置しない。自分の変更と無関係な既存失敗は一度だけ切り分け、修正PRまたはIssueで追跡する。期待値・timeout・retryを緩めてCIを通さない。

ブラウザーのresponsive検査はCIの必須checkではない。UIを変更した場合に何を確認するかは[`docs/responsive-browser-qa.md`](docs/responsive-browser-qa.md)にある。

## 5. Web UIを変更したとき

Web UIの変更は、PRに加えてCloudflare Pagesの非本番Previewを作り、Preview URLで対象routeを実際に表示して確認するまでが一つの作業である。localhostやスクリーンショットだけで完了にしない。手順は[`docs/agent-delivery-policy.md`](docs/agent-delivery-policy.md)の「PRとCloudflare Preview」にある。

Previewでは、Production branch、secret、独自domainの設定を変更しない。

リンクやCTAの遷移先を変更する場合は、`Join`や`Register`といったラベルから推測せず、[`docs/ROUTE_CONTRACT.md`](docs/ROUTE_CONTRACT.md)と対象sourceを確認する。

## 6. 承認が必要な操作

次の操作は、権利者（repository owner）の明示的な承認なしに行わない。PRやPreviewの許可から、これらの許可を推定しない。

- `main`へのmerge、Productionへの公開（`main`への反映はProduction配信を起動し得るため、本番操作として扱う）
- Production formの送信、実メールの送信
- Cloudflare設定、GAS deployment、Terraform apply、database migration
- secret・認証設定の追加・変更
- route・独立Webの削除、公開停止、別repositoryへの移設

正確な条件と例外（影響が限定された微調整の扱い等）は`AGENTS.md`の「Git and Deployment」と「Cloud Development」にある。

## 7. セキュリティと個人情報

- secret、credential、token、OTP、lecture code、個人情報、保護されたLibrary資料をcommitしない。chat、screenshot、logにも貼らない。
- 個人PCの`.env*`、credential、Production dataをcloud環境やrepositoryへcopyしない。
- 氏名、メール、学籍番号、問い合わせ本文、生IP、確認コードをlogやanalyticsへ送らない。
- testや検証には合成データだけを使う。
- 外部AIの出力は、検証と人間のreviewが終わるまで公開事実として扱わない。

規則の本文は`AGENTS.md`の「Security and Privacy」にある。脆弱性を見つけた場合はpublic issueにせず、[`.github/SECURITY.md`](.github/SECURITY.md)の手順で非公開に報告する。

## 8. 文書の地図

| 知りたいこと | 文書 |
|---|---|
| 全文書の一覧と優先順位 | [`docs/README.md`](docs/README.md) |
| 作業規則・承認条件 | [`AGENTS.md`](AGENTS.md) |
| 理念・identity・project間の関係 | [`docs/PROJECT_GUIDE.md`](docs/PROJECT_GUIDE.md) |
| 開発環境 | [`docs/CLOUD_DEVELOPMENT.md`](docs/CLOUD_DEVELOPMENT.md) |
| コマンドと検証 | [`docs/development-workflows.md`](docs/development-workflows.md)、[`docs/agent-delivery-policy.md`](docs/agent-delivery-policy.md) |
| 技術構成・境界 | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| 正式な文言・CTA・状態語 | [`docs/CONTENT_GOVERNANCE.md`](docs/CONTENT_GOVERNANCE.md) |
| route・遷移先 | [`docs/ROUTE_CONTRACT.md`](docs/ROUTE_CONTRACT.md) |
| 独立Webの編集境界 | [`docs/WEBSITE_BOUNDARIES.md`](docs/WEBSITE_BOUNDARIES.md) |
| 設計上の決定記録 | [`docs/adr/README.md`](docs/adr/README.md) |
| 依存・ライセンス | [`docs/dependency-maintenance.md`](docs/dependency-maintenance.md)、[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) |
| 過去の報告・旧資料（Historical） | [`docs/archive/README.md`](docs/archive/README.md) |
