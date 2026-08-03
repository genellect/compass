# Phase 8B 最小管理者運用 実装報告

作成日: 2026-08-01  
判定: `LOCAL IMPLEMENTATION PASS / EXTERNAL AUTH AND HUMAN ACCEPTANCE PENDING / PRODUCTION BLOCKED`

## 1. 判定の範囲

本報告のPASSは、合成データを用いたローカルコード、API contract、静的export、unit/integration testの
範囲に限る。Google Cloud、Cloudflare、Neon production、Google OAuth正規host、実Google Drive、
初期管理者、MFA、規約・privacy承認、Limited Pilot、CTA切替は含まない。

Phase 8Aのplatform資産についても、ローカル実装と静的・Docker・DB role試験は完了しているが、
Terraform apply、production migration、secret rotation、別Neon branch restoreは未実施である。

## 2. 実装した管理者surface

### Frontend

- `/library-registration/admin/`を静的Next.js routeとして追加し、`noindex, nofollow`を設定した。
- 通常buildは合成データだけのmock modeとし、Google modeは同一originの
  `NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL=/library-registration/admin/api`と管理専用の公開OAuth Client IDの
  明示設定を必要とする。管理UIへCloud Run originをcompileしない。
- Production buildでは登録用と管理用のOAuth Client IDを分離し、同値を拒否する。確認用data moduleは
  compile-timeで空実装へ置換し、生成された全HTML/JavaScriptを禁止markerについて走査する。
- 申請一覧、filter、詳細、Drive状態、監査一覧、roleに応じた重要操作UIを実装した。
- 氏名・メール・学籍番号の検索語は`POST /admin/v1/applications/search`のJSON bodyへ入れ、
  URL queryへ入れない。
- ID tokenはReact stateからAPIへBearer tokenとして渡し、client実装はCloudflare AccessのHttpOnly Cookieを
  同一origin Pages Functionへ届けるため`credentials: "same-origin"`、`cache: "no-store"`を使用する。
  Pages FunctionはCookieをCloud Runへ転送しない。Google tokenをlocalStorage、sessionStorage、Cookieへ
  書き込む処理はない。
- token期限、15分無操作、tab非表示、`pagehide`、管理API 401で自動lockし、token、名簿、申請、監査、
  検索語、操作理由、export記録をメモリから消去する。lock後に完了したresponseは破棄する。

### Edge proxy

- `functions/library-registration/admin/api/[[path]].ts`が、管理APIの正確なpath・method・query・headerだけを
  Cloud Runへ中継する。request 64 KiB、response 12 MiBを上限とし、redirect、利用者からのedge header、
  Cookie、CORS、`Set-Cookie`、server headerを拒否／除去する。
- Cloudflare Pages encrypted secretとGCP Secret Managerだけに同一の
  `LIBRARY_ADMIN_EDGE_SHARED_SECRET`を置く。ProductionのCloud Run管理routeはedge secret欠落・不一致・
  重複をGoogle検証より前に汎用404で拒否する。
- Google検証前のpre-auth rate limitは1 instance毎分30件で、Terraformの`max_instance_count=1`を前提とする。
  scale-outには共有storeまたはedge limiterを先行させる。

### API

実装したrouteは次のとおり。

| method | route | 最小role | 用途 |
|---|---|---|---|
| GET | `/admin/v1/session` | viewer | DB上の管理者role確認 |
| GET | `/admin/v1/applications` | viewer | 非PII filterによる一覧 |
| POST | `/admin/v1/applications/search` | viewer | PII検索語をbodyで送る一覧検索 |
| GET | `/admin/v1/applications/{id}` | viewer | 申請・member・Drive・operation詳細 |
| POST | `/admin/v1/applications/{id}/decision` | operator | 許可された個別確認の承認・却下 |
| POST | `/admin/v1/operations/{id}/retry` | operator | failed/dead operationの再queue |
| POST | `/admin/v1/members/{id}/deactivate` | admin | ローカル利用停止 |
| POST | `/admin/v1/members/{id}/revoke` | admin | 利用停止とsystem-managed Drive revokeのqueue |
| GET | `/admin/v1/audit-events` | viewer | 監査記録一覧 |

`PHASE8_ADMIN_API_ENABLED`は既定OFFである。一般Workspace利用者はGoogle認証を通過しても、
有効な`library_admins.google_sub`がなければ管理APIを利用できない。
管理APIは登録用とは別のOAuth audienceだけをserver-sideで受け付ける。承認・却下、retry、
deactivate、revokeはさらに既定OFFの`ADMIN_MUTATIONS_ENABLED`を通過しなければ404となる。
production public surfaceはflag状態にかかわらず`/phase6/admin/authorization`と`/admin/v1/*`を
組み込まない。管理routeは専用admin surfaceだけに存在し、初期管理者bootstrap、
MFA、正規host review後、Terraformのexact confirmation付きactivation objectでだけ有効化する。

## 3. RBACと状態変更の安全条件

| role | serverが許可する操作 |
|---|---|
| `viewer` | session、一覧、検索、詳細、監査の読取り |
| `operator` | `viewer`に加え、安全な個別確認の承認・却下、failed/dead operationのretry |
| `admin` | `operator`に加え、利用停止、system-managed permissionの利用停止＋revoke |

重要mutationは次をAPIで再検証する。

- 空白除去後8文字以上、500文字以下の理由。
- 最新の`recordVersion`による楽観lock。
- deactivate/revokeでの対象member ID再入力。
- 8文字以上の`Idempotency-Key`と、actor・scope・request bodyのfingerprint。
- 同じkey・同じpayloadはreplayし、同じkey・異なるpayloadは`409`で拒否する。
- `faculty=other`など固定資格条件を満たさない申請は、管理者操作でも承認しない。
- unmanagedまたは存在しないDrive permissionをrevokeしない。

ローカル利用停止では、pending/failedの`drive_grant` operationを`dead`、
`error_code=member_inactive`へ変更し、対応する未完了grantをfailedにする。adminのdeactivate/revokeと
worker grantは同じmember rowを`SELECT FOR UPDATE`する。workerはDrive permission lookup前とcreate直前に
`populate_existing`で`member_status=active`を再読込みする。これらの競合補強はローカル対象testを通過した。
production PostgreSQL上の同時停止・running operation競合試験は未実施であり、本番PASS条件として残す。

## 4. 監査

accepted mutationは`library_admin_audit`へ次を追記する。

- `admin_id`、実行時role、action、result。
- member/application/operationのUUID snapshot。
- 理由、request ID、作成時刻。
- expected version、request fingerprintなどの非PII metadata。

専用admin runtime用DB権限は監査tableの`SELECT`と`INSERT`だけを許可し、`UPDATE`と`DELETE`を許可しない
SQL・audit scriptを実装した。Google `sub`、token、メール、学籍番号、Drive permission IDは
監査rowへ複製しない。

2026-08-02の追加hardeningでは、Production readinessが実LOGIN名と実効権限を照合し、owner接続、
schema CREATE、管理者表変更、監査・export履歴改変、migration/backup兼任、public/worker兼任を
拒否するようにした。初期管理者bootstrapもcreate-onlyとし、既存管理者の再有効化・昇格には使わない。

現時点で`library_admin_audit`へ保存するのはaccepted mutationである。認証拒否、RBAC拒否、validation
拒否は同tableへbusiness eventとして追記せず、PIIを含めないHTTP route template、status、request IDの
platform logで観測する設計である。production DBでの権限拒否とlog/alert受信は外部ゲートに残る。

2026-08-03の追加hardeningで、session、申請一覧・検索、名簿検索、申請詳細、監査一覧の成功後に、
`admin_read_succeeded` structured security eventを追加した。eventは内部`admin_id` UUID、実行時role、
固定action、request ID、結果件数または対象UUIDだけを持つ。Google `sub`、メール、氏名、学籍番号、
検索語、filter、token、request／response bodyは含めない。route無効、認証・RBAC拒否、対象不存在、
validation失敗、内部errorでは成功eventを出さない。これはplatform上の読取検知を補強するもので、
既存mutation／exportのappend-only DB監査契約は変更しない。

## 5. ローカルテスト証跡

2026-08-01に現行worktreeで次を再実行した。

| 検証 | 結果 |
|---|---|
| frontend Community/Contact | 57 tests PASS |
| frontend Library registration/admin | 53 tests PASS |
| frontend release-gate | 8 tests PASS |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run build` | Next.js 16.2.11 production static build PASS |
| `npm.cmd run verify` | 登録・管理者preview routeとdeployment asset検証PASS |
| host Python全回帰 | 197 tests PASS |
| 隔離Docker開発image内Python全回帰 | 197 tests PASS |
| Phase 8B admin deactivate/revoke・worker grant競合の対象suite | 22 tests PASS |
| local PostgreSQL API/race gate | deactivate先行、grant先行＋revokeともPASS |

確認範囲にはRBAC、固定資格条件、PII search body、
`drivePermissionManaged`、理由validation、楽観lock、冪等payload不一致、unmanaged revoke拒否、
deactivate時の未完了grant取消、subject rate-limit拒否時のglobal quota非消費、surface分離、
production fail-closed、Terraform/DB role/backup資産contract、同一member row lock、Drive lookup前・
create直前のactive再確認が含まれる。

buildは`/library-registration/admin/`を静的生成した。ローカル合成ブラウザE2Eでは1440px/390pxの
登録・管理画面で横overflowなし、console error 0、viewerのexport非表示、adminの目的選択・確認gate、
CSV受領票と削除期限表示を確認した。in-app browserではobject URLの実file保存eventとTab/Enterの
合成操作を確証できないため、実保存・keyboardを含む人間E2EはPENDINGである。正規host、実Google
sign-in、実Drive、production database、通知、MFAもこの証跡に含まれない。

ブラウザ証跡は
`outputs/019f6667-2a38-7ef0-8ac0-3b3e0e24065e/browser-e2e/phase9-phase10a-browser-e2e.json`、
統合証跡は`outputs/library-registration/local-preproduction-gate.json`を正本とする。

### 2026-08-02 追加hardening後の再検証

| 検証 | 結果 |
|---|---|
| frontend Community/Contact | 57 tests PASS |
| frontend Library registration/admin | 57 tests PASS |
| frontend release-gate | 16 tests PASS |
| frontend typecheck・static build・route/asset verify | PASS |
| host Python全回帰 | 238 tests PASS |
| Production-shaped frontend rehearsal | 50 HTML/JavaScript、登録用OAuth参照1、管理用OAuth参照1、管理preview marker 0 |
| rehearsal後のlocal preview復元 | 51 text artifacts、rehearsal値0、mock build PASS |
| Desktop/Mobileブラウザ監査 | page overflow 0、390pxで表の内部横scroll 0→403px、console warning/error 0 |

最新のfrontend rehearsal証跡は
`outputs/frontend-production-rehearsal/20260802T144820855Z/evidence.json`である。Desktop/Mobile画像は
`outputs/ui-audit/`へ保存した。Docker Desktop CLIはこの時点で検出できなかったため、過去のDocker証跡を
今回の再検証結果として読み替えない。上記はローカル証跡であり、Production受入ではない。

### 2026-08-03 管理読取security event補強

`test_admin_read_security_events.py`で、6種類の管理読取成功時に固定action、内部admin UUID、role、
request ID、件数／対象UUIDだけが出ることを確認した。検索語、氏名、メール、学籍番号、Google `sub`、
token、bodyの非混入と、route無効／RBAC拒否時に成功eventが出ないことも固定した。
追加後のhost Python全回帰は274 tests PASSである。
Cloud Loggingへの実配送、Cloudflare Accessとのrequest ID／時刻相関、保存期間、alert通知は
Production外部ゲートに残る。

## 6. 残る手動・外部ゲート

次を全て完了するまでPhase 8Bをproduction PASSにしない。

1. 本人がGoogle Cloud、Neon、Google OAuthへloginし、review済み設定だけを反映する。
2. production migration/管理用接続から`bootstrap_phase8_admin.py`を一度だけ実行し、初期管理者を作る。
3. Productionの`GOOGLE_ADMIN_ALLOWED_EMAILS`をprivateな完全一致allowlistとし、初期値はowner-controlledな
   大学Workspace／個人Gmailの両方を異なる`sub`の`admin`として確認する。その他のWorkspace／個人Google
   accountは一律`403`にする。
4. Cloudflare Pages proxyのorigin／encrypted secret、GCP側の同値numeric secret version、canonical hostと
   全公開aliasのAccess policyを設定する。Cloud Run direct-origin管理要求がsecretなしで404となることを確認する。
5. 両アカウントのMFA・recoveryを確認し、本人が停止・再認可・復旧できるようにする。
   第二管理者はPASSまたはProduction Cutoverの要件とせず、single-operator riskを残余riskとして受容する。
6. ownerと別viewerで実Drive grant、通知、閲覧、編集拒否、replay、retry、deactivate、revoke、cleanupを
   確認する。
7. production Neonでrole audit、監査UPDATE/DELETE拒否、accepted mutationの追記を確認する。
8. 正規hostの管理readをCloud Loggingで確認し、`admin_read_succeeded`のPII非混入、拒否時の成功eventなし、
   Cloudflare Accessとの相関、異常読取・exportの調査query／通知先を確認する。
9. 外部Edgeで管理画面をDesktop/Mobile、keyboard、再認証、stale、通信失敗、pre-auth rate limit、
   token期限、15分無操作、tab非表示、401 lock、PII消去まで人が確認し、正規hostでも同じ受入を行う。
10. 規約、privacy、保存期間、削除・照会、国外保存、incident連絡先、Pilot条件を責任者が承認する。

## 7. ロールバック

外部applyをまだ行っていないため、現時点のロールバック先は現行Googleフォームである。
公式ライブラリCTAは変更しない。

Preview/Pilot以降に異常が起きた場合は次の順とする。

1. Drive kill switchをONにし、Schedulerをpauseして外部副作用を止める。
2. public APIをread-onlyにする。管理APIだけを止める場合は`PHASE8_ADMIN_API_ENABLED=false`の
   revisionへ戻し、監査rowは削除しない。
3. CTAを承認済みGoogleフォームへ戻し、新規導線を閉じる。
4. request ID、時刻、revision、対象UUID、HTTP statusだけを保存し、PII、token、Drive ID、bodyを
   証跡へ残さない。
5. database変更が関係する場合はwriteを再開せず、backupを取得して別branchへrestore・照合する。
   migration downgradeはdata lossをreviewし、承認済みjobから一段ずつ実施する。
6. 復旧後は合成operation、管理者read、管理mutation、実Drive 1件の順に確認し、Scheduler、public write、
   CTAの順で再開する。

Phase 8Bは既存の管理者tableを利用しており、この実装だけを理由とする新規schema migrationはない。
したがってUI/APIの撤回時に監査tableや既存recordを削除しない。

## 8. 最終判定

Phase 8Bの最小管理者UI・API・RBAC・accepted mutation監査・安全条件は、合成データのローカル範囲で
実装と対象testを完了した。判定は`LOCAL IMPLEMENTATION PASS`である。

クラウド反映、実host認証、production DB権限、実Drive、人手受入、規約承認は未完了である。
従って全体判定は引き続き`PRODUCTION BLOCKED`であり、公式CTAを切り替えない。
