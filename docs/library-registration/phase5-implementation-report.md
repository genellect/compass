# Phase 5 ローカル実装報告

> **履歴文書:** 実装証跡は保持するが、第二管理者を未完了条件とする記述はADR-0003と`phase-roadmap-v3.md`で廃止済みである。

実施日: 2026-07-16<br>
判定: `PHASE 5 PASS`

## 実装済み

- SQLAlchemy 2.0.51。
- Alembic 1.18.5。
- Psycopg 3.3.4とpool。
- Pydantic Settings。
- SQLiteローカルadapterとNeon pooled/direct接続契約。
- 初期Alembic migration。
- 申請履歴と利用者名簿の分離。
- Google identity、Drive permission、operation outbox。
- 管理者、監査、import/export metadata。
- DB一意制約。
- optimistic locking。
- 冪等登録service。
- Phase 5ローカルAPIとDB health。
- 認証失敗の非保存。
- 不承認申請の90日retention。
- 承認時のDrive operation予約。外部実行はしない。

## テーブル

- `library_members`
- `library_identities`
- `library_applications`
- `library_access_grants`
- `library_operations`
- `library_admins`
- `library_admin_audit`
- `library_import_batches`
- `library_import_rows`
- `library_export_runs`

## 登録処理

```text
Idempotency-Key確認
  -> DBから既存memberを検索
  -> 既存状態をサーバー生成
  -> Phase 3資格判定を再利用
  -> 認証失敗は保存しない
  -> member/applicationをtransaction保存
  -> approvedだけDrive grant/outboxをpending保存
  -> commit
```

クライアントが送る`existingRegistration`は永続化判断に使用しない。

## テスト

合計31件成功。

Phase 4解除介助ツール追加後のリポジトリ全体では35件成功している。

- 既存Phase 3判定・APIテスト14件。
- Neon pooled/direct URL判定。
- pooled接続で未対応startup parameterを渡さないこと。
- 承認登録。
- 同一idempotency key再送。
- 別keyによる登録済み判定。
- 認証失敗の非保存。
- 学籍番号不正の履歴保存。
- 個別確認member。
- 既存情報競合。
- email一意制約。
- optimistic lock。
- Phase 5 API。
- DB health。
- Idempotency-Key必須。
- 外部副作用有効時のAPI拒否。
- migration upgrade/downgrade。
- migrationとmetadataの差分0。
- PostgreSQL方言offline SQL生成。

## PostgreSQL統合結果

- Neon FreeのSingaporeリージョンに合成データ専用projectを作成。
- `phase5-synthetic-gate`を登録・同時実行試験用branchとして作成。
- `phase5-restore-gate`を復旧試験用branchとして作成。
- Neon PostgreSQL 17.10へ接続。
- FastAPIはpooled、Alembic・dump/restoreはdirect接続を使用。
- 接続文字列はWindowsユーザー環境変数だけに保存。
- Alembic `upgrade -> downgrade -> re-upgrade`成功。
- downgrade後の業務テーブルは0件で、管理用`alembic_version`だけ残存。
- 最終revisionは`3ee520dc1b7a`、public tableは11件。
- 4本の別connectionによる同一idempotency key同時登録で、1件作成、
  3件replay、member/applicationは各1件。
- 2本の別connectionによる同一人物・異なるkey競合で、memberは1件だけ。
- 2本の別connectionによる更新でoptimistic lockがstale writeを検出。
- PostgreSQL 18.4 `pg_dump`でcustom-format archiveを作成。
- 空の別branchへ`pg_restore`し、10業務テーブルの件数とAlembic revisionが
  sourceと完全一致。
- 実Neon pooled接続で`GET /phase5/health/db`が200、
  dialect `postgresql`、外部副作用無効を確認。

統合中に、pooled URLへ`statement_timeout`をstartup parameterとして
渡すとNeon PgBouncerが拒否する問題を検出した。pooled URLでは当該startup
optionを省略し、direct URLだけに適用する最小修正を行った。

## ローカル環境上の制約

作業領域内Pythonの`_sqlite3.pyd`がWindows application controlで
ブロックされた。署名済みCodex bundled Pythonから作成した
untracked `.venv-trusted`ではSQLite 3.50.4が利用でき、テストを完走した。

## Phase 5外の継続事項

- Node 22.16.0への統一。
- Phase 4の第二管理者、OAuth引継ぎ、国外保存承認。`hd`実測は2026-07-18に完了。

実個人情報、Google認証、Drive API、Gmail APIは接続していない。
Phase 5はPASSだが、Phase 4のProduction条件が未完了のため、本番個人情報
保存とPhase 6の実Google認証着手は引き続き禁止する。
