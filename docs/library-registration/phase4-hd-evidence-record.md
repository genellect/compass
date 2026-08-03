# Phase 4 Google `hd`実測記録

> **履歴文書:** `hd`実測証跡は有効だが、本文中の第二管理者要件はADR-0003と`phase-roadmap-v3.md`で廃止済みであり、現行Gateには適用しない。

最終更新: 2026-07-18  
状態: `PASS`

IDトークン、メール全文、Google `sub`実値は本記録へ記載しない。

本記録は大学Workspaceアカウントと許可`hd`の確認用である。薬学部、学年、
学籍番号、学生・教員等の属性証明には使用せず、それらはフォーム内部判定で扱う。

| 対象 | 実測日時UTC | `hd` | メールドメイン | `sub` fingerprint | `aud` | `iss` | `exp` | `email_verified` | 判定 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 同一Workspace組織の代表ユーザー | 2026-07-18T09:27:25.017215+00:00 | `st.kitasato-u.ac.jp` | `st.kitasato-u.ac.jp` | `11bcf0f2393d2eb5` | 一致 | 有効 | 有効 | `true` | `PASS` |

初回実測は許可`hd`を発見するための計測だったため、証跡JSONの
`expected_hd_match`は`null`である。`hd`実測後、ローカルのWindows User
環境変数`EXPECTED_GOOGLE_HD`を`st.kitasato-u.ac.jp`へ固定した。

## PASS条件

- 同一Workspace組織の代表大学アカウント1件を検証専用Web OAuth Client IDで実測する。
- Googleによるtoken verificationが成功する。
- `aud`、`iss`、`exp`、`email_verified`がすべて有効。
- `hd`が存在する。
- 実測した`hd`だけを許可リスト候補とし、メール末尾から推測しない。
- 学生用・教員用の属性別`hd`測定を要求しない。
- `hd`一致だけでフォーム上の薬学部、学年、学籍番号、区分を承認しない。
- 同じ許可`hd`なら第1層を区分なしで通過させ、第2層の固定ロジックでDrive付与可否を判定する。

## 承認

| 項目 | 記録 |
| --- | --- |
| 証跡ファイル | `outputs/phase4-oidc-evidence/phase4-oidc-workspace-member-20260718T092725Z.json` |
| 確認者 | 運営者本人による対話ログイン / Codexによる保存証跡照合 |
| 確認日 | 2026-07-18 |
| 許可`hd`案 | `st.kitasato-u.ac.jp` |

P4-B01は解除済みである。ただし、この実測だけでPhase 4全体やProductionを
PASSにはしない。第二管理者、OAuth引継ぎ実証、国外保存の正式承認は別ゲート
として継続する。
