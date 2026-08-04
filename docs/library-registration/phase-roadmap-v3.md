# 未来戦略ライブラリ 登録基盤 Phaseロードマップ v3

策定日: 2026-08-01<br>
最終整合日: 2026-08-03
状態: 現行・未公開<br>
適用基線: `origin/main` `7d65cfa230e5d20acbe4b72f971b07b8325827f1`から作成した
`codex/library-registration-production-prep-20260803`。current HEADはmatching machine evidenceで固定する。

## 1. 再策定の結論

旧登録実装は機能試験を積み上げていたが、現在の公式サイトmainから44 commits遅れた
dirty worktreeにあり、そのままmerge・公開できるリリース基線ではなかった。さらに、
ローカルPASS、実Google認証PASS、合成Drive PASSが、実ホスト・実Drive・運用・個人情報の
Production Gateと混在していた。

今後は、最新mainへ選別移植したリリース基線を唯一の統合元にし、次の三つを分離する。

1. 実装が正しいこと。
2. 外部サービスと実データで安全に動くこと。
3. Googleフォームから本番CTAを切り替えてよいこと。

この三つは別の証跡と承認を必要とし、前段のPASSで後段を自動PASSにしない。

## 2. 不変仕様

### OAuth第1層

Google OAuthは、署名検証済みID tokenにより許可Workspace組織のユーザーであることを
確認する。同じ`st.kitasato-u.ac.jp`の`hd`なら学生・教員を分岐せず通過させる。
registrationのGoogle Identity Services chooserには`runtimeConfig.expectedHostedDomain`を`hd`として
必須で渡し、大学domain外accountを選択候補から除外する。共通`GoogleSignInButton`の`hd`は、他の
保護surfaceではoptionalとする。chooser制約は認可の代替ではなく、server側のissuer、audience、
`email_verified`、`hd`再検証と許可domain外account拒否を不変の二重防御とする。

### Drive承認第2層

Drive Viewer付与はフォーム内容とDB状態からFastAPIが再判定する。薬学部、学年・区分、
学生の`PP|PL|MP + 数字5桁`、同意、既存登録を確認し、教員等の既存個別確認分岐も維持する。
OAuth成功だけで付与せず、ブラウザの表示判定だけでも付与しない。

この境界の変更には、要件変更記録、正負case、TS/Python契約試験、運営責任者の明示承認を
必要とする。手順説明の修正は変更承認にならない。

## 3. 現在地

| 領域 | 現在地 | 公開判定 |
|---|---|---|
| Next.js登録UI | 最新mainへ選別移植、専用route、mock既定 | 未公開 |
| Google認証 | 実Workspace正系・個人Google拒否をローカル確認済み | 本番host未確認 |
| PostgreSQL | migration、pooled/direct、同時登録、冪等性、lockを開発Neonで確認済み。専用local PostgreSQLで合成200件/同時2とdump→別local DB restoreを確認 | production role適用・hosted負荷・別Neon branch restore未実施 |
| Drive operation | outbox、lease、有限再試行、grant/revokeを合成clientで確認済み | 実Drive E2E未完了 |
| 管理者 | 専用静的route/UI、mock、Google API client、RBAC API、検索・詳細・承認/却下・retry・停止/revoke・監査をローカル実装 | 正規host認証・初期管理者・MFA・人間受入未完了 |
| 旧名簿移行 | private CLI、hash固定、dry-run、承認、冪等apply、rollback、raw保持をローカル実装。合成PostgreSQL gate PASS | 実snapshot・人間承認・production apply未実施 |
| CSV/Excel | admin専用CSV/XLSX、formula対策、hash、追記専用監査、管理UIをローカル実装。合成gate PASS | データ取扱承認・正規host認証・実Excel受入未実施 |
| Cloudflare/Cloud Run | public/admin/worker/migration分離、Terraform、cost guard、public ingress停止、fail-closedをローカル実装。本登録route/APIは未公開 | billing、spend cap、Terraform apply・実host検証未実施 |
| Local pre-Production | source integrity、production-shaped frontend rehearsal、三Docker target、Terraform validate、全回帰、PostgreSQL API/race、200件負荷、dump/restore、cleanupを一つの合成データ専用gateへ統合 | DB修正後の個別gateはPASS。正式判定は現在HEADと一致するcanonical JSONだけ |
| 規約・個人情報 | draft | 人間承認未完了 |

正式状態は、Release BaselineとPhase 8A/8B/9/10Aが`LOCAL IMPLEMENTATION PASS`、Phase 7Bが
`REAL DRIVE E2E PENDING`、全体が`PRODUCTION BLOCKED`である。ローカルPASSをクラウド、
実Drive、人手承認のPASSへ読み替えない。

## 4. Gate R0: Release Baseline

目的: 現行公式サイトから再現可能な唯一の統合基線を作る。

実施内容:

- 最新`origin/main`から独立worktree/branchを作成する。
- 旧dirty worktreeを変更せず、登録機能に必要なファイルだけを移植する。
- 現行Next.jsネイティブ`/future-strategy-library/`を維持する。
- `/library-registration/`をnoindex・非analytics・非CTAのpreview routeとして統合する。
- root環境例、ignore、build、verify、Dockerを現行mainへmergeする。
- 通常buildをmock、外部副作用OFF、Drive OFF、kill switch ONにする。
- ローカルPhase 5 APIをopt-inにする。

PASS GATE:

- [x] frontend全試験、typecheck、production build、export検証がPASS。
- [x] Python全回帰がPASS。
- [x] Docker compose configと合成PostgreSQL smokeがPASS。
- [x] `out/library-registration/index.html`が存在し、h1 1件、noindex、Googleフォームリンクなし。
- [x] Desktop 1440×1000、Mobile 390×844で横overflowなし、console warning/error 0件。
- [x] 合成学生のmock E2Eで全角小文字学籍番号を`PP23000`へ正規化し、自動承認表示。
- [x] 現行ライブラリCTAがGoogleフォームのまま。
- [x] secret、token、実PII、Python cache、DB fileをGit差分に含まない。
- [x] COMPASS Interactiveのpath/resourceへアクセス・変更していない。

2026-08-01判定: `R0 PASS / LOCAL ONLY / NOT RELEASED`。詳細は
`release-baseline-verification-2026-08-01.md`を参照する。

R0 PASS後もpush・preview deployは別承認とする。

## 5. Phase 7B: 実Google Drive E2E

目的: 所有者OAuth、`drive.file`、Picker、実permissionの成立とcleanupを実証する。

試験範囲:

- 本番ライブラリではなく新規の空テストフォルダを所有者がPickerで選ぶ。
- 所有者と異なるテスト受信者へ`reader`を1件付与する。
- Drive標準招待通知、別アカウント閲覧可、編集不可を人が確認する。
- 同一申請再実行でpermissionが重複しないことを確認する。
- revoke後に閲覧不可、permission削除、OAuth grant失効を確認する。
- 保存証跡は時刻、結果、ハッシュ化識別子、cleanup結果だけとする。

PASS GATE:

- [ ] grant、notification、view、replay、revoke、cleanupが全てPASS。
- [ ] folder ID、permission ID、メール、token、認可codeを証跡へ保存していない。
- [ ] 失敗時もtest permissionとOAuth grantを残さない。
- [ ] kill switchをONへ戻したことを別確認する。

第二管理者はこの技術E2Eの必須条件ではない。所有者と別viewerで実施できる。

## 6. Phase 8A: Production Platform Hardening

目的: ローカル一体型APIを、本番の公開境界と運用境界へ分割する。

推奨topology:

```text
Cloudflare Pages static form
  -> Cloud Run public API
       -> Neon pooled connection
       -> outbox transaction
Cloud Scheduler with OIDC
  -> Cloud Run private worker
       -> Neon pooled connection
       -> Google Drive API
Alembic/recovery job
  -> Neon direct connection
```

ローカル実装済み:

- public APIとworkerを別Cloud Run serviceまたは別entrypointにする。
- workerはCloud Run IAM/OIDCを主境界にし、共有secretだけに依存しない。
- migrationはruntime起動時に実行せず、明示jobからdirect接続で行う。
- `APP_ENV=production`時はSQLite、空OAuth ID、空許可`hd`、広すぎるCORS、
  local API、worker公開、kill switch解除の矛盾を起動時拒否する。
- API用、migration用、backup/restore用DB roleを分離し、owner credentialをruntimeへ渡さない。
- production secretをSecret Managerから数値version指定で注入するTerraform契約と、
  rotation・失効手順を用意する。
- workerはDrive/API/外部副作用OFF・kill switch ONのstandbyでもhealthを維持し、Terraform既定では
  Scheduler、関連IAM、Drive secret bindingを作らない。exact confirmation付きactivationだけが
  全境界を一括有効化する。管理APIもbootstrap・MFA・正規host確認前はrouteごと既定OFFにする。
- API origin確定後、`https://*.run.app` CSPをexact originへ狭める。
- `sub`単位submit制限、全体上限、payload上限、request timeout、有限pollを実装する。
- PIIを除外したstructured log、error rate、dead operation用metric、通知設定のTerraformを追加する。
- 合成データ専用`pg_dump`/restore、migration rollback、Drive停止、API read-onlyのrunbookと
  安全guardを実装する。
- Cloud Run spend capとproject alertを人が確認しない限りruntimeを作れない
  `cost_guardrails_review`を追加する。runtimeはnotification channel 1件以上を必須とする。
- public `allUsers` invokerをruntime作成から分離し、既定OFF・緊急時OFFへ戻せる
  `public_ingress_activation`を追加する。
- Neonの常時wakeを避けるためworkerを15分間隔・20件batch・retry 0とする。

LOCAL IMPLEMENTATION GATE:

- [x] public API、dedicated admin API、private worker、migrationのroute・image・secret・DB role境界を分離。
- [x] production誤設定、worker OIDC不備、過大payloadをfail-closedにするcontractを実装。
- [x] API/worker/migration/backup用DB roleと機械判定audit SQLを実装。
- [x] Terraform format/validate、三target Docker build・分離確認、ローカルDB role試験をPASS。
- [x] Phase 8A固有のplatform/asset testをPASS。
- [x] cost guard、notification必須、public ingress独立停止、15分workerをfail-closed Terraform契約化。
- [x] 専用local PostgreSQLで合成200登録・最大同時connection 2と同一200件の冪等再送を完了し、
  各主要table 200件、欠落・重複なしを確認。実測時間は最新のmachine evidenceを正本とする。
- [x] dumpを空の別local DBへrestoreし、Alembic `f1a2b3c4d5e6`、11 table、主要row 800、
  constraint、audit列の一致を確認。
- [x] hostとread-only Docker開発imageのPython全回帰、frontend全回帰、typecheck、build、
  verifyがPASS。最新件数はPhase報告とcanonical local gate証跡を正本とする。

判定: `PHASE 8A LOCAL IMPLEMENTATION PASS / CLOUD AND MANUAL GATES PENDING / PRODUCTION BLOCKED`。
証跡と未実施操作は`phase8a-implementation-report.md`および
`phase8a-production-platform-runbook.md`を参照する。

CLOUD / MANUAL PASS GATE:

- [ ] 対象projectのCloud Run spend cap、project alerts-only budget、通知recipientを本人が確認し、
  Terraformの額とsanitized evidenceが一致する。
- [ ] public/admin/workerがrequest-based、`min=0/max=1`で、public ingressを独立停止できる。
- [ ] public APIからworker操作routeへ到達できない。
- [ ] Scheduler OIDC以外のworker要求を拒否する。
- [ ] production誤設定が起動時fail-closedになる。
- [ ] runtime DB roleでDDL・role変更・不要table accessができない。
- [ ] secret rotation後も復旧し、旧secretが無効。
- [ ] deployed Cloud Run/Neonで200件/日のevent想定と少なくとも2同時submitを再実行し、
  重複・欠落・無限再試行なしを確認。
- [ ] productionと分離した別synthetic Neon branchへrestoreし、件数・制約・監査列を照合。

## 7. Phase 8B: 最小管理者運用

目的: 自動処理が失敗・個別確認になったとき、人が安全に解決できるようにする。

ローカル実装済み:

- `/library-registration/admin/`のnoindex静的routeと、mock既定・Google API modeの管理UI。
- 公開siteのheader、footer、navigation、CTA、sitemapから管理routeへのリンクを禁止するstatic gate。
- 同一origin`/library-registration/admin/api`のCloudflare Pages proxy、正確なpath・method・query・header
  allowlist、`public/_routes.json`の最小Function route。
- Pages/GCPだけが共有するprivate edge secretと、Cloud Run direct-origin管理要求の汎用404拒否。
- Google検証前の管理pre-auth毎分30件制限（`max_instance_count=1`前提）。
- `viewer`、`operator`、`admin`のserver-side RBAC。
- 申請・Drive状態のfilter、POST bodyによる氏名・メール・学籍番号検索、詳細・監査表示。
- 安全な個別確認の承認/却下、失敗/dead operationのretry、利用停止のみ、
  system-managed permissionの利用停止＋Drive revoke。
- 空白除去後8文字以上の理由、対象ID再確認、楽観lock、冪等keyとpayload fingerprint。
- accepted mutationの操作者role、対象UUID、理由、request ID、時刻、結果の監査追記。
- 利用停止時のpending/failed grant取消。admin deactivate/revokeとworker grantは同じmember rowを
  `SELECT FOR UPDATE`し、workerはDrive lookup前とcreate直前に`populate_existing`でactiveを再確認。
- 合成fake Driveと専用local PostgreSQLを使うAPI/race gateで、deactivate先行とgrant先行の
  最終状態・監査・operationを外部副作用なしで検証する。
- 緊急停止、owner OAuth再認可、初期管理者bootstrap、異常時対応のrunbook。
- 同一責任者の大学Workspace 1件と個人Gmail 1件だけをprivate runtime allowlistへ置き、
  2つの実測`sub`をどちらも`admin`にするdeny-by-default運用契約。
- token期限、15分無操作、tab非表示、`pagehide`、401による自動lock、表示中PIIの消去、
  lock後に完了したresponseの破棄。

LOCAL IMPLEMENTATION GATE:

- [x] frontend全回帰、TypeScript、production build、静的export検証がPASS。
- [x] hostとread-only Docker開発imageのPython全回帰がPASS。
- [x] admin deactivate/revoke・worker grant競合の対象suiteと専用local PostgreSQL API/race gateがPASS。
- [x] PII検索語をURL queryへ入れず、POST JSON bodyへ送るcontractを確認。
- [x] APIがrole別にread/decision/retry/deactivate/revokeを許可・拒否する。
- [x] stale version、空白理由、unmanaged permission、同一key別payloadを拒否する。
- [x] accepted mutationが監査tableへ追記され、停止時の未完了grantが再付与待ちに残らない。

判定: `PHASE 8B LOCAL IMPLEMENTATION PASS / EXTERNAL AUTH AND HUMAN ACCEPTANCE PENDING / PRODUCTION BLOCKED`。
詳細は`phase8b-implementation-report.md`と`phase8b-admin-operations-runbook.md`を参照する。

EXTERNAL AUTH / HUMAN PASS GATE:

- [ ] Productionの`GOOGLE_ADMIN_ALLOWED_EMAILS`がprivateな完全一致allowlistで、未設定・空・重複・
  不正形式をfail closedにする。初期値はowner-controlledな2件だけとする。
- [ ] Cloudflare Pagesの管理proxy変数／encrypted edge secretとGCP Secret Managerの同値numeric versionを設定し、
  canonical hostと全公開aliasの管理pathをCloudflare Accessで上記2メールだけへ限定する。
- [ ] Cloud Run origin直叩きはedge secretなしで404、Access未認証はedgeで遮断、Access通過後も
  Google token不正・allowlist外・DB未登録`sub`を拒否する。
- [ ] 許可した大学Workspace／個人Gmailの2アカウントだけが`admin`として管理画面へ入り、
  その他のWorkspace／個人Google accountは一律拒否される。
- [ ] deployed APIとproduction管理者recordで2つの実測`sub`、`admin` role、deny-by-defaultを再検証する。
- [ ] production Neonで監査tableのUPDATE/DELETE拒否と、accepted mutationの監査追記を実証する。
- [ ] production PostgreSQLでadmin停止とrunning worker grantの同時競合を実証する。
- [ ] 外部Edgeと正規hostでowner-controlledな2アカウント、双方のMFA・recovery、
  管理UIのdesktop/mobile・keyboard・異常系を
  人が受け入れる。ローカル自動ブラウザ試験は、この人間受入の代替にしない。
- [ ] 正規hostでpre-auth rate limit、token期限、15分無操作、tab非表示、401 lockとPII消去を確認する。
- [ ] 実Driveでgrant/retry/deactivate/revokeと停止・復旧を確認する。
- [ ] 本人が管理API・worker・公開導線の停止、OAuth再認可、復旧runbookを実行できる。

第二管理者は設けず、PASSまたはProduction Cutoverの要件としない。2アカウントが同一人物に属する
single-operator riskを運営責任者が受容し、本人不在・両アカウント同時失効時の即時停止条件を記録する。

## 8. Phase 9: 旧Sheet/GAS/Drive移行

目的: 旧名簿をPostgreSQLへ安全に引き継ぎ、Drive実権限との差を説明可能にする。

ローカル実装済み:

- `google-form.csv`、`management-sheet.csv`、`drive-permissions.csv`をrepository外の
  protected bundleからだけ読むprivate CLI。public API/workerにraw data routeを作らない。
- exact artifact SHA-256、header、row/byte数をmanifestへ固定し、差替え・path traversal・
  暗黙上書きを拒否する。
- raw payload、normalized payload、rule versionを分離し、32 bytes以上のversion付き
  HMAC keyでrow fingerprint、normalized row/aggregate hash、Drive resource fingerprintを作る。
- `ready`、`manual_resolution`、`excluded`を分離する。曖昧な学年・区分、所属欠損、
  email・学籍番号・氏名の競合、Drive only/Sheet onlyを推測で補完しない。
- 有効なadmin、10文字以上の理由、source/report/normalized hash、Drive resource fingerprint、
  idempotency keyによるapprove。apply時にも承認adminが有効であることと全hashを再確認する。
- 既存Drive permissionを`already_granted`、`managed_by_system=false`として記録し、
  Drive operation、grant/revoke、通知メールを一切作らない。
- batchが作成した未変更recordだけをrollbackし、既存memberや依存追加後のmemberを削除しない。
- approve/reject/apply/rollbackの管理監査、raw payloadのDB改変拒否、1〜3650日の保持値固定、
  監査付きhold/unhold/purge、purge後も残す非PII同意来歴、保護されたrow別照合artifact。

LOCAL IMPLEMENTATION GATE:

- [x] Alembic `e0f1a2b3c4d5 -> f1a2b3c4d5e6`をupgradeし、非empty旧e0はfail-closed。
- [x] `f1a2b3c4d5e6 -> e0f1a2b3c4d5 -> c9d1e2f3a4b5 -> f8b0a1c2d3e4`を
  downgradeし、`f8b0a1c2d3e4 -> f1a2b3c4d5e6`へ再upgradeして`alembic check`をPASS。
- [x] 合成3 source rowsを別connection 2 workerで同時applyし、member/permission重複0。
- [x] 同一batch replay、rollback・re-approve・re-importが冪等。
- [x] raw snapshot改変をPostgreSQL triggerが拒否。
- [x] created/reused/skipped、lineage、reconciliation countsがPIIなしstatusで照合可能。
- [x] Drive operation、Google/Drive/email/Neon/Cloud Runの外部副作用0。

判定: `PHASE 9 LOCAL IMPLEMENTATION PASS / REAL SNAPSHOT AND HUMAN APPROVAL PENDING / PRODUCTION BLOCKED`。
詳細は`phase9-implementation-report.md`と`phase9-legacy-migration-runbook.md`を参照する。

REAL SNAPSHOT / HUMAN / PRODUCTION PASS GATE:

- [ ] 旧データの目的、access、暗号化、保管、正確な保持日数、legal hold、削除を人が承認。
- [ ] 旧Sheet、Google Form response、Drive permissionを同一基準時刻で読み取り専用取得。
- [ ] source件数が`ready + manual_resolution + excluded`と一致し、apply後は
  `applied + skipped`が全rowを説明する。
- [ ] Drive only、Sheet only、両方、不一致、unkeyedの全件を人が説明可能。
- [ ] source/dry-run/normalized hashとDrive resource fingerprintを確認した有効なadminが理由付きで承認。
- [ ] production migration roleだけがraw tableへaccessし、public/worker roleは拒否される。
- [ ] apply・rollback・re-importで欠落・重複がなく、管理監査とlineageが一致。
- [ ] 人間承認前後ともDrive grant/revoke、operation、通知メールが0件。
- [ ] snapshotとraw payloadを承認期限・方法どおり削除し、PIIなし削除証跡を保存。

## 9. Phase 10A: CSV/XLSX出力

目的: PostgreSQL正本を壊さず、定期名簿を運用へ渡す。

- `POST /admin/v1/exports`をadminだけに許可し、feature flagは既定OFFとする。
- server-side 1 statement snapshotから固定14列のCSV/XLSXをmemory内生成し、file本体を
  server filesystem、DB、Driveへ保存しない。
- CSVはUTF-8 BOM/CRLF、XLSXはinline textとし、先頭空白・control文字後を含む
  `=`, `+`, `-`, `@`を安全化する。macro、formula、external link、PII metadataを作らない。
- format、allowlist status/role filter、allowlist利用目的コード、確認、idempotency keyを
  要求する。export専用requestに自由記述理由を持たせず、PII/free-textを監査metadataへ入れない。
- 実行者、role、固定利用目的コード、snapshot時刻、件数、byte数、hash、条件、成否、推奨削除時刻を
  `library_export_runs`と管理監査へ追記する。file bytesは監査へ保存しない。
- 1回最大5,000 rows、service上限10 MiB、同時生成1、adminごと毎時12回、
  download推奨削除30日を初期限界とする。
- responseを`private, no-store`、`nosniff`とし、browser側でもSHA-256を再計算する。

LOCAL IMPLEMENTATION GATE:

- [x] adminはCSV/XLSXを取得でき、viewer/operatorは拒否される。
- [x] feature flag OFF時はendpointを`404`として非公開にする。
- [x] formula-like値、control文字、先頭0、Unicode、改行をCSV/XLSXで安全に保持。
- [x] XLSXにformula、macro、external relationship、PII document propertiesがない。
- [x] 5,000 rows上限、10 MiB service上限、同時生成、rate limit、idempotency conflictを実装。
- [x] 成功・上限失敗を監査し、PostgreSQL triggerがexport監査UPDATE/DELETEを拒否。
- [x] 管理UIで固定利用目的の選択、確認、status/role、hash再計算、temporary object URL破棄を実装。
- [x] 合成PostgreSQL gateでCSV hashとXLSX生成を確認し、外部副作用0。
- [x] 専用local PostgreSQLに対してfeature OFF、認証・RBAC・CORS、cache禁止、hash、削除期限、
  idempotency、rate limit、追記専用監査をAPI経由で確認。

判定: `PHASE 10A LOCAL IMPLEMENTATION PASS / DATA-HANDLING AND PRODUCTION AUTH GATES PENDING / PRODUCTION BLOCKED`。
詳細は`phase10a-implementation-report.md`と`phase10a-export-runbook.md`を参照する。

DATA-HANDLING / AUTH / PRODUCTION PASS GATE:

- [ ] 出力目的、列、許可admin、暗号化保存先、再共有禁止、30日以内削除を人が承認。
- [ ] production DB roleがexport監査へSELECT/INSERTでき、UPDATE/DELETEは拒否される。
- [ ] 正規hostで一般利用者、viewer、operatorを拒否し、MFA済みadminだけを許可。
- [ ] response header、download SHA-256、件数、snapshot時刻、監査recordが一致。
- [ ] 実Excelで文字化け、列順、先頭0、formula非実行、macro/外部linkなしを人が確認。
- [ ] download fileを承認済み暗号化領域だけに置き、期限内削除と削除証跡を確認。
- [ ] desktop/mobile/keyboard、二重click、上限、network失敗を正規hostで受入。

VBAからの書戻し、Drive操作、認証メール変更はPhase 10B候補とし、10Aの条件にしない。

### Phase 9/10A後のlocal pre-Production統合ゲート

目的: Production Gateへ外部統合する前に、自律実行可能なlocal検証を一つのfail-closed手順へ集約する。

- canonical commandは`scripts/library-local-preproduction-gate.ps1 -Action Run`とする。
- source integrity、frontend全回帰、production-shaped frontend rehearsal、production用三Docker target、
  Terraform format/validate、Python全回帰、Phase 9/10A PostgreSQL API/race、合成200件負荷、
  dump/restore、Docker cleanupを検証する。
- rehearsalはRFC 5737予約originと合成OAuth Client IDだけを使い、production artifactを検証後、
  明示的なmock buildへ復帰し、rehearsal値が`out/`へ残っていないことを確認する。
- sanitized evidenceは`outputs/library-registration/local-preproduction-gate.json`へ保存する。
- pre/postのHEAD、source manifest、worktree status fingerprintを別々に記録し、clean worktreeかつ
  全値不変でなければfail closedとする。
- `status=pass`、`source_integrity_unchanged=true`、全step・cleanup成功が揃った実行だけをlocal gate PASSとする。

このgateは実OAuth、Cloudflare、Cloud Run、Neon、Drive、Git、実PII、規約承認、人間E2Eを扱わない。
したがってlocal gate PASSでもPreview、Pilot、Production Cutoverは引き続き別判定とする。

## 10. Preview Gate

Previewは「本番公開」ではなく、非公開導線のhost検証である。
親`SiteHeader`再利用・登録CTA非表示・hero撤去・フォーム直結を含む最小UI改装は、2026-08-02の
local E2EでPASSした。Desktop 1440pxの大学学生・薬学部・`PP23000`自動承認、規約開閉、Mobile menu、
320px/390pxの`scrollWidth=clientWidth`・横overflowなし、console log 0件を確認した。
ただし、下記のhost検証とmachine evidenceが揃うまでPreview PASSへ進めない。

- [ ] R0 PASS。
- [ ] route追加だけのreview済みcommit。
- [ ] CTAはGoogleフォームのまま。
- [ ] noindex、非analytics、CSP、CORS、canonicalをhostで確認。
- [ ] mockまたは隔離test projectだけを使用し、実PII・本番Drive side effectなし。
- [ ] 320px・390px・1440px幅で、横overflow、console error、keyboard、focus、入力不足表示、二重submitを確認。
- [ ] preview URL削除またはrollback手順がある。

## 11. Limited Pilot Gate

- [ ] Phase 7Bの実Drive Gate、Phase 8AのCloud/Manual Gate、Phase 8BのExternal/Human GateがPASS。
- [ ] 利用規約、プライバシー、保存期間、国外保存、問い合わせ窓口を人が承認。
- [ ] production OAuth/API/DB/Driveを実hostで確認。
- [ ] 管理者停止・retry・revokeとrollbackを実施済み。
- [ ] 参加者、期間、上限、成功条件、停止条件を文書化。
- [ ] Googleフォームをrollback先として受付可能に維持。
- [ ] single-operator riskの受容と、本人不在・両アカウント同時失効時の停止条件を責任者が明示承認。

Pilotは5〜20名から開始し、200件/日イベントを最初から流さない。

## 12. Production Cutover Gate

以下を全て満たすまで、公式CTAを変更しない。

### 法務・個人情報

- [ ] 規約、プライバシー、保持・削除、照会、incident対応、保存地域を承認・版管理。
- [ ] 収集項目を必要最小限にし、不要なtoken/claim/Drive IDを保存しない。

### 認証・認可

- [ ] 公開登録routeでは、実hostでID token全検証と許可`hd`正系・個人Google否定系がPASS。
- [ ] OAuth第1層とDrive判定第2層の固定境界をE2Eで確認。
- [ ] 管理routeでは、初期private 2-account allowlist、2つの`admin` `sub`、全未許可account拒否、
  Cloudflare Access／同一origin proxy／private edge secret、両アカウントのMFA・recovery、
  session失効・再認可がPASS。

### データ・機能

- [ ] grant、既存permission、replay、同時submit、failure、retry、revokeがPASS。
- [ ] Phase 9移行・Drive照合が完了し、旧利用者の扱いを説明可能。
- [ ] 最低限の安全なCSV/XLSX出力がPASS。

### 運用・復旧

- [ ] backup/restore、migration rollback、kill switch、API read-only、CTA rollbackを訓練。
- [ ] error/dead operation/quota/cost/security alertと連絡先が有効。
- [ ] Secret rotation、OAuth再認可、管理者失効を運営責任者が文書化した復旧手順で実行可能。
- [ ] public ingress停止、Scheduler/Drive停止、spend cap発動時のGoogle Form rollbackを訓練。

### 公開

- [ ] Preview/Pilotの実測結果を承認。
- [ ] CTA切替を独立commitとしてreview。
- [ ] canonical URLでdesktop/mobile、console、headers、OAuth、DB、Driveをsmoke test。
- [ ] 旧Google Form/GAS停止は安定期間後に別承認で実施。

## 13. 準0円運用と容量方針

設計負荷は年間500登録、イベント時最大200登録/日、同時submit 2件を基準とする。
この件数自体は小さいが、無料を決めるのは登録件数より、常時起動、DB compute時間、log、
egress、backup、無限poll、無限retryである。

通常月額目標は`$0–$0.30`（150円/USDなら約0–45円）とし、Cloud Run spend cap初期提案を
`$0.20/月`、project alerts-only budget初期提案を`$1/月`とする。consoleが受理する最低額と
本人の絶対許容額を外部Gateで確認し、承認なく引き上げない。

費用抑制原則:

- Cloud Runはmin instances 0、initial max instances 1、短いtimeout、有限concurrency。
- workerは常駐させず、15分scheduler + 20件batched有限処理。5分pollはNeonを常時wakeさせ得るため不採用。
- frontend pollに回数・間隔上限を設ける。
- Neonは低compute、connection pool小、保存量/compute/egress alertを設定する。
- logへPIIを出さず、retentionとsampleを絞る。
- Cloud Run spend cap、project alerts-only budget、notification channelをruntime作成前の必須gateにする。
- public `allUsers` invokerを別gateとし、異常時はruntime削除前にpublic ingressだけを閉じる。
- exact 12 secret versionsの安全境界を維持し、無料6超過の6 versions、約`$0.36/月`を正式な低額費用として扱う。RPC token追加分は約`$0.06/月`、rotation中の一時13 versionsは約`$0.42/月`とする。
- 無料枠はサービス側が変更できるため、PreviewとProduction承認直前に公式料金を再確認する。

spend capは2026-08-02時点でPreviewで、gross estimated costに基づき新規Cloud Run利用をpauseする。
反映は瞬時でなく、in-flight request、遅延超過、Cloud Run外費用は残る。alerts-only budget単独を
上限と説明しない。cap/無料枠/quota到達時はpublic ingress、Drive worker、API writeを止め、CTAを
Googleフォームへ戻せることを運用条件とする。

## 14. 次に行う作業

1. 最新mainを統合したclean HEADでcanonical local pre-Production gateを実行し、sanitized evidenceの
   `status=pass`、pre/post source不変、全step成功、Docker cleanup、最終mock buildを確認する。
2. 所有者と別viewerでPhase 7Bの空テストフォルダE2Eを実施し、permissionとOAuth grantをcleanupする。
3. billing/cardはこの直前まで登録せず、本人承認後にCloud Run spend cap、project budget、通知先を
   先に設定する。その後だけPhase 8Aのreview済みTerraform plan、production Neon role/migration、secret rotation、
   deployed 200件/2同時負荷、別Neon branch restoreを本人承認のもとで実証する。
4. Phase 8Bの初期private 2-account allowlist、両`admin` bootstrap、Cloudflare Access、同一origin proxy、
   private edge secret、Cloud Run direct-origin拒否、正規host OAuth、全未許可account拒否、
   両アカウントのMFA・recovery、自動lock、外部Edge人間受入、
   production PostgreSQL同時競合、復旧drillを行う。
5. Preview公開を本番公開と分けて承認し、host上のheaders、CORS、CSP、320px・390px・1440px幅を確認する。
6. Phase 9/10Aのlocal実装は完了したため、データ取扱承認後にだけ実snapshot rehearsal、
   人間dry-run承認、正規host admin出力、実Excel受入へ進む。承認前は合成データに限定する。

Phase 8A/8B/9/10Aはローカル実装を完了しているが、外部サービスへのapply、実Drive変更、公開、
規約承認を自動完了扱いにしない。GoogleフォームのCTAはProduction Cutover Gateまで維持する。
