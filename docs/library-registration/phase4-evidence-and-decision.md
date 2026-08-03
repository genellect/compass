# Phase 4 証跡・方針確定・ゲート判定

> **履歴文書:** 当時の証跡は保持するが、第二管理者をProductionブロッカーとする判定はADR-0003と`phase-roadmap-v3.md`で置き換えられた。現行Gateには適用しない。

実施日: 2026-07-16  
対象: 未来戦略ライブラリ登録・名簿管理基盤  
初回実施方式: 読み取り専用。Drive権限、Sheet、OAuth、本番導線は変更していない。  
介助更新: 2026-07-17。Phase 4解除専用のローカル証跡ツールと記録票を追加し、Google認証とフォーム資格判定の責務を分離した。
実測更新: 2026-07-18。同一Workspace組織の代表アカウントでGoogle OIDCを
検証し、P4-B01を`PASS`とした。
介助完了更新: 2026-07-19。P4-B02の管理者pair比較、P4-B03のread-only
OAuth失効・再認可server、P4-B04の公式vendor確認を実装・文書化し、Dockerを
含むPython 43件で検証した。残るのは本人ログイン、同意、指名、運営承認である。

## 1. 判定

| 判定対象 | 結果 |
| --- | --- |
| Phase 4の証跡収集 | P4-B01完了、P4-B02-P4-B04未完了 |
| 技術・運用方針 | 確定 |
| Phase 4 PASS GATE | `BLOCKED` |
| Phase 5 PostgreSQL Gate | `PASS` |
| 実個人情報のNeon保存 | 禁止継続 |
| Phase 6Aローカル認証基盤 | 実装可。Primary 1名・合成データ限定 |
| Phase 6B/Production昇格 | `BLOCKED / ASSISTANCE READY` |

Phase 5は合成データ専用Neon環境でPASSした。Google OIDCの実IDトークン
から得る`hd`は実測済みである。Phase 4は本番用第二管理者、OAuth引継ぎ
実証、国外保存の正式承認が未確定のため、Phase 6B/Productionに対して
引き続きBLOCKEDとする。Phase 6Aは実PII外部保存と外部副作用を無効にし、
Primary 1名で署名検証、認証DB、登録API、RBAC照合を実装できる。

## 2. 収集した証跡

### 2.1 Google Drive

対象ID: Secret Managerで管理し、公開リポジトリには記録しない

| 項目 | 実測結果 |
| --- | --- |
| 種別 | Google Driveフォルダ |
| Shared Drive ID | なし |
| 所有者 | あり |
| 現在の接続ユーザー | 共有操作可能 |
| 直下項目 | 4件 |
| 直接permission | 35件 |
| `owner` | 1件 |
| `writer` | 2件 |
| `commenter` | 25件 |
| `reader` | 7件 |
| 学生メールドメイン | 32件 |
| その他ドメイン | 3件 |

結論:

- 対象は共有ドライブ本体ではなく、My Drive配下のフォルダである。
- 旧GASの`SHARED_DRIVE_ID`という変数名は実体を表していない。
- 現在のpermissionは`reader`だけではなく、`commenter`と`writer`を含む。
- 新システムは新規学生へ`reader`だけを付与し、既存の上位権限を自動降格しない。
- 既存permissionの正規化は登録処理とは分離し、Phase 9の照合対象とする。

### 2.2 旧Google Sheet

Spreadsheet ID: 運用者の非公開設定で管理し、公開リポジトリには記録しない

| タブ | 非空行数（ヘッダー込み） | 主用途 |
| --- | ---: | --- |
| フォームの回答 1 | 24 | Google Form原回答 |
| 管理記録 | 24 | GAS処理結果 |
| ドライブ利用者名簿 | 33 | 運用名簿 |

確認した事項:

- Google Form回答は23件、管理記録も23件。
- ドライブ利用者名簿は32件。
- Driveの直接permissionは35件であり、Sheet名簿と件数が一致しない。
- フォームには自動収集メールと手入力大学メールが併存する。
- 管理記録には判定理由、Drive処理、申請者メール、管理者メール、エラーが保存されている。
- Spreadsheetのタイムゾーンが`Asia/Dili`になっている。UTCオフセットは日本と同じだが、新DBはUTC保存、UI表示は`Asia/Tokyo`へ統一する。

結論:

- Sheet行数だけを現役利用者数とみなさない。
- Phase 9ではGoogle Form、管理記録、運用名簿、Drive permissionの4系統を全件照合する。
- 元Sheetを直接更新せず、snapshotとステージングを経由する。

### 2.3 Google認証

Drive connectorのprofileでは`hd` claimを取得できなかったため、
2026-07-18に検証専用Web OAuth ClientとローカルOIDC証跡サーバーを使い、
同一Workspace組織の代表アカウント1件を実測した。

| 項目 | 実測結果 |
| --- | --- |
| `hd` | `st.kitasato-u.ac.jp` |
| メールドメイン | `st.kitasato-u.ac.jp` |
| `aud` | 一致 |
| `iss` | 有効 |
| `exp` | 有効 |
| `email_verified` | `true` |
| `sub` fingerprint | `11bcf0f2393d2eb5` |
| 証跡ファイル | `outputs/phase4-oidc-evidence/phase4-oidc-workspace-member-20260718T092725Z.json` |

初回計測時は許可値の発見が目的だったため、証跡の`expected_hd_match`は
`null`である。実測後、Windows User環境変数`EXPECTED_GOOGLE_HD`を
`st.kitasato-u.ac.jp`へ固定した。

結論:

- メール末尾から推測せず、IDトークンで実測した`st.kitasato-u.ac.jp`だけを許可`hd`候補とする。
- P4-B01の同一Workspace組織の代表アカウント実測は完了した。学生用・教員用の追加実測は行わない。
- Googleはメールを主識別子にせず`sub`を使用し、組織制限では`hd`を確認するよう案内している。
- Google認証は大学Workspaceアカウント確認だけを担当し、薬学部、学年、学籍番号、学生・教員区分はフォーム内部判定に残す。
- 同じ許可`hd`を持つユーザーは学生・教員で分岐せず第1層を通過させるが、Drive付与可否を決める第2層の固定ロジックは変更しない。

参考:

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Google IDトークンのサーバー検証](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)

### 2.4 データ保存地域

Neonの公式リージョン一覧では、日本リージョンは確認できず、APACではSingaporeとSydneyが確認できる。0円・低遅延を優先し、Neonを採用する場合の第一候補をSingaporeとする。

方針:

- 開発・本番ともリージョンはSingaporeを第一候補とする。
- 本番前にNeon Consoleの実際の選択肢を再確認する。
- プライバシー説明に、国外クラウド事業者での保存、利用目的、安全管理措置、問い合わせ方法を記載する。
- NeonのDPA、セキュリティ情報、再委託・保存地域を年1回確認する。
- 日本国内保存が必須と判断された場合はNeonを不採用とし、有料国内DBまたは既存の適格な国内基盤へ変更する。

個人情報保護委員会は、外国で個人データを扱う場合、外的環境の把握と委託先への必要かつ適切な監督を求めている。

参考:

- [Neon region status](https://neon.com/docs/introduction/status)
- [Neon security](https://neon.com/security)
- [個人情報保護委員会 外国にある第三者への提供編](https://www.ppc.go.jp/personalinfo/legal/guidelines_offshore/)
- [個人情報保護委員会 通則編](https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/)

### 2.5 ローカル開発環境

| 項目 | 実測 |
| --- | --- |
| Git | 2.54.0 |
| Node.js | 24.18.0 |
| リポジトリ指定Node | 22.16.0 |
| npm | 11.16.0 |
| uv | 0.11.28 |
| Python | 3.12.13 |
| Docker | Desktop 4.82.0、Engine 29.6.1、Compose v5.3.0。CLIはPATH外だが実コンテナ成功 |
| gcloud | PATH上になし |
| psql | PostgreSQL 18.4 portableを作業領域へ導入 |
| DATABASE_URL等 | Windowsユーザー環境変数へ設定済み |
| `.env`実ファイル | なし |

再検証結果:

- TypeScript判定テスト: 14件成功。
- Python全テスト: 35件成功。
- TypeScript型検査: 成功。
- Next.js静的ビルド: 成功。
- 凍結サイト検証: 成功。

結論:

- Phase 5 PostgreSQL統合ゲートは完了した。
- DockerはPhase 5開始の必須条件にしなかった。2026-07-19の再検証で実動を確認し、Phase 6以降のローカル再現性とCloud Run image検証へ使用する。
- PostgreSQL統合テストはNeonの開発用project/branchを使い、実個人情報を投入しない。
- Alembicはdirect接続、アプリ実行はpooled接続を使用する。
- Node 22.16.0への統一は継続する再現性改善とする。

Neonはアプリ接続にpooled connection、マイグレーション等にはdirect connectionを推奨している。

参考: [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)

### 2.6 Python依存関係

現在の環境:

- FastAPI 0.139.0
- Starlette 1.3.1
- HTTPX2 2.7.0
- Python 3.12.13

`httpx2`は名称だけ見ると誤入力に見えるが、PyPIでPydantic所有・Trusted Publishingの正規パッケージであることを確認した。現在のStarlette TestClientで14件成功しているため、Phase 5準備では削除しない。

参考: [HTTPX2 on PyPI](https://pypi.org/project/httpx2/)

## 3. 確定した運用方針

### 3.1 Drive

- リソース種別: 現運営者本人が所有するMy Driveフォルダ。
- 新規付与ロール: `reader`。
- 自動化主体: 現在のフォルダ所有者によるOAuthを初期案とする。
- 標準通知: Driveの招待通知を第一候補とする。
- 既存`commenter`/`writer`: 自動降格しない。
- 本番前条件: OAuth主体の退任・失効時の引継ぎ手順と、第二の運用管理者を用意する。

### 3.2 管理者

- bootstrap adminは現在のDrive所有者を候補とする。
- メールをリポジトリへ固定せず、Phase 6で実測したGoogle `sub`をSecret Managerまたは管理者bootstrap設定へ登録する。
- 役割は`viewer`、`operator`、`admin`。
- 本番までに第二管理者を1名以上登録する。
- 緊急停止、費用確認、Drive/OAuth引継ぎは`admin`責務とする。

### 3.3 保存期間

| データ | 保存方針 |
| --- | --- |
| 現役利用者名簿 | 利用中 |
| 停止済み利用者PII | 停止後1年 |
| 承認済み申請・同意証跡 | 利用終了後1年 |
| 不承認・未完了申請PII | 最終判定後90日 |
| Drive/通知operation | 1年 |
| 管理者監査ログ | 3年。PIIを最小化しUUID中心 |
| サーバー生成export | レスポンス完了後保持しない |
| 管理者端末のexport | 原則30日以内に削除 |
| 旧Sheet作業snapshot | 移行PASS後90日 |
| import hash・件数・版 | PIIを含めず継続保持 |

利用目的がなくなった個人データは遅滞なく削除するという個人情報保護委員会の考え方に合わせる。法令、大学規程、事故対応でより長い保持が必要になった場合は、Production Gate前に本表を更新する。

### 3.4 費用

- 通常運用0円を目標とし、完全な請求0円保証とは表現しない。
- Cloud Run: request-based、min 0、max 1から開始。
- Neon: Free、Singapore第一候補、DB 250MBを警戒線。
- Scheduler: 最大1ジョブ。
- Secret Manager: active version 6個以内。
- 月次費用確認: bootstrap adminの運用責務。
- 異常時: APIをread-only、外部operationを停止、CTAを旧Google Formへ戻す。

## 4. 未解決ブロッカー

P4-B01は2026-07-18に解除した。Phase 4全体を解除するには、次の3件が残る。

| ID | 内容 | 解除条件 | 影響 |
| --- | --- | --- | --- |
| P4-B02 | 第二管理者未指定 | 大学Googleアカウント1名以上を指名し`sub`確認 | Production不可 |
| P4-B03 | OAuth引継ぎ未実証 | token失効・再認可手順をテスト用projectで確認 | Phase 7本番不可 |
| P4-B04 | 国外保存の正式な運営承認記録なし | プライバシー本文と委託先確認票を承認 | 実PII保存不可 |

### 4.1 介助作業の完了状態

| ID | 介助成果物 | 残作業 |
| --- | --- | --- |
| P4-B01 | `phase4_oidc_evidence_server.py`、サニタイズ済みJSON、`phase4-hd-evidence-record.md` | なし。2026-07-18 `PASS` |
| P4-B02 | role固定OIDC server、pair比較tool、管理者記録票 | 第二管理者指名、2名の本人ログイン、MFA確認 |
| P4-B03 | `phase4_oauth_handoff_server.py`、secret非保存wrapper、手動runbook | 専用client設定、空folder共有、2名のOAuth同意 |
| P4-B04 | region/DPA/security/sub-processor/削除の公式確認、説明文、承認票 | 運営責任者の確認・記名・日付 |

統合手順は`phase4-blocker-resolution-pack.md`を正本とする。

## 5. Phase 5への引継ぎ結果

Phase 5は次の制限下で実施し、2026-07-16にPASSした。

- 合成データだけを使用する。
- Neonは開発用project/branchを別作成する。
- Drive、Gmail、Google認証は呼び出さない。
- `EXTERNAL_SIDE_EFFECTS_ENABLED=false`を固定する。
- Phase 5実施時点では`ALLOWED_GOOGLE_HOSTED_DOMAINS`を空のままにする。
- DB URLはGitへ保存しない。
- 本番schema確定前に旧Sheetをimportしない。

次はPhase 6Aの自動回帰とローカル実Google E2Eを進める。Phase 4の人による
残り3点は、第二管理者を準備できる時点でPhase 6Bとして収集する。
これらが揃うまで実PIIの外部DB保存、Preview/Production認証昇格、
Drive本番権限変更へ進まない。

詳細は`phase5-readiness.md`、`phase5-postgresql-integration-gate.md`、
各ADRを参照する。
