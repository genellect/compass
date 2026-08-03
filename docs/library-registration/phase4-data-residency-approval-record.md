# Phase 4 国外保存・委託先承認記録

最終更新: 2026-08-04
状態: `P4-B04 PASS / APPROVED FOR LIMITED PILOT`

本書は運営判断を記録するための確認票であり、個別案件への法的助言ではない。
大学規程または適用法令への適合性に疑義がある場合は、Productionを開始せず、
個人情報保護の専門家へ確認する。

## 1. 委託・保存概要

| 項目 | 内容 |
| --- | --- |
| サービス | Neon PostgreSQL |
| cloud / primary region | AWS / Singapore `aws-ap-southeast-1` |
| 利用目的 | 登録資格確認、名簿、同意証跡、Drive付与operation管理 |
| 主なデータ | 氏名、大学メール、学籍番号、所属、状態、同意日時 |
| 開発データ | 合成データのみ |
| 本番開始条件 | 本記録の承認、プライバシー本文反映、Phase 4全項目PASS |
| 通信 | TLS 1.2以上 |
| 保存時暗号化 | AES-256、AWS KMS等による鍵管理 |
| 国内保存必須時 | Neonを不採用にし、国内DBへ再選定・移行 |

重要: SingaporeはDB projectのprimary regionである。Neon DPAは、サービス提供に
必要な範囲で米国その他のNeon・sub-processor拠点から個人データへアクセスまたは
処理する可能性を示している。したがって「Singapore域内から一切出ない」とは説明
しない。運営承認はこの国際的な委託・再委託可能性を含む。

## 2. 保存期間と削除

| データ | 期間 | 削除方法 |
| --- | --- | --- |
| 現役利用者名簿 | 利用中 | 退会・停止時に状態変更し、下記期限へ移行 |
| 停止済み利用者PII | 停止後1年 | 定期削除job、実行監査を保存 |
| 承認済み申請・同意証跡 | 利用終了後1年 | PIIを削除し必要最小限の監査へ縮退 |
| 不承認・未完了申請PII | 最終判定後90日 | 定期削除job |
| Drive/通知operation | 1年 | PII参照を切り離して削除 |
| PIIを最小化した管理者監査 | 3年 | 期限到来後に削除 |

サービス終了時は、必要なデータを先にexportし、Neon projectを削除する。Neonの
現行仕様ではproject削除はcompute、branch、database、roleを含み、削除後7日間は
回復可能な期間がある。DPA上は契約終了時の削除・返却、法令上必要な保存やbackup
上の隔離例外があり、アカウント削除請求先は`privacy@neon.tech`とされる。

## 3. 委託先確認結果

| 確認項目 | 状態 | 2026-07-19時点の根拠・判断 |
| --- | --- | --- |
| Singapore region | 確認済み | AWS Asia Pacific (Singapore) `aws-ap-southeast-1` |
| project内branch/databaseのregion | 確認済み | project選択regionへ作成。既存projectのregion変更不可 |
| TLS | 確認済み | public/private networkでTLS 1.2以上 |
| 保存時暗号化 | 確認済み | AES-256、key rotation、AWS KMS/Azure Key Vault |
| 第三者監査 | 確認済み | SOC 2 Type II、ISO 27001/27701の年次監査説明 |
| DPA | 確認済み | breach通知、削除・返却、sub-processor、国際移転条項 |
| sub-processor | 確認済み | 公式一覧、更新通知購読手段あり。2026-04-16更新 |
| 国外・再委託リスク | 要承認 | 米国等からの処理可能性をDPAが明示 |
| security問い合わせ | 確認済み | `security@neon.tech`、Trust Center |
| privacy・削除問い合わせ | 確認済み | `privacy@neon.tech` |
| project削除手順 | 確認済み | Console Settings > Delete。全object削除、7日回復可能期間 |
| 年次監督 | 要担当者指定 | DPA、sub-processor、security、料金、保存地域を年1回確認 |

参考:

- [Neon regions](https://neon.com/docs/introduction/regions)
- [Neon Security](https://neon.com/security)
- [Neon DPA](https://neon.com/pdf/DPA.pdf)
- [Neon sub-processors](https://neon.com/subprocessors)
- [Neon project管理・削除](https://neon.com/docs/manage/projects)
- [個人情報保護委員会 通則編](https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/)
- [外国にある第三者への提供編](https://www.ppc.go.jp/personalinfo/legal/guidelines_offshore/)
- [外国所在serverへの保存Q&A](https://www.ppc.go.jp/all_faq_index/faq1-q12-3/)

## 4. プライバシー説明追記案

> 登録情報は、利用資格の確認、利用者名簿の管理、共有フォルダへの招待、
> 利用者への連絡および安全な運営のために利用します。登録情報の一部は、
> クラウドデータベース事業者NeonのAWSシンガポールリージョンを主な保存地域
> として保管します。サービス提供、保守または再委託に必要な範囲で、Neonまたは
> その委託先が米国その他の国から情報へアクセスし、処理する場合があります。
> 運営者は、保存情報の最小化、通信・保存時の暗号化、アクセス制御、保存期限後の
> 削除、委託先の安全管理措置と再委託先一覧の定期確認を行います。

正式公開前に、運営主体、問い合わせ先、開示・訂正・削除請求方法、国外取扱いへの
同意または適法な委託根拠を確認し、利用規約・プライバシー本文へ反映する。

## 5. 運営責任者の承認

次の全項目を確認してから記名する。承認しない場合はPhase 4を`BLOCKED`のまま
維持し、実PIIをNeonへ保存しない。

- [x] Singaporeはprimary regionであり、全処理の地域限定保証ではないと理解した。
- [x] Neon DPA、sub-processor一覧、国外・再委託可能性を確認した。
- [x] 保存項目、目的、期間、削除方法を承認する。
- [x] 上記プライバシー説明をProduction前に公開本文へ反映する。
- [x] 年次レビュー担当者と次回レビュー日を指定する。
- [x] 国内保存必須と判断した場合は本番開始前にDBを再選定する。

| 項目 | 記入欄 |
| --- | --- |
| 運営責任者氏名 | Gitへ記録しない |
| 役割 | 運営責任者 |
| 承認日 | 2026-08-04 |
| Singapore primary region | 承認済み |
| 国外アクセス・再委託可能性 | 承認済み |
| DPA・sub-processor確認 | 2026-07-19 vendor evidenceを前提に承認済み |
| プライバシー本文反映責任者 | 運営責任者 |
| 年次レビュー担当者 | 運営責任者 |
| 次回レビュー日 | 2027-08-04 |
| local approval evidence SHA-256 | `6286c8888a24314fbf31c19819cc64c9fe97c389348d44680344c0eb7b185953` |

承認本文は`outputs/phase4-approvals/`のGit対象外証跡へ保存する。repository側には
個人名を記録せず、役割、承認日、次回レビュー日、証跡のSHA-256だけを記録する。

最終判定: `P4-B04 PASS`。これは国外保存・委託先承認だけの判定であり、Drive、
本番write、Git main統合、人間E2Eの各gateを省略しない。
