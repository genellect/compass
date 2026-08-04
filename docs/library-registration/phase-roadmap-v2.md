# 未来戦略ライブラリ 登録・名簿管理基盤 Phaseロードマップ v2

> **履歴文書:** この文書は当時のPhase定義と証跡を保持するため残している。
> 2026-08-01以降の実装順、PASS GATE、公開判定には
> `phase-roadmap-v3.md`を使用する。
> 本文中の第二管理者要件はADR-0003で廃止済みであり、現行Gateには適用しない。

最終更新: 2026-07-17<br>
文書状態: 実装前再定義版<br>
対象: 登録導線、利用者名簿、管理画面、旧GAS/Sheet移行、Excel・Excel VBA連携、本番移行<br>
実装境界: 本文書は計画・ゲートの再定義だけを行い、新しい外部接続や本番変更を許可しない。

## 1. 結論

当初の目的は「Googleフォーム＋GAS＋スプレッドシートを独自フォームへ置き換えること」だった。将来要件を含めて再精査すると、最終目的は次のように定義し直すべきである。

> 北里大学薬学部を中心とする未来戦略ライブラリの利用資格確認、Drive閲覧権限、現役利用者名簿、管理者操作、旧名簿移行、定期出力を、監査可能な単一の運用基盤へ移行する。

ただし、汎用フォーム基盤、学生情報システム、Excelを正本とする双方向同期基盤は作らない。PostgreSQLを唯一の正本とし、Google Drive、旧スプレッドシート、Excel/VBAはそれぞれ権限先、移行元、出力・照合先として扱う。

現時点の判定は次のとおりである。

- `Phase 3 Local MVP PASS`: 独自UI、条件付き項目、TypeScript/Python共通判定、静的ビルド、ローカル表示は合格。
- `Production Gate BLOCKED`: 実Google認証、DB、Drive付与、管理者認証、旧名簿移行、バックアップ・復旧は未実装または未確認。
- 次に実装へ進む前に、Phase 4の方針・運用・個人情報ゲートを通過させる。

## 2. 当初要件の再精査

### 維持する目的

- 大学Googleアカウントから取得した検証済みメールを使用し、手入力メールを廃止する。
- 学生の自動承認条件を、薬学部かつ `PP / PL / MP + 数字5桁` とする。
- `PP00000`を学生の有効学籍番号として扱わない。
- 博士課程、教員、職員、大学担当者、薬学部以外、既存情報との不一致は個別確認へ送る。
- 条件を満たした利用者にGoogle Driveの`reader`権限を付与する。
- 二重登録、二重権限付与、二重メール送信を防ぐ。
- 年間数百人規模で通常月の運用コスト0円を目標とする。

### 追加する目的

- 認証機能付き専用URLから、管理者が現役利用者名簿を検索、確認、停止、再処理、出力できる。
- すべての管理者操作を、実行者、対象、日時、理由とともに監査できる。
- 旧GAS連携スプレッドシートを読み取り専用の移行元として取り込み、Driveの実権限と照合できる。
- Excel/Excel VBAから利用できる、版管理されたCSV/XLSX出力を提供する。
- Excelからの更新が必要な場合も、直接DBを書き換えず、変更要求の検証・差分確認・管理者承認を経由する。

### 明示的に対象外とするもの

- 汎用フォームビルダー、アンケート基盤、講義分析基盤。
- Excel/VBAからNeon PostgreSQLへの直接接続。
- Excelファイル、旧Sheet、PostgreSQLを同時に正本とする双方向同期。
- URLを知っていることだけを認証とみなす管理者画面。
- 管理者の長期アクセストークン、DBパスワード、APIキーをExcelブックへ埋め込む設計。
- 人間の確認を経ない旧名簿の一括上書き、または移行時のDrive権限自動追加・削除。

## 3. 現行実装の到達点

| 領域 | 現在の状態 | 判定 |
| --- | --- | --- |
| 登録UI | `/library-registration/`に独自UIを実装。氏名、所属、在籍区分、学年、学籍番号、規約、個人情報、任意質問を表示 | Local PASS |
| レスポンシブ | Desktopと狭幅で横方向の表示崩れがないことを確認 | Local PASS |
| 資格判定 | TypeScriptとPythonで同一の正規化・判定契約を実装 | Local PASS |
| 判定テスト | 共通14ケースが両言語で成功 | Local PASS |
| FastAPI | `/health`と`POST /phase3/evaluate`のみ。認証事実も既存登録状態も入力値として受ける純粋契約 | Production不可 |
| Google認証 | 3種類のモックのみ | 未実装 |
| PostgreSQL | SQLAlchemy、Alembic、Neon接続、テーブルなし | 未実装 |
| Drive権限 | 現行MVPからは一切付与しない | 未実装 |
| メール | 現行MVPからは一切送信しない | 未実装 |
| 管理画面 | なし | 未実装 |
| 旧名簿移行 | なし | 未実装 |
| Excel/VBA | なし | 未実装 |
| 公開導線 | 現行GoogleフォームCTAを維持 | 安全境界を維持 |

旧GASには、リポジトリ外で管理する対象IDに対してDrive APIの`reader`権限を作成し、管理記録をスプレッドシートへ追加する処理が存在する。2026-07-16のAPI実測により、対象は共有ドライブではなくMy Driveフォルダと確定した。現行MVPはこの処理へ接続されていない。

## 4. 再定義後の設計原則

### 4.1 正本はPostgreSQLだけにする

```text
旧Google Sheet ──一方向移行──> PostgreSQL ──権限同期──> Google Drive
                                      │
                                      ├──管理画面
                                      └──版付き出力──> CSV / XLSX / Excel VBA
```

- PostgreSQLだけが現役利用者状態の正本となる。
- 旧Sheetは移行完了後に読み取り専用化し、正本へ戻さない。
- Excel出力はスナップショットであり、DBと同じ権限を持たない。
- Excelからの変更は直接更新ではなく「変更要求」として取り込む。

### 4.2 申請履歴と利用者名簿を分離する

当初案の`library_registrations`一表だけでは、再申請、利用停止、メール変更、旧名簿移行、Excel差分更新を安全に表現しにくい。次の論理モデルへ修正する。

| 論理テーブル | 役割 |
| --- | --- |
| `library_members` | 現役・停止済みを含む利用者名簿の正本 |
| `library_identities` | Google `sub`、検証済みメール、初回紐付け状態 |
| `library_applications` | 各申請、入力、同意版、判定結果の履歴 |
| `library_access_grants` | Drive対象、permission ID、付与・削除状態 |
| `library_operations` | Drive、通知、再試行の冪等な処理記録 |
| `library_admins` | 管理者`sub`、役割、無効化状態 |
| `library_admin_audit` | 管理者操作の追記専用監査ログ |
| `library_import_batches` / `library_import_rows` | 旧Sheet・Excel変更要求のステージングと差分 |
| `library_export_runs` | 出力条件、件数、版、ハッシュ、実行者 |

実テーブル数はPhase 5でER図とマイグレーションをレビューして確定する。年間数百人規模では、テーブル数を減らすことより、責務と監査境界を分けることを優先する。

### 4.3 公開登録と管理画面の認証を分離する

- 公開登録: Google Identity ServicesのIDトークンをFastAPIで検証し、`sub`、`email_verified`、`hd`、`aud`、`iss`、`exp`をサーバー事実として生成する。
- Google認証の責務は、許可された大学Workspaceアカウントを本人が操作できることの確認に限定する。薬学部、学年、学籍番号、学生・教員等の区分はフォーム入力による内部資格判定に残す。
- Google認証成功だけでフォーム属性を承認せず、フォーム条件一致だけで大学アカウント確認を省略しない。
- 同じ許可`hd`を持つ組織ユーザーは学生・教員で分岐せず認証ゲートを通過させる。この入口仕様の説明変更を、Drive付与可否を決める内部資格判定の変更理由にしない。
- 管理画面: 専用URLに加え、管理者`sub`許可リスト、短時間のサーバーセッション、`HttpOnly`・`Secure` Cookie、CSRF対策を必須とする。
- 管理者権限: `viewer`、`operator`、`admin`の最小3段階を採用し、Drive削除・利用停止・一括更新は`admin`または明示承認を必要とする。
- URLの非公開性や`noindex`は補助策であり、認証・認可の代わりにしない。

Googleは、IDトークンをサーバーで検証し、組織制限にはメールドメインだけでなく`hd`を確認し、ユーザーの主識別子には変更可能なメールではなく`sub`を使うよう案内している。<br>
参考: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)、[IDトークンのサーバー検証](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)

### 4.4 Drive通知を最小構成の第一候補にする

当初案の「Drive通知を抑止してGmail APIで独自HTMLメールを送る」はブランド表現には有利だが、Gmailスコープ、運営者リフレッシュトークン、送信失敗状態が増える。最小本番では次を推奨する。

1. Drive APIの権限付与と標準招待通知を第一候補にする。
2. 登録完了画面で、大学メールに届くGoogle Drive招待を確認するよう案内する。
3. 独自HTMLメールはDrive付与が安定した後の任意拡張とする。
4. 現運営者本人が所有するMy Driveフォルダでは、所有者OAuthを初期自動化主体とし、退任・失効時の再認可手順をProduction条件にする。

Drive APIの`reader`はViewerに対応する。対象はMy Driveフォルダであるため、フォルダへのユーザーpermissionとして実装する。既存のcommenter/writerを登録処理で自動降格しない。`permissions.create`の同一対象への並行操作は避け、DBロックまたは処理直列化で二重付与を防ぐ。<br>
参考: [Shared drives overview](https://developers.google.com/workspace/drive/api/guides/about-shareddrives)、[Drive roles](https://developers.google.com/workspace/drive/api/guides/ref-roles)、[permissions.create](https://developers.google.com/workspace/drive/api/reference/rest/v3/permissions/create)

### 4.5 Excel/VBAは出力・照合から始める

- Phase 10Aでは、管理画面からUTF-8 BOM付きCSVとXLSXを出力する。
- 出力には`schema_version`、`generated_at`、`row_count`、抽出条件、SHA-256を含むmanifestを付ける。
- `=`, `+`, `-`, `@`で始まるセルを数式として解釈させない。
- VBAはローカルでの整形、学年別シート作成、差分表示、印刷用帳票作成に限定する。
- マクロブックにDB接続情報や長期APIキーを保存しない。
- マクロ配布時はコード署名と版番号を必須とする。

ExcelのPower Query Web connectorはCSV/XLSX/JSON等のWeb取り込みに対応するが、認証方式と利用環境の差がある。このため、初期段階では認証済み管理画面からのダウンロードを標準とし、Power QueryやVBAによるリモート更新は後続の任意ゲートとする。<br>
参考: [Power Query Web connector](https://learn.microsoft.com/en-us/power-query/connectors/web/web)、[Office trusted publishers](https://learn.microsoft.com/en-us/microsoft-365-apps/security/trusted-publisher)

## 5. PASS GATEの共通定義

各Phaseは、実装完了の宣言ではなく、証跡を伴うPASS GATEで終了する。

| 状態 | 意味 |
| --- | --- |
| `PASS` | 必須項目をすべて満たし、次Phaseへ進める |
| `PASS WITH CONDITIONS` | 開発は進められるが、未解決項目をProduction Gateへ持ち越せない |
| `BLOCKED` | セキュリティ、個人情報、権限、費用の前提が欠け、後続接続へ進めない |
| `NOT STARTED` | 未着手 |

各ゲートには最低限、次を残す。

- 対象コミットまたは文書版。
- 実行したテストコマンドと結果。
- 実ブラウザまたは実サービス確認の証跡。
- 未解決事項、リスク、担当者、期限。
- ロールバック手順。
- 個人情報・秘密情報がログや成果物へ混入していない確認。

## 6. Phase別実装方針

### Phase 3: Local MVP（現在）

目的: 外部通信なしで、UIと資格判定契約を確定する。

完了済み:

- 独自登録UIとレスポンシブCSS。
- 薬学部と学籍番号を含む明示的判定。
- TypeScript/Python共通14ケース。
- 静的ビルドと凍結サイト検証。

PASS GATE:

- [x] `npm.cmd run check`成功。
- [x] TypeScript 14件成功。
- [x] Python 14件成功。
- [x] 現行`future-strategy-library/`と`messages/`の凍結比較成功。
- [x] 外部送信、DB保存、Drive付与、メール送信なし。

判定: `PASS (LOCAL ONLY)`。本番機能の証明には使用しない。

### Phase 4: 方針・個人情報・外部権限確定

目的: 外部サービスへ接続する前に、技術では決められない運用前提を確定する。

2026-07-19判定: `BLOCKED`。証跡収集と方針決定、Phase 5のPostgreSQL
統合、P4-B01の`hd`実測は完了した。第二管理者、OAuth引継ぎ、国外保存の
正式承認が揃うまで、Phase 6B昇格と実PII保存は禁止する。Phase 6Aの
署名検証・認証DB・登録APIは、Primary 1名、合成データ、外部副作用無効の
条件で実装してよい。解除手順は
`phase4-blocker-resolution-pack.md`を参照する。

P4-B02の管理者pair比較、P4-B03のread-only token失効・再認可tool、P4-B04の
vendor公式確認は準備完了。Codex側で代行できる実装・証跡様式は完了し、本人
ログイン、Google同意、第二管理者指名、運営責任者承認だけを手動gateとして残す。

実施内容:

- 同一Workspace組織の代表アカウント1件でGoogle `hd`の実値を確認する。学生用・教員用の追加測定は要求しない。
- Drive対象IDがMy DriveフォルダであることをAPI証跡として記録する。
- 所有者OAuthを初期自動化主体として採用する。
- 運営者OAuth主体の退任・失効時の引継ぎと再認可手順を決定する。
- 規約版、プライバシー版、保存項目、保存期間、削除手順、大学照会時の手順を承認する。
- Neonの利用可能リージョンを作成時点で再確認し、国外保存可否を承認する。
- 管理者候補と`viewer/operator/admin`の責務分担を決定する。
- 0円運用が「通常運用目標」であり、従量課金超過を数学的に保証しないことを運用責任者が承認する。

PASS GATE:

- [x] `hd`実測結果`st.kitasato-u.ac.jp`と許可候補が文書化済み。
- [x] Driveリソース種別、付与単位、必要ロール、自動化主体が設計上確定済み。
- [x] 保存期間と削除方針が確定済み。正式本文への反映はProduction条件。
- [x] データ保存地域はSingaporeを第一候補として確定。正式運営承認は未完了。
- [x] 第二管理者pair証跡とOAuth失効・再認可の安全な実行toolを準備済み。
- [ ] 本番第二管理者の指名、本人ログイン、MFA確認、再認可実証が未完了。
- [ ] Singapore primary region、国外アクセス・再委託可能性の正式承認が未完了。
- [x] 費用上限設定と月次確認責務が確定済み。

判定基準: 1項目でも未確定ならProductionは`BLOCKED`。Phase 5とPhase 6Aの
ローカル実装は開始できるが、実個人情報を外部DBへ保存してはならない。

### Phase 5: PostgreSQL永続化・監査基盤

目的: PostgreSQLを正本にし、外部APIを呼ばずに登録・重複・停止・監査を保証する。

2026-07-16判定: `PASS`。SQLAlchemy、Alembic、Psycopg、初期schema、
冪等登録service、ローカルAPIに加え、Neon Singaporeの合成データ専用
project/branchでPostgreSQL統合ゲートを完了した。実測値は
`phase5-postgresql-integration-gate.md`を参照する。

実施内容:

- SQLAlchemy 2、Alembic、psycopg 3を導入する。
- Phase 4で承認した論理モデルをER図とマイグレーションへ落とす。
- `google_sub`、正規化メール、正規化学籍番号へ適切な一意制約を設ける。
- 旧利用者向けに`google_sub`を一時的にNULL許容とし、初回認証で安全に紐付ける。
- 冪等キー、行バージョン、作成・更新・停止日時をサーバー時刻で管理する。
- PIIをアプリログ、例外メッセージ、監視通知へ出さない。
- Neon開発DBと本番DBを分離し、接続はTLSと小さいpoolで行う。

PASS GATE:

- [x] 空DBからAlembic適用で最新スキーマを再現できる。
- [x] 使い捨てDBでupgrade/downgradeまたは前進修復手順を確認済み。
- [x] 同時二重送信で一意制約とトランザクションが破れない。
- [x] 申請履歴と現役名簿が分離され、再申請で履歴を失わない。
- [x] バックアップから別DBへの復旧リハーサル成功。
- [x] テストログとCloud Run想定ログにPII・接続文字列がない。
- [x] Drive・Gmail等の外部副作用はまだ無効。

### Phase 6A: Google認証・登録API基盤

目的: クライアントが送った認証事実を信用せず、FastAPIが本人性と所属組織を判定する。

実装条件: Primary 1名、合成データ、`EXTERNAL_SIDE_EFFECTS_ENABLED=false`。
第二管理者は技術実装の前提にせず、Phase 6B/Production Gateへ持ち越す。

実施内容:

- Google Identity Servicesを登録画面へ接続する。
- FastAPIで署名、`aud`、`iss`、`exp`、`email_verified`、`hd`を検証する。
- `sub`を主識別子にし、メールは変更可能属性として扱う。
- `/phase3/evaluate`の本番利用を禁止し、認証事実・既存登録状態をサーバー生成する新APIへ置き換える。
- 厳格なCORS、入力上限、リクエストIDを導入する。分散レート制限は
  Preview負荷試験前に方式を確定する。
- 管理者用には`sub`ベースのRBAC照合を導入する。短時間session、CSRF、
  Cookie属性、失効処理は認証付き管理画面を作るPhase 8で実装する。
- 実装済みDocker development imageとPostgreSQL 17 local Composeを継続利用する。
  production targetのshutdown、timeout、read-only filesystem、Cloud Run相当設定を
  追加検証する。Neon固有挙動の最終ゲートは実Neon branchで行う。

PASS GATE:

- [x] Google Identity Servicesを明示的設定時だけ読み込むUIを実装済み。
- [x] Google公式libraryで署名、`aud`、`iss`、`exp`を検証し、
  `email_verified`と許可`hd`を追加検証する実装と合成試験が成功。
- [x] `sub`を主識別子としてDBへ結び、トークン本体を保存しない。
- [x] 同一人物の再送は新しい人物を作らず、別`sub`によるsilent linkと
  idempotency key横取りを拒否する合成試験が成功。
- [x] クライアントが送る`account`や既存登録状態をPhase 6 APIが受け付けない。
- [x] 管理者認可はGoogle `sub`とactive roleで照合し、一般大学アカウントへ
  メール一致だけで権限を与えない。
- [x] CORS allowlist、Bearer境界、トークン非反射、リクエストIDを自動試験済み。
- [x] 実大学アカウントが認証でき、実測`hd`と大学メールを確認できる。
- [x] 個人Googleアカウントを実Google E2Eで許可Workspace外として拒否する。
- [x] 同一組織の教員アカウントには追加測定を要求せず、OAuth第1層では役割分岐
  しない。Drive付与可否はフォーム固定判定で分岐する仕様と自動試験を維持する。
- [x] Docker imageの非root起動、health、shutdown、local PostgreSQL 17での
  migrationと64件のPython回帰が成功。
- [x] 合成データ専用NeonへPhase 6A revisionを前進適用し、direct migration、
  pooled schema検証、Docker全回帰を完了する。

### Phase 6B: Pre-Production認証運用ゲート

目的: Phase 6Aを本番相当環境へ昇格させる前に、単独管理者依存、実PII、
認証失効、国外保存の運用リスクを解消する。

PASS GATE:

- [ ] 第二管理者を1名以上指名し、Primary/Secondaryの異なる`sub`、同一`hd`、
  MFA、緊急連絡可否を確認する。
- [ ] OAuth主体の失効・再認可・引継ぎを空のDriveテストfolderで実証する。
- [ ] Singapore保存、国外アクセス・再委託、保存期間、削除手順を正式承認する。
- [ ] Preview環境のSecret/CORS/Originを確定し、実PIIを保存する前に
  アクセス制御、削除、バックアップ、費用alertを確認する。
- [ ] 分散または単一instance制約と整合するレート制限を負荷試験し、
  1日200件のイベント時シナリオを通す。

### Phase 7: Drive閲覧権限・招待通知

目的: 承認済み利用者にだけ、冪等にDrive Viewer権限を付与する。

実施内容:

- DBへ`pending`なoperationを保存してからDrive APIを実行する。
- 対象リソース、メール、既存permissionを照合する。
- 成功時にpermission IDと付与時刻を保存する。
- `already_granted`を成功扱いにし、重複通知を防ぐ。
- 失敗は有限回だけ再試行し、手動再実行可能にする。
- 同じDrive対象への並行permission操作を直列化する。
- 初期版はDrive標準招待通知を使用し、独自HTMLメールは任意拡張とする。

PASS GATE:

- [ ] テスト用Driveで新規付与、既存権限、失敗、再試行、削除の各経路が成功。
- [ ] `reader`が期待する閲覧範囲だけを与えることを別アカウントで確認。
- [x] 同一申請10回でもgrant/outboxが1件で、worker再実行がpermissionを増やさない。
- [x] Drive API障害中も登録とoperationが失われない。
- [x] 付与失敗時に成功表示・成功通知を出さない。
- [x] 自動化主体の秘密情報をGit、DB、ログ、sanitized evidenceへ保存しない。
- [x] 本番Driveへの実行はfeature flagと緊急停止スイッチで無効化できる。

2026-07-28判定: `LOCAL PASS / REAL DRIVE E2E PENDING`。実装、合成Drive試験、
Docker PostgreSQL 17、Neon schema、Desktop/Mobile UIは成功した。正式`PASS`には、
所有者ログイン後に空のテストフォルダをGoogle Pickerで選択し、新規reader、
標準通知、別アカウントViewer範囲、削除を実証する必要がある。本番フォルダと
本番PII経路は引き続き無効である。証跡は`phase7-implementation-report.md`を参照する。

### Phase 8: 認証付き管理者画面

目的: 日常運用をスプレッドシートと個人情報入りメールから管理画面へ移す。

推奨URL: 専用サブドメインまたは`/library-admin/`。URLは固定してよいが、認証前に名簿データを返さない。

初期機能:

- 現役・停止済み利用者一覧。
- 氏名、メール、学籍番号の検索。
- 学年、在籍区分、資格、Drive、処理状態のフィルター。
- 個別確認の承認・却下。
- Drive再実行、利用停止、権限削除。
- CSV/XLSX出力。
- import batch、operation、監査履歴の参照。

安全条件:

- 破壊的操作は確認画面と理由入力を必須とする。
- 一括操作は対象件数と差分を表示してから確定する。
- 一覧APIはページングし、URL・アクセスログへ氏名やメールを含めない。
- 管理者通知メールは「管理画面を確認してください」に留め、PII全文を記載しない。

PASS GATE:

- [ ] `viewer/operator/admin`の権限境界テスト成功。
- [ ] 未認証、一般学生、無効管理者が全管理APIを拒否される。
- [ ] 検索、フィルター、ページング、0件、大量件数を確認済み。
- [ ] 停止・再有効化・Drive削除が監査ログへ追記される。
- [ ] 監査ログを通常の管理操作から変更・削除できない。
- [ ] セッション失効、管理者削除、CSRF、連打を確認済み。
- [ ] Mobileで最低限の緊急停止、Desktopで全運用が可能。

### Phase 9: 旧GAS連携スプレッドシート移行

目的: 旧名簿を、件数・由来・不一致を説明できる形でPostgreSQLへ引き継ぐ。

移行手順:

1. Google Form、管理記録Sheet、Drive権限一覧を同一基準時刻で読み取り専用取得する。
2. 元データのファイルハッシュ、行数、ヘッダー、取得日時を保存する。
3. 直接`library_members`へ入れず、`library_import_batches/rows`へステージングする。
4. メールと学籍番号を現行契約で正規化するが、元値も保持する。
5. 承認済み、個別確認、条件未達、重複、欠損を分類する。
6. Drive permission全ページと照合し、Sheetのみ、Driveのみ、両方、不一致を報告する。
7. 自動取込候補と人間確認候補を分ける。
8. dry-runレポートを管理者が承認した後だけ本表へ反映する。
9. 移行だけではDrive追加・削除・メール送信を行わない。
10. 旧レコードは検証済みメールで一意に一致した場合だけ、初回ログイン時に`sub`へ紐付ける。

PASS GATE:

- [ ] 元Sheet行数、承認行数、重複数、欠損数、取込数が数式で一致する。
- [ ] 同じsnapshotを再投入しても重複利用者を作らない。
- [ ] 自動取込条件と手動確認条件を別担当者がレビュー済み。
- [ ] Drive権限一覧との全件照合が完了。
- [ ] サンプルだけでなく、全件が分類済みで未分類0件。
- [ ] dry-runから本反映まで元データハッシュが変わっていない。
- [ ] 本反映のロールバックまたはbatch単位無効化を確認済み。
- [ ] 旧Sheetの読み取り専用保持期間と削除日が承認済み。

### Phase 10: Excel・Excel VBA連携

目的: 管理者が名簿を安全に定期取得・整形・帳票出力できるようにする。

#### Phase 10A: 読み取り・出力

- 管理画面からCSV/XLSXを生成する。
- 出力列は固定の`schema_version`で版管理する。
- Excelテンプレート/VBAは、ローカルファイル取込、差分表示、学年別整形、帳票出力を行う。
- 定期更新は当初「管理者ログイン後の更新」を標準とする。
- 必要ならCloud Scheduler 1ジョブでスナップショットの件数・ハッシュを更新するが、PIIファイルを公開URLへ置かない。

#### Phase 10B: 変更要求取込（必要性が確認された場合だけ）

- Excelから出す更新ファイルは`member_id`、`record_version`、変更可能列、変更理由を持つ。
- 管理画面へアップロードし、ステージング、検証、差分表示、承認後に反映する。
- 競合した`record_version`は上書きせずエラーにする。
- Drive権限や認証メールの変更をExcelだけで確定させない。

PASS GATE:

- [ ] 日本語、空欄、長い氏名、先頭ゼロをExcelで正しく保持する。
- [ ] CSV数式インジェクション対策が全対象文字で成功。
- [ ] manifestの件数とSHA-256が出力本体と一致する。
- [ ] 旧schemaのVBAが未知の新版を黙って処理せず停止する。
- [ ] VBAブックにパスワード、DB URL、長期APIキー、個人トークンがない。
- [ ] VBAコード署名、配布元、版、更新手順が確定している。
- [ ] 5,000行で更新・整形・出力が運用可能時間内に完了する。
- [ ] 変更要求取込を実装する場合、dry-run、競合、監査、取消を確認済み。

### Phase 11: 限定パイロット

目的: 現行Googleフォームを残したまま、限定利用者で実運用経路を検証する。

実施内容:

- 新登録URLを招待制で限定公開する。
- 自動承認、個別確認、既存登録、Drive既付与を実アカウントで確認する。
- 旧フォームと新フォームが同一申請を同時処理しない運用ルールを決める。
- エラー率、Drive反映時間、問い合わせ、コールドスタート、DB容量、費用を記録する。

PASS GATE:

- [ ] 合意した人数の学生、大学関係者、既存登録者でE2E成功。
- [ ] 誤付与、二重付与、PII漏出0件。
- [ ] 管理者だけで失敗処理を特定・再実行できる。
- [ ] CTAを戻す、Drive自動化を止める、APIをread-onlyにするロールバック訓練成功。
- [ ] 連続7日以上、重大エラーなし。期間は本番責任者が最終決定する。
- [ ] 実測費用が0円で、無料枠監視が機能している。

### Phase 12: Production切り替え

目的: 最終Production Gate通過後、現行Googleフォーム/GASから新導線へ切り替える。

切り替え順序:

1. 旧SheetとDriveの最終差分snapshotを取得する。
2. 最終delta importと全件照合を行う。
3. Production Gate承認記録を残す。
4. 公式サイトに新登録URLを追加するが、最初は旧CTAを維持する。
5. 本番URLで認証、DB、Drive、管理画面、出力をsmoke testする。
6. 別コミットでCTAを新登録URLへ切り替える。
7. 旧Google Formの受付とGASトリガーを停止する。
8. 監視期間中は旧Form/GASを削除せず、再開手順を保持する。
9. 保持期間終了後に旧名簿を承認済み手順でアーカイブまたは削除する。

CTA切り替え、GAS停止、旧データ削除を同一変更に含めない。

## 7. PRODUCTION GATE

Production GateはPhase別PASSの単純な合計ではない。次の全領域が`PASS`であり、責任者が証跡へ署名した場合だけ、本番CTAを切り替える。

### 7.1 要件・法務・個人情報

- [ ] 利用対象、判定条件、個別確認条件が正式承認済み。
- [ ] 規約・プライバシー本文、版、発効日、保存期間、削除手順が確定。
- [ ] 国外を含むデータ保存地域と委託サービス利用が承認済み。
- [ ] 本人からの照会、訂正、削除、大学からの正当な照会への手順がある。
- [ ] 管理者・運営代表者の変更時に権限と秘密情報を引き継げる。

### 7.2 認証・認可・秘密情報

- [ ] Google IDトークンの署名、`aud`、`iss`、`exp`、`email_verified`、`hd`検証が実環境で成功。
- [ ] Google認証は大学Workspaceアカウント確認、フォーム判定は薬学部・学年・学籍番号・区分判定として分離され、両方を通過しない限り自動承認されない。
- [ ] `sub`が利用者と管理者の主識別子になっている。
- [ ] 管理者に2段階認証を要求し、退任者を即時無効化できる。
- [ ] 管理者RBAC、CSRF、CORS、Cookie、レート制限を検証済み。
- [ ] Secret Manager以外に本番秘密情報がなく、Git履歴・成果物・ログにもない。
- [ ] DBユーザー、Google自動化主体、デプロイ主体が最小権限。

### 7.3 機能・整合性

- [ ] 自動承認、個別確認、対象外、登録済み、既存情報不一致のE2E成功。
- [ ] 薬学部かつ `PP/PL/MP + 5桁`だけが学生自動承認候補になる。
- [ ] 同時送信、再送、再試行でもmemberとDrive permissionが重複しない。
- [ ] Drive付与結果、permission ID、通知結果がDBと一致する。
- [ ] 停止・権限削除・再有効化を管理画面と監査ログで追跡できる。
- [ ] 旧Sheet、PostgreSQL、Driveの最終件数・差分が説明可能。
- [ ] CSV/XLSXの文字化け、先頭ゼロ、数式インジェクション対策が成功。

### 7.4 障害・復旧・運用

- [ ] Drive、Google認証、Neon、Cloud Runの各障害時にデータを失わない。
- [ ] 有限再試行、dead/pending状態、管理者再実行、緊急停止が機能する。
- [ ] DBバックアップから別環境への復旧訓練成功。
- [ ] CTAを旧Googleフォームへ戻す手順を別担当者が実行できる。
- [ ] PIIを含まないエラー通知と、日次件数・失敗件数の監視がある。
- [ ] 依存関係に未対処のCritical/High脆弱性がない。
- [ ] Production手順、障害連絡先、定期権限棚卸し日が文書化済み。

### 7.5 費用・無料枠

- [ ] Cloud Runはrequest-based、最小インスタンス0、最大インスタンスを小さく固定。
- [ ] NeonのDB容量、compute使用量、休止・復帰挙動を実測済み。
- [ ] Secret Managerのactive versionとaccess回数を無料枠内に設計。
- [ ] Cloud Schedulerは原則1ジョブ、最大でも無料枠内の3ジョブ以下。
- [ ] Cloudflare Pagesのbuild/file上限を超えない。
- [ ] 月次使用量確認、予算通知、異常時の停止手順がある。
- [ ] 従量課金サービスで無料枠超過時に費用が発生し得る残余リスクを責任者が承認。

1項目でも未達の場合、Production Gateは`BLOCKED`であり、CTAを切り替えない。例外承認でセキュリティ、個人情報、バックアップ、認証、権限整合性を免除してはならない。

## 8. 0円運用の再評価

### 想定負荷上限

通常運用の設計値を次とする。

| 指標 | 設計値 |
| --- | --- |
| 新規・再登録 | 年500件。イベント日最大200件 |
| イベント集中試験 | 200件/10分、平均1 request/s、5倍burst |
| 登録関連API | 通常年1,500。悲観シナリオ18,000/月 |
| Cloud Run警戒線 | 15,000登録/月または90,000 vCPU-seconds/月 |
| 管理画面・出力を含む全API | 通常年20,000以下。異常増加を月次監視 |
| 管理者 | 20人以下 |
| 名簿 | 5,000人以下 |
| DB使用量 | 250MB以下を警戒線 |
| 定期ジョブ | 1ジョブ |
| 一括再試行 | 1回100件以下、手動承認 |

現在の公式情報では、Neon Freeはプロジェクトごとに月100 CU-hoursと0.5GB storage、Cloudflare Pages Freeは月500 buildsと20,000 files、Cloud Schedulerは請求先アカウントあたり3 jobs、Secret Managerはactive version 6個と月10,000 access operationsまで無料枠がある。Cloud Run request-basedはTier 1基準で月180,000 vCPU-seconds、360,000 GiB-seconds、200万requests相当の無料creditがある。SingaporeはTier 2のため実効compute無料量は小さく、最小インスタンス0を固定する。<br>
参考: [Neon pricing](https://neon.com/pricing)、[Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)、[Cloud Run pricing](https://cloud.google.com/run/pricing)、[Cloud Run min instances](https://docs.cloud.google.com/run/docs/configuring/min-instances)、[Cloud Scheduler pricing](https://cloud.google.com/scheduler/pricing)、[Secret Manager pricing](https://cloud.google.com/secret-manager/pricing)

イベント日200件は無料枠内に十分収まる。200件/日を30日続けてもCloud Runは
無料枠内だが、Neonはアクセス分散により月100 CU-hoursを超える可能性がある。
詳細な悲観シナリオ、超過単価、Docker開発計画は
`cost-capacity-and-docker-plan.md`を正本とする。一方、Cloud Run等は
pay-as-you-goであり、予算通知は課金を強制停止する上限ではないため、
「いかなる状況でも請求0円」を保証する設計とは言えない。

### 費用防止設定

- Cloud Run: min 0、max 1から開始、request timeoutとconcurrencyを制限。
- API: 大学Wi-Fi等の共有NATを考慮し、pre-auth 300 requests/分/IP、全体600 requests/分、submit 5回/分/Google `sub`を負荷試験用初期値とする。IPだけで正規イベントを遮断しない。
- DB: pooled connection、小さいpool、常時ポーリングなし、一覧はページング。
- Drive: 無限再試行なし、1件ずつ冪等処理、障害時circuit breaker。
- Scheduler: 単一の照合・保守endpointへ集約し、ジョブを増殖させない。
- Secret Manager: 通常はDB URL、Google主体、session signing key等を6 active versions以内に保つ。古い版は確認後destroyする。
- Export: オンデマンド生成を基本とし、PIIファイルを恒久保存しない。

## 9. リスク登録簿

| リスク | 影響 | 対応ゲート |
| --- | --- | --- |
| `hd`の想定違い | 正規学生を拒否、対象外を許可 | Phase 4/6 |
| Drive対象IDの種別誤認 | 想定より広い権限、付与失敗 | Phase 4/7 |
| 自動化主体の退任・失効 | 全招待停止 | Phase 4/7/Production |
| 申請と名簿の混同 | 再申請で履歴消失、停止状態不明 | Phase 5 |
| 旧Sheetの重複・欠損 | 誤名簿、誤権限 | Phase 9 |
| Excelを第二の正本化 | 競合、上書き、監査不能 | Phase 10 |
| VBAへの秘密埋込み | 漏えい、第三者操作 | Phase 10 |
| CSV数式実行 | 管理端末で任意式実行 | Phase 8/10 |
| 無限再試行・高頻度poll | 費用・API quota超過 | Phase 7/8 |
| 無料枠変更 | 予期しない費用 | 全Production Gate前に再確認 |
| DB国外保存未承認 | 個人情報運用不整合 | Phase 4 |
| 管理画面の認可不備 | 全名簿漏えい・誤操作 | Phase 6/8 |

## 10. 今後の推奨実施順序

```text
Phase 4  方針・個人情報・Drive/OAuth確認
  ↓
Phase 5  PostgreSQL正本・監査・バックアップ
  ↓
Phase 6A Google認証・登録API基盤
  ↓
Phase 6B 第二管理者・認証引継ぎ・Pre-Production Gate
  ↓
Phase 7  Drive Viewer付与・招待通知
  ↓
Phase 8  認証付き管理画面
  ↓
Phase 9  旧Sheet移行・Drive照合
  ↓
Phase 10 Excel/VBA出力、必要なら変更要求取込
  ↓
Phase 11 限定パイロット
  ↓
Phase 12 Production Gate・切り替え
```

管理画面を旧名簿移行より先に作るのは、移行結果と不一致をスプレッドシート以外の場所で確認・承認できるようにするためである。Excel/VBAを移行より後にするのは、出力schemaを移行で得た実データに合わせて確定し、Excel側を正本にしないためである。

## 11. 次に行うべきこと

Phase 4の証跡収集、方針決定、ゲート判定は完了した。P4-B01は`PASS`、
Phase 4全体は`BLOCKED`である。Phase 5はすでに`PASS`である。

1. Phase 6Aの自動回帰とDocker PostgreSQL 17回帰を完了する。
2. 運営者が大学Workspaceアカウントと個人Gmailでローカル実Google E2Eを行う。
3. 第二管理者を準備できる時点で、用意済みwrapperにより2名の証跡を取得する。
4. 専用OAuth clientと空folderで失効・再認可を実証する。
5. Singapore primary region、国外アクセス・再委託、保存期間、削除方法を正式承認する。
6. 3から5が揃った時点でPhase 6B/Pre-Production Gateを再判定する。

Phase 6BがPASSするまでは、実個人情報の外部DB保存、本番Drive権限付与、
管理者名簿公開を行わない。ローカル実Google E2Eでは送信前に保存先を
ローカルPostgreSQLへ固定し、合成フォーム値だけを使用する。
