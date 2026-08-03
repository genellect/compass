# ADR-0004: Phase 5データベース境界

Status: Accepted  
Date: 2026-07-16

## Decision

- PostgreSQLを唯一の名簿正本とする。
- `members`と`applications`を分離する。
- Google identity、Drive permission、operation、admin audit、import batchを別責務にする。
- FastAPI実行にはNeon pooled connection、Alembicとdump/restoreにはdirect connectionを使う。
- Phase 5では合成データだけを使用する。
- Drive、Gmail、Google認証の外部副作用を無効化する。
- Dockerを開始必須条件にせず、Neon開発branchでPostgreSQL統合テストを行う。

2026-07-19 amendment:

- Docker DesktopのEngine、Compose、Linux container実行を確認した。
- Phase 6以降はPostgreSQL 17 local ComposeとCloud Run用API imageを開発ループへ
  組み込む。ただしNeon pooled/direct、PgBouncer、scale-to-zero、dump/restoreの
  最終統合ゲートは実Neon branchで継続する。

## Consequences

- serverless接続数を抑えられる。
- migration用とruntime用の秘密情報を分離する必要がある。
- Phase 5開始時にNeon開発project/branchの作成が必要になる。
