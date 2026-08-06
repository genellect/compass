# COMPASS PROJECT GUIDE

Status: Canonical
Scope: COMPASSの公開brand、公式Webサイト、接続する公開体験
Last verified: 2026-08-01
Reference: `genellect/compass` / `origin/main`

## 1. この文書の役割

この文書は、COMPASSの現行identity、project間の関係、教育上の原則、designの方向性、公開実装の境界を定義する。

COMPASSは、学生団体の紹介ページでも、未来戦略ライブラリ単体のWebサイトでもない。独自system、実践資料、教育体験、学生による共創を一つにつなぐ、学生主導型の教育・テクノロジープラットフォームである。

この文書はproject-levelの意味を管理する。coding agentの実行規則は`AGENTS.md`、技術境界は`docs/ARCHITECTURE.md`、copy・CTA・status・metricsの管理は`docs/CONTENT_GOVERNANCE.md`を正本とする。

## 2. Current Identity

### Brand statement

> Don’t Just Learn. Build What’s Next.

### Vision

> 学びを、意思決定の力へ。

### Core promise

> 北里大学薬学部から、学び・研究・未来をつなぐ。<br>
> 独自システム、実践資料、教育活動、学生コミュニティをひとつに。<br>
> 学生の「知る」を、「選ぶ」「動く」へ変える。

### Organizational status

COMPASSは学生有志による任意の学生支援活動である。北里大学、同大学の学部・研究室・関連機関の公式組織ではない。

## 3. なぜCOMPASSが必要か

知識を受け取るだけでは、学生は次の選択へ進めない。必要なのは、情報へ到達する経路、考えるための判断軸、実際に試せる道具、問いを共有できる場、そして行動へ移す機会である。

COMPASSは、講義で飲み込まれた疑問、進路選択で不足する情報、AI時代への戸惑い、何かを始めたい学生の孤立といった身近な課題から出発する。課題を観察し、根拠を集め、system・resource・learning experience・communityとして実装し、学生が自分の意思で次の一歩を選べる状態をつくる。

Technology自体を目的にしない。資料の数やfeatureの多さも目的にしない。COMPASSの価値は、学生の問いが理解、判断、参加、制作、行動へ変わることにある。

## 4. 二つの「4分類」

現行COMPASSには、活動領域と公開導線という二つの4分類がある。文書・UI・説明で混同しない。

### 4.1 活動領域 — Capability Model

| 領域 | 役割 |
|---|---|
| Technology | 教育・運営上の課題を、実際に使えるsystemとして実装する |
| Resources | 情報を、学生が使える資料と判断軸へ変換する |
| Education | 講義・講演・workshopを通じ、知識を学習体験へ変える |
| Community | 学生の挑戦、対話、共同制作、継続運営を支える |

親サイトのExperience UIでは、Educationの主要な提供形式を`Workshops`として示している。これは領域の廃止ではない。`Education`が活動領域、lecture / talk / workshopが提供形式である。

### 4.2 公開導線 — Public Experience Map

| 導線 | 役割 |
|---|---|
| Interactive | 中核product・参加型講義体験 |
| Library | 中核resource・意思決定支援 |
| Manifesto | AI時代における思想・行動宣言 |
| Community | 学生の参加・共同制作・運営参加 |

Manifestoは独立事業ではなく、COMPASSの思想と言語を外部へ伝えるbrand layerである。Founderは起源・専門性・説明責任を示す信頼layerであり、projectや活動領域そのものではない。

## 5. Project / Experienceの関係

### COMPASS

全体brandであり、Technology / Resources / Education / Communityを統合する母体。北里大学薬学部を起点にするが、価値は一つの学部・一つの専攻へ閉じない。

### COMPASS Interactive

リアルタイムとAIを用いて、質問、反応、理解、教材、教員操作を一つの講義体験へ接続する旗艦product。公開repositoryには紹介・Developer説明routeが含まれるが、product本体は別の非公開repository・別deploymentで管理される。

### 未来戦略ライブラリ

主に北里大学薬学部生を対象とする登録制の資料・判断支援service。試験等の直近課題から、英語、AI、研究、大学院、careerまでを接続する。COMPASS全体の中心そのものではなく、Resources領域の中核experienceである。

### COMPASS Essentials

薬学部生以外も利用できる一部resourceへの外部form導線。未来戦略ライブラリ登録、Community参加、Contact、Interactive lecture joinとは別のjourneyとして扱う。

### COMPASS Manifesto

AI時代を生きる学生へ向けた思想と行動のessay。技術仕様でも、独立した運営部門でもない。問いを投げかけ、読者を観客席から行動へ誘う。

### COMPASS Community

白金campusを主な拠点とする共同制作・学習community。教育企画、情報発信、教材、design、media、Web開発等を、関心と経験に応じて学生が一緒に形にする。

## 6. Audience

### Primary

- 北里大学薬学部生
- 薬学・生命科学を学ぶ学生
- 研究、英語、AI、大学院、career designに関心を持つ学生
- 講義や学習へより主体的に参加したい学生

### Secondary

- 教員・教育関係者
- 大学院生・卒業生
- engineer・technical reviewer
- 外部協力者・組織

公開contentは学生が直感的に理解でき、同時に教員・engineerが事実関係と設計意図を評価できる精度を持つ。

## 7. Experience Principle

COMPASSの体験は、次の流れを支える。

```text
Question → Evidence → Model → Prototype → Decision → Action
```

- 興味を生む前に情報を詰め込みすぎない。
- 興味だけで終わらせず、根拠と具体的な次の行動を示す。
- 一つの正解を押し付けず、選択肢と判断軸を提供する。
- student concernを長期の学び・研究・将来へ接続する。
- system上の便利さと教育的価値を区別して説明する。
- Mobileでの理解、可読性、tap、安定したlayoutを最優先する。

## 8. Voice and Writing

COMPASSの文体は次を満たす。

- 明快で、意思がある
- 知的に誠実で、学生に開かれている
- 大胆だが、誇張しない
- 温度があるが、曖昧にしない
- 技術を語るときは、利用者価値と責任まで示す
- 短いcopyで関心を生み、その後に根拠を置く

避けるもの:

- genericなAI startup表現
- 根拠のない最上級・導入実績・教育効果
- 読者価値より先に続く長い自己説明
- 技術の複雑さ自体を価値とする表現
- founder中心の自己宣伝
- 官僚的で学生から遠い大学文書調

## 9. Design Identity

現行のvisual systemは、deep navy、cyan、抑制したwarm gold、scientific grid、horizon、orbital geometry、neural particle、controlled motionを組み合わせる。

伝えるべき印象は、知性、方向性、academic credibility、scientific curiosity、future possibilityである。次へ寄せすぎない。

- generic neon AI dashboard
- 意味のない装飾密度
- fantasy色の強いscience fiction
- 空間だけが余り、情報階層を失ったminimalism
- animationがcopyとCTAを上回る構成

「見やすいのに密度が高い」を基準とする。Heroと主要messageが主役であり、背景演出はAI、life science、latest technologyを想起させながら、それらを支える。Japanese readability、contrast、reduced motion、stable layout、device performanceを優先する。

## 10. Content Principles

### 判断軸を届ける

資格、研究室、career、AI service、特定の思想を唯一の正解として推奨しない。利用者が選択肢、評価基準、risk、公式情報を理解し、自分で決められるcontentを作る。

### 現在の課題を未来へつなぐ

試験、英語資格、AI tool、講義、研究室選択等の身近な入口を、研究literacy、大学院、professional identity、international opportunity、長期的な成長へ接続する。

### AI利用では人間を主語にする

AIは学習、思考、執筆、research preparation、system operationを支援できる。一方で、判断、academic integrity、安全性、公開責任を代替しない。AI outputは検証とhuman reviewを経て使用する。

### Trustを機能として扱う

対象者、費用、登録条件、利用規約、privacy、再配布制限、公式情報との区別を、装飾ではなくproduct architectureの一部として示す。

## 11. Evidence and Status

次を必ず分離する。

- Productionへ反映済みのもの
- 明示した実環境でoperationally verifiedなもの
- 実装済みだが必要な実環境確認が残るもの
- plannedなもの
- historicalなもの

人数、資料数、行数、migration数、function数、test数、performance等には、測定日、対象system、scope、除外を付ける。設計上のcapacityや目標同時接続数は、完了したload testではない。mock participantは利用実績ではない。技術的な動作と教育効果は関連するが、同一の主張ではない。

状態語彙と更新手順は`docs/CONTENT_GOVERNANCE.md`に従う。

## 12. Technical Boundary

この公開repositoryは、Next.js static export、React、TypeScript、Cloudflare Pages、Pages Functions、Turnstile、Google Apps Script、analytics、automated verificationを使用する。

未来戦略ライブラリ登録は、公開static UI、public/admin/workerに分離したFastAPI、PostgreSQL、
Google OAuth、Drive permission worker、認証済み管理者画面で構成する。Production移行後の登録情報の正本は
PostgreSQLとし、旧GoogleスプレッドシートとExcel/CSVはそれぞれ読み取り専用の移行元、
監査済み一時出力として扱う。管理者画面では「申請・システム処理」と「登録者名簿」を分離し、
名簿の学年表示は`1年`〜`6年`、`M1`、`M2`、`その他`へ固定する。実PII、database dump、
credentialは公開source treeへ保存しない。

repositoryはpublicであり、管理URLや実装コードを秘匿できる前提を置かない。Library管理機能は
Cloudflare Access、同一originの最小Pages proxy、private edge secret、Google完全一致allowlist、
server-side `sub` RBAC、serviceごとのDB loginと最小DB roleを重ねる。public serviceは管理routeを
常時404とし、管理者・監査・export表へ到達できないため、sourceを読まれてもsecret値とProduction identity／dataなしでは
認証・認可を突破できない構成とする。管理URLは公開導線へ掲載しないが、非掲載や`noindex`を認可とは扱わない。
ただし、現行public DB roleには登録処理用tableのraw `SELECT`が残るため、そのDB credentialまで漏えいした場合の
PII一括読取は未解消である。RLS、限定関数、または同等のdata-service境界と実PostgreSQL権限試験で
credential単独のbulk readを拒否できるまで、実PII投入とProduction Cutoverを認めない。
Drive副作用は、producerが実Drive IDを持たずversioned HMAC-SHA256 operation attestationを発行し、
private workerだけが固定targetとOAuth credentialを持つ。DB行のtarget ID、欠損・改変・期限切れ・再利用署名を
権限根拠にせず、検証失敗時はDrive APIを呼ばない。

Libraryの公開repository前提のthreat modelと秘密情報区分は
`docs/library-registration/public-repository-security-boundary.md`を正本とする。

COMPASS Interactive本体は別repository・別deploymentで、独自のfrontend、data、authorization、AI、storage、verification architectureを持つ。保護されたLibrary content、Production user data、private credential、Production databaseは公開repositoryへ置かない。

詳細は`docs/ARCHITECTURE.md`を参照する。

## 13. Trust, Privacy, and Neutrality

- 目的に必要なdataだけを収集する。
- 個人情報、credential、保護資料をsource・log・analyticsへ出さない。
- 大学公式情報とCOMPASS独自の解説・提案を明確に区別する。
- 試験、履修、進級、研究室配属、career要件は公式情報での確認を促す。
- 特定研究室、career、資格、AI service、価値観を唯一の正解として扱わない。
- public content、AI output、安全判断、教育上の主張には人間が責任を持つ。

## 14. Success Criteria

COMPASSは、学生が次のいずれかへ進めたときに価値を生む。

- 知らなかった可能性を発見する
- 問いをより明確に理解する
- より良い根拠で選択肢を比較する
- 学習体験へ参加する
- 具体的な次の行動を始める
- 仲間と役立つものをつくる

traffic、登録、code量、feature数は補助指標であり、missionそのものではない。

## 15. Canonical Sources and Priority

1. そのtaskでユーザーが明示した要件
2. 現行Production挙動と最新`origin/main`の実装
3. `AGENTS.md`
4. `Project.guide/PROJECT_GUIDE.md`
5. `docs/ARCHITECTURE.md` / `docs/CONTENT_GOVERNANCE.md`
6. route-specific requirement・test・runbook
7. completed migration record・旧PDF・過去資料

Productionと`origin/main`が食い違う場合は、一方を推測で正本化せず差分を報告する。旧PDFと完了済み要件は`Historical`または`Completed`として扱い、現行sourceを上書きしない。

## 16. Change Principle

- 大規模な情報階層、Hero、navigation、registration flow、color system、dependency、deploymentの変更は、分析・提案・明示承認を経て実施する。
- 承認済みscope以外を「整理」の名目で変更しない。
- active / legacy / unusedは名称で判断せず、import、build、Git history、Production挙動で確認する。
- UI変更ではDesktopとMobileを別々に検証し、overflow、console、focus、motion、CTA destinationを確認する。
- local / CI passをProduction acceptanceと同一視しない。

## Responsive Experience Acceptance

Desktop / Mobileに加え、Windows 125%・150%表示やbrowser chromeで生じる横長・短尺CSS viewportを検証する。検証正本は`docs/responsive-browser-qa.md`とし、意味のある改行、実文字範囲、Mobile menu、展開前後、Hero初期画面を統合監査する。

## 17. Core Principle

> COMPASSは、学生が知識を受け取る場所ではなく、問いを根拠と行動へ変えるためのplatformである。

design、copy、system、resource、event、communityのすべては、この原則と学生のより良い意思決定を支える。
