# Groups切替前の受入票

対象PR: [#127](https://github.com/genellect/compass/pull/127)

このPRは新規会員向けGroups基盤の追加であり、既存会員の移行ではない。現在は**Implemented, verification pending**。本番へのmerge、migration、Secret追加、Group共有、方式切替は未実施。

## 自動検証

| 境界 | 検証 |
| --- | --- |
| 既存会員の保護 | legacy固定、再申請で方式を変えない、Group処理からの個人ACL作成/削除0件 |
| 資格判定 | 大学OAuthとフォーム判定は既存契約を維持、教職員は手動承認まで追加0件 |
| 容量・冪等性 | PostgreSQL別接続による同時申請、200件予約、800境界、固定shardへの再試行 |
| 停止・回復 | paused Groupでも当人の管理済membershipを削除可能、Group ACLは削除しない |
| 認証通信 | Groups専用OAuth、allowlist、固定HTTPS宛先、APIとtoken更新のtimeoutを制限 |
| 成功判定 | 未確認membership/Drive ACLでは通知を作らない、誤った個別共有へfallbackしない |
| DB | upgrade/downgrade/reupgrade、限定LOGIN権限監査、cutover後の破壊的downgrade拒否 |
| 配信設定 | mock providerで26ケース。既定無効、未確認切替拒否、WorkerだけにGroups Secret、固定version必須 |

初回PR CIではPostgreSQLを含むbackend、依存監査、CodeQL、Cloudflare Previewが成功。追加修正後の最新headのCIをPRのChecksで確認し、古いheadの合格を新headの合格に読み替えない。UI差分はないため全UI検証のローカル重複実行はせず、既存のPR CIを維持する。

## 本番切替までに残る実環境確認

1. **試験Groupの指定**: 大学Workspace上でユーザーが管理できる、既存利用者のいない試験Groupを指定する。新しい有料契約は前提にしない。
2. **G0**: Cloud Identity APIの利用可否、Groups専用OAuth認証、MEMBER追加・参照・削除を確認する。
3. **G2**: 試験用Driveフォルダと試験アカウントで、Group経由の閲覧可/削除後の閲覧不可を実測する。API成功だけで伝播完了としない。
4. **運用Group準備**: 年度別Groupと予備shard、自己加入禁止・名簿非公開の設定、Group reader共有を照合する。既存個人ACLは維持する。
5. **適用内容レビュー**: 本番用catalogue、Secret version、デプロイするimage digest、migrationと現在のDB version、切替時刻をレビューする。機密値はPR・chatへ貼らない。
6. **適用承認後**: migration → 既存会員件数/方式確認 → Worker先行 → producer切替 → 少数の新規申請確認の順で行う。

G0/G2が未完了の間はDraft PRとし、既存の本番個別共有を継続する。大学側制限でAPI操作できない場合も、既存運用に手を加えず保留する。

## 中断と切戻し

- このPRをmergeしなければ、本番API・DB・Driveの挙動は変わらない。
- migration前に新imageを動かさない。schema追加は通常互換だが、未追加列を参照する新imageは旧schemaで動作しない。
- 切替後はproducer flagをoffにして新規Group割当を止められる。既存Group会員は再分類しない。
- Group worker flagをoffにすればGroupキューだけが停止し、既存の個別共有処理は継続する。
- cutover後のschema downgradeは禁止。復旧はforward fixとし、Group ACL・既存個人ACLを削除しない。

詳細な入力形式とコマンドは[新規登録者向けGoogle Groupsアクセス基盤](new-member-group-access.md)を参照。
