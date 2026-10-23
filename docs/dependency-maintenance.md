# 依存関係とセキュリティの保守

Status: Operational Runbook
Scope: ソース、lockfile、開発・CI環境の非本番監査
Last verified: 2026-10-23

## 再現可能なインストール

Nodeの依存管理にはnpmと`package-lock.json`、Pythonにはuvと
`services/library-api/uv.lock`を使用する。pnpmは補助CLIであり、別のlockfileを生成しない。

```bash
npm ci
uv sync --project services/library-api --locked --dev
npm run check:repository
npm audit --audit-level=moderate
npm run audit:python
```

`audit:python`は公開PyPIパッケージの名前とバージョンをOSVへ問い合わせる。
ソース、環境変数、認証情報、利用者データは送信しない。APIの異常や不完全な応答は失敗扱いとする。
Pythonライセンスは実行中の環境にインストールされたlockfile一致のdistributionを対象とし、
未インストールの別プラットフォーム用パッケージはレポートに残す。
CIではLinuxとWindowsの両方を検査する。OSVの脆弱性照合は全lockfileを対象とする。

監査結果は`test-results/security/`へ出力する。Gitへcommitしない。
`npm run sbom:npm --silent`はlockfileに基づくCycloneDX一覧を標準出力へ出す。
これは本番コンテナや配信済みJavaScriptの実測SBOMではない。

## 更新手順

1. 公開アドバイザリ、影響バージョン、修正版、利用経路を確認する。
2. 作業ブランチで対象依存とlockfileを更新する。無関係なmajor更新や、監査コマンドが提案する後退更新を自動適用しない。
3. runtime、dev、optionalの差分と解決された推移依存を確認する。
4. 上記監査、`npm run check`、対象APIテストを実行する。Next.jsや画像処理の更新では既存のブラウザ・画像差分gateも実行する。
5. 修正前後の件数、影響条件、検証したコミット、未確認環境をPRへ記録する。
6. 本番への反映は依頼で指定された承認条件に従う。既存CDを維持し、mainへの反映で公開される場合は本番操作として扱う。

Pythonの変更後は次をリポジトリルートから実行する。

```bash
uv run --directory services/library-api --locked pytest
uv run --project services/library-api --locked python -m unittest discover -s tests -p test_dependency_audit.py
```

Docker、DB role、migration、Drive権限、GAS、Cloudflare設定の変更はこの監査コマンドに含まれない。
外部環境へ接続する検証は対象と副作用を確認し、必要な承認を得る。

## ライセンスの確認

[Third-party Notices](../THIRD_PARTY_NOTICES.md)と[素材台帳](legal/asset-register.md)を参照する。
[ポリシー](legal/dependency-license-policy.json)は確認済みのライセンス式を管理する。
未確認の式や不明なメタデータはCIを失敗させ、出典・実ファイル・用途をレビューする。

旧形式のPythonメタデータは、パッケージ名・バージョン・同梱LICENSEのSHA-256を一致させた
レビュー記録でのみ補完する。パッケージ名全体やライセンス不明を一括許可しない。
LGPL/MPL等は、ビルドでの利用、ブラウザ配信、コンテナ再配布、対象ファイルの改変ごとに義務を確認する。
式の確認は通知文、著作権表示、ソース提供等の履行を代替しない。

## 定期確認と公開境界

`Repository Maintenance` workflowは毎週のスケジュールと手動実行で、merge済み依存のadvisoryを監査する。PRの必須checkにはせず、PRが持ち込む脆弱な依存は`Library Security Quality Gate`の依存差分レビューで拒否する。
オンライン照合が停止した場合も合格扱いにしない。既存のCodeQL、依存差分レビュー、
ソース・Git履歴スキャナーを併用する。

```bash
npm run verify:public-source
npm run verify:git-history-secrets
```

履歴の`review`判定は侵害の証明ではない。ルール、パス、blob、fingerprintで追跡し、値をログへ転載しない。
`blocking`がなくても個人連絡先等の残存はあり得る。検査対象のrefと取得履歴を記録する。
実credentialの疑いがある場合、公開Issueや通常のCI artifactへ詳細を載せず、
[Security Policy](../.github/SECURITY.md)の経路で連絡する。履歴書換えや認証情報の更新を自動実行しない。

## 2026-09-10の修正記録

| 対象 | 更新 | 利用経路・判断 |
|---|---|---|
| Next.js | 16.2.11 → 16.3.4 | Windows上のNextサーバーRCEとAVIF画像最適化RCEを含む修正。静的export・`images.unoptimized`の配信では該当サーバー処理を使わない |
| sharp | 0.35.3 → 0.35.4 | 直接依存とoverrideを更新。ビルド・画像制作・推移依存を対象とする |
| Vitest / mocker | 4.1.10 → 4.1.11 | 開発・テスト依存。公開アプリにテストサーバーを含めない |
| baseline-browser-mapping | 2.10.43 → 2.11.21 | 推移依存の修正版へ更新 |
| httpx2 / httpcore2 | 2.7.0 → 2.12.0 | Python dev group。TLS・解析・メモリ消費等のアドバイザリを解消。本番`--no-dev`依存は変更なし |

出典: [Next Windows RCE](https://github.com/advisories/GHSA-p293-qw3h-jr36)、
[Next AVIF RCE](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4)、
[sharp](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)、
[Vitest](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)、
[baseline-browser-mapping](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv)。

脆弱なバージョンの存在は、悪用された証拠ではない。本番ログ・開発端末の侵害調査は
今回のソース・依存監査に含まれておらず、過去の実害の有無は未確定である。

## 2026-10-23の修正記録

修正前の`npm audit`は9件（critical 1 / high 6 / moderate 2）、Python OSV照合は3パッケージを検出した。
修正後はいずれも0件である。更新はすべて非majorで、lockfileは対象パッケージとその固定依存だけを更新した。

| 対象 | 更新 | 利用経路・判断 |
|---|---|---|
| Next.js | 16.3.4 → 16.4.3 | `next/og` ImageResponseのRCE、画像最適化API・`use cache`・Server Actions等の修正を含む。静的export・`images.unoptimized`の配信ではサーバー処理を使わないが、`opengraph-image`はbuild時に`next/og`で生成するため更新する |
| sharp | 0.35.4 → 0.35.5 | 直接依存とoverrideを更新。同梱librsvgの脆弱性。Nextのoptional依存、miniflare、画像制作スクリプトが利用する |
| wrangler / miniflare | 4.114.0 → 4.152.0 / 4.20260722.0 → 5.20261019.2-beta | 開発・Preview用CLI。miniflare経由のundici・sharpを解消する。miniflareとworkerdはwranglerが版を固定する |
| undici | 7.29.0 → 7.30.1（override） | 旧overrideが脆弱範囲7.0.0–7.29.0の版に固定していた。miniflare経由の開発依存 |
| Vitest / mocker | 4.1.11 → 4.1.12 | 開発・テスト依存。公開アプリにテストサーバーを含めない |
| vite | 8.2.2 → 8.2.4 | Vitestの推移依存。開発サーバーとlaunch-editorの修正。manifestは8.2.2と同一 |
| source-map-js | 1.2.1 → 1.2.2 | postcssの推移依存。indexed source mapによるDoS |
| Mako | 1.3.12 → 1.4.3 | Python本番依存（alembic経由、`--no-dev`に含まれる）。WindowsのTemplateLookupでのpath traversal。Library APIのソースはMakoを直接importせず、alembicのmigration雛形生成で使われる |
| urllib3 | 2.7.0 → 2.8.0 | Python本番依存（requests・cachecontrol経由、`--no-dev`に含まれる）。HTTPS proxyのTLS設定、chunked応答のDoS |
| certifi | 2026.7.22 → 2026.10.23 | Python本番依存（requests経由、`--no-dev`に含まれる）。鍵が侵害されたemSignルートCAを同梱していた。2026-10-20公開のadvisoryで、本作業中のOSV照合で検出した |

`overrides.postcss`（8.5.25）と`overrides.nanoid`（3.3.18）は該当advisoryがなく、変更していない。

出典: [Next next/og RCE](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j)、
[Next 画像最適化 SVG RCE](https://github.com/advisories/GHSA-2464-fhr4-w9xw)、
[Next `use cache` RCE](https://github.com/advisories/GHSA-673q-mjm6-r5xr)、
[Next 画像最適化 SSRF](https://github.com/advisories/GHSA-cjq9-62q9-8jv4)、
[Next Server Actions DoS](https://github.com/advisories/GHSA-p3m5-59mp-jv5r)、
[sharp](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)、
[undici WebSocket DoS](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5)、
[undici BalancedPool TLS](https://github.com/advisories/GHSA-w293-vg96-wgc3)、
[Vitest mocker](https://github.com/advisories/GHSA-qxg6-89mg-rqv8)、
[Vitest Windows traversal](https://github.com/advisories/GHSA-xp26-3454-mjgp)、
[launch-editor（vite）](https://github.com/advisories/GHSA-587h-7wmj-h5pm)、
[source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)、
[Mako](https://github.com/advisories/GHSA-5639-2j2p-m4mx)、
[urllib3 proxy TLS](https://github.com/advisories/GHSA-8988-9cw3-xx77)、
[urllib3 deflate](https://github.com/advisories/GHSA-gh4c-6fx4-qh6g)、
[urllib3 chunk-size](https://github.com/advisories/GHSA-vxq7-64xx-v4gw)、
[certifi](https://github.com/advisories/GHSA-6q48-6c7w-9gw2)。
Next.js・undici・viteの残りのadvisoryは`npm audit --json`の出力で確認できる。

npm 10.9系の`npm install`はこの依存グラフで`Cannot read properties of null (reading 'edgesOut')`を出して失敗した。
lockfileはnpm 11で解決した。そのうえで、対象外のパッケージ（chai、tinyrainbow、rolldown等）が範囲内の最新版へ再解決された分を元の版へ戻した。
CIと同じnpm 10の`npm ci`と`npm ls --all`で整合を確認した。

今回の更新でも、脆弱なバージョンの存在は悪用の証拠ではない。本番ログ・開発端末の侵害調査は行っていない。

## 2026-10-23のNode.js更新記録

| 対象 | 更新 | 利用経路・判断 |
|---|---|---|
| Node.js（`.node-version`、`toolchain.env`、Dev Container node feature） | 22.16.0 → 24.22.1（LTS Krypton、2026-10-20公開） | Node 22のEOLは2027-04-30、Node 24は2028-04-30。Node 26はLTS前のため採用しない。CI（`node-version-file`）とCloudflare Pagesのbuildは`.node-version`を読む |
| Dev Container base image | `javascript-node:1-22-bookworm` → `javascript-node:5-24-bookworm` | `1-*`系列はNode 24を提供しない。Node本体はnode featureが固定版を導入する。`remoteUser`（`node`）と`NVM_DIR`は同一 |
| 同梱npm | 10.9系 → 11.19.1 | `npm ci`は成功し、`npm install --package-lock-only --ignore-scripts`で`package-lock.json`は変化しない。未承認install scriptは警告のみで従来どおり実行される（`strict-allow-scripts=false`） |

本番影響: mainへのmerge後、Cloudflare Pagesの本番buildがNode 24.22.1で実行される。Node 22とNode 24で
`npm run build`した`out/`（497ファイル）を比較した。build IDとwebpack runtimeのファイル名を正規化した後の差分は、
webpack runtime内のchunk対応表（17組、内容は同一）の並び順だけだった。画像・CSS・その他のJS chunkは同一である。
`npm test`、`npm run typecheck`、`npm run check:repository`、`npm run verify`はNode 24で合格した。
Node 24の`node:test`既定reporterはTAPからspecへ変わるが、repository内にTAP出力への依存はない。
Python・Library APIはNodeを使用しないため対象外とした。

Rollback: `.node-version`、`.devcontainer/toolchain.env`、`.devcontainer/devcontainer.json`を22.16.0の値へ戻すcommitを作る。
即時の復旧が必要な場合は、Cloudflare Pages dashboardで直前のProduction deploymentへrollbackする。
