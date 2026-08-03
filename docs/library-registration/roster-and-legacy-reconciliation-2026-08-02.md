# 未来戦略ライブラリ 名簿正本・旧データ照合記録

Status: `READ-ONLY INVENTORY PASS / LOCAL ROSTER IMPLEMENTED / REAL IMPORT PENDING`  
Scope: 旧Googleフォーム、管理記録、ドライブ利用者名簿、対象Drive folder権限  
Observed at: 2026-08-02  
PII handling: 実値をrepository、文書、log、test fixtureへ保存していない

## 1. 正本と二段構成

本番移行後の正本はPostgreSQLとする。旧Googleスプレッドシートは移行証跡として読み取り専用で
保持し、日常運用で双方向同期しない。

管理者画面は次の二段構成とする。

1. `申請・利用状況`: フォーム送信内容、資格判定、管理者判断、Drive処理、失敗状態を確認する。
2. `登録者名簿`: 現在の利用者を、氏名、学年、学籍番号、登録日時の順で確認する。

CSV/XLSXはPostgreSQLの監査済み一時snapshotであり、正本ではない。管理者画面のProduction公開が
完了するまでは「常時アクセス可能」と判定しない。

## 2. 読み取り専用inventory

| 対象 | 現在値 |
|---|---:|
| Googleフォーム回答 | 31行 |
| 管理記録 | 31行 |
| ドライブ利用者名簿 | 40行 |
| folderのuser権限 | 43件 |
| 所有者を除くuser権限 | 42件 |
| `st.kitasato-u.ac.jp`のuser権限 | 40件 |

名簿40行のうち、18行はフォームまたは管理記録から大学メールへ一意に対応し、同じメールの
Drive権限も確認できた。22行は名簿にメール列がなく、旧フォーム／管理記録にも対応行がないため、
自動ではメールへ結び付けられない。曖昧な複数候補は0行、学籍番号空欄は1行である。

氏名とDrive `displayName`の一致は信頼できる対応キーにならなかった。行順、類似氏名、メールの
local partからの推測は禁止する。運営責任者は2026-08-02に、未対応22行を含む名簿40行がすべて
既存登録者であることを確認した。この確認により22行は会員正本へ移行できるが、大学メール、
Google identity、Drive permissionとの対応まで確認されたことにはならない。したがって22行は
`normalized_email = NULL`の会員として受け入れ、推測によるidentity・申請・権限・operationを
作成しない。

## 3. 学年正規化

名簿表示・出力の許可値は次の9値に固定する。

```text
1年, 2年, 3年, 4年, 5年, 6年, M1, M2, その他
```

変換規則:

- `1`〜`6`、`1年`〜`6年`は`1年`〜`6年`。
- 修士課程の内部grade `1` / `2`は`M1` / `M2`。
- `D3`、卒業生、教員、博士課程、未分類は`その他`。
- 資格判定用の`academic_role`と数値gradeは変更せず、名簿表示だけを正規化する。

現在の40行をこの規則で変換した内訳は、1年8、2年2、3年4、4年17、5年0、6年4、M1 2、
M2 0、その他3である。

## 4. 登録日時

- 新システムでmemberを作成した時点をUTCで`library_members.registered_at`へ記録する。
- 管理画面は`Asia/Tokyo`で表示する。
- 旧フォーム日時は、元spreadsheetのtimezone `Asia/Dili`としてUTCへ変換する。
- 手動追加等で根拠となる日時がない旧行はNULLとし、移行実行時刻を登録日時として捏造しない。
- ORM内部の`created_at`はDB行作成時刻であり、利用者の登録日時とは区別する。

## 5. 並べ替え

管理者名簿API `POST /admin/v1/members/search`は、PII検索語をURLへ出さず、次をserver-sideで
ページング・並べ替えする。

- 学年: 1年 → 6年 → M1 → M2 → その他
- 学籍番号: 大文字正規化後の昇順／降順、空欄は末尾
- 登録日時: UTCの昇順／降順、空欄は末尾

同値時は学年、学籍番号、登録日時、member IDの順で安定化する。CSV/XLSXの先頭4列も
`full_name, roster_grade, student_number, registered_at_utc`とし、既定行順を学年、学籍番号、
登録日時、member IDにする。

## 6. 実移行gate

実データ投入前に次が必要である。

1. Production PostgreSQLへ最新Alembic migrationを適用し、backup/restoreを確認する。
2. 旧4 sourceのsnapshot hashと基準時刻を固定する。
3. 自動一致18行と、運営責任者が既存登録者と確認した未対応22行をdry-runで分離集計する。
4. 40名簿行、40大学domain権限、フォーム31行、管理31行の差分理由と、22行をメール未紐付けで
   受け入れる方針を承認記録へ残す。
5. dry-run hashを管理責任者が承認してからapplyする。applyはDrive権限変更やメール送信を行わない。
6. 移行後に申請履歴、名簿、Drive権限、監査件数を照合し、問題時はrollbackする。

ローカル実装では、合成40名（メール対応18名、未対応22名、空学籍番号1名）について、同一batch
再実行、rollback・再apply、未対応会員への外部副作用なしを検証する。現時点では実PIIのexport・
DB投入・旧sheet編集・Drive権限変更を行っていない。
