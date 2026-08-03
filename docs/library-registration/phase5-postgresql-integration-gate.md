# Phase 5 PostgreSQL統合ゲート

> **履歴文書:** PostgreSQL証跡は保持するが、第二管理者をProduction条件とする記述はADR-0003と`phase-roadmap-v3.md`で廃止済みである。

実施日: 2026-07-16  
正式判定: `PASS`

## 1. 判定範囲

Phase 5のPostgreSQL永続化・同時実行制御・バックアップ復旧を、
合成データ専用Neon環境で実証した。

このPASSに含めないもの:

- 実個人情報の保存。
- RLS。
- Google認証。
- Drive/Gmail外部副作用。
- 管理者画面。
- 本番切り替え。

## 2. 実行環境

| 項目 | 実測 |
| --- | --- |
| Neon region | Singapore / `aws-ap-southeast-1` |
| Neon server | PostgreSQL 17.10 |
| Local client | PostgreSQL 18.4 |
| Source branch | `phase5-synthetic-gate` |
| Restore branch | `phase5-restore-gate` |
| Application connection | pooled |
| Migration・backup connection | direct |
| Data | 合成データのみ |
| External side effects | `false` |

接続文字列はWindowsユーザー環境変数
`DATABASE_URL`、`DATABASE_URL_UNPOOLED`、
`FSL_DATABASE_URL_RESTORE_UNPOOLED`へ保存した。
値はGit、文書、テスト出力へ保存していない。

チャットへ手動共有された既存`COMPASS` projectの接続情報は、本試験では
使用していない。新projectのCLI認証、direct接続、pooled接続を再確認し、
既存利用者がいないという明示承認後に旧projectを削除した。現在は
合成データ専用projectだけが残っている。

## 3. Alembicゲート

| 試験 | 結果 |
| --- | --- |
| `upgrade head` | 成功 |
| `downgrade base` | 成功 |
| downgrade後の業務テーブル | 0 |
| downgrade後の残存テーブル | `alembic_version`のみ |
| re-upgrade | 成功 |
| 最終public table数 | 11 |
| 最終revision | `3ee520dc1b7a` |

## 4. 同時実行ゲート

### 同一idempotency key

4本の別connectionから同時登録した。

- 新規確定: 1。
- replay: 3。
- `library_members`: 1行。
- 対象`library_applications`: 1行。

### 同一人物・異なるkey

2本の別connectionから同時登録した。

- 正常確定: 1。
- persistence conflict: 1。
- `library_members`: 1行。
- 重複member: 0。

### optimistic lock

2本の別connectionで同一memberを読み、先行connectionをcommit後、
後続connectionをcommitした。

- backend connectionが別であることを確認。
- 後続更新で`StaleDataError`を検出。
- stale writeは保存されなかった。

## 5. dump/restoreゲート

sourceのdirect接続からPostgreSQL 18.4 `pg_dump`を実行し、
custom-format archiveを作成した。空の別branchへ
`pg_restore --single-transaction --exit-on-error`で復元した。

| 項目 | 結果 |
| --- | --- |
| Dump size | 30.2KB |
| Source revision | `3ee520dc1b7a` |
| Restore revision | `3ee520dc1b7a` |
| 10業務テーブル件数 | 全件一致 |
| members | 2 / 2 |
| applications | 2 / 2 |
| access grants | 2 / 2 |
| operations | 2 / 2 |

dumpのSHA-256はローカル成果物と共に保持する。

## 6. pooled接続互換修正

初回の実Neon pooled接続で、`statement_timeout`をstartup
`options`として渡したため、PgBouncerからunsupported startup parameterで
拒否された。

修正:

- pooled URLではstartup `options`を渡さない。
- direct URLでは既存の`statement_timeout`を維持する。
- pooled/direct判定の回帰テストを2件追加する。

修正後、実Neon pooled接続によるDB healthと同時実行試験が成功した。

参考:

- [Neon connection errors](https://neon.com/docs/connect/connection-errors)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Neon migration with pg_dump and pg_restore](https://neon.com/docs/import/migrate-from-neon)

## 7. 全回帰

- Python: 35 passed。Phase 5 PASS後に追加したPhase 4証跡ツール4件を含む。
- TypeScript: 14 passed。
- TypeScript typecheck: passed。
- Next.js static build: passed。
- `messages`: 4 files preserved byte-for-byte。
- `future-strategy-library`: 33 files preserved byte-for-byte。
- Neon `GET /phase5/health/db`: HTTP 200、dialect `postgresql`。
- uv lock check・locked sync: passed。
- `git diff --check`: passed。
- repository内のNeon credential候補: 0 files。

## 8. 正式判定

Phase 5 PostgreSQL統合ゲートを`PASS`とする。

ただしPhase 4のProduction条件は継続`BLOCKED`である。`hd`実測は
2026-07-18に完了したが、第二管理者、OAuth引継ぎ、国外保存の正式承認が揃うまで、
実個人情報のNeon保存、RLS、Phase 6のGoogle認証、本番Drive権限付与へ
進まない。
