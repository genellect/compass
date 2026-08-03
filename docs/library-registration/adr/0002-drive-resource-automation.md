# ADR-0002: Driveリソースと自動化主体

> **履歴上の注意:** 第二管理者に関する決定はADR-0003と`phase-roadmap-v3.md`で置き換えられた。第二管理者は現行のPASS/Production Gate要件ではない。本書は当時の設計経緯としてのみ参照する。

Status: Accepted for design / Production blocked by succession test  
Date: 2026-07-16

## Evidence

- 対象IDはMy Driveフォルダであり、Shared Drive IDを持たない。
- 直接permissionは35件で、reader以外の権限を含む。
- 現在の所有者は共有操作可能。

## Decision

- 新規学生へフォルダの`reader`permissionを付与する。
- 既存のcommenter/writerを自動降格しない。
- 初期自動化主体はフォルダ所有者のOAuthとする。
- Drive標準招待通知を第一候補とする。
- permission作成はoperation keyとDB制約で冪等化する。
- 同一フォルダへのpermission変更は直列化する。

## Production conditions

- OAuth再認可、token失効、担当者交代の手順を実証する。
- 第二管理者を指定する。
- 将来Shared Driveへ移行する場合は別ADRで権限モデルを再定義する。
