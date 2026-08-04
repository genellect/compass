# 未来戦略ライブラリ登録基盤 Production Gate 引継書

作成日: 2026-08-02／最終整合日: 2026-08-03（Asia/Tokyo）
対象: 未来戦略ライブラリの独自登録UI、API、管理画面、Drive権限処理、名簿移行・出力<br>
基準main: `origin/main` / `7d65cfa230e5d20acbe4b72f971b07b8325827f1`
統合branch: `codex/library-registration-production-prep-20260803`
移植済み履歴HEAD: `280c8cc722e1b23e3a57fc2e45b8f4d55d039357`
今回の本番直前整備差分は未コミットであり、承認されたrelease commitとmatching-HEAD証跡を得るまでProductionへ使用しない。
総合判定: `LOCAL STATUS = MATCHING-HEAD MACHINE EVIDENCE / BILLING DEFERRED / PRODUCTION BLOCKED`

## 1. 本書の目的

本書は、ローカル実装済みの登録基盤を、本番へ安全に反映するまでの順序、責任境界、停止条件、証跡を一つにまとめた引継書である。ローカルtestや静的buildの成功を、Google Cloud、Neon、Google Drive、Cloudflare Pages、Google OAuth、実PIIを含む本番受入の成功と混同しない。

次の原則はProduction Cutover完了まで変更しない。

- 現行`/future-strategy-library/`の登録CTAは、既存Googleフォームを指し続ける。
- `/library-registration/`はnoindexの独立routeとして先に検証し、CTA切替は別commit・別承認にする。
- route統合、Cloud/DB基盤反映、CTA切替、旧Googleフォーム/GAS停止を一つのcommitや一つの承認に混在させない。
- Google OAuthの第一段階は、Googleが署名したID tokenの`aud`、`iss`、期限、`email_verified`、組織domainをserver側で確認する。`hd` query hintだけを認可根拠にしない。
- 同一組織の学生・教員をOAuth入口で別分岐しない。一方、Drive権限付与の固定判定は、フォーム入力の所属、学籍番号`PP|PL|MP + 数字5桁`、学年、学生・教員区分等をserver側で維持する。
- secret、token、password、database URL、OAuth client secret、refresh token、Drive resource ID、実利用者PIIをGit、chat、screenshot、console log、Terraform変数fileへ記録しない。
- COMPASS Interactiveのrepository、worktree、container、network、volume、port、database、secret、deploymentには触れない。競合の疑いがあれば本作業を停止し、COMPASS Interactiveの保護を優先する。

## 2. 現在のローカル状態

| 項目 | 現在状態 | 判定上の意味 |
|---|---|---|
| 最新main取込 | `ce06cd7`を`966f71b`で統合済み | final source commit後にcanonical gateを実行する |
| Frontend unit・typecheck・static build・export verify | PASS | ローカルartifactのcontractのみPASS |
| 最新Future Strategy Library検証 | PASS | 6 section、canonical copy、4つのGoogleフォームCTA、header/mobile、画像assetの検証を保持 |
| Docker image | `public`、`worker`、`migration`の分離build PASS | image push、Artifact Registry digest、本番起動は未証明 |
| Terraform | fmt、`init -backend=false`、validate、provider-mock activation test PASS | GCS backend、実plan、実applyは未実施 |
| Cloudflare Preview guard | local test PASS | Cloudflare本人認証とPreview uploadは未実施 |
| PostgreSQL / DB bootstrap | 修正commit済み・個別回帰PASS | clean最終HEADのcanonical gateへ統合待ち |
| Canonical local preproduction gate | matching-HEAD JSONだけを正本とする | source commitごとに再実行。過去FAIL/PASSを流用しない |
| Cost controls | local fail-closed実装済み | billing、spend cap、project alert、通知到達は未実施 |
| Production external gate | 未実施 | GCP、Neon、Drive、Cloudflare、GitHub、正規host、人間E2Eは未承認 |

最新mainを統合したclean sourceに対するcanonical全回帰がPASSするまで、branchをPreview公開候補またはProduction候補として固定しない。途中の過去証跡は設計参考であり、最新sourceの正式PASS証跡ではない。

## 3. 操作主体と承認境界

### 3.1 Codexが自律実行できる範囲

- source、test、runbook、Terraform plan前資産のローカル検査。
- 合成データだけを使うunit、integration、browser、Docker、PostgreSQL、backup/restore rehearsal。
- secret値を読まないGCP preflight、Git差分、build artifact、hashの検査。
- 本人認証後かつ直前承認後の、明示されたbranch・Preview・plan等の限定操作支援。
- sanitized evidenceの生成とPASS/HOLD/BLOCKED判定。

### 3.2 本人による明示操作または直前承認が必要な範囲

- GitHub、Google Cloud、Google OAuth、Neon、Cloudflare、Drive ownerとしてのlogin、MFA、OAuth同意、規約同意。
- カード/billing有効化、Cloud Run spend cap、project alert、data location・保存期間・利用規約・privacy・通知先・費用停止線の承認。
- secret payloadの作成・貼付、Drive folderの目視確認、Viewerの受信・閲覧・revoke確認。
- `terraform apply`、migration job実行、production role変更、image push、Preview/Production deploy、実Drive side effect、実PII移行、CTA切替。
- owner-controlledな大学Workspace／個人Gmailの双方での本人login、MFA、recovery、失効・復旧受入。

本人がloginする画面では、Codexは遷移・入力箇所の案内まで行い、password、MFA code、OAuth code、recovery code、tokenを取得・表示・保存しない。

## 4. 本番反映の厳密な順序

順序を飛ばさない。各GateでFAILまたは証跡不足があれば、それより後を開始しない。ただし、外部認証待ちの間に、外部状態を変えない別のローカル検証は継続できる。

### Gate 0: source freezeとDB bootstrap完了

1. DB bootstrap修正を完了する。
2. migration接続が意図したroleでDDLを実行し、新規table、sequence、function、schemaの所有者が`fsl_migration`へ統一されることを確認する。
3. runtime loginがowner、DDL、role変更、raw import table、監査UPDATE/DELETE等の権限を持たないことをaudit SQLで確認する。
4. role操作を順に実施する場合は、各一回の操作に対応する確認値だけを一時環境変数へ設定する。
   - bootstrap: `FSL_DATABASE_ROLE_CONFIRM=apply-bootstrap`
   - bind: `FSL_DATABASE_ROLE_CONFIRM=apply-bind`
   - grant: `FSL_DATABASE_ROLE_CONFIRM=apply-grant`
   - audit: `FSL_DATABASE_ROLE_CONFIRM=apply-audit`
5. 各操作後に確認値を削除する。connection stringやpasswordをshell history、chat、証跡へ出さない。
6. DB bootstrap関連test、backend全pytest、migration upgrade/downgrade/re-upgrade、同時登録、冪等性、optimistic lock、backup/restoreを再実行する。

停止条件:

- object ownerがlogin userやdatabase ownerのまま残る。
- runtime roleがDDL、role継承、監査改変、raw snapshotの不要権限を持つ。
- migration履歴の書換え、downgrade不能、restore不一致、PII混入がある。

### Gate 1: canonical local preproduction gate

DB修正を含む最終sourceに対して、次を一回のcanonical gateとして実行する。

1. clean worktreeのsource integrity pre-check、HEAD、source manifest、status fingerprint生成。
2. frontend全test、typecheck、production build、static export verify。
3. Future Strategy Libraryの最新copy、responsive asset、GoogleフォームCTA不変を確認。
4. production-shaped frontend rehearsalを外部通信なしで実行し、最後にmock artifactへ復元。
5. `public`、`worker`、`migration` imageを非root・read-only前提でbuild・test。
6. Terraform fmt、offline-backend init、validate、activation-contract test。
7. PostgreSQL 17で年間基準500件、event日最大200件、同時2件の合成負荷、冪等性、競合、backup/restoreを確認。
8. source integrity post-check、pre/post HEAD・manifest・status fingerprint一致、Docker cleanup、port・container・network確認。

PASS条件:

- 最終evidenceの`status=pass`。
- pre/post HEAD・source hash・file count・worktree status fingerprint一致、`source_integrity_unchanged=true`。
- 外部Google、Drive、Neon production、Cloud Run、Cloudflare、実PIIへ接触していない。
- COMPASS Interactiveへの参照・変更がない。

このPASSは`LOCAL PASS`であり、Preview、Pilot、Production CutoverのPASSではない。

### Gate 2: 人間方針承認

本人が次を文書単位で承認し、versionとSHA-256を固定する。

- 利用規約、privacy notice、個人情報の利用目的。
- Neon/GCPのdata location、保存期間、削除、backup、incident時の扱い。
- Drive folderの対象範囲とowner責任。
- export fileの暗号化、保管先、再共有禁止、30日以内削除、削除記録。
- 通知受信者、通常月額`$0–$0.30`目標、Cloud Run spend cap初期`$0.20`、project alert初期`$1`、quota停止線、残余risk、連絡先。
- Preview、Limited Pilot、Production Cutoverの対象人数、期間、成功条件、停止条件。
- 同一人物の2アカウントに依存するsingle-operator riskと、本人不在・両アカウント同時失効時の停止条件。

### Gate 3: GitHub release branch

1. 本人がGitHubへloginし、CLIまたはbrowserの認証を完了する。tokenや認証codeをchatへ貼らない。
2. release manifestへ固定した最新`origin/main`と当branch HEADの差分を再確認する。
3. route/UI、backend/infra、runbookをreviewし、secret scanと`git diff --check`を実施する。
4. Cloudflare generic production deployがPreview guardを迂回できないこと、build後にもGit HEADとclean状態を再確認することを検証する。
5. 本人がpush/PR公開を直前承認した後だけ、branchをpushしDraft PRを作成する。
6. GitHub上のdiff、check、base branch、公開範囲を本人が確認する。

このGateではmerge、Production deploy、CTA切替を行わない。

### Gate 4: GCP課金制御、read-only preflight、基盤容器

カード/billingはこのGate直前まで登録しない。本人が対象project、支払方法、停止方法、残余riskを
承認した後、Cloud Run spend capとproject alerts-only budgetを先に設定し、その後read-only
preflightを実行する。

確認対象:

- project IDとlifecycle、billing有効性、approved region `asia-southeast1`。
- project・Cloud Run・Monthly scopeのspend cap status=`Configured`、初期提案`$0.20`または本人承認額。
- project全体のalerts-only budget初期提案`$1`、通知recipient、通知到達。alerts-only単独は停止しない。
- Artifact Registry、Cloud Run、Secret Manager、Logging、Monitoring、Scheduler、IAM Credentials、Drive/Picker等の必要API。
- uniform bucket-level accessとpublic access preventionを持つ既存GCS Terraform state bucket。
- approved regionのDocker Artifact Registry repository。
- 12個のSecret Manager containerの存在。payloadやversion内容は読まない。
- payload投入後の定常active version合計12、概算`$0.36/月`。rotation中の一時13は新revision確認後に
  旧versionを無効化して11へ戻す。
- `public`、`admin`、`worker`、`migration`のimmutable image digest。
- PIIを含まない通知channelの存在。

sanitized evidenceにはresource名や値そのものではなくfingerprint、件数、bool、regionだけを残す。preflightがFAILしたresourceは、本人承認の別操作で作成・修正し、再度read-only preflightを行う。
spend capはPreviewで、反映遅延、in-flight request、Cloud Run外費用を止めない。利用不可、最低額が
本人許容を超える、または残余risk未承認ならGCP runtimeをBLOCKする。

外部変更の順序は、(1)billing/card直前承認、(2)spend cap・project alert・通知先、(3)個別承認した
API/bucket/repository/12 secret containers/notification channel作成、(4)4 image push、(5)read-only
preflight、(6)Terraform Stage 1とする。preflightが不足resourceを自動作成することはない。

### Gate 5: Neon productionとrole分離

1. 本人がNeonへloginし、専用production project/branchと、別のrestore rehearsal branchを準備する。
2. API pooled、admin pooled、worker pooled、migration direct、backup/restore directを別credential・別roleとして発行する。
3. URLはSecret Managerの対応containerへ本人が直接入力する。Terraform file、Git、chatへ入れない。
4. production DB role bootstrap/bind/grant/auditをGate 0と同じ順序・確認値で実行する。
5. owner、TLS、pooler/direct、schema privilege、table privilege、default privilege、監査改変拒否を確認する。
6. migration前backupを取り、別branchへrestoreし、Alembic revision、table、row count、constraint、audit列を照合する。
7. 旧credentialを失効する前に、新credentialで必要最小権限の疎通を確認する。

production connection stringや実データを証跡へ出さず、project/branch/credentialはfingerprintだけを記録する。

### Gate 6: Terraform Stage 1 — migration-only

1. GCS backendを既存bucketと専用prefixで初期化する。backend座標やcredentialをcommitしない。
2. 次のactivationを全てOFF・空confirmationにする。
   - `runtime_services_activation`
   - `cost_guardrails_review`（OFF時は額0）
   - `public_ingress_activation`
   - `worker_drive_activation`
   - `admin_api_activation`
   - `public_api_write_activation`
   - `phase10a_export_activation`
3. `terraform -target`を使わず、full planを生成する。
4. planがmigration jobと最小限のmigration secret bindingを作り、public/admin/worker runtime、public/admin invoker、Scheduler、Drive secret binding、admin、export、public writeを作らないことを人が確認する。
5. 本人の直前承認後だけapplyする。
6. migration jobは作成されただけでは未完了である。本人承認後に一度実行し、Alembic head、object owner、role auditを確認する。

Stage 1完了前にruntimeを起動すると、fresh DBへstartup probeが先行し得るため禁止する。

### Gate 7: Terraform Stage 2 — runtime standby

migrationとrole auditがPASSした後だけ、次を設定する。

```text
runtime_services_activation.enabled=true
runtime_services_activation.confirmation=I_APPROVED_PRODUCTION_RUNTIME_SERVICES_AFTER_MIGRATION_V1
cost_guardrails_review.enabled=true
cost_guardrails_review.cloud_run_spend_cap_usd=<APPROVED_AMOUNT>
cost_guardrails_review.project_alert_budget_usd=<APPROVED_AMOUNT>
cost_guardrails_review.confirmation=I_VERIFIED_CLOUD_RUN_SPEND_CAP_AND_NEAR_ZERO_COST_GUARDRAILS_V1
```

この段階でも次はOFFのままにする。

- public API write: OFF、従って`API_READ_ONLY_MODE=true`。
- public ingress: OFF、`allUsers` invokerなし。
- admin API: OFF。
- Drive worker side effect: OFF、kill switch ON、Schedulerなし。
- Phase 10A export: OFF。

full planでcost guard額、notification channel 1件以上、runtime secret binding、service account、Cloud Run revision、public invoker 0、min 0/max 1、timeout、health probe、notification policyを確認し、本人の直前承認後だけapplyする。`runtime_services_activation`は初回bootstrap latchであり、runtime作成後のincident switchとしてOFFに戻さない。停止には後述のpublic ingress/read-only/Drive/export controlsを使う。

### Gate 8: Google OAuthとPhase 7B使い捨てDrive E2E

#### 8.1 Web OAuth

1. 本人がGoogle Auth Platformでproduction Web OAuth Clientを確認する。
2. Cloudflare Preview originと最終canonical originを、Gateの段階に応じてexact authorized JavaScript originへ登録する。wildcard、localhost、本番で不要なoriginを入れない。
3. public client IDだけをfrontend build設定へ渡す。client secretはstatic bundleへ絶対に渡さない。
4. serverはID tokenの署名、`aud`、`iss`、期限、`email_verified`、組織domainを確認する。
5. 個人Google account、対象外domain、aud不一致、期限切れ、未検証emailを拒否する。

#### 8.2 Phase 7B使い捨てE2E

公開login用、Phase 7B用、本番Drive owner用のWeb OAuth clientを分離する。分離できない場合でも、
本番用refresh tokenを作る前にPhase 7Bを完了する。Phase 7Bのcleanupは最後にOAuth grantを
revokeするため、同じclient・ownerで先に作った本番tokenまで無効化し得る。

1. 実資料を含まないowner所有の空テストfolderを使用する。
2. `http://localhost:8767/oauth2/callback`だけを持つ使い捨てclientと、対応するPicker keyを使う。
3. ownerとは別のViewer用Google accountを一つ用意する。学生用・教員用に別々の組織accountを準備する必要はない。
4. test recipientへViewer付与、通知受信、実閲覧、編集拒否、冪等再実行、revoke、再閲覧拒否を順に人が確認する。
5. folder/permission ID、email、tokenはevidenceへ出さずfingerprintだけを記録する。
6. 全test permissionと空folderを削除し、対象外resourceへ変更がないことをownerが確認する。
7. 使い捨てOAuth grantをrevokeし、cleanup PASSを記録する。

### Gate 9: 本番Drive credential bootstrapとworker実Drive E2E

#### 9.1 本番credential bootstrap

Phase 7B cleanupとGCP read-only preflightがPASSした後に限り、本番Drive owner用clientを使う。
External applicationのpublishing statusが`In production`であること、redirect URIが
`http://localhost:8769/oauth2/callback`だけであることを本人が確認する。External/Testingで
取得した`drive.file` refresh tokenを長期本番credentialとして固定しない。

Drive owner本人が専用bootstrap UIでlogin・同意し、対象folderのfingerprintを目視確認する。
secret version追加を許可する直前に、本人だけが次を入力する。

```text
I_APPROVED_PRODUCTION_DRIVE_CREDENTIAL_BOOTSTRAP_V1
```

この確認は、OAuth client ID/secret、owner refresh token、Drive resource IDを既存4個の
Secret Manager containerへ安全に追加する承認である。workerのDrive side effect承認とは別である。
bootstrapはDrive permissionを変更しない。結果にはpayloadを残さず、追加version件数、folder
fingerprint、scope検査、numeric versionだけを保存する。

#### 9.2 worker実Drive E2E

実Drive処理を有効にするreview済みplanでは次を使う。

```text
worker_drive_activation.enabled=true
worker_drive_activation.confirmation=I_APPROVED_PRODUCTION_DRIVE_SIDE_EFFECTS_V1
```

このplanでworker API、Drive API、外部副作用、Scheduler、IAM、Drive secret bindingが一括で有効になり、kill switchだけがOFFになることをreviewする。部分的なflag変更は禁止する。

有効化後、ownerとは別のtest recipientへViewerを1件付与し、通知、実閲覧、編集拒否、冪等再実行、
revoke、再閲覧拒否を人が確認する。folder/permission ID、email、tokenはevidenceへ出さず、全test
permissionを削除して対象外resourceへの変更がないことをownerが確認する。OAuth通過やcredential
bootstrapだけでDrive GateをPASSにしない。

### Gate 10: 初期管理者と管理API

1. 登録用とは別の管理用Google Web OAuth Clientを作成し、正規管理hostだけをAuthorized
   JavaScript originへ登録する。登録用と管理用のClient IDが同じ場合は停止する。
2. 公開サイトのheader、footer、navigation、CTA、sitemapに管理URLへのリンクがないことをstatic gateで確認する。
   管理URLへCloudflare Access等のedge policyを設定し、許可した管理者以外へHTML自体を配信しない。
   `noindex`と非公開リンクだけをアクセス制御として扱わない。
3. 管理UIは`NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL=/library-registration/admin/api`だけを使う。
   Cloudflare PagesのProduction環境へ`LIBRARY_ADMIN_CANONICAL_ORIGIN=<正規siteのexact HTTPS origin>`、
   `LIBRARY_ADMIN_API_ORIGIN=<Terraform admin_api_urlのexact HTTPS origin>`とencrypted
   `LIBRARY_ADMIN_EDGE_SHARED_SECRET`を設定し、同じedge secretをGCP Secret Managerの
   `fsl-admin-edge-shared-secret`へprivate payloadとして追加してnumeric versionをpinする。
   secretを`NEXT_PUBLIC_*`、Git、shell history、証跡へ置かない。
   Preview環境へadmin API originとedge secretを設定しない。
4. canonical hostと全公開aliasの`/library-registration/admin/*`にAccess policyを設定し、後述する2メールだけを
   Allow、その他をdeny-by-defaultとする。`public/_routes.json`が管理API proxy globだけをFunction対象とし、
   管理画面全体や全siteをwildcardにしていないことを確認する。
5. 初期許可対象は、同一責任者が管理する大学Workspace 1件と個人Gmail 1件の2アカウントだけとする。
   正確なメールアドレスは公開repository、build、ログへ置かず、Productionの
   `GOOGLE_ADMIN_ALLOWED_EMAILS`／Secret Managerへ完全一致CSVとして設定する。未設定、空、
   重複、不正形式はfail closedとする。将来の追加は運営責任者の明示承認、Secret Manager変更、
   変更監査、実token確認、個別`sub` bootstrapを必要とする。
6. 正規host OAuthで2アカウントを別々に認証し、各Google `sub`を実測する。管理認可では`hd`、
   学生・教員、学部、学年、学籍番号で分岐せず、allowlist外を一律拒否する。
7. production migration／管理接続を持つ承認済み環境で、2つの異なる実測`sub`をcreate-only
   bootstrapし、両方を`admin` roleとして登録する。bootstrapは既存管理者の昇格・再有効化には使用しない。
8. 各bootstrap直前の確認値は次である。

```text
PHASE8_BOOTSTRAP_CONFIRM=I_CONFIRMED_THE_VERIFIED_GOOGLE_SUB
```

9. 2アカウント双方のMFA、recovery、session失効、登録用token拒否と、未許可のWorkspace／個人Google
   accountのadmin拒否を人が確認する。
10. Cloud Run originの管理routeをedge secretなしで直接呼ぶと汎用404、Pages管理routeはAccess未認証時に
   edgeで遮断されることを確認する。Access通過後もGoogle token不正、allowlist外、DB未登録`sub`は拒否する。
11. Production runtime LOGIN名と実効DB権限のreadiness検査をPASSし、owner接続、管理者表変更、
   監査改変、migration/backup兼任が拒否されることを確認する。
12. まずread-only管理APIだけを有効化し、正規hostでsession、search、名簿、監査、毎分30回pre-auth制限、
   token期限、15分無操作、tab非表示、401 lock、PII消去を確認する。
13. 更新操作が必要な期間だけ、別のmutation activationをreviewして有効化し、deactivate、retry、
   revoke、監査追記、競合拒否を確認する。

```text
admin_api_activation.enabled=true
admin_api_activation.confirmation=I_APPROVED_PRODUCTION_ADMIN_API_AFTER_MFA_BOOTSTRAP_V1
admin_mutations_activation.enabled=true
admin_mutations_activation.confirmation=I_APPROVED_PRODUCTION_ADMIN_MUTATIONS_AFTER_MFA_AND_RECOVERY_REVIEW_V1
```

第二管理者は設けず、PASSまたはProduction Cutoverの要件としない。2アカウントが同一人物に属するため、
本人不在、両アカウント同時失効、端末喪失時に第三者が即時復旧できないsingle-operator riskを本人が受容する。
両アカウント個別のMFA・recovery、session失効、本人によるCloudflare／GCP／Neon／worker停止と
OAuth再認可の手順を人間E2Eで確認する。

### Gate 11: Cloudflare Preview

1. Preview実行前にGit branch、HEAD、worktree clean、package lock、最新local gate hashを確認する。
2. generic Production deployを使わず、Library専用guardだけを使う。
3. Preview branchは`library-registration-preview-<lowercase-suffix>`とし、Cloudflare dashboardの現在のproduction branchと一致しないことをbuild前・upload直前に確認する。
4. Preview publishを本人が直前承認したときだけ、local terminalへ次を一時設定する。

```text
CLOUDFLARE_LIBRARY_PREVIEW_CONFIRMATION=I_APPROVED_LIBRARY_PREVIEW_DEPLOYMENT_V1
```

5. production-shaped buildに必要なAPI origin、Google public OAuth client ID等はlocal environmentまたは承認済みCI variableへ設定する。secretを`NEXT_PUBLIC_*`へ入れない。
6. build後にもHEAD不変・worktree cleanを再確認し、既存GoogleフォームCTAが変わっていないことをartifactで検証する。
7. returned Preview URLがbranch-scoped hostであり、canonical production deploymentではないことを確認する。
8. desktop/mobile、横overflow、console、keyboard、double submit、CSP、CORS、noindex、非analytics、OAuth拒否系、API read-onlyを人が確認する。
9. Previewでは実PIIと本番Drive side effectを使わない。mockまたは隔離test projectだけを使う。

Preview upload成功だけでProduction PASSとしない。Preview URLの削除・rollback手順も同時に記録する。

### Gate 12: 旧GAS/Sheet引継ぎ — Phase 9

旧利用者が実在しない場合も、「対象snapshot 0件・import不要」を人が記録し、暗黙に省略しない。引継ぎを行う場合は次の順とする。

1. Google Form response、連携Sheet、Drive permissionを同一基準時刻でread-only exportする。
2. private作業directoryでhashを固定し、Git、chat、public evidenceへ置かない。
3. dry-run、schema/row validation、重複、domain、学籍番号、manual review、Drive差分0を確認する。
4. source/report/normalized/Drive fingerprintの各hashを本人が照合する。
5. apply直前だけ次を設定する。

```text
PHASE9_APPLY_CONFIRM=APPLY_APPROVED_BATCH_WITHOUT_DRIVE_SIDE_EFFECTS
```

6. importはDrive side effectなしで実施し、row count、audit append、raw payload改変拒否を確認する。
7. rollbackは対象batch UUIDとのexact match、期限後purgeは`PURGE_EXPIRED_TERMINAL_RAW_SNAPSHOTS`を別承認とする。

### Gate 13: Phase 10A CSV/XLSX export

次を全て満たすまでexportをOFFにする。

- data handling、保存先、暗号化、再共有禁止、削除期限、incident処理を本人が承認。
- production admin OAuth/MFA/RBACがPASS。
- production DB roleが`library_export_runs`へSELECT/INSERTのみを持ち、UPDATE/DELETEを拒否。
- cache禁止、row/byte/rate limit、SHA-256、formula injection防止、人間Excel受入がPASS。

有効化時のexact confirmationは次である。

```text
phase10a_export_activation.enabled=true
phase10a_export_activation.confirmation=I_APPROVED_PRODUCTION_PHASE10A_EXPORT_AFTER_DATA_HANDLING_REVIEW_V1
```

緊急停止は`enabled=false`・空confirmationへ戻す。export file本体をserverへ保存せず、端末上のfileは承認済み暗号化領域で管理し、原則30日以内に削除する。

### Gate 14: Limited Pilot

1. Preview、Neon、Cloud Run、OAuth、Drive、adminの各実host GateがPASSしていることを確認する。
2. spend cap=`Configured`、project alert、通知到達、cost evidenceを再確認し、Pilot hostのpublic
   ingressとpublic writeを同じreview済みplanで有効にする。

```text
public_api_write_activation.enabled=true
public_api_write_activation.confirmation=I_APPROVED_PRODUCTION_API_WRITES_AFTER_RECOVERY_REVIEW_V1
public_ingress_activation.enabled=true
public_ingress_activation.confirmation=I_APPROVED_PUBLIC_CLOUD_RUN_INGRESS_AFTER_COST_AND_RECOVERY_REVIEW_V1
```

3. 参加者、期間、最大登録数、Drive付与件数、成功・停止条件を限定する。
4. 最初は合成または運営者test、次に明示同意した少数利用者の順に進める。
5. OAuth、登録、DB transaction、status、Drive viewer付与、通知、revoke、admin auditをend-to-endで確認する。
6. event日最大200件・同時2件の条件でCloud Run/Neon latency、5xx、connection、quota、costを実測する。
7. single-operator riskを受容した記録と、本人不在・両アカウント失効時の即時停止条件を確認する。

Pilot中も公式CTAはGoogleフォームのままにする。Pilot参加者には非公開URLを個別に案内する。

### Gate 15: Production Cutover

Cutover前に次を全てPASSにする。

- 最新mainとの再base/review、CI、Preview、Limited Pilot。
- GCP/Neon/Drive/OAuth/Admin/backup/restore/monitoring/cost gate。
- 規約・privacy・保存期間・問い合わせ窓口。
- owner-controlledな2アカウント双方のMFA・recovery、session失効、本人による停止・復旧受入。
- Googleフォームが即時rollback先として引き続き受付可能。
- CTA変更commitがroute/infra commitから分離されている。

本人がCTA切替のexact diff、公開先、rollbackを確認し、直前承認した後だけ次を行う。

1. reviewed branchをmainへmergeする。
2. canonical Production deploymentを承認済み方法で実行する。
3. canonical hostの`/library-registration/`を再検証する。
4. 別commitで`/future-strategy-library/`の登録CTAだけを新導線へ切り替える。
5. desktop/mobile、console、CSP/CORS、OAuth、registration、Drive、admin、monitoringを再確認する。
6. 観測期間を終えるまで旧Googleフォーム/GASを停止・削除しない。

旧Googleフォーム/GASの停止は、CTA Cutoverとも別の不可逆操作として、利用状況、未処理response、rollback不要を人が確認した後に別承認する。

## 5. Exact confirmation 一覧

| 用途 | Exact confirmation | 意味 |
|---|---|---|
| DB role bootstrap | `apply-bootstrap` | NOLOGIN capability role、schema ownership等の初期化 |
| DB login binding | `apply-bind` | login roleとcapability roleのbinding |
| DB privilege grant | `apply-grant` | migration後のtable/sequence/default privilege付与 |
| DB role audit | `apply-audit` | role・ownership・権限監査 |
| Cost guard確認 | `I_VERIFIED_CLOUD_RUN_SPEND_CAP_AND_NEAR_ZERO_COST_GUARDRAILS_V1` | spend cap、project alert、通知先、額、残余riskの確認 |
| Runtime作成 | `I_APPROVED_PRODUCTION_RUNTIME_SERVICES_AFTER_MIGRATION_V1` | migration/role audit後のpublic/worker作成。adminは別activationで作成 |
| Public ingress | `I_APPROVED_PUBLIC_CLOUD_RUN_INGRESS_AFTER_COST_AND_RECOVERY_REVIEW_V1` | reviewed host/Pilot/Cutoverだけでpublic invokerを有効化 |
| Public write再開 | `I_APPROVED_PRODUCTION_API_WRITES_AFTER_RECOVERY_REVIEW_V1` | read-onlyからwriteへ移行 |
| Drive credential bootstrap | `I_APPROVED_PRODUCTION_DRIVE_CREDENTIAL_BOOTSTRAP_V1` | OAuth/refresh token/Drive resourceをSecret Managerへ登録 |
| Drive side effect | `I_APPROVED_PRODUCTION_DRIVE_SIDE_EFFECTS_V1` | worker/Scheduler/Drive権限変更を有効化 |
| 初期管理者identity | `I_CONFIRMED_THE_VERIFIED_GOOGLE_SUB` | 2つの実測Google `sub`を個別にcreate-only登録し、両方を`admin`にする |
| Admin API | `I_APPROVED_PRODUCTION_ADMIN_API_AFTER_MFA_BOOTSTRAP_V1` | bootstrap/MFA/host review後のadmin route有効化 |
| Admin更新操作 | `I_APPROVED_PRODUCTION_ADMIN_MUTATIONS_AFTER_MFA_AND_RECOVERY_REVIEW_V1` | read-only管理受入後、必要期間だけ承認・停止・再処理を有効化 |
| Phase 9 import | `APPLY_APPROVED_BATCH_WITHOUT_DRIVE_SIDE_EFFECTS` | 承認済みhashのlegacy batchをDrive変更なしで適用 |
| Phase 9 purge | `PURGE_EXPIRED_TERMINAL_RAW_SNAPSHOTS` | 期限後raw snapshotの削除 |
| Phase 10A export | `I_APPROVED_PRODUCTION_PHASE10A_EXPORT_AFTER_DATA_HANDLING_REVIEW_V1` | data handling承認後の名簿出力有効化 |
| Cloudflare Preview | `I_APPROVED_LIBRARY_PREVIEW_DEPLOYMENT_V1` | branch-scoped Preview公開 |

confirmationはsecretではないが、値を設定しただけで承認完了にはならない。必ず対象plan、対象resource、対象branch、対象host、実行時刻、rollbackを人が確認し、直前承認と一対一に対応させる。使用後は環境変数から削除する。

## 6. Incident・停止・rollback順序

異常時は外部副作用を先に止め、証跡を保全してから原因を調べる。

1. `public_ingress_activation.enabled=false`・空confirmationへ戻し、public invokerを外す。
2. Cloud Schedulerをpauseする。
3. `worker_drive_activation.enabled=false`・空confirmationのreview済みrevisionへ戻し、Drive API、外部副作用、Drive secret bindingを停止する。
4. `public_api_write_activation.enabled=false`・空confirmationへ戻し、`API_READ_ONLY_MODE=true`にする。
5. `admin_mutations_activation.enabled=false`・空confirmationへ戻し、管理更新操作を停止する。
6. `phase10a_export_activation.enabled=false`・空confirmationへ戻し、exportを停止する。
7. 管理画面全体を止める場合はadmin APIとedge access policyを閉じる。
8. 公式CTAが新導線へ切替済みなら、別の小さなrollback commitで既存Googleフォームへ戻す。
9. request ID、時刻、revision、HTTP status、operation UUID等の非PIIだけを記録する。
10. DB不整合時はwriteを再開せず、別Neon branchへrestoreして照合する。
11. credential漏えいが疑われる場合は、新versionへrotationし、新revision確認後に旧versionと旧credentialを失効する。
12. 復旧はDB/read-only health、admin read、synthetic registration、管理mutation、Drive 1件、Scheduler、public write、public ingress、CTAの順に段階的に行う。

`runtime_services_activation`をincident時にOFFへ戻してserviceを削除しない。`prevent_destroy`とdeletion protectionを維持する。

## 7. 証跡に残してよいもの・残してはいけないもの

残してよいもの:

- commit SHA、source manifest hash、artifact digest、migration revision。
- resource名・account・folder・subjectの短いSHA-256 fingerprint。
- row count、table count、duration、HTTP status、PASS/FAIL、quota/costの集計値。
- PIIを含まないtest名、browser viewport、console error count、sanitized plan summary。

残してはいけないもの:

- 氏名、大学email、学籍番号、問い合わせ本文、実利用者一覧。
- Google `sub`そのもの、ID/access/refresh token、OAuth code、MFA/recovery code。
- database URL、password、Neon credential、Secret Manager payload。
- Drive folder/file/permission IDの生値。
- export file、legacy raw snapshot、Terraform state、plan内のsensitive payload。

実PIIやcredentialを扱う手動工程では、screen sharing、screenshot、自動terminal capture、clipboard履歴、shell history、cloud logの範囲を事前確認する。

## 8. 最終PASS判定票

| Gate | 必須証跡 | 状態 |
|---|---|---|
| Local source/DB | clean最終HEAD、matching evidence、pre/post不変、全回帰、DB ownership/role audit | MACHINE EVIDENCE REQUIRED |
| GitHub | reviewed PR、CI、base/head、secret scan | PENDING |
| GCP cost | spend cap、project alert、通知到達、min/max、public ingress停止、残余risk承認 | PENDING |
| GCP platform | read-only preflight、review済みplan/apply、monitoring | PENDING |
| Neon | role分離、migration、backup/restore、rotation | PENDING |
| OAuth | 正規host、署名/aud/iss/期限/domain、拒否系 | PENDING |
| Drive | owner + separate Viewer、grant/view/revoke、cleanup | PENDING |
| Admin | 初期private 2-account allowlist、2つの`admin` bootstrap、MFA・recovery、deny-by-default、RBAC、監査 | PENDING |
| Cloudflare Preview | branch URL、noindex、CTA不変、host E2E | PENDING |
| Phase 9 | 実snapshot移行または0件・移行不要の承認記録 | PENDING |
| Phase 10A | data handling、Excel、人間削除・監査受入 | PENDING |
| Limited Pilot | 対象・期間・停止条件、実測、rollback | PENDING |
| Production Cutover | single-operator risk受容、別CTA commit、canonical E2E | BLOCKED |

全行がPASSとなり、本人がProduction Cutoverを直前承認するまで、総合状態は`PRODUCTION BLOCKED`である。ローカルPASS、Preview upload、OAuth login、Drive credential bootstrapのいずれか一つだけを根拠に、CTA切替または本番完了を宣言しない。
