# 依存関係とセキュリティの保守

Status: Operational Runbook
Scope: ソース、lockfile、開発・CI環境の非本番監査
Last verified: 2026-09-10

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

`Repository Maintenance` workflowはPR、mainの更新、毎週のスケジュールで監査する。
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
