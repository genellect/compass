# ADR-0007: 準0円運用と課金制御を前提とするProduction runtime

日付: 2026-08-02<br>
状態: Cost principle accepted; billing, external resources, and Production deployment pending

## Context

登録規模は年間約500件、イベント日最大200件であり、処理量そのものは小さい。運営方針は
「必ずカード不要」ではなく、通常は0円から数十円程度に抑え、異常時の自動追加課金を
実効的に制御することである。カードとbillingの登録は外部Production Gate直前まで延期する。

現行実装はFastAPI、Neon PostgreSQL、Cloud Run、Secret Manager、Cloud Scheduler、
Artifact Registry、Singapore GCS Terraform backendを前提に、public/admin/worker/migrationを分離している。
この実装を本命profileとして維持する。無料だけを理由に、検証済みの認証・DB・監査・Drive
outbox contractを別runtimeへ書き換えない。

Google CloudにはCloud Runを対象とするspend cap budgetがあるが、2026-08-02時点ではPreviewである。
指定projectのCloud Run費用がtargetを超えると新規利用を自動pauseする一方、反映は瞬時ではなく、
in-flight requestと反映遅延分は課金される。Secret Manager、GCS、Artifact RegistryなどCloud Run以外の
固定費も停止しない。alerts-only budgetは通知だけで、単独では課金上限にならない。

## Decision

1. Production runtimeの第一候補を`Cloudflare Pages static UI + Cloud Run FastAPI + Neon PostgreSQL`
   とする。Cloudflare WorkersへのAPI移植は、GCP billingを採用できない場合のcontingencyに限定する。
2. `compass-auth-502802`へのbilling link、カード登録、Free Trial、API有効化、resource作成、image push、
   Terraform applyは、本人が費用境界と対象projectを直前承認するまで実行しない。
3. 通常月額目標を`$0–$0.36`とする。これは保証額ではなく、12 active secret versionsのうち無料6を
   6 versions超える約`$0.36/月`、小さいSingapore state、image storage等を含む運用目標である。
   DB role分離やsecret分離を数円削減のために弱めない。
4. Cloud Run runtimeを作る前に、対象project・Cloud Run単一service scopeのspend cap budgetと、
   project全体のalerts-only budgetを別々に設定し、sanitized evidenceを残す。初期提案値は
   Cloud Run `$0.20/月`、project alert `$1/月`だが、実際のtargetはconsoleで設定可能な最小額を確認し、
   本人が直前承認する。絶対許容額より低く設定し、反映遅延の余白を取る。
5. Terraformの`cost_guardrails_review`を既定OFFにし、正のcap額、project alert額、exact confirmationが
   揃わない限りCloud Run runtimeをplan/applyできないようにする。これは外部budgetの存在を自動証明
   するものではなく、人間がreviewした証跡へのfail-closed latchである。
6. Cloud Runはrequest-based billing、`min=0`、public/admin/workerとも`max=1`、CPU idle、短いtimeout、
   有限concurrencyを固定する。API rate limit、DB pool上限、worker kill switch、有限retry、public
   read-only mode、旧Google Form rollbackを重ねる。
7. alerts-only budgetだけを「完全な上限」と説明しない。spend capもPreview、反映遅延、Cloud Run外費用の
   制約があるため、数学的な超過ゼロ保証とは呼ばない。Production PASSは多層制御と低額の残余riskを
   本人が受容した場合に限る。
8. spend capが対象billing accountで利用できない、許容上限を設定できない、または運営者がカード登録を
   承認しない場合はGCP runtimeをBLOCKし、Cloudflare Workers Free + Neon Freeの代替案を別ADR・
   contract比較・privacy review後にのみ採用する。
9. NeonはFree planを第一候補とし、100 CU-hours/月と0.5GB storageの50%・80%警戒線を運用で確認する。
   有料planへの自動移行を前提にせず、上限接近時は新規独自登録を停止してGoogle Formへ戻す。
10. 課金制御のためにPII保護、TLS、DB role分離、監査、OAuth検証、Drive least privilegeを緩和しない。

## Production cost PASS GATE

- [ ] 専用GCP projectとbilling accountだけを対象にし、他COMPASS projectとの費用共有を避ける。
- [ ] Cloud Run spend cap budgetが`Configured`で、project、service、monthly targetを本人が確認する。
- [ ] project全体のalerts-only budgetと通知受信者を確認し、通知到達を試験する。
- [ ] `cost_guardrails_review`の額がconsole証跡と一致し、exact confirmation付きplanをreviewする。
- [ ] public/admin/workerがrequest-based、`min=0`、`max=1`、CPU idle、想定timeout/concurrencyである。
- [ ] Scheduler 1 job、active secret version数、Artifact Registry、GCS、Loggingの固定・準固定費を棚卸しする。
- [ ] event日200件・同時2件のPilotでrequest、CPU、Neon CU-hour、storage、egress、月額見込みを実測する。
- [ ] cap発動またはquota 80%でDrive worker停止、API read-only、CTA rollbackが成立する。
- [ ] capは即時でなくCloud Run外費用を止めない残余riskを本人が承認する。

## Consequences

- 既存FastAPI/Neon/Cloud Run設計を維持し、数百人規模では通常費用をほぼ0円にできる。
- 12個のactive secret versionを分離して安全性を保つため、無料6個を超える6個分、約$0.36/月の固定費を許容する。RPC token rotation中の一時13個は約$0.42/月、今回追加分の限界費用は約$0.06/月である。
- billingとカード登録はProduction直前まで不要で、ローカル実装・検証を先に完了できる。
- Preview機能に依存するため、Production Gate直前に提供状況、最低target額、料金、regionを再確認する。
- Cloud Runが自動pauseした場合、独自登録はfail closedし、復旧は本人がcapを手動解除した後だけ行う。

## References（2026-08-02確認）

- https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps
- https://docs.cloud.google.com/billing/docs/how-to/budgets
- https://cloud.google.com/run/pricing
- https://cloud.google.com/secret-manager/pricing
- https://cloud.google.com/artifact-registry/pricing
- https://cloud.google.com/scheduler/pricing
- https://cloud.google.com/storage/pricing
- https://neon.com/pricing
- https://developers.cloudflare.com/workers/platform/pricing/
