# COMPASS Documentation Index

Status: Canonical Index
Last verified: 2026-08-01

## 文書の優先順位

1. そのtaskでユーザーが明示した要件
2. 現行Production挙動と最新`origin/main`の実装
3. [`AGENTS.md`](../AGENTS.md)
4. [`Project.guide/PROJECT_GUIDE.md`](../Project.guide/PROJECT_GUIDE.md)
5. [`ARCHITECTURE.md`](ARCHITECTURE.md) / [`CONTENT_GOVERNANCE.md`](CONTENT_GOVERNANCE.md)
6. route-specific requirement・test・runbook
7. completed migration record・旧PDF・過去資料

Productionと`origin/main`が食い違う場合は差分を報告し、どちらかを推測で正本化しない。

## Canonical Documents

| Document | Responsibility |
|---|---|
| [`README.md`](../README.md) | repositoryの入口、開発・検証command、主要構成 |
| [`AGENTS.md`](../AGENTS.md) | coding agent向け実装契約、安全境界、確認事項 |
| [`PROJECT_GUIDE.md`](../Project.guide/PROJECT_GUIDE.md) | COMPASSの理念、identity、project関係、experience原則 |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | repository、runtime、deployment、form、data境界 |
| [`CONTENT_GOVERNANCE.md`](CONTENT_GOVERNANCE.md) | canonical copy、CTA、metrics、status、editorial rule |
| [`CODEX_LINKS.md`](../CODEX_LINKS.md) | 正規公開URLとjourney別destination |

## Operational Runbooks

| Document | Scope |
|---|---|
| [`analytics-monitoring-operations.md`](analytics-monitoring-operations.md) | 公式Pages projectのGA4 / Cloudflare Web Analytics |
| [`community-registration-operations.md`](community-registration-operations.md) | Community form、Pages Function、Turnstile、GAS |
| [`contact-form-operations.md`](contact-form-operations.md) | Contact form、email verification、Pages Function、Turnstile、GAS |

runbookはsource上の契約と運用手順を記録する。Cloudflare dashboard、GAS deployment、secret、実メール疎通等の外部状態は、文書の日付だけで現在有効と判断せずoperatorが確認する。

## Completed Implementation Record

[`Project.guide/FUTURE_STRATEGY_LIBRARY_NEXT_REQUIREMENTS.md`](../Project.guide/FUTURE_STRATEGY_LIBRARY_NEXT_REQUIREMENTS.md)は、2026-07-31に完了したNext.js移行の要件記録である。現行copy・architectureを上書きしない。

## Historical Documents

次のPDFは過去の理念・Library設計を理解するために保持するが、現行実装の正本ではない。

- `Project.guide/COMPASS Founding Vision 2.0.pdf`
- `Project.guide/COMPASS_Founding_Vision.pdf`
- `Project.guide/Future_Strategy_Library_Design_Philosophy.pdf`

最初の2件は内容が重複する旧版として監査されている。今回は履歴保全のため移動・削除しない。将来の整理では、編集可能な原稿を正本とし、PDFを大学提出・説明用の派生物としてversion管理する。

## Status Labels

- `Canonical`: 現行方針の正本
- `Canonical Index`: 正本の所在と優先順位を管理
- `Operational Runbook`: 現行sourceに対応する運用手順。外部状態は別途確認
- `Completed`: 完了した実装・移行の記録
- `Historical`: 過去contextのみ。現行判断を上書きしない

## Maintenance Rules

- 新規文書にはStatus、Scope、Last verifiedを付ける。
- 変動する数値には基準日・対象system・scopeを付ける。
- secret名は記載できるが、値、recovery情報、個人dataは記載しない。
- codeと文書の変更を同一taskで行う場合、文書だけを先行して「Production」と記載しない。
- 古い文書を消す前に、正本への移行、参照link、Git historyを確認する。
