# 公開リポジトリ前提のセキュリティ境界

最終更新: 2026-08-03

## 1. 前提

このシステムは、リポジトリ、URL、API path、入力schema、判定規則、OAuth Client ID、
Cloud Run / Cloudflare の構成概要が第三者に読まれることを前提とする。
コードやroute名を秘密として認証・認可を成立させてはならない。

OAuth Client IDは公開識別子であり、認証用の秘密ではない。管理者メールアドレス、
DB接続文字列、Drive OAuth credential、edge共有secret、operation attestation keyは
実行環境だけに置く。これらを `NEXT_PUBLIC_*`、HTML、JavaScript、Git、ログ、監査metadata、
エラー本文へ出力しない。

## 2. surface別の強制境界

### 利用登録

1. Google ID tokenをサーバーで検証する。
2. 署名、issuer、専用audience、有効期限、`email_verified`、許可Workspace hosted domainを
   すべて満たさないtokenを拒否する。
3. 認証通過後にだけ、所属、在籍区分、学年、学籍番号、規約同意の固定判定を行う。
4. idempotency、request/body上限、pre-auth / submit / status rate limitを適用する。
5. responseとログには名簿全体、他人の申請、token、検索語を含めない。

判定規則自体は秘密情報として扱わない。現行の固定仕様では、許可Workspaceへの所属をGoogleで確認した後、
薬学部・在籍区分・学年・学籍番号はフォーム入力を用いて判定し、大学の正本名簿とは照合しない。
したがって、同じWorkspaceの利用者が公開された規則に合う虚偽入力を行うriskは、コード非公開化では解消できない。
これは管理者認証の迂回とは別の、承認policy上の残余riskとして、identity重複防止、監査、停止・revokeで低減する。
将来これを除去する場合は、大学管理者との連携、正本名簿照合、または人手承認への仕様変更を、運営責任者が
明示承認してから行う。現在の固定判定を暗黙に変更してはならない。

### 管理画面

1. 公開サイトからリンクしない。`robots.txt` / `noindex` は補助であり認可には使わない。
2. Cloudflare Accessをexact-email allowlist・default denyで適用する。
3. Pages Functionは許可したmethod/path/query/headerだけを専用Admin Cloud Runへ転送する。
4. Pages Functionだけがprivate edge secretを注入し、backendはmissing / invalid / duplicateを
   汎用404で拒否する。Production Admin Cloud Runは`/health/live`だけを公開probeとし、
   `/health/ready`、未知pathを含むその他すべてをedge secret → pre-auth limitの順で処理する。
   edge secret不正時はroute解決・DB接続・Google検証へ進まない。
5. 管理用の別OAuth audienceでGoogle ID tokenを検証し、runtime allowlistを完全一致で照合する。
6. PostgreSQLの `google_sub` とactive RBAC行を照合する。画面上のroleやJavaScriptは認可根拠にしない。

Cloudflare Access JWT assertionはedge側の追加制御・監査情報であり、backendの認可根拠にはしない。
backendはprivate edge secret、Google ID token、exact allowlist、DB RBACを独立に検証する。未使用の
Access assertionをoriginへ転送する必要はない。
7. 15分無操作、token expiry、page hide、401でmemory上のtokenと取得済みPIIを破棄する。
8. Admin成功readは内部UUID、固定action、request ID、件数だけを記録する。

### Drive worker

1. public/admin serviceからDrive OAuth credentialを分離する。
2. internal-only Cloud Run、IAM/OIDC、max instance 1、kill switch既定ONを維持する。
3. DB行が指定するDrive targetを信頼せず、worker runtimeの固定targetだけを使う。
4. Drive副作用の直前に、operation/member/application/email/reader role/type/発行時刻/nonceを束縛した
   versioned HMAC-SHA256 attestationと、現在のmember・application承認状態・grant roleを再検証する。
5. 欠損、期限切れ、改変、再利用、target不一致ではDrive APIを呼ばない。revokeはDB上のpermission IDを
   単独で信頼せず、固定target上のattested recipientに対応するlive permissionとの一致を要求する。

## 3. PIIとDB credentialの境界

管理、公開登録、worker、migration、backupは別のNOLOGIN capability roleと別loginを使う。
Admin用DB URLをpublic serviceへ渡さず、public roleからadmin/audit/export権限を外す。
workerはDrive処理に必要な列以外を読めず、識別子や宛先を任意更新できない状態を最終目標とする。

現行local headではpublic API用roleから全`library_*` raw table/column/sequence権限を撤去し、固定schemaの
2本の限定`SECURITY DEFINER` RPCだけを許可する。さらにDB credentialから独立したversioned bearer tokenを
要求し、DBにはprivate schemaのSHA-256 digestだけを保存する。tokenはparameter bindingし、欠落・誤りは
state照会・書込み前に汎用拒否する。したがって公開sourceまたはpublic DB credentialの片方だけでは、raw PIIの
一括取得・登録RPC実行・本人status照会を行えない設計である。

残余gate: 実production相当の専用LOGINで、superuser/owner/CREATEDB/CREATEROLE/BYPASSRLS/replication、
migration/backup/未知role membershipがないこと、raw `SELECT`/`COPY`/`SET ROLE`拒否、token欠落・誤りの
無書込み、正規RPC、同時登録・冪等性を実PostgreSQL証跡化する。それまでは実PII受付のProduction Gateを
PASSにしない。DB credentialとRPC tokenの同時漏えいは残余リスクであり、public ingress停止、token rotation、
DB credential rotation、監査を同時に行う。

## 4. 公開成果物と供給網

- production buildはregistration/adminの両方を明示的にGoogle modeへ固定する。
- `admin-mock-login`、synthetic名簿、preview markerを含む `out/` は公開しない。
- mock buildはloopback HTTP以外で登録用mock操作と管理画面を開けないようruntimeでも拒否し、登録画面は受付停止表示へfail closedする。
- Production Gateは、Git対象sourceと公開artifactを別々に秘密情報scanする。
- `npm run verify:public-source` は、追跡対象と追加予定のテキスト設定を検査し、
  実allowlist、秘密鍵、主要provider credential、個人PCの絶対pathを拒否する。
- 名簿のCSV / Excel / database dumpと、追跡された `out` / `.next` / `outputs` は、
  内容にかかわらず公開source gateで拒否する。
- Terraform stateと実`*.tfvars`も内容にかかわらず拒否し、remote backend以外のstateや
  ローカル実設定を公開repositoryへ置かない。
- `.env.example` / `.dev.vars.example`以外のdotenv、`.netrc`、`.pypirc`が追跡された場合も
  値の見た目にかかわらず拒否する。
- `.next`、`out`、`__pycache__`、trace、dump、backupをsource archiveへ混入させない。
- dependency lockを維持し、production dependency auditとCI結果をrelease証跡へ残す。
- `.github/workflows/library-security-quality.yml` はread-only tokenでsource scan、
  frontend release rehearsal、lock済みFastAPI全試験、PRのdependency reviewを実行する。
  workflowには本番secretを渡さない。
- `.github/workflows/codeql.yml` はJavaScript / TypeScriptとPythonを
  `security-extended` queryで解析する。公開repositoryのstandard hosted runnerだけを使う。
- GitHub Actionsは可変tagではなく40桁commit SHA、Dockerの外部base imageは
  `sha256` digestへ固定する。DependabotでGitHub ActionsとDockerも定期更新する。

## 5. Production Gateでの攻撃者視点テスト

- sourceとrouteを知る未認証者: registration/admin/workerの保護endpointを利用できない。
- 個人Google account: 登録APIのWorkspace gateで拒否される。
- 許可Workspace member: 登録フォームの固定判定を通過した場合だけ自分の申請を作成・確認できる。
- 許可外Google account: Cloudflare Access、backend exact allowlistの両方でAdmin拒否。
- allowlist内だがDB `google_sub` 未登録/disabled: Admin拒否。
- browserからedge secret headerを偽装: Pages Functionまたはbackendで拒否。
- public DB login: Admin table/exportへpermission denied。Drive operationの直接作成・更新不可。
- unsigned/tampered/replayed Drive operation: deadまたは拒否、Drive API call 0。
- 現在のmock `out/` を非loopback hostで配信: 登録用mock操作と管理画面mock loginの両方が不可。
- log/cache/error response: token、secret、氏名、メール、学籍番号、検索語を含まない。

## 6. 秘密の生成・保存・rotation

- 共有secret / attestation keyはCSPRNGで256 bit以上を生成する。
- 値はチャット、issue、PR、Git、Terraform変数ファイルへ貼らず、Secret Managerまたは
  Cloudflare encrypted secretへ直接登録する。
- Secret Manager versionは `latest` ではなく数値でpinする。
- rotation時は新versionでrevisionを作成し、canary後に旧versionを無効化する。
- 漏えい疑い時はworkerを停止し、DB login、edge secret、attestation key、OAuth tokenの順に
  影響範囲を確認してrotationする。旧secret拒否までを復旧完了条件とする。

## 7. GitHub手動Gate

本番反映前にrepository Settingsで次を目視確認する。

- default branchへのforce pushと削除を禁止する。
- pull request、required status checks、conversation resolutionを必須にする。
- 管理者による規則bypassを許容する場合も、Production Cutoverは別の直前承認として記録する。
- Secret scanningとpush protectionを有効にし、open alertが0であることを確認する。
- Code scanningはadvanced setupとして上記CodeQL workflowを使用し、同じ言語のdefault setupを
  二重に有効化しない。high / critical alertが0であることを確認する。
- dependency graph、Dependabot alerts、security updatesを有効にし、high/critical alertを0にする。
- Actions / Cloudflare / GCP secretに最小権限と環境分離を適用し、fork由来PRへsecretを渡さない。
- Production deployment対象commit SHAと、review・CI・artifact検証対象SHAを一致させる。
