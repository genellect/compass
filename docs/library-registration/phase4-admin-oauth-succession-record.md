# Phase 4 第二管理者・OAuth引継ぎ記録

> **履歴文書・実行非推奨:** 本書の第二管理者要件はADR-0003と`phase-roadmap-v3.md`で廃止された。第二管理者は現行のPASS/Production Gate要件ではなく、この記録を運用手順として使用しない。

最終更新: 2026-07-19  
状態: `TOOLS READY / HUMAN NOMINATION AND DRILL REQUIRED`

個人メール、Google `sub`実値、OAuth Client Secret、token、認可codeは本記録へ
記載しない。証跡には`sub`のSHA-256先頭16文字だけを保存する。

## 1. 管理者指名

| 項目 | Primary admin | Secondary admin |
| --- | --- | --- |
| 指名 | 現Drive所有者を候補とする。正式確認待ち | 未指定 |
| 大学管理Googleアカウント | 代表実測済み。管理者用再測定待ち | 本人ログイン待ち |
| `hd` | `st.kitasato-u.ac.jp`実測済み | 未実測 |
| `sub` fingerprint | 候補証跡 `11bcf0f2393d2eb5` | 未実測 |
| MFA | 本人確認待ち | 本人確認待ち |
| 想定role | `admin` | `admin` |
| 緊急連絡可否 | 本人確認待ち | 本人確認待ち |
| 氏名・連絡先の保管 | 非公開の運営者名簿 | 非公開の運営者名簿 |

既存の`workspace-member`証跡はP4-B01の組織確認証跡であり、管理者指名そのもの
ではない。P4-B02では`primary-admin`と`secondary-admin`のrole labelで再取得する。

本番bootstrap時にGoogle `sub`実値を保存する場合は、GitやMarkdownではなく、
アクセスを限定したSecret Manager等を使用する。Phase 4では実値を保存しない。

## 2. Codex側の準備完了

- `scripts/start-phase4-admin-evidence.ps1`: roleを固定して証跡serverを起動。
- `services/library-api/scripts/verify_phase4_admin_pair.py`: 2名の`hd`、role、
  fingerprintの別人物性を比較。
- 証跡保存先: `outputs/phase4-oidc-evidence/`（Git対象外）。
- token、メール全文、Google `sub`、Client IDは証跡へ保存しない。
- 同じ人物または異なる`hd`を第二管理者として使うと`BLOCKED`になる。

## 3. 管理者証跡結果

| 項目 | 結果 |
| --- | --- |
| Primary証跡file | 未取得 |
| Secondary証跡file | 未取得 |
| 両者`status=pass` | 未実施 |
| 両者`expected_hd_match=true` | 未実施 |
| fingerprintが別 | 未実施 |
| MFA本人確認 | 未実施 |
| 緊急連絡確認 | 未実施 |
| 正式指名日 | 未記入 |

## 4. OAuth引継ぎドリル

対象は新規作成した空のテストフォルダだけとし、未来戦略ライブラリ本番フォルダ
や利用者PIIを使わない。第二管理者にはテストフォルダのViewer権限だけを手動付与
する。ドリルはDrive権限を追加・変更・削除しない。

| 手順 | 自動証跡 | 結果 |
| --- | --- | --- |
| Primaryがoffline accessで認可 | 時刻・fingerprint・refresh token有無 | 未実施 |
| read-only Drive metadata取得 | HTTP結果・folder判定 | 未実施 |
| Primary refresh tokenをrevoke | HTTP結果 | 未実施 |
| 旧refresh tokenが`invalid_grant` | HTTP結果・エラー分類 | 未実施 |
| Secondaryがoffline accessで再認可 | 時刻・fingerprint | 未実施 |
| 同じread-only metadata取得 | HTTP結果 | 未実施 |
| Secondary tokenも試験内でrevoke | HTTP結果 | 未実施 |
| Primary/Secondaryが別人物 | fingerprint比較 | 未実施 |
| token非永続化 | 固定安全境界 | 実装済み |

証跡server: `services/library-api/scripts/phase4_oauth_handoff_server.py`  
証跡保存先: `outputs/phase4-oauth-handoff/`（Git対象外）

## 5. PASS条件

- PrimaryとSecondaryが別人物で、同じ許可`hd`を持つ。
- 両者が自分でGoogleログインとOAuth同意を操作する。パスワードを共有しない。
- 両者のMFAと緊急連絡可否を人が確認する。
- Primaryの旧refresh tokenが失効後に`invalid_grant`になる。
- Secondaryの再認可で同じread-only Drive metadata操作が成功する。
- token、認可code、メール全文、Google `sub`をログ・Git・証跡へ保存しない。
- ドリル後に本番用credentialが残らない。

## 6. 最終指名確認

| 項目 | 記入欄 |
| --- | --- |
| Primary指名記録 | 氏名は非公開の運営者名簿だけへ記入 |
| Secondary指名記録 | 氏名は非公開の運営者名簿だけへ記入 |
| 両者MFA確認日 | 未記入 |
| 緊急連絡確認日 | 未記入 |
| ドリル証跡file | 未記入 |
| 運営責任者確認日 | 未記入 |

最終判定: `BLOCKED`。本人ログイン、第二管理者の指名、MFA確認、OAuthドリルが
完了した時点で再判定する。
