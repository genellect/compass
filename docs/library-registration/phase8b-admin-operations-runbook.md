# Phase 8B 管理者運用 Runbook

作成日: 2026-08-01<br>
適用範囲: 未来戦略ライブラリ登録基盤の最小管理者機能<br>
現状態: `LOCAL IMPLEMENTATION / EXTERNAL AUTH AND HUMAN ACCEPTANCE PENDING / PRODUCTION BLOCKED`

## 1. 不変の認証・承認境界

- 一般登録のGoogle OAuthは、署名、`aud`、`iss`、期限、`email_verified`、
  `hd=st.kitasato-u.ac.jp`をFastAPIで検証する。同じ組織の学生・教員は、この第一段階で分岐しない。
- 管理画面は登録用とは別のOAuth audienceとprivate allowlistを使う。初期許可対象は、同一責任者が
  管理する大学Workspace 1件と個人Gmail 1件の合計2アカウントだけである。管理認可では`hd`、
  学生・教員、学部、学年、学籍番号で分岐せず、allowlist外を一律拒否する。
- 正確なメールアドレスとGoogle `sub`は公開repository、build、ログへ置かず、private runtime
  `GOOGLE_ADMIN_ALLOWED_EMAILS`／Secret ManagerとProduction DBだけで管理する。Production allowlistは
  正規化した完全一致メールのCSVとし、未設定、空、重複、不正形式なら起動をfail closedとする。
  初期値は上記2件だけとし、将来追加する場合は運営責任者の明示承認、Secret Manager変更、変更監査、
  実token確認、個別`sub` bootstrapを必須とする。
- OAuth通過だけではDrive Viewerを付与しない。薬学部、区分・学年、学生の場合の
  `PP|PL|MP + 数字5桁`、必須同意、既存登録をサーバーが再判定する。
- `faculty=other`、identity conflict、規約・privacy未同意、無効な学生番号・学年を、
  管理画面から例外承認できるようにしてはならない。
- 管理UIの表示可否は補助である。閲覧、承認、再試行、停止、revokeの全操作をAPIのRBAC、
  楽観ロック、冪等性、監査記録で再検証する。

## 2. 管理者role

| role | 許可する操作 |
|---|---|
| `viewer` | 申請一覧・詳細・処理状態・監査記録の閲覧 |
| `operator` | `viewer`に加え、安全な個別確認の承認・却下、失敗したDrive処理の有限再試行 |
| `admin` | `operator`に加え、利用停止のみ、system-managed permissionの利用停止＋Drive revoke |

一般Workspace利用者は管理者URLを知っていても名簿へ到達できない。Google認証済みであることに加え、
DBの有効な`library_admins.google_sub`とroleが一致しなければAPIが`403`を返す。
初期状態ではowner-controlledな2つの実測`sub`だけを`admin`とし、他のGoogle accountは一律拒否する。
将来追加する場合も運営責任者の明示承認、変更記録、実token確認、個別`sub` bootstrapを必須とする。

## 3. 実装した安全境界

- 管理UIは同一originの`/library-registration/admin/api`だけを呼ぶ。Cloudflare Pages Functionは
  許可したpath・method・query・headerだけを専用admin Cloud Run serviceへ中継し、直接Cloud Run originをclientへ公開しない。
- Pagesのprivate `LIBRARY_ADMIN_API_ORIGIN`はTerraform `admin_api_url`と完全一致させ、公開登録serviceへ
  向けない。public serviceは管理routeを常時404にし、管理者・監査・export表へのDB権限も持たない。
- admin serviceは登録用flag/audience、Drive OAuth、実Drive IDを受け取らず、専用service accountと
  `fsl_admin_runtime`だけを継承した別pooled DB loginを使う。
- Pages encrypted secretとGCP Secret Managerにだけ同一の`LIBRARY_ADMIN_EDGE_SHARED_SECRET`を置く。
  Production管理routeはedge secretを最初に検証し、欠落・不一致・重複を汎用404で拒否する。
- Google token検証前のpre-auth rate limitは1 instance毎分30件である。Terraformの
  `max_instance_count=1`を変更する場合は共有storeまたはedge rate limitを先に導入する。
- Google ID tokenはReactメモリ内だけに保持し、URL、Cookie、localStorage、sessionStorage、
  analyticsへ保存しない。
- 氏名、メール、学籍番号による検索条件はPOST JSON bodyで送信し、query string、ブラウザ履歴、
  Cloud Run request URLへ露出させない。
- 重要操作は8文字以上の空白でない理由、対象IDの再確認、最新`recordVersion`、
  `Idempotency-Key`を必須とする。同一keyを別payloadへ再利用した場合は`409`で拒否する。
- 監査記録には操作、actor role、結果、対象UUID snapshot、理由、request ID、時刻を追記し、
  UPDATE/DELETEを拒否する。Google `sub`、token、メール、学籍番号、Drive permission IDは記録しない。
- 管理者のsession、申請一覧・検索、名簿検索、申請詳細、監査一覧は、成功後だけ
  `admin_read_succeeded` security eventを出す。eventは内部admin UUID、role、固定action、request ID、
  結果件数または対象UUIDだけを含み、検索語、filter、氏名、メール、学籍番号、Google `sub`、token、
  bodyを含めない。拒否・無効route・対象不存在では成功eventを出さない。
- 「利用停止のみ」と「利用停止＋Drive revoke」を分ける。前者は外部permissionが存在しない、
  またはsystem-managedでない場合にもローカル利用停止を成立させる。後者は本システムが作成した
  permissionだけを対象にする。
- workerはDrive grant直前に利用者が`active`であることを再確認し、停止済み利用者へ遅延付与しない。
- retryは`failed`または`dead`だけを対象とし、回数を初期化して有限worker queueへ戻す。
- token期限、15分無操作、tab非表示、`pagehide`、管理API 401で画面をlockし、tokenと表示中PIIを消去する。
  lock後に完了した遅延responseは画面へ反映しない。

## 4. ローカル確認

外部通信をしない合成データモードで確認する。

```powershell
$env:NEXT_PUBLIC_LIBRARY_ADMIN_MODE='mock'
npm.cmd run test:library-registration
npm.cmd run typecheck
npm.cmd run build
npm.cmd run verify
```

`/library-registration/admin/`で次を確認する。

1. 固定の合成adminとして、Excel型の名簿table、申請、監査が表示される。画面にrole切替を置かない。
2. 利用停止のみと、system-managed permissionのrevokeを区別できる。
3. 理由未入力、8文字未満、確認未選択では実行buttonを有効にしない。
4. stale version、権限不足、別payloadでの冪等key再利用はAPI／component testで拒否される。
5. Desktop 1440px、Mobile 390pxでpage全体の横overflowがなく、名簿tableだけが内部横scrollし、
   console warning/errorがない。

mockは画面・契約確認用であり、実Google認証、実DB role、実Drive、production受入の証跡ではない。

## 5. 初期管理者bootstrap（本人による手動ゲート）

2つのowner-controlled accountそれぞれのGoogle `sub`は、本人が正規Google OAuth結果から個別に確認する。値をチャット、Git、
スクリーンショット、shell historyへ貼らず、実行processの環境変数だけに設定する。

```powershell
$env:PHASE8_BOOTSTRAP_GOOGLE_SUB='<verified value in local environment only>'
$env:PHASE8_BOOTSTRAP_ROLE='admin'
$env:PHASE8_BOOTSTRAP_CONFIRM='I_CONFIRMED_THE_VERIFIED_GOOGLE_SUB'
python -m scripts.bootstrap_phase8_admin
```

この手順を2つの異なる実測`sub`について1回ずつ実行し、両方を`admin`にする。production migration／管理用接続を
持つ承認済み実行環境だけを使う。HTTP bootstrap endpointは
作らない。実行結果には生の`sub`ではなく短いfingerprintだけを表示する。完了後は三つの環境変数を
現在のprocessから削除する。

## 6. 本番前に本人が行う操作

1. 最終規約・privacy文面、version、SHA-256、保存期間、削除・照会・incident手順、国外保存を承認する。
2. Google CloudとNeonへ本人としてloginし、review済みplanに限ってSecret Manager入力、migration、
   IAM/Cloud Run/Scheduler反映を承認する。
3. Cloudflare PagesのProduction環境で`NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL=/library-registration/admin/api`、
   `LIBRARY_ADMIN_CANONICAL_ORIGIN=<正規siteのexact HTTPS origin>`、
   `LIBRARY_ADMIN_API_ORIGIN=<Terraform admin_api_urlのexact HTTPS origin>`を設定する。32文字以上のrandom
   `LIBRARY_ADMIN_EDGE_SHARED_SECRET`をPages encrypted secretとGCP Secret Managerの両方へ同値で登録し、
   backend revisionはnumeric versionをpinする。値はチャット、Git、shell historyへ貼らない。
   Preview環境にはadmin API originとedge secretを設定せず、正規origin以外のFunction要求が404となることを確認する。
4. canonical hostとすべての公開aliasの`/library-registration/admin/*`へCloudflare Accessを設定し、
   owner-controlledな2メールだけをAllow、その他をdeny-by-defaultとする。
5. owner-controlledな2アカウントを個別にbootstrapし、両方のroleが`admin`であることと、
   各アカウントのMFA・復旧方法を確認する。その後のreview済みTerraform planでだけ
   `admin_api_activation.enabled=true`と
   `confirmation=I_APPROVED_PRODUCTION_ADMIN_API_AFTER_MFA_BOOTSTRAP_V1`を同時設定する。
6. 正規hostで許可した大学Workspace／個人Gmailの両方が成功し、その他のWorkspace／個人Google accountが
   `403`になることを確認する。
7. Cloud Run origin直叩きがedge secretなしで404、Access未認証のPages routeがedgeで遮断されることを確認する。
   Access通過後もGoogle token不正、allowlist外、DB未登録`sub`を拒否し、pre-auth rate limit、自動lock、
   PII消去を正規hostで確認する。
8. 正規hostからsession、一覧、検索、詳細、監査を実行し、Cloud Loggingの`admin_read_succeeded`に
   内部admin UUID、role、固定action、request ID、件数／対象UUIDだけが記録されることを確認する。
   検索語、氏名、メール、学籍番号、Google `sub`、Authorization／edge secret、request／response bodyが
   記録されていないこと、403等の拒否要求に成功eventがないことも確認する。
9. Cloudflare Access logとCloud Loggingで、時刻・request ID・route・status・許可主体を相関できること、
   401/403/404/429、短時間の大量読取、exportを調査するquery／通知先、保存期間、閲覧権限を確認する。
10. 第二管理者は設けず、PASSまたはProduction Cutoverの要件としない。同一人物の2アカウントに依存する
   single-operator riskを受容し、両アカウントのMFA・recovery、session失効、本人による緊急停止・
   OAuth再認可・復旧手順を確認する。
11. ownerと別viewerで実Drive grant、通知、view、編集拒否、replay、revoke、閲覧拒否、OAuth cleanupを確認する。
12. Limited Pilotの人数、期間、停止条件、連絡先を承認し、人間受入結果を記録する。

Codexは本人のGoogle login、MFA登録、OAuth同意、規約承認、secret値入力、Terraform apply、
production migration、Drive実権限変更、公開、CTA切替を代行完了扱いにしない。

## 7. 異常時

1. Drive副作用を止めるため`worker_drive_activation`を既定standbyへ戻し、緊急時は先に
   Schedulerをpauseする。standby revisionはhealthを維持し、Drive/API/外部副作用をOFF、kill switchを
   ONにし、Scheduler/IAM/Drive secret bindingを除外する。
2. 必要ならpublic APIをread-only revisionへ切り替え、新規登録を止める。
3. request ID、時刻、revision、対象UUID、HTTP statusだけを保存する。PIIやrequest bodyを記録しない。
   管理読取を調査する場合は`admin_read_succeeded`の内部admin UUID、role、固定action、件数／対象UUIDと
   Cloudflare Access logをrequest ID・時刻で照合し、検索語や名簿内容をincident記録へ転記しない。
4. 利用停止が必要なら先に「利用停止のみ」を行い、外部permissionがsystem-managedと確認できた場合だけ
   revokeを実行する。
5. stale versionは再送を繰り返さず、最新詳細を読み直して対象と理由を再確認する。
6. owner OAuthが失効した場合はworkerを停止したまま本人が再認可し、合成operation 1件の成功後に再開する。

## 8. PASS判定

ローカル実装は、Python・TypeScript・build・Docker・mock E2Eが全件PASSし、上記境界がテストで
固定された時点で`PHASE 8B LOCAL PASS`と判定できる。

次が未完了の間は`PHASE 8B PRODUCTION BLOCKED`を維持する。

- 正規hostのGoogle OAuthと一般利用者拒否。
- production Neonの実role・migration・監査trigger。
- owner-controlledな2アカウントの`admin` bootstrap、両方のMFA・recovery、管理者本人の受入。
- Cloudflare Access、Pages proxy変数／encrypted secret、Cloud Run direct-origin拒否、自動lockの正規host E2E。
- 実Drive grant/retry/revokeとincident/復旧drill。
- 規約・privacy・保存期間・国外保存・Limited Pilotの明示承認。
