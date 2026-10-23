# COMPASS Documentation Index

Status: Canonical Index
Last verified: 2026-10-23 (entry documents; external operational states require their own checks)

## 文書の優先順位

1. そのtaskでユーザーが明示した要件
2. 現行Production挙動と最新`origin/main`の実装
3. [`AGENTS.md`](../AGENTS.md)
4. [`ARCHITECTURE.md`](ARCHITECTURE.md) / [`CONTENT_GOVERNANCE.md`](CONTENT_GOVERNANCE.md)
5. route-specific requirement・test・runbook
6. [`archive/`](archive/README.md)の完了済み記録・旧PDF・過去資料

Productionと`origin/main`が食い違う場合は差分を報告し、どちらかを推測で正本化しない。

## Canonical Documents

| Document | Responsibility |
|---|---|
| [`README.md`](../README.md) | repositoryの入口、開発・検証command、主要構成 |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | 新メンバー向けの開発の始め方、branchとPRの流れ、承認が必要な操作 |
| [`AGENTS.md`](../AGENTS.md) | coding agent向け実装契約、安全境界、確認事項 |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | repository、runtime、deployment、form、data境界 |
| [`CONTENT_GOVERNANCE.md`](CONTENT_GOVERNANCE.md) | canonical copy、CTA、metrics、status、editorial rule |
| [`ROUTE_CONTRACT.md`](ROUTE_CONTRACT.md) | route、所属surface、canonical URL、redirect、journey別destination、tabの扱い |
| [`WEBSITE_BOUNDARIES.md`](WEBSITE_BOUNDARIES.md) | 独立Web・独立surfaceの編集境界 |
| [`adr/README.md`](adr/README.md) | ADRの索引と新規ADRのテンプレート |

## Operational Runbooks

| Document | Scope |
|---|---|
| [`analytics-monitoring-operations.md`](analytics-monitoring-operations.md) | 公式Pages projectのGA4 / Cloudflare Web Analytics |
| [`founder-domain-operations.md`](founder-domain-operations.md) | Founder独自ドメイン、301、検索エンジン登録、公開後監視 |
| [`community-registration-operations.md`](community-registration-operations.md) | Community form、Pages Function、Turnstile、GAS |
| [`contact-form-operations.md`](contact-form-operations.md) | Contact form、email verification、Pages Function、Turnstile、GAS |
| [`library-registration/phase9-legacy-migration-runbook.md`](library-registration/phase9-legacy-migration-runbook.md) | 旧Form/Sheet/Drive snapshotのprivate移行、承認、rollback、purge |
| [`library-registration/phase10a-export-runbook.md`](library-registration/phase10a-export-runbook.md) | admin限定CSV/XLSX出力、保管、監査、削除、緊急停止 |
| [`library-registration/frontend-production-rehearsal.md`](library-registration/frontend-production-rehearsal.md) | Google/APIへ接続しないProduction-shaped frontend buildと最終mock復元 |
| [`library-registration/local-preproduction-gate-runbook.md`](library-registration/local-preproduction-gate-runbook.md) | Phase 8A/8B/9/10Aの合成データ専用統合ゲート、証跡、停止条件 |
| [`library-registration/cloudflare-preview-deployment-runbook.md`](library-registration/cloudflare-preview-deployment-runbook.md) | Production branchとCTAを保護するLibrary専用Cloudflare Preview手順 |
| [`library-registration/gcp-readonly-preflight-runbook.md`](library-registration/gcp-readonly-preflight-runbook.md) | near-zero GCP本命profileのsecret非閲覧read-only事前確認。billing・外部変更は直前承認後のみ |
| [`library-registration/production-gate-handoff-2026-08-02.md`](library-registration/production-gate-handoff-2026-08-02.md) | matching-HEAD local証跡から外部認証・Preview・Pilot・Cutoverまでの引継ぎ |
| [`library-registration/admin-access-security-boundary.md`](library-registration/admin-access-security-boundary.md) | 管理専用OAuth、server-side RBAC、mutation停止、DB実効権限、edge/manual gate |

runbookはsource上の契約と運用手順を記録する。Cloudflare dashboard、GAS deployment、secret、実メール疎通等の外部状態は、文書の日付だけで現在有効と判断せずoperatorが確認する。

## Future Strategy Library Registration

| Document | Status / responsibility |
|---|---|
| [`phase-roadmap-v3.md`](library-registration/phase-roadmap-v3.md) | Phase、PASS Gate、Preview/Pilot/Production Gateの正本 |
| [`release-baseline-manifest.md`](library-registration/release-baseline-manifest.md) | historical R0と現行release候補のbase/head・検証境界 |
| [`adr/0007-near-zero-cost-production-runtime.md`](adr/0007-near-zero-cost-production-runtime.md) | FastAPI/Neon/Cloud Runを維持する準0円運用、spend cap、残余riskの決定 |
| [`cost-capacity-and-docker-plan.md`](library-registration/cost-capacity-and-docker-plan.md) | 2026-08-02料金基準、容量、Docker隔離、課金停止線 |
| [`roster-and-legacy-reconciliation-2026-08-02.md`](library-registration/roster-and-legacy-reconciliation-2026-08-02.md) | 旧Sheet/Driveのread-only件数照合、名簿正規化、未解決22行、PostgreSQL正本方針 |
| [`admin-access-security-boundary.md`](library-registration/admin-access-security-boundary.md) | 管理画面をURLやclient表示だけで守らない多層認可とProduction手動ゲート |

Phase 9/10Aの実装報告は[`archive/library-registration/`](archive/README.md)へ移した（Historical）。

Phase 9/10Aの対象gateは`LOCAL IMPLEMENTATION PASS`だが、現行候補のcanonical統合判定には
現在HEADと一致するmachine evidenceが必要である。billingは意図的に未登録、外部認証・実PII・
公開は未実施である。正式判定は常に
`phase-roadmap-v3.md`と最新machine evidenceで確認する。

## Historical Documents

完了済みPhase報告、旧版roadmap、旧Project Guide（`PROJECT_GUIDE.md`、`project.guide.md`）、2026-07-31に完了したNext.js移行の要件記録、旧PDFは、2026-10-23に[`archive/`](archive/README.md)へ移した。索引は[`archive/README.md`](archive/README.md)にある。

これらは過去の判断を理解するために保持するが、現行実装の正本ではない。現行copy・architecture・Gate判定を上書きしない。

旧PDFのうち`COMPASS Founding Vision 2.0.pdf`と`COMPASS_Founding_Vision.pdf`は、内容が重複する旧版として監査されている。履歴保全のため削除せず移動だけを行った。将来の整理では、編集可能な原稿を正本とし、PDFを大学提出・説明用の派生物としてversion管理する。

## Status Labels

- `Canonical`: 現行方針の正本
- `Canonical Index`: 正本の所在と優先順位を管理
- `Operational Runbook`: 現行sourceに対応する運用手順。外部状態は別途確認
- `Completed`: 完了した実装・移行の記録
- `Historical`: 過去contextのみ。現行判断を上書きしない

## Responsive Browser QA

[`responsive-browser-qa.md`](responsive-browser-qa.md)は、全公開routeのCSS viewport、実改行、overflow、Mobile menu、CTA、展開状態、Playwright、GitHub Actions、Production smokeを管理するCanonical Operational Runbookです。

## Maintenance Rules

- 新規文書にはStatus、Scope、Last verifiedを付ける。
- 変動する数値には基準日・対象system・scopeを付ける。
- secret名は記載できるが、値、recovery情報、個人dataは記載しない。
- codeと文書の変更を同一taskで行う場合、文書だけを先行して「Production」と記載しない。
- 古い文書を消す前に、正本への移行、参照link、Git historyを確認する。

## 開発・権利・依存保守

| 文書 | 役割 |
|---|---|
| [開発・検証](development-workflows.md) | READMEから分離した環境別コマンドと副作用の境界 |
| [依存保守](dependency-maintenance.md) | npm/uv監査、ライセンス、固定値、例外review |
| [利用許可](legal/permissions.md) | 権利者の許可が必要な行為と申請方法 |
| [素材台帳](legal/asset-register.md) | 第三者素材の出典と既存credits |
| [文書変更対応表](documentation-maintenance.md) | 規則の保持と事実訂正の根拠 |
