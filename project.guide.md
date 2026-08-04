# 未来戦略ライブラリ 登録基盤プロジェクトガイド

更新日: 2026-08-03
状態: リリース候補 v4（最新main統合済み・matching-HEAD canonical証跡必須・未公開・PRODUCTION BLOCKED）
基準コミット: `origin/main` `7d65cfa230e5d20acbe4b72f971b07b8325827f1`
作業ブランチ: `codex/library-registration-production-prep-20260803`

## 1. この文書の位置付け

このファイルを、未来戦略ライブラリ登録基盤の実装判断における入口とする。
詳細なPhase、PASS GATE、Preview/Pilot/Production Gateは
`docs/library-registration/phase-roadmap-v3.md`を正本とする。過去のPhase報告は
当時の証跡であり、現行構成や公開可否の根拠として単独では使用しない。

本リリース候補は、旧作業ブランチを現在の公式サイトへ直接mergeしたものではない。
独立worktreeへ登録機能に必要なソース、テスト、契約、Docker構成、履歴文書だけを
選別移植し、最新mainを安全に統合してからcanonical gateを再実行する。旧作業ツリーは
比較証跡として保持し、reset、clean、上書きを行わない。

## 2. 目的と非目的

目的は、Googleフォーム、GAS、スプレッドシートで運用してきた利用登録を、次の
監査可能な基盤へ段階移行することである。

```text
公式Next.jsサイト
  -> Google Workspaceアカウント確認
  -> FastAPIによるサーバー再検証・資格判定
  -> PostgreSQLへの冪等登録・監査記録
  -> 非同期workerによるGoogle Drive Viewer権限付与
  -> 認証付き管理者画面・移行・出力
```

作らないもの:

- 汎用フォーム作成基盤。
- 大学の正式な在籍確認システム。
- Excelを正本とする双方向同期。
- OAuthの組織確認だけでDrive権限を付与する経路。
- ブラウザだけで完結する権限判定やDrive操作。

PostgreSQLを正本とし、Google Driveは権限先、旧Google Sheetは読み取り専用の
移行元、Excel/CSVは出力・照合先として扱う。

## 3. 変更禁止の認証・承認境界

以下は固定仕様であり、説明文、テスト手順、アカウント種別の都合だけでは変更しない。

### 第1層: Google OAuth組織ゲート

- Google ID tokenの署名、`aud`、`iss`、`exp`、`email_verified`、`hd`を
  FastAPIで検証する。
- 許可`hd`は`st.kitasato-u.ac.jp`とする。
- 同じ許可`hd`の組織ユーザーは、学生・教員で分岐せず第1層を通過させる。
- 登録画面のGoogle Identity Services chooserには`runtimeConfig.expectedHostedDomain`を`hd`として
  必須で渡し、大学domain外accountを選択候補へ出さない。共通`GoogleSignInButton`を使う他の
  保護surfaceでは、用途ごとの認証契約を維持するため`hd`はoptionalとする。
- chooserの`hd`は利用者補助であり、認可境界にはしない。chooserを迂回したtokenを含め、FastAPIが
  issuer、audience、`email_verified`、`hd`を再検証し、許可domain外accountを必ず拒否する。
- 主識別子は変更可能なメールではなくGoogle `sub`の一方向fingerprintとする。
- 第1層通過はフォーム入場またはSubmit受理条件であり、Drive承認ではない。

### 第2層: フォーム内容によるDrive付与判定

- 所属が薬学部。
- 対象となる在籍区分・学年が入力済み。
- 学生の場合、学籍番号が`PP`、`PL`、`MP`のいずれか＋数字5桁。
- `PP00000`は例示値として拒否する。
- 必須同意が成立している。
- 既存登録との一致・競合を冪等に処理する。
- 教員・大学担当者・博士課程、薬学部以外、非学生メール等は既存の個別確認分岐を
  維持する。

ブラウザの判定表示は説明用であり、最終判定はFastAPIが同じ契約で再実行する。
OAuth第1層の仕様変更を、第2層の削除・緩和・置換理由にしてはならない。

## 4. 現在のリリース基線

### 公式サイト

- 公式サイトはReact / TypeScript / Next.jsの静的exportである。
- `/future-strategy-library/`は現行Next.jsネイティブページであり、旧HTMLコピーではない。
- `/library-registration/`を独立root layoutのプレビュー経路として統合する。
- 登録ページは`noindex, nofollow`とし、解析タグを載せない。
- 現行ライブラリページのCTAは、Production CutoverまでGoogleフォームのまま維持する。
- 登録ページの追加とCTA切替は必ず別コミット・別承認にする。

### 登録UIの最小改装契約

- 登録専用hero、独自header、登録手順indexを置かず、親サイトの`SiteHeader`を再利用する。
  登録routeでは自己参照となる登録CTAだけを非表示にし、header直下を登録見出しとフォームへ直結する。
  公式サイト全体や管理画面を同時に再設計しない。
- H1は「ようこそ、／未来戦略ライブラリへ。」、導入文は
  「必要事項を入力してください。現在は北里大学薬学部生の方を対象としており、登録は3分ほどで完了します。」、
  最初のsection見出しは「大学アカウント認証」とする。
- 文言は利用者が次の行動を理解できる表現を優先する。対象はMy Drive上のfolderであるため、
  UIでは「共有ドライブ」ではなく「Google Drive共有フォルダの閲覧権限」と案内する。
- 可視UIへ「検証」「モック」「Phase」「API」「Preview」「Decision」等の開発・内部判定語を出さない。
  local/test modeの識別は非可視の安全markerと自動testだけで扱う。
- 利用規約と個人情報の説明は折りたたみ、利用規約checkboxは本文を開いた後だけ有効にする。
  submit panelは「登録内容を確認する」CTA一つだけを表示する。
- 利用者が選べるaccount例は大学学生・大学教職員等だけとし、個人Gmailを選択肢へ出さない。
  実Google chooserも登録routeでは許可大学domainを`hd`で指定するが、個人Google accountを
  serverが拒否する認証契約は変更しない。
- 入力状況と不足項目を画面内で確認できるようにするが、表示上の進捗を資格判定や承認結果に
  読み替えない。送信内容、認証、Drive付与可否は従来どおりFastAPI/DBのserver判定を正とする。
- label、必須状態、error/status通知、focus表示、keyboard操作、見出し順、contrastを含むa11yを
  維持する。320px、390px、1440px幅で、横overflow、文言欠け、focus、入力不足表示、二重submitを
  検証する。mobile titleは左右20px、`clamp(1.3rem, 6.5vw, 1.72rem)`、`nowrap`とし、stack後の
  子要素へdesktop用`flex-basis`を残さず、不要な空白やtitle clipを作らない。
- この改装はfrontend presentationだけを対象とし、API payload、認証、資格判定、DB、Drive
  operation、rate limit、冪等性を変更しない。2026-08-02のlocal E2EではDesktop 1440pxの合成学生
  `PP23000`自動承認、規約開閉、Mobile menu、320px/390pxの`scrollWidth=clientWidth`、横overflowなし、
  console log 0件をPASSした。Production external gatesと実Google/Drive人間E2Eは未完了である。

### API・DB・Drive

- FastAPI、SQLAlchemy、Alembic、PostgreSQL/Neon対応コードが存在する。
- Google ID token検証、identity link、冪等登録、optimistic lock、Drive operation
  outbox、有限再試行、revoke、status照会を実装済み。
- Phase 8Aではpublic API、dedicated admin API、private worker、migrationを別surface・別Docker targetへ分離し、
  production fail-closed、request body上限、rate limit、構造化log、Terraform、DB role分離、
  合成データ専用backup/restore手順をローカル実装した。
- Production runtimeの本命はCloudflare Pages静的UI + Cloud Run FastAPI + Neon PostgreSQLである。
  billing/cardは外部Gate直前まで登録せず、Cloud Run spend cap、project alert、通知先、
  `min=0/max=1`、public ingress独立停止を確認しない限りruntimeを作らない。
- workerはNeonの常時wakeを避けるため15分間隔・20件batch・retry 0とする。通常招待開始待ちは
  最大15分、event 200件のbacklog解消目標は3時間以内とし、deployed Pilotで実測する。
- 専用local PostgreSQL 17で合成200登録・最大同時connection 2と、同じ200件の冪等再送を
  完了し、欠落・重複なし、各主要table 200件を確認した。実測時間は最新のmachine evidenceを正本とする。dumpを空の別local DBへ
  restoreし、Alembic `f1a2b3c4d5e6`、11 table、主要row 800、constraint、audit列が一致した。
  これはlocal証跡であり、deployed Cloud Run/Neonの負荷・別Neon branch restore証跡ではない。
- 専用local PostgreSQLに対するPhase 9/10A gateでは、migration、別connection、冪等性に加え、
  export APIの認証・RBAC・CORS・cache禁止・hash・監査・rate limitと、合成fake Driveを使う
  deactivate/grant競合を実DB transactionで検証する。production PostgreSQL、実Drive、実認証の
  証跡には読み替えない。
- 外部副作用は既定OFF、Drive APIは既定OFF、kill switchは既定ON。
- Drive producerは実Drive IDを受け取らず、固定論理aliasと専用HMAC-SHA256 keyで、
  operation/member/application/email/reader role/type/発行時刻/one-time nonceを束縛する。
  workerだけが実Drive IDとOAuth credentialを受け取り、DB上のtarget IDを無視して固定targetへ処理する。
  署名欠損・改変・期限切れ・再利用・target不一致はDrive API call前にdeadとし、手動retryは
  現在状態を再検証して新nonce・新署名を発行する。attestation keyはedge/worker認証/DB/OAuth secretと共用しない。
- ローカル専用Phase 5 APIも既定OFFとし、Docker/.envで明示した場合だけ有効にする。
- 実Google Drive E2Eは未完了であり、本番フォルダIDと本番資格情報を設定しない。

### 旧名簿移行

- Phase 9は、Google Form response、管理Sheet、Drive permissionの三snapshotを扱う
  private migration jobとしてローカル実装した。public API、worker、browserからraw dataを
  uploadするrouteは作らない。
- exact file hash、version付きHMAC row fingerprint、normalized row/aggregate hash、
  Drive resource fingerprint、raw/normalized分離、dry-run、admin承認、冪等apply、
  lineage付きrollback、1〜3650日の固定可能な保持値（既定90日）とlegal holdを実装した。
- ambiguous role、faculty欠損、email・学籍番号競合、Drive/名簿不一致を推測で補完せず、
  `manual_resolution`としてskipする。
- 既存Drive permissionは`already_granted`、`managed_by_system=false`として記録するだけで、
  Drive operation、招待、削除、通知メールを発生させない。
- 合成PostgreSQLではmigration downgrade・再upgrade、別connection 2 workerの同時apply、
  冪等性、rollback・re-import、raw payload改変拒否をPASSした。実snapshotは未取得であり、
  データ取扱承認、同一基準時刻snapshot、人間dry-run承認、production applyはPENDINGである。

詳細は`docs/library-registration/phase9-implementation-report.md`と
`docs/library-registration/phase9-legacy-migration-runbook.md`を正本とする。

### 管理者機能

- `/library-registration/admin/`に`noindex, nofollow`の管理者UIを実装した。通常buildは
  合成データだけを使うmock modeで、Google modeは公開Client IDとAPI URLの明示設定を要する。
- 管理UIへのリンクは、公開サイトのheader、footer、navigation、CTA、sitemapに置かない。
  URLを非表示にすることや`noindex`は認可ではないため、ProductionではCloudflare AccessとAPI認可を併用する。
- 公開repositoryの全コード、管理URL、OAuth Client ID、Cloud Run hostが攻撃者に既知でも成立する設計とする。
  フロントエンドの表示制御、難読化、`robots.txt`、URL非掲載を認可根拠にしない。
  詳細なthreat model、秘密情報区分、攻撃者視点testは
  `docs/library-registration/public-repository-security-boundary.md`を正本とする。
- Production管理UIは同一originの`/library-registration/admin/api`だけを呼び、Cloudflare Pages Functionが
  許可済みpath・method・query・headerだけをCloud Runへ中継する。`public/_routes.json`もこのproxy globだけを
  Function対象へ含め、管理画面全体や全siteをwildcardにしない。
- Pages Productionの`LIBRARY_ADMIN_CANONICAL_ORIGIN`は正規site origin、private
  `LIBRARY_ADMIN_API_ORIGIN`はTerraform `admin_api_url`と完全一致させる。Preview環境へadmin private bindingを渡さない。
  public登録serviceへ管理proxyを向けず、public surfaceは管理routeを常時404にする。
- public、admin、workerは別のCloud Run service account、別のpooled DB LOGIN、別のcapability roleを使う。
  public roleは管理者・監査・export表へアクセスできず、admin roleにも登録申請を新規作成する権限を与えない。
- 現行local headはpublic roleの全`library_*` raw table/column/sequence権限を撤去し、登録・冪等再送と
  本人status確認を、固定schema・固定signatureの2本の`SECURITY DEFINER` RPCだけへ限定する。
  RPCはDB URLから独立した32–512 byte tokenを要求し、DBには`fsl_private`内のSHA-256 digestだけを保存する。
  tokenはSQL/logへliteral展開せず、parameter bindingし、欠落・不一致を汎用拒否する。public loginは
  superuser/owner/migration/backup/未知role membershipとraw PII権限をreadinessで拒否する。
- source公開だけではtokenもDB credentialも得られない。ただし実PII投入前に、専用public LOGINだけを使った
  実PostgreSQL試験でraw `SELECT`/`COPY`/`SET ROLE`拒否、token欠落・誤りの無書込み、正規RPC、同時登録・冪等性を
  証跡化する。この実環境証跡がない間は、ローカル静的/unit試験が通過してもProduction Gateを`BLOCKED`のまま維持する。
- Pages encrypted secretとGCP Secret Managerだけに同一の`LIBRARY_ADMIN_EDGE_SHARED_SECRET`を保存し、
  Cloud RunはProduction管理要求をedge secret → pre-auth rate limit → Google認証の順に検証する。
  `/health/live`だけを公開probeとし、`/health/ready`・未知pathを含む全pathでsecret欠落・不一致・重複を
  route解決・DB接続・Google検証前に同一の汎用404とする。Admin startup/liveness probeは`/health/live`を使う。
- Cloudflare Access JWT assertionはedge補助gate・監査情報であり、backendの認可根拠にしない。
  backendはedge secret、Google ID token、exact allowlist、DB RBACを独立検証し、不要なassertion転送は行わない。
- 管理pre-auth rate limitは`max_instance_count=1`の間は1 process毎分30件とする。scale-outする場合は
  共有storeまたはCloudflare側rate limitを導入するまで上限変更を認めない。
- APIはGoogle認証に加え、DBの有効な`library_admins.google_sub`で`viewer`、`operator`、
  `admin`を照合する。UIの操作非表示だけを認可根拠にしない。
- 管理APIは登録用とは別のGoogle OAuth audienceだけを受け付ける。Productionでは両Client IDの
  重複を起動前に拒否し、全管理routeでserver-sideの署名・audience・期限・`email_verified`・admin `sub`を
  再照合する。旧`/phase6/admin/authorization`も管理専用認証境界へ統合する。
- 初期管理者許可リストは同一責任者が管理する大学Workspace 1件と個人Gmail 1件の
  2アカウントだけとし、それぞれの実Google `sub`をcreate-only bootstrapした後、両方を`admin`とする。
  正確なメールアドレスと`sub`は公開repositoryへ置かず、`GOOGLE_ADMIN_ALLOWED_EMAILS`／Secret Managerで管理する。
  Production allowlistは正規化した完全一致メールだけを受け付け、未設定、空、重複、不正形式はfail closedとする。
  初期値は上記2件に限定する。将来追加する場合は本人の明示承認、Secret Manager変更、変更監査、
  実token確認、個別`sub` bootstrapを要する。
  管理認可ではdomain、学生・教員、学部、学年、学籍番号による分岐を作らず、上記以外は同じ
  Workspace利用者を含め一律拒否する。将来の追加は運営責任者の明示承認と個別`sub`登録を要する。
- 承認・却下・retry・deactivate・revokeは、管理API本体と別の既定OFF
  `ADMIN_MUTATIONS_ENABLED`で停止できる。OFF時は認証やDB接続より前に404とする。
- Production readinessはAlembic headだけでなく、実LOGIN名、runtime capability role、
  schema CREATE、管理者表変更、監査改変、migration/backup兼任等の実効DB権限を検査し、
  owner接続や過剰権限をreadyにしない。
- 申請一覧・詳細、PII検索用POST、監査一覧、承認・却下、有限retry、利用停止のみ、
  system-managed Drive permissionの利用停止＋revokeを実装した。
- 重要操作には、空白除去後8文字以上の理由、楽観lock用version、対象member ID再確認、
  `Idempotency-Key`を要求する。同じkeyの異なるpayloadは`409`で拒否する。
- adminのdeactivate/revokeとworker grantは同じmember rowを`SELECT FOR UPDATE`し、workerは
  Drive lookup前とcreate直前に`populate_existing`でactive状態を再確認する。production
  PostgreSQLでの同時競合試験は外部ゲートとして残す。合成fake Driveと専用local PostgreSQLを
  使うAPI/race gateは、外部副作用なしで両方の順序を検証する。
- accepted mutationは操作者role、対象UUID、理由、request ID、時刻とともに監査tableへ追加する。
  production DB roleで監査tableのUPDATE/DELETEを許可しない設計だが、production Neonでの
  実権限監査は未完了である。
- 管理sessionはGoogle token期限、15分無操作、tab非表示、`pagehide`、管理API 401で即時lockし、
  token、名簿、申請、監査、検索語、操作理由、export記録をメモリから消去する。lock後の遅延responseも破棄する。

管理URL自体を上記2メールだけへ見せるedge access policy、両アカウントのMFA・recovery、repository/deploy権限、
正規hostでの人間E2Eはコード外のProduction Gateであり、未完了の間は`PRODUCTION BLOCKED`を
維持する。詳細は`docs/library-registration/admin-access-security-boundary.md`を参照する。

第二管理者はPASSまたはProduction Cutoverの要件としない。2アカウントが同一人物に属する
single-operator構成であるため、本人不在や両アカウント同時失効時に第三者が即時復旧できないriskを
運営責任者が受容する。両アカウント個別のMFA・recovery確認と緊急停止手順で低減する。

### CSV/XLSX名簿出力

- Phase 10Aは、PostgreSQL snapshotから固定14列のCSV/XLSXをserver memory内で生成する
  admin専用機能としてローカル実装した。file本体をserver、DB、Driveへ保存しない。
- `viewer`と`operator`を拒否し、admin、allowlist済みの固定利用目的コード、確認checkbox、
  `Idempotency-Key`を必須とする。export requestに自由記述理由を持たせず、free-text/PIIを
  監査metadataへ保存しない。他の管理操作の理由入力はこの変更の対象外である。
- CSV formula injection防止、XLSX inline text、macro・formula・external linkなし、
  SHA-256再照合、追記専用export監査を実装した。
- 1回最大5,000 rows、service上限10 MiB、1 process同時1件、adminごと毎時12回、
  download推奨削除30日を初期限界とする。
- `PHASE10A_EXPORT_API_ENABLED`は既定OFFである。保管・暗号化・再共有・削除方針、
  正規host admin OAuth/MFA、production DB role、実Excel受入はPENDINGである。

詳細は`docs/library-registration/phase10a-implementation-report.md`と
`docs/library-registration/phase10a-export-runbook.md`を正本とする。

### ローカルpre-Production統合ゲート

- `scripts/library-local-preproduction-gate.ps1`を、外部サービス統合前のcanonical local gateとする。
- source integrity、frontend全回帰、production-shaped frontend rehearsal、production用三Docker target、
  Terraform format/validate、Python全回帰、Phase 9/10A PostgreSQL API/race、合成200件負荷、
  dump/restore、Docker cleanupを一連で検証する。
- frontend rehearsalはRFC 5737予約originと合成OAuth Client IDだけでproduction artifactのfail-closedを
  確認し、終了時に明示的なmock buildへ戻して合成値の残留がないことを検証する。
- このゲートはローカル・合成データ専用である。実OAuth、Cloudflare、Cloud Run、Neon、Drive、
  人間E2E、規約・個人情報承認、Git公開を実施もPASS扱いもしない。
- 実行結果の正本は`outputs/library-registration/local-preproduction-gate.json`とし、
  pre/postのHEAD、source manifest、worktree status fingerprintを別保存する。clean worktree、
  `status=pass`、`source_integrity_unchanged=true`、全step成功、cleanup成功を確認した実行だけを
  local gate PASSとする。

### 公開状態

このブランチはローカルのみで、push、Cloudflare Pages公開、Cloud Run公開、Neon本番変更、
Google OAuth設定変更、billing/card登録は行っていない。Phase 8A/8B/9/10Aの判定は
`LOCAL IMPLEMENTATION PASS`であり、クラウド、実Drive、人手承認を含むProduction PASSではない。

### 準0円・課金制御

- 年間500件、event日最大200件、同時2件を設計負荷とする。
- 通常月額目標は`$0–$0.36`（約0–54円）。exact 12 secretsの安全境界を維持するため、
  無料6超過の6 active versions、約`$0.36/月`（約54円、150円/USD換算）は受容する。
  public RPC tokenの追加限界費用は約`$0.06/月`、rotation中の一時13 versionsは約`$0.42/月`とする。
- Cloud Run spend cap初期提案は`$0.20/月`、project alerts-only budgetは`$1/月`。
  consoleの利用可否・最低額と本人の許容額を直前確認し、承認なく増額しない。
- spend capはPreviewで反映遅延、in-flight、Cloud Run外費用が残る。数学的な超過ゼロ保証とは
  呼ばず、public ingress停止、Drive停止、API read-only、Google Form rollbackを重ねる。

### 現行ローカル証跡

- 最小UI改装後のlocal E2Eは、Desktop 1440pxの学生happy path、規約開閉、Mobile menu、320px/390pxの
  title・横overflow、console log 0件をPASSした。これは合成データのローカル証跡であり、
  正規host、実Google認証、実Drive、人間受入の証跡ではない。
- Python全回帰、frontend全回帰、typecheck、build、静的export検証の最新結果は、固定件数ではなく
  各Phase報告とcanonical local gateの実行証跡を正本とする。
- Phase 9/10A専用Docker gateでmigration downgrade・再upgrade、3 source rows、
  同時apply worker 2、member/permission重複0、Drive operation 0、rollback・re-import、
  raw/export監査の改変拒否、CSV hash、XLSX生成、export API、deactivate/grant競合を検証する。
- ローカル自動ブラウザ試験の成否にかかわらず、正規host、実Google認証、実Drive、実Excelを使う
  外部Edge人間E2EはPENDINGであり、Production Gateを満たさない。

## 5. ディレクトリと保護境界

主要配置:

```text
src/app/(library)/library-registration/  登録ページroute
src/library-registration/                UI・ブラウザ契約・API client
services/library-api/                    FastAPI・DB・worker基盤
contracts/library-registration/          TS/Python共通判定case
docs/library-registration/               ADR・証跡・ロードマップ
compose.library-dev.yaml                 合成データ専用Docker環境
```

`COMPASS Interactive` の作業ディレクトリは別プロジェクトであり、
読取り、編集、Docker resource共有、network共有、volume共有、port再利用を行わない。
衝突時はCOMPASS Interactiveの保護を優先し、本プロジェクト側を停止・変更する。

Docker resourceは`fsl-registration-dev-*`と
`com.compass.project=future-strategy-library-registration`で識別する。Docker Desktopの
global prune、既存network/volumeの削除、他projectのcompose操作は禁止する。

## 6. ローカル環境

### Frontend

```powershell
npm.cmd install
npm.cmd run test:library-registration
npm.cmd run typecheck
npm.cmd run build
npm.cmd run verify
```

通常buildは`NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE=mock`を使用する。Google統合は
ローカル環境変数に公開Client IDとローカルAPI URLを明示したときだけ有効にする。
ID token、client secret、refresh token、DB URLをプロンプト、Git、画面証跡へ貼らない。

production-shaped rehearsalは外部通信と実credentialを使わず、最後にmock buildへ戻す。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-frontend-production-rehearsal.ps1 -Action Run
```

### API

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-docker-dev.ps1 -Action Validate
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-docker-dev.ps1 -Action Test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-docker-dev.ps1 -Action Phase9Phase10Test
```

外部サービス統合前のcanonical local gateは次を使用する。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-local-preproduction-gate.ps1 -Action Validate
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-local-preproduction-gate.ps1 -Action Run
```

Docker環境は合成データ専用である。実氏名、実メール、実学籍番号、実Drive IDを入れない。
停止は本composeだけを指定する。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-docker-dev.ps1 -Action Down
```

volume削除は試験データ廃棄を意図し、対象名を確認した場合だけ実行する。

## 7. 秘密情報と個人情報

- root `.env`、service `.env`、Google credential JSON、token、証跡`outputs/`をGit管理しない。
- フロントへ渡してよいのはOAuth Web Client ID、API base URL、許可`hd`だけである。
- Client secret、refresh token、DB接続文字列、worker credentialを`NEXT_PUBLIC_*`へ置かない。
- 本番secretはSecret Manager等から注入し、ソース、Cloudflare static bundle、CI logへ残さない。
- ID tokenはブラウザメモリだけに保持し、localStorage、URL、analyticsへ渡さない。
- application logへ氏名、メール、学籍番号、token、Drive permission IDを平文出力しない。
- 保存期間、削除、照会、漏えい時対応、国外保存の承認を実PII投入前に確定する。

## 8. リリース方式

公開は三段階とする。

1. Preview: routeをnoindexで追加するが、CTAはGoogleフォームのまま。実PIIと本番Driveを
   使用しない。
2. Limited Pilot: 招待した少人数だけで本番同等経路を検証する。Googleフォームを
   即時rollback先として維持する。
3. Production Cutover: 全Production Gate通過後、別コミットでCTAを新導線へ切り替える。

公開commitには、route統合、インフラ設定、CTA切替を混在させない。各段階で
Cloudflareのcanonical URL、desktop/mobile、console、CSP、OAuth、API、DB、Drive、
rollbackを実環境確認する。

## 9. 次の作業順

1. 最新mainを統合し、clean HEADでcanonical local gateを再実行してsource不変と全回帰を固定する。
2. Phase 7B: 空のテストフォルダで実Drive grant/view/replay/revoke/cleanupを人が確認する。
3. Phase 8A費用・外部ゲート: billing/cardはこの直前まで延期し、本人承認後にCloud Run spend cap、
   project alert、notification channelを先に設定する。review済みplanに限ってCloud Run/IAM/Scheduler/Secret Managerを反映し、
   production Neonのrole・migration・rotation、deployed 200件/2同時負荷、別Neon branch restoreを実証する。
4. Phase 8B外部ゲート: 許可した2アカウントの`admin` bootstrap、正規host OAuth、全未許可Google利用者拒否、
   両アカウントのMFA・recovery、
   外部Edgeと正規hostでの管理UI受入、production PostgreSQL同時競合、停止・復旧drillを実施する。
5. Phase 9実データgate: データ取扱方針を承認し、同一基準時刻snapshot、読み取り専用
   rehearsal、全差分の人間承認、production apply・rollback訓練を行う。
6. Phase 10A本番gate: 出力の保存・暗号化・再共有・30日以内削除を承認し、正規hostの
   admin OAuth/MFA、DB role、実Excel受入を確認してからfeature flagを有効にする。
   VBA変更取込は必要性確認後にPhase 10Bとして別設計する。
7. PreviewとLimited Pilotを別々に承認・実測する。
8. Production Gate通過後に、別commitでCTAを切り替える。旧Google Form/GAS停止も別承認とする。

第二管理者は準備せず、Production Cutoverの必須条件にも含めない。実Drive E2Eは所有者と別viewerで
実施する。管理運用は同一責任者の2アカウントに限定し、両方のMFA・recovery、OAuth再認可、
管理API・worker・公開導線の緊急停止を本人が確認する。single-operator riskは明示的な残余riskとして残す。

## 10. 現在の正式判定

- Historical Release Baseline: `PASS`。2026-08-01時点の証跡は
  `docs/library-registration/release-baseline-verification-2026-08-01.md`を参照するが、現在候補の
  canonical PASSへ読み替えない。
- Phase 7: `LOCAL PASS / REAL DRIVE E2E PENDING`。
- Phase 8A: `LOCAL IMPLEMENTATION PASS / CLOUD AND MANUAL GATES PENDING / PRODUCTION BLOCKED`。
- Phase 8B: `LOCAL IMPLEMENTATION PASS / EXTERNAL AUTH AND HUMAN ACCEPTANCE PENDING / PRODUCTION BLOCKED`。
- Phase 9: `LOCAL IMPLEMENTATION PASS / REAL SNAPSHOT AND HUMAN APPROVAL PENDING / PRODUCTION BLOCKED`。
- Phase 10A: `LOCAL IMPLEMENTATION PASS / DATA-HANDLING AND PRODUCTION AUTH GATES PENDING / PRODUCTION BLOCKED`。
- Local pre-Production Gate: 実装済み。正式結果は
  `outputs/library-registration/local-preproduction-gate.json`の`status=pass`、`head_commit`が現在HEAD、
  `source_integrity_unchanged=true`、cleanup PASSを同時に満たす証跡だけとする。source commit後は
  過去PASSを無効として必ず再実行する。
- Cost Gate: local fail-closed実装済み。billing、spend cap、project alert、通知到達は未実施。
- Preview Gate: 未判定。公開承認とホスト実測が必要。
- Pilot Gate: BLOCKED。
- Production Cutover Gate: BLOCKED。

Phase 8A/8B/9/10AのローカルPASSは、Terraform apply、production migration、secret入力、
実Drive権限変更、公開、規約承認、管理者本人受入を完了扱いにしない。詳細な未完了条件と
証跡様式は`docs/library-registration/phase-roadmap-v3.md`を参照する。
