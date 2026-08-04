# 準0円運用・容量・Docker開発計画

最終更新: 2026-08-03
料金基準日: 2026-08-02
対象: 未来戦略ライブラリ登録・名簿管理基盤

## 1. 結論

- 年間500登録、イベント日最大200登録は、FastAPI + Cloud Run + Neon Freeの容量上は十分小さい。
- 通常月額目標は`$0–$0.36`（為替150円/USDなら約0–54円）とする。主な残額はSecret Managerの
  12 active versionsのうち無料6を6つ超える約`$0.36/月`（約54円）と、Singaporeの小さいstate等である。
- Cloud Run computeは通常負荷ならFree Tier内の見込みだが、0円を保証しない。Cloud Run対象の
  spend cap、project alert、`min=0/max=1`、公開IAM停止、rate limit、worker kill switch、Google Form
  rollbackを重ねる。
- spend capの初期提案は`$0.20/月`（約30円）である。consoleがこの額を受理することを外部Gateで
  確認し、受理しない場合は本人承認なしに額を上げない。project全体には別の`$1/月` alerts-only
  budgetを置く。
- spend capはPreviewで反映が瞬時ではなく、in-flight request、遅延超過、Cloud Run外の固定費を
  止めない。従って「数学的に追加請求ゼロ」ではなく「数十円目標・低い残余risk・自動pause」の設計である。
- Docker Desktopは登録基盤専用resourceへ隔離して利用し、COMPASS Interactiveを停止・変更しない。

## 2. Docker Desktopと隔離境界

2026-07-19の実測でDocker Desktop 4.82.0、Engine 29.6.1、Compose v5.3.0、Linux/x86_64、
`desktop-linux` context、約16 CPU/15.5GiB memoryを確認した。CLIがPATH外でも
`scripts/library-docker-dev.ps1`が既知のDocker Desktop実体を解決する。

2026-08-03の再検査では、`docker` command、通常のProgram Files／user-local実体、
`com.docker.service`、Docker process、Appx／uninstall registryのいずれも検出できなかった。
したがって過去の実測を現在利用可能な証跡へ読み替えず、Docker gateは`BLOCKED: runtime unavailable`とする。
再導入はCOMPASS Interactiveのresource、port、contextへ触れないことを確認してから別の明示操作で行う。

登録基盤は次へ固定する。

| 項目 | 登録基盤専用値 |
| --- | --- |
| Compose project | `compass-library-registration-dev` |
| network | `fsl-registration-dev-network` |
| volume | `fsl-registration-dev-postgres-data` |
| PostgreSQL host port | `55432` |
| API host port | `58000` |
| PostgreSQL | 17、1 CPU/1GiB |
| API | 1 CPU/512MiB |

wrapperはownership label、protected port 54321–54327、`compass-interactive`参照、port衝突を検査し、
一致しなければ中断する。`Down`は登録基盤container/networkだけを削除し、登録volumeを保持する。
既存のCOMPASS Interactive container、network、volume、repository、path、secretへ触れない。

Dockerは開発・合成データ試験専用であり、Neon pooled/direct、scale-to-zero、Cloud Run cold start、
実Drive、実hostのProduction Gateを置き換えない。

## 3. 負荷モデル

| 指標 | 設計値 |
| --- | ---: |
| 年間登録 | 500件 |
| イベント日 | 最大200件/日 |
| event集中試験 | 200件/10分 |
| 同時submit | 2件 |
| 1登録あたりpublic API | 3 request |
| event日public API | 600 request |
| event集中時平均 | 1 request/秒、5倍burstも確認 |
| Cloud Run計算前提 | 1 vCPU、512MiB、1 request 2秒 |
| public/admin/worker上限 | 各min 0、max 1 |
| public concurrency | 20 |
| worker | concurrency 1、20 operation/回、15分間隔 |
| 1登録あたりDB増分 | 悲観値20KB、実測で更新 |

public APIはDrive処理を同期的に待たず、DB outboxへ有限状態として記録する。workerの5分pollは
Neonを常時wakeさせ得るため15分へ変更した。通常時の招待開始待ちは最大15分、200件event時は
20件ずつ処理し、Drive応答とretryを含むbacklog解消目標を3時間以内とする。このSLOはPilotで実測し、
未達でも間隔を無条件に短縮せず、event-driven方式または手動承認済み臨時drainを比較する。

## 4. Cloud Run費用

request-based billingのFree Tierは月180,000 vCPU-seconds、360,000 GiB-seconds、2,000,000 requests
相当をTier 1単価のcreditとして扱う。SingaporeはTier 2であるため、ここではCPU
`$0.0000336/vCPU-second`、memory `$0.0000035/GiB-second`、request `$0.40/100万件`を使う。

1登録をpublic API 3 request × 2秒とすると、gross costは概算`$0.000213/登録`である。

| シナリオ | 登録/月 | request/月 | gross概算 | net見込み |
| --- | ---: | ---: | ---: | ---: |
| event 1日 | 200 | 600 | `$0.043` | `$0`見込み |
| 年500件を1か月へ全集中 | 500 | 1,500 | `$0.107` | `$0`見込み |
| proposed spend cap相当 | 約938 | 約2,814 | `$0.20` | capによりpauseし得る |
| 200件/日を30日 | 6,000 | 18,000 | `$1.28` | Free Tier内の可能性が高いがcap先行 |
| 100,000件/月 | 100,000 | 300,000 | 約`$21.3` gross | capなしでは有料化し得る |

spend capはgross estimated costで判定し、Free Tier creditを差し引く前に発動し得る。このため
`$0.20`は請求額上限というより、想定500件/月を通しつつ異常流量を早く止めるtraffic-cost fuseである。

最悪時の計算境界として、1 vCPU/512MiBのserviceが連続CPU割当された場合は約`$0.127/時`、
public、admin、workerの3 serviceが同時に連続稼働しても約`$0.382/時`である。`max=1`により水平拡張費を
抑えるが、Googleはspend capの反映時間を保証していないため、遅延が長ければcap超過は発生する。

### Cloud Run cost fuse

1. projectとCloud Runに限定したmonthly spend capを、初期`$0.20`で設定する。
2. 50%・80%・100%通知と`Configured`状態を本人が確認する。
3. project全体のalerts-only budgetを初期`$1`で別に設定する。これは通知だけで停止しない。
4. Terraform `cost_guardrails_review`とsanitized console証跡の額を一致させる。
5. runtimeは`min=0`、`max=1`、CPU idle、short timeout、bounded DB poolとする。
6. `public_ingress_activation`を既定OFFにし、Pilot/Cutover時だけexact confirmationで`allUsers`
   invokerを作る。異常時は最初にOFFへ戻して新規public computeを閉じる。
7. Scheduler/Driveは別gateで停止し、API writeをread-onlyへ戻し、CTAをGoogle Formへrollbackする。

## 5. Neon PostgreSQL

Neon Freeはprojectあたり100 CU-hours/月、0.5GB storage、最大2 CUを基準とし、非稼働時は
scale-to-zeroさせる。課金planへ自動移行する前提にせず、Free上限接近時は独自登録をfail closedする。

| シナリオ | 悲観評価 |
| --- | --- |
| 200件を1時間に集中 | 2 CUを1時間使っても2 CU-hours |
| 15分poll、5分後suspend、常時0.25 CU | 約60 CU-hours/月 |
| public利用・admin・backupの余白 | 残り約40 CU-hours/月を警戒枠とする |
| 5分poll、常時0.25 CU | 約180 CU-hours/月となりFree不適合のため不採用 |

storageを20KB/登録とすると0.5GBは約25,000登録、250MB警戒線は約12,500登録である。
年間500件なら登録本体は約10MB/年だが、監査、operation、index、export/import auditを月次実測する。

Production Gateでは次を確認する。

- Free plan、100 CU-hours、0.5GB、scale-to-zero設定と現在利用量。
- API pooled、worker pooled、migration/backup directのrole分離。
- 50%/80%停止線。80%到達時はworkerと新規writeを停止する。
- 別branch restore、Alembic head、row/table/constraint/ownership照合。

## 6. Cloud Run以外の費用

| サービス | 無料・低額境界 | 本構成の見込み・制御 |
| --- | --- | --- |
| Secret Manager | billing account全体で6 active versions無料、超過`$0.06/version/月` | exact 12を安全上維持。ほかのprojectが無料枠を消費していなければ通常約`$0.36/月`。RPC token追加分は約`$0.06/月`。rotation後は旧versionを確認して無効化 |
| Artifact Registry | 0.5GiB-month無料、超過約`$0.10/GiB-month` | 4 imageは共通layerを利用。push前0.4GiB警戒、current/last-known-goodを残してcleanup |
| Cloud Scheduler | 3 job無料 | worker 1 job、15分間隔、retry 0 |
| Cloud Logging | 50GiB/project/月無料 | PII log禁止、structured metadataのみ、volume警戒 |
| GCS Singapore | US Always Free対象外で微小storage/operation費があり得る | Terraform stateだけ。UBLA/PAP、version/lifecycle、月次byte棚卸し |
| Cloudflare Pages | static asset requestは無料 | 静的UIだけ。API runtimeにはしない |
| Drive API | quota・料金変更を直前再確認 | 200 permission/dayは小さいが有限retryとkill switchを維持 |

Cloud Run spend capは上表を停止しない。外部の利用者が増やせる主経路はpublic requestであり、これを
Cloud Run capと公開IAM停止で抑える。image push、secret version追加、GCS state操作は承認済みoperator
だけが行い、CIによる無制限自動deployを採用しない。

## 7. 悲観シナリオと費用境界

| 事象 | capなしの概算 | 制御後の扱い |
| --- | ---: | --- |
| 通常500件/年 | compute `$0`見込み、Secret Manager約`$0.36/月`＋微小固定費 | 継続 |
| event 200件/日 | gross compute約`$0.043` | cap未到達、通常処理 |
| 500件が同一月 | gross compute約`$0.107` | cap未到達見込み |
| 約938件相当のgross compute | `$0.20` | spend capがCloud Run新規利用をpauseし得る |
| 攻撃・loopで3 service連続稼働 | 約`$0.382/時` | 各max 1 + cap + public/admin IAM停止。反映遅延分は残る |
| Artifact 1GiB保持 | 無料超過0.5GiBで約`$0.05/月` | push前size gate、manual cleanup |
| Secret 12 active | 約`$0.36/月` | 安全性のため受容（billing account内の無料6が未使用の場合） |
| Secret rotationで一時13 active | 最大約`$0.42/月`相当 | 新revision確認後に旧version無効化 |
| Neon Free上限接近 | 有料化を自動選択しない | 80%でwrite/worker停止、計画見直し |

為替、税、billing account内の他project、Free Tier変更、spend cap反映遅延により実請求は変わる。
このprojectを専用billing scopeへ置き、Production承認直前に公式料金とconsole表示を再確認する。

## 8. PASS GATEと停止線

ローカルで自律実行する項目:

- [x] Docker専用resource、port、label、COMPASS Interactive保護を実装。
- [x] public/admin/worker/migration image、PostgreSQL 17、Alembic、API、DB role、合成200件・同時2件・
  dump/restoreの個別gateを実装・検証。
- [x] Cloud Run `min=0/max=1`、public ingress独立gate、15分worker、batch 20をTerraformへ固定。
- [x] runtime作成前に`cost_guardrails_review`と通知channelを要求するTerraform preconditionを追加。
- [ ] 最新main統合後のclean HEADでcanonical local gateを再実行し、pre/post source snapshot一致を証明。

本人操作と外部Gateが必要な項目:

- [ ] billing/cardを有効にする直前に対象project、支払方法、解約・停止方法を本人確認。
- [ ] Cloud Run spend capの提供状態とconsole最小額を確認し、`$0.20`または本人承認額で設定。
- [ ] project `$1` alerts-only budget、通知recipient、通知到達を確認。
- [ ] Secret 12、Artifact Registry 0.4GiB、GCS state byte、Logging、Scheduler 1 jobを棚卸し。
- [ ] Neon 50%/80%、scale-to-zero、15分poll時のCU-hourを実測。
- [ ] deployed Pilotで200件・同時2件、Drive backlog 3時間以内、5xx、latency、costを確認。
- [ ] cap/異常時にpublic IAM停止、Scheduler/Drive停止、API read-only、Google Form rollbackを訓練。
- [ ] Preview/Pilot/Productionの各直前に料金、Free Tier、spend capのPreview状態を再確認。

capが利用できない、最低額が本人許容額を超える、または残余riskを本人が承認しない場合、GCP runtimeは
`BLOCKED`のままとする。Cloudflare Worker等への移行は自動判断せず、別の設計・contract parity・
privacy Gateを経る。

## 9. 公式参照

- https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps
- https://docs.cloud.google.com/billing/docs/how-to/budgets
- https://cloud.google.com/run/pricing
- https://docs.cloud.google.com/run/docs/configuring/max-instances
- https://cloud.google.com/secret-manager/pricing
- https://cloud.google.com/artifact-registry/pricing
- https://cloud.google.com/scheduler/pricing
- https://cloud.google.com/logging
- https://cloud.google.com/storage/pricing
- https://neon.com/pricing
- https://docs.docker.com/subscription/desktop-license/
