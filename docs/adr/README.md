# Architecture Decision Records

Status: Canonical Index
Scope: `genellect/compass`のarchitecture・運用上の決定記録
Last verified: 2026-10-23

## この場所の扱い

ADRは、後から変えにくい設計判断について、背景・決定・結果を一件ずつ残す記録である。repository共通の置き場として、2026-10-23に`docs/library-registration/adr/`から移した。番号とファイル名は移動前のまま維持している。

ADR-0001〜0007は未来戦略ライブラリ登録基盤の決定である。新しいADRは対象systemを問わずこの場所に追加する。

各ADRの`Status`はその決定の採否と適用範囲を表す。Production反映の有無は`AGENTS.md`のContent Status Vocabularyと各runbookで別に確認する。

## 索引

| ADR | 決定 | Status（各ADR冒頭の記載） |
|---|---|---|
| [ADR-0001](0001-data-residency-retention.md) | データ保存地域と保存期間 | Accepted for Phase 5 / Production confirmation required |
| [ADR-0002](0002-drive-resource-automation.md) | Driveリソースと自動化主体 | Accepted for design。第二管理者に関する部分はADR-0003で置き換え |
| [ADR-0003](0003-admin-identity-rbac.md) | 管理者IDとRBAC | Accepted / owner-controlled dual-account allowlist |
| [ADR-0004](0004-phase5-database-boundary.md) | Phase 5データベース境界 | Accepted |
| [ADR-0005](0005-docker-isolation.md) | Docker開発環境の独立境界 | Accepted |
| [ADR-0006](0006-release-topology-and-gates.md) | リリース基線・本番topology・公開ゲート | Accepted for implementation; production deployment pending |
| [ADR-0007](0007-near-zero-cost-production-runtime.md) | 準0円運用と課金制御を前提とするProduction runtime | Cost principle accepted; billing, external resources, and Production deployment pending |

## 新規ADRの作り方

- 番号は既存の最大番号の次を4桁で付け、`NNNN-kebab-case-title.md`とする。欠番を再利用しない。
- 既存ADRを書き換えて決定を覆さない。新しいADRを追加し、旧ADRの冒頭に置き換え先を一行で注記する。
- secret値、個人情報、Production identityはADRへ書かない。secret名や境界の説明は記載できる。
- 追加したADRはこの索引へ一行追加する。

## テンプレート

```markdown
# ADR-NNNN: 決定の題名

Status: Proposed | Accepted | Superseded by ADR-NNNN | Historical
Date: YYYY-MM-DD
Scope: 対象system・route・service

## 背景

何が問題で、どの制約（費用、安全、権利、運用者数、既存実装）の下で判断したか。

## 決定

採用したもの。適用条件と、明示的に採用しなかった選択肢。

## 結果

この決定で得るもの、受け入れるrisk、後続の作業・Gate。検証方法と、決定を見直す条件。
```
