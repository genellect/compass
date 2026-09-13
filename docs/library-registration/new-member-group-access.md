# 新規登録者向けGoogle Groupsアクセス基盤

更新: 2026-09-13。対象は未来戦略ライブラリのみ。**実装と合成データ検証の記録であり、本番切替済みを意味しない。**

PR・切替前の残作業は[Groups切替前の受入票](group-release-readiness.md)を参照。

## 1. 前提の再確認

- 再調査した最新mainは `5c5f21a81e9f6376f0e5b1ef473fa93236b6378b`。旧作業基線から109コミット進んでいたが、登録APIの差分は依存ライブラリ更新のみだった。
- このmainから独立worktree・`feat/library-new-member-groups-20260913`を作成。ユーザー承認により今回は独立ローカル開発とした。
- 既存登録者の個別Drive権限は維持する。移行・削除・再共有・一括通知は行わない。再申請、学年更新、旧名簿importでも既存会員の方式を変更しない。
- OAuthの大学組織確認と、薬学部・学籍番号・学年・在籍区分による承認判定は変更しない。入学年度の抽出は所属の証明や新たな承認条件ではない。
- 登録UI、管理UI、メール本文、COMPASS Interactive、独立した他サイトは変更しない。

## 2. 実装契約

| 対象 | 方式 |
| --- | --- |
| 既存会員・切替前に初めて作成された会員 | `legacy_individual`、現在の個別共有を継続 |
| 切替日時以降に初めて作成された会員 | `group_membership`、承認後にグループへ追加 |
| PP/PL＋数字5桁 | 先頭2桁から入学年度。例: PP23000 → `ug-2023` |
| MP＋数字5桁 | 例: MP25001 → `master-2025` |
| 教職員などの個別承認案件 | 手動承認された場合のみ `special-approved` |

方式は会員作成時に固定し、PostgreSQLトリガーでも後からの変更を拒否する。グループは最初の割当時に固定し、学年進行で移動させない。

1グループの運用上限は800枠。Googleの公式上限と同一ではない。初期の既存メンバー数（管理者を含む）と、未完了を含むアプリ予約数を数える。上限に達したら、同年度の準備済み次shardへ振り分ける。割当は行ロックと条件付き更新で行い、別connectionの同時実行でも枠を超えない。

初期登録後に人手でメンバーを追加するとDBの予約数には反映されないため、運用用グループへの手動追加は行わない。追加した場合は切替/追加受付を一時停止して台帳と照合する。削除後も枠を自動再利用しない（過少計数を避ける保守的な運用）。枠の回収は今回の対象外。

Googleグループ自体の自動作成は行わない。管理可能な事前作成済みグループのimmutable IDをallowlistへ登録し、DB台帳から自動選択する。グループ不足、API障害、未確認の共有設定では再試行/要対応となり、個別共有への自動フォールバックはしない。

## 3. データと処理

- `library_members.access_strategy`: 会員ごとの固定方式。migrationでは全既存会員をlegacyにする。
- `library_access_groups`: 年度・shard・Google Group ID・メール・容量・予約数。
- `library_group_memberships`: 会員とグループの対応、Google membership名、確認日時、システム作成の確証、削除状態。
- `library_resource_group_grants`: グループ単位のDrive reader権限。共有ACL IDはこの表だけに保存する。
- `library_operations`: `group_membership_add/remove/reconcile`を追加。既存の署名・再試行・イベント起動・15分間隔の障害回復を再利用する。
- `library_access_grants`: 互換性のためグループ利用者にも処理結果の行を持つ。ただし個人のDrive権限IDはNULL、`managed_by_system=false`とし、共有ACLの所有権を表さない。グループの実体は上記専用表が正本。

WorkerはGroupメタデータ、対象GroupのDrive reader ACL、対象メールのMEMBER登録を照合してから成功にする。既存通知outboxを再利用し、成功確認前に登録完了通知を作成しない。重複実行、結果応答の喪失はlookupで収束する。作成した確証がない既存membershipは勝手に削除しない。

停止処理はシステム作成を確認できた当人のmembershipだけを削除する。グループのDrive権限や他会員の権限は削除しない。

**APIの照合成功と、利用者側へのDriveアクセス反映完了は別である。** Google側の伝播遅延はアプリで短縮できない。即時起動でAPI処理を開始するが、実利用者からの閲覧確認が本番切替の必須条件となる。

## 4. 認証・権限

- GroupsはCloud Identity Groups APIを使用。消費者向けGoogle Groupsではなく、APIで管理可能なGroups for Businessのグループが必要。名称はGoogleの機能名であり、この活動が営利事業であることを意味しない。
- 大学Workspaceの設定・グループ管理権限でAPI操作が許可されるかは未確認。契約追加や大学管理者への問い合わせは自動実行しない。
- Groups専用OAuth client/refresh tokenを用意し、既存Drive認証にscopeを追加しない。WorkerのみにSecret Managerの固定versionを渡す。
- scopeは `https://www.googleapis.com/auth/cloud-identity.groups`。実装する操作はallowlist内Groupの参照とMEMBER追加/削除だけ。OWNER/MANAGER昇格、任意Group作成、任意URLへの要求は実装しない。
- public APIには新テーブルの直接SELECT/INSERT/UPDATE権限を与えない。既存の認証付きSECURITY DEFINER RPCだけを拡張する。
- Workerは台帳を読めるが、Group ID・メール・容量・Drive ACLの台帳変更はできない。台帳登録にはmigration権限と明示的な操作が必要。
- 機密値はローカル環境変数またはSecret Managerのみ。台帳JSONも実運用の識別子を含むのでGitへ追加しない。

公式資料: [Cloud Identity Groups](https://docs.cloud.google.com/identity/docs/groups)、[認証とグループ権限](https://docs.cloud.google.com/identity/docs/concepts/auth)、[membership操作](https://docs.cloud.google.com/identity/docs/how-to/memberships-google-groups)。

## 5. 切替ゲートと手順

### G0: 実アカウントのAPI可用性（手動認証が必要）

1. 大学アカウントで管理できる試験Groupを1つ準備する。既存利用者は移さない。
2. 加入申請/自己加入、メンバー一覧の閲覧、投稿の設定を閉じ、メンバー同士へ名簿が露出しないことを確認する。グループの存在を知るだけで加入できる設定にしない。
3. 認証用Google CloudプロジェクトでCloud Identity APIの有効状態を確認し、Groups専用OAuthを認証する。試験用大学アカウントについてlookup・MEMBER追加・readback・削除を確認する。組織ポリシーで拒否されたらここで保留し、本番の個別共有を継続する。
4. Google GroupsのAPIが使えない場合に、ブラウザ操作を本番Workerの代替にしない。

### G1: ローカル・CI合成データ

- migration upgrade → downgrade → reupgrade、既存会員のlegacy維持。
- 実PostgreSQLのAPI/Worker限定LOGINによる処理と、禁止テーブル/列へのアクセス拒否。
- 別connectionからの同時冪等登録、200件の容量予約、800境界、結果喪失時の収束。
- 不明Group、未共有Group、API 403/429/5xx、非MEMBER、通知先行、個別共有へのフォールバックを拒否。
- GitHub Actionsの既存API jobに使い捨てPostgreSQL 17 serviceを追加。本番の接続文字列は使わない。

### G2: 試験Group経由のDrive E2E（人間確認が必要）

1. 本番フォルダとは別の試験フォルダをGroupにreader共有する。
2. 個別ACLが存在しない試験大学アカウントで申請相当処理を行い、Group加入後に閲覧できることを確認する。
3. 当人のmembershipを削除し、Google側反映後に閲覧不可となることを確認する。他会員・Group ACLが維持されることも確認する。
4. 実測の反映時間、使用した方式、合否のみを証跡化する。トークンや名簿は保存しない。

### G3: 本番準備・限定切替（別途実施）

1. 新規受付を切り替えず、schema migrationと既存権限監査を適用する。既存会員のstrategyが全件legacyであることを件数で照合する。
2. 必要年度の本番Groupと予備shardを準備し、対象フォルダに**Group単位のreader**を手動で設定する。既存個人ACLには触れない。
3. `services/library-api`から台帳JSONを検証する。形式は後述。通常実行は読み取りのみ。
   `python -m scripts.group_catalogue PRIVATE_CATALOGUE.json`
4. 照合成功後、承認済みの台帳追加だけを実行する。
   `python -m scripts.group_catalogue PRIVATE_CATALOGUE.json --apply --approve-production-catalogue`
   このCLIはGroup作成、会員追加、Drive権限変更を行わない。
5. Terraformの`group_access`でG0/G2の合格、allowlist、Groups専用Secretの固定versionを設定する。まずworkerのみ有効化し、既存個別処理が継続することを確認する。
6. UTCの切替日時を明示し、`producers_enabled=true`で新規会員の方式選択を有効にする。`GROUP_ACCESS_ENABLED=true`と`GROUP_ACCESS_CUTOVER_AT`がpublic APIへ渡る。
7. 小数件の新規利用者で閲覧・メール・名簿を確認してから通常運用する。

すべてのflagは既定で無効。今回の実装作業ではG0/G2、実データ変更、本番Secret追加、Terraform apply、cutoverを実施しない。

台帳JSONの合成例:

```json
[{
  "group_name": "groups/SYNTHETIC",
  "group_email": "fsl-2026-01@example.test",
  "cohort_key": "ug-2026",
  "shard": 1,
  "capacity": 800
}]
```

CLIは準備時のGroup実人数を予約数へ含める。既存台帳のID・容量・共有ACLを自動上書きしない。

## 6. 障害時・費用・切戻し

- 新たな定期ジョブや有料サービス契約は追加しない。既存Worker起動時にGroups/Drive API要求が増えるため、追加CPU時間・既存Google側quotaの監視は必要。無料を無条件に保証する実装ではない。
- Group未準備、容量枯渇、認証期限切れは既存のoperation再試行/上限到達通知で検知する。容量は人手の事前準備で補充する。
- cutover前のschema downgradeは、group方式の会員が0件の場合のみ許可する。offline downgradeは安全確認不能なので拒否する。
- cutover後の停止は`producers_enabled=false`とする。これ以降に初めて作成される会員だけlegacyになり、既存Group会員の方式は変わらない。
- Group処理の障害なら`worker_enabled=false`でGroupキューだけを止める。個別処理は維持し、復旧後にGroupキューを再開する。Group会員をlegacyに変えて個別ACLを大量作成しない。
- 通常のrollbackではmembership削除、Group ACL削除、既存個人ACL削除を行わない。cutover後はschemaを戻さずforward fixする。

## 7. ローカル検証結果

2026-09-13、独立PostgreSQL 17.6・合成データのみ:

- upgrade/downgrade/reupgrade、限定RPCでの同時冪等登録、限定Worker実行: PASS。
- 別connectionの200件予約: PASS（残り1枠のGroupは800、次Groupは199）。
- 既存会員の固定方式、raw table拒否、台帳更新拒否、DB権限監査: PASS。
- cutover後のdowngrade拒否: PASS。schema versionと合成Group会員201件を維持。
- API回帰416件: PASS。実PostgreSQLを使う2件は通常runではskipし、別runで2件ともPASS。
- Terraform `fmt -check` / `validate`: PASS。backend接続なし、applyなし。
- public-source検査: 668ファイル、検出0件。機密値・本番PIIは使用していない。
- Draft PR #127を作成。初回headのPostgreSQLを含むbackend CIはPASS。最新headの全CIはPR Checksを正本とする。
- Google APIはfake transportで検証。Google側の実加入・閲覧伝播は未検証であり、G0/G2は未完了。
