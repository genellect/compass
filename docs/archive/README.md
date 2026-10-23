# Archive

Status: Historical
Scope: 完了したPhase報告・証跡、旧版roadmap、旧Project Guide、旧PDF
Last verified: 2026-10-23

## この場所の扱い

このdirectoryの文書はすべて`Historical`であり、現行実装の正本ではない。当時の判断・証跡を追うためだけに保持する。現行の規則・状態は[`AGENTS.md`](../../AGENTS.md)、[`docs/README.md`](../README.md)、各runbookで確認する。

アーカイブ文書の本文は移動時の原文を維持している。本文中のpath、状態語、「現行」「正本」等の記述は当時のものであり、移動後のpathや現在の状態を表さない。

アーカイブ文書を根拠に現行のcopy・architecture・Gate判定・承認条件を変更しない。現行文書と食い違う場合は現行文書を優先し、必要なら差分を報告する。

## 未来戦略ライブラリ登録基盤（`library-registration/`）

2026-10-23に`docs/library-registration/`から移動した。現行のPhase・Gate判定は[`phase-roadmap-v3.md`](../library-registration/phase-roadmap-v3.md)を正本とする。

| 文書 | 内容 |
|---|---|
| [`phase-roadmap-v2.md`](library-registration/phase-roadmap-v2.md) | 旧版roadmap。v3で置き換え済み |
| [`phase3-implementation-plan.md`](library-registration/phase3-implementation-plan.md) | Phase 3の実装案 |
| [`phase3-test-report.md`](library-registration/phase3-test-report.md) | Phase 3の最終テスト報告（2026-07-16） |
| [`phase4-admin-oauth-succession-record.md`](library-registration/phase4-admin-oauth-succession-record.md) | 第二管理者・OAuth引継ぎ記録。ADR-0003で要件廃止 |
| [`phase4-blocker-resolution-pack.md`](library-registration/phase4-blocker-resolution-pack.md) | Phase 4ブロッカー解除の手動引渡しパック |
| [`phase4-evidence-and-decision.md`](library-registration/phase4-evidence-and-decision.md) | Phase 4の証跡・方針・ゲート判定 |
| [`phase4-hd-evidence-record.md`](library-registration/phase4-hd-evidence-record.md) | Google `hd`実測記録 |
| [`phase5-implementation-report.md`](library-registration/phase5-implementation-report.md) | Phase 5ローカル実装報告 |
| [`phase5-postgresql-integration-gate.md`](library-registration/phase5-postgresql-integration-gate.md) | Phase 5 PostgreSQL統合ゲートのPASS記録 |
| [`phase5-readiness.md`](library-registration/phase5-readiness.md) | Phase 5着手準備・完了記録 |
| [`phase6a-implementation-report.md`](library-registration/phase6a-implementation-report.md) | Phase 6A Google認証・登録API基盤の実装記録 |
| [`phase7-implementation-report.md`](library-registration/phase7-implementation-report.md) | Phase 7 Drive閲覧権限・招待通知の実装報告 |
| [`phase8a-implementation-report.md`](library-registration/phase8a-implementation-report.md) | Phase 8A実装報告 |
| [`phase8b-implementation-report.md`](library-registration/phase8b-implementation-report.md) | Phase 8B最小管理者運用の実装報告 |
| [`phase9-implementation-report.md`](library-registration/phase9-implementation-report.md) | Phase 9旧名簿移行の実装報告 |
| [`phase10a-implementation-report.md`](library-registration/phase10a-implementation-report.md) | Phase 10A CSV/XLSX名簿出力の実装報告 |
| [`release-baseline-verification-2026-08-01.md`](library-registration/release-baseline-verification-2026-08-01.md) | Historical R0の検証記録（2026-08-01） |

運用手順はアーカイブしていない。Phase 7〜10Aのrunbook、Cloudflare・GCP・GASのrunbook、`admin-access-security-boundary.md`、`public-repository-security-boundary.md`、`release-baseline-manifest.md`等は`docs/library-registration/`に残る。

## 旧Project Guide・旧PDF（`project-guide/`）

2026-10-23に、repository rootの`project.guide.md`と`Project.guide/`から移動した。内容が古く、現行の正本としては扱わないというユーザー判断による。

| 文書 | 内容 |
|---|---|
| [`PROJECT_GUIDE.md`](project-guide/PROJECT_GUIDE.md) | COMPASS全体の旧Project Guide（Last verified 2026-08-01） |
| [`project.guide.md`](project-guide/project.guide.md) | 未来戦略ライブラリ登録基盤の旧プロジェクトガイド（2026-08-03） |
| [`FUTURE_STRATEGY_LIBRARY_NEXT_REQUIREMENTS.md`](project-guide/FUTURE_STRATEGY_LIBRARY_NEXT_REQUIREMENTS.md) | 2026-07-31に完了したNext.js移行の要件記録 |
| [`COMPASS Founding Vision 2.0.pdf`](<project-guide/COMPASS Founding Vision 2.0.pdf>) | 旧理念PDF |
| [`COMPASS_Founding_Vision.pdf`](project-guide/COMPASS_Founding_Vision.pdf) | 旧理念PDF。上記と内容が重複する旧版として監査済み |
| [`Future_Strategy_Library_Design_Philosophy.pdf`](project-guide/Future_Strategy_Library_Design_Philosophy.pdf) | 未来戦略ライブラリの旧設計思想PDF |

現行のidentity、公開導線の分類、copy、status語彙は`AGENTS.md`と[`CONTENT_GOVERNANCE.md`](../CONTENT_GOVERNANCE.md)、技術境界は[`ARCHITECTURE.md`](../ARCHITECTURE.md)を正本とする。
