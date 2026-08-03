# 未来戦略ライブラリ 管理画面アクセス保護境界

Status: `LOCAL IMPLEMENTATION PASS / EXTERNAL ACCESS GATE PENDING / PRODUCTION BLOCKED`
Date: 2026-08-03

## 1. 結論

管理画面のURL、Reactの表示制御、メールアドレスだけを認可根拠にしない。Productionの名簿データは、次の全層を通過した要求にだけ返す。

1. Cloudflare Accessの正確な管理route policy
2. 同一origin Pages Functionのpath・method・header allowlist
3. PagesとCloud Runだけが共有する非公開edge secret
4. Google署名検証より前の管理API pre-auth rate limit
5. 管理専用Google Web OAuth Clientが発行対象となるID token
6. Google署名、issuer、audience、期限、`email_verified`、完全一致メールallowlistのサーバー検証
7. PostgreSQLの`library_admins.google_sub`に存在する、明示的に許可された有効な管理者
8. endpointごとの`viewer`、`operator`、`admin`権限
9. 更新操作では、独立した既定OFFのmutation gate
10. Production runtimeのLOGIN名と実効DB権限のreadiness検査

URLを知っていること、画面を表示できること、大学Workspaceに所属することだけでは、管理データへアクセスできない。

### 初期管理者許可リスト

Productionで最初に許可するのは、同一の運営責任者が管理する2つのGoogleアカウント
（大学Workspace 1件、個人Gmail 1件）だけである。正確なメールアドレスと`sub`は個人情報を含むため、
公開repositoryやbuild成果物へ記載せず、Productionの`GOOGLE_ADMIN_ALLOWED_EMAILS`／Secret Managerだけで管理する。
Production値は正規化した完全一致メールの明示allowlistとし、未設定、空、重複、不正形式ならfail closedとする。
初期値は上記2件だけとする。将来追加する場合は運営責任者の明示承認、Secret Manager変更、変更監査、
実token確認、個別`sub` bootstrapを必須とする。

両アカウントは、管理専用OAuthで個別に署名・audience・期限・`email_verified`を検証し、実測した
異なるGoogle `sub`をcreate-only bootstrapした後、どちらも`admin` roleとする。メールアドレスは
bootstrap対象とCloudflare Access許可リストの照合に使うが、APIの継続的な認可キーは`sub`とする。

管理画面の認可ではWorkspace domain、学生・教員、学部、学年、学籍番号による分岐を作らない。
現段階では上記2アカウント以外を、同じ大学Workspaceの利用者を含め一律拒否する。将来の追加は運営責任者の
明示承認、変更記録、実token確認、個別`sub` bootstrapを必要とし、domain一致やメールパターンから
自動追加しない。

## 2. 実装済みの防御

### 管理専用OAuth audience

- 一般登録は`GOOGLE_OAUTH_CLIENT_IDS`を使う。
- 管理APIは`GOOGLE_ADMIN_OAUTH_CLIENT_IDS`だけを使う。
- Productionでは両者のClient IDが一つでも重複したら起動設定を拒否する。
- フロントエンドにも管理専用の公開Client IDだけを渡す。Client secretやID tokenはstatic bundle、Git、ログへ保存しない。

### 公開repositoryを前提としたedge境界

- 管理UIは同一originの`/library-registration/admin/api`だけを呼ぶ。Cloud Run originを管理UIへcompileしない。
- Cloudflare `_routes.json`は`/library-registration/admin/api/*`だけを管理Functionへ渡し、管理画面全体や全siteを
  wildcardでFunction化しない。
- Pages Functionは許可済みpath・method・query・request headerだけをCloud Runへ転送し、64 KiBを超えるrequest、
  12 MiBを超えるresponse、redirect、利用者が送ったedge header、Cookie、CORS・`Set-Cookie`・server headerを拒否／除去する。
- Cloudflare Accessのassertion headerはedgeでの配信制御にだけ用い、未検証のままCloud Runへ転送しない。
  backendはこのheaderを認証・認可根拠にせず、Google署名検証・exact allowlist・DB `sub` RBACを必須とする。
- `LIBRARY_ADMIN_API_ORIGIN`は正確なHTTPS originだけを許可する。`LIBRARY_ADMIN_EDGE_SHARED_SECRET`は
  Cloudflare Pages encrypted secretとGCP Secret Managerにだけ同じ値を置き、`NEXT_PUBLIC_*`、Git、build、logへ置かない。
- `LIBRARY_ADMIN_CANONICAL_ORIGIN`は正規公開originだけに固定し、Pages Functionはrequest originが
  完全一致しないPreview alias・branch alias・別hostを汎用404で拒否する。Preview環境へ本番admin secretを設定しない。
- `LIBRARY_ADMIN_API_ORIGIN`はTerraformの`admin_api_url`出力と完全一致させる。登録用public serviceを
  管理proxyのoriginとして再利用しない。
- ProductionのCloud Run管理surfaceは`/health/live`以外の全path（`/health/ready`と未知pathを含む）で、
  edge secretが欠落、不一致、重複した要求をroute解決・DB接続・Google token検証より前に汎用404で拒否する。
  したがって公開コードからCloud Run URLやheader名を知っても、secret値なしでは管理APIへ到達できない。
- さらに、Google token検証前のpre-auth rate limitを1 instanceあたり毎分30要求とし、Terraformの
  `max_instance_count=1`と組み合わせる。将来scale-outする場合は共有storeまたはCloudflare側rate limitへ移行するまで上限を増やさない。
- 公開情報として扱えるのはOAuth Client IDと同一origin API pathだけである。管理者メール、Google `sub`、edge secret、
  DB URL、Drive credential、token、名簿は公開情報として扱わない。
- `/health/live`だけをCloud Run startup/liveness probeに使う。保護された`/health/ready`は正しいedge secretを
  通過した運用確認だけが呼び、pre-auth limit後にDB revisionと実効roleを検査する。
- `CF-Access-Jwt-Assertion`はCloudflare側の補助gate・監査情報であり、backendの認可assertionとして採用しない。
  backendはedge secret、Google ID token、exact allowlist、DB RBACを常に独立検証する。不要ならoriginへ転送しない。

### server-side RBAC

- 管理者の主識別子はGoogle OIDCの不変な`sub`とする。
- `library_admins`のメール一致、フロントエンドのrole値、非表示ボタンは認可根拠にしない。
- 全`/admin/v1`要求でサーバーが有効な管理者行とroleを再照合する。
- 初期状態では上記2つの実測`sub`だけを有効な`admin`として登録し、他はdeny-by-defaultとする。
- 専用admin runtime roleだけが`library_admins`をSELECTでき、INSERT、UPDATE、DELETEできない。
  public runtime roleは`library_admins`、`library_admin_audit`、`library_export_runs`へ一切アクセスできない。
- 初期管理者bootstrapはcreate-onlyとし、既存管理者の再有効化や昇格には使えない。

### PIIを残さない管理読取security event

- `/admin/v1/session`、申請一覧・検索、名簿検索、申請詳細、監査一覧は、認証・RBAC・読取処理が
  すべて成功した後だけ`admin_read_succeeded`をstructured logへ出す。
- eventに含めるのは内部`admin_id` UUID、実行時role、固定action名、request ID、返却件数、
  詳細対象の内部UUIDだけである。Google `sub`、メール、氏名、学籍番号、検索語、filter値、token、
  request／response bodyは記録しない。
- route無効、Google認証拒否、RBAC拒否、対象不存在、validation失敗、内部errorでは
  成功eventを出さない。拒否系はPIIを含まない既存HTTP route template／status／request IDと
  Cloudflare Accessのedge証跡で観測する。
- このeventは読取検知用のplatform security logであり、accepted mutation／exportの
  append-only DB監査を置き換えたり変更したりしない。

### 更新操作の独立停止

- `ADMIN_MUTATIONS_ENABLED`の既定値はOFFとする。
- OFF時は承認、却下、再処理、利用停止、権限取消のrouteを404にする。
- ProductionでONにするには、管理API本体の有効化とは別の確認文字列を要求する。
- 一覧、詳細、名簿、監査の読み取りと、更新操作の停止を分離する。
- 名簿出力もさらに独立したPhase 10A gateを持つ。

### Production DB実効権限の検査

Productionの`/health/ready`は、接続確認とAlembic headに加えて、実際の`current_user`と実効権限を検査する。

- 設定したLOGIN名との不一致を拒否する。
- owner、admin、superuser、migration、backup相当の権限を拒否する。
- schema CREATE、管理者表の変更、監査・export履歴の変更／削除、移行表の読み取りを拒否する。
- public API roleとworker roleの兼任を拒否する。
- admin role、public API role、worker roleは互いに兼任せず、各Cloud Run serviceへ別のLOGINと
  pooled接続secretを割り当てる。
- 必要な最小権限が一つでも不足する場合もreadinessを失敗させる。

これにより、誤ってNeon owner接続文字列をruntimeへ渡したrevisionをreadyにしない。

### Production成果物

- ローカル確認用データはProduction build時に空実装へcompile-time置換する。
- Production verifierは`out`配下のHTMLとJavaScriptを全走査し、確認用データやmarkerの混入を拒否する。
- 最終的な認可は常にAPI側で行い、成果物分離だけをセキュリティ根拠にはしない。
- 実メール、credential形式、接続文字列、合成確認markerをsourceと`out`の両方でrelease testが走査する。

### 画面離脱時のPII消去

- Google ID tokenの`exp`、15分無操作、tab非表示、`pagehide`、管理APIの401で管理画面を即時lockする。
- lock時はtoken、名簿、申請、監査、検索語、操作理由、export記録をメモリから消去する。
- lock後に完了した遅延responseは世代番号で破棄し、PIIを画面へ復元しない。

## 3. コードだけでは保証できない境界

正規のProductionデプロイ権限を持つ人物が、認証処理を削除した別コードへ差し替えることまで、同じコード自身で完全に防ぐことはできない。したがってProduction Gateでは、コード外でも次を必須とする。

- repositoryの書き込み権限、branch protection、review、CI、デプロイ権限を最小化する。
- Production secretをGit、ローカル共有ファイル、静的bundleへ置かない。
- Cloudflare側で管理URLに現行private allowlistと同じ初期2メールだけを許可するAccess policyを設定し、
  明示承認されていないアカウントへページ自体を公開しない。
- 2つの所有者管理Googleアカウントの双方でMFA、recovery、失効手順を人が確認する。
- Production image digest、設定値、DB LOGIN role、readiness結果をリリース直前に照合する。
- 公開サイトのheader、footer、navigation、CTA、sitemapから管理URLへリンクしない。

Cloudflare Access等のedge policyが未設定でもAPIデータはedge secret、Google完全一致allowlist、DB RBACで拒否されるが、
「管理画面の存在自体を許可者だけへ見せる」要件はedge設定が完了するまでPENDINGとする。
`noindex`は検索エンジン向けの指示であり、アクセス制御ではない。`robots.txt`と公開導線からの
リンク除外も発見性を下げるだけで、認可には使わない。

第二管理者はPASS条件またはProduction Gate要件としない。2アカウントが同一人物に属するため、
運営責任者の不在、両アカウントの同時失効、端末喪失時に第三者が即時復旧できないsingle-operator riskを
受容する。このriskは、両アカウントそれぞれのMFAとrecovery確認、管理API・worker・公開導線の停止手順、
緊急時にCloudflare/GCP/Neonを本人が停止できることの確認で低減するが、消滅はしない。

## 4. ローカル確認画面の扱い

ローカルのmock modeはUI確認専用で、合成データしか持たず、Production API、Production PostgreSQL、実Driveへ接続しない。
画面上のrole選択は置かず、固定の合成admin表示とする。Production buildには確認用データを含めない。

実PIIを表示する管理画面をmock modeや通常のNext.js development serverへ接続してはならない。

## 5. Production手動ゲート

本番有効化前に、運営責任者が次を順番に確認する。

1. 登録用とは別の管理用Google Web OAuth Clientを作成する。
2. 管理画面の正規HTTPS originだけをAuthorized JavaScript originsへ登録する。
3. `NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL=/library-registration/admin/api`を設定し、Cloudflare PagesのProduction環境へ
   正規site originと一致する`LIBRARY_ADMIN_CANONICAL_ORIGIN`、Terraform `admin_api_url`と一致する
   `LIBRARY_ADMIN_API_ORIGIN`、encrypted `LIBRARY_ADMIN_EDGE_SHARED_SECRET`、
   GCP Secret Managerへ同じedge secretの
   numeric versionを登録する。値はチャット、Git、shell historyへ貼らない。
   Preview環境にはこれら2つのprivate admin bindingを登録しない。
4. Cloudflare Accessをcanonical hostとすべての公開aliasの`/library-registration/admin/*`へ設定し、上記2メールの
   完全一致だけをAllow、その他をdeny-by-defaultとする。Pages Function pathの迂回aliasがないことも確認する。
5. 管理用Client IDをフロントとAPIへそれぞれ公開設定として入力し、両者が一致することを確認する。
6. 上記2アカウントを別々に認証し、それぞれの実Google `sub`をdirect migration／管理接続から
   create-only bootstrapして、両方を`admin` roleとして登録する。
7. 上記2アカウントの正系と、一般Workspace利用者・未許可の個人Googleアカウント・無効管理者の
   401/403を正規hostで確認する。
8. Cloud Run originを直接呼んだ管理要求がedge secretなしで汎用404、Pages proxyがAccess未認証時に遮断、
   Access通過後もGoogle token不正・allowlist外・DB未登録`sub`が拒否されることを確認する。
9. Production runtime LOGINがownerではなく、readinessの実効権限検査をPASSすることを確認する。
10. 毎分30回のpre-auth制限、token期限、15分無操作、tab非表示、401での自動lockとPII消去を正規hostで確認する。
11. 正規hostで各管理読取を1回ずつ実行し、Cloud Loggingへ`admin_read_succeeded`が届くこと、
    内部admin UUID・role・固定action・request ID・件数／対象UUID以外の検索語・氏名・メール・
    学籍番号・Google `sub`・token・bodyが存在しないことを確認する。拒否要求には成功eventがないことも確認する。
12. Cloudflare AccessとCloud Loggingの保存期間、閲覧権限、401/403/404/429、異常な読取件数・exportを
    調査するquery／通知手順を確認する。
13. 両アカウントのMFA・recovery、緊急停止、復旧、監査、Desktop/Mobileの人間E2Eを完了する。
14. 必要な期間だけ管理mutation、名簿出力を個別に有効化する。

これらが完了するまでは、ローカル自動試験がPASSしていても`PRODUCTION BLOCKED`を維持する。
