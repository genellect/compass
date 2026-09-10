# Git履歴のセキュリティ確認

Status: Completed audit; residual review items retained
Scope: mainの到達可能履歴。侵害調査・履歴書換えは対象外
Last verified: 2026-09-10

基準コミット`40c6b090d7e5e105fb4fc002452ac5983e247ee3`までのmain履歴を取得し、
既存`scan-git-history-secrets.mjs`で確認した。284 commits、3,822 objects、1,982 blobsを検査し、
10MiB超による除外は0件だった。未取得ref、削除済みremote branch、GitHubの非到達オブジェクト、
外部artifact、添付ファイル、本番ログはこの結果に含まれない。

| 判定 | 件数 | 評価 |
|---|---:|---|
| blocking | 0 | 検査規則に一致する高確度のcredential検出なし |
| review: GAS recipient | 27 | 同一連絡先1種類の過去blob。現在のソースは直接値を除去済み。履歴には連絡先の残存がある |
| review: PostgreSQL URL | 16 | APIテスト6ファイルの12種類。外部接続を拒否する等のfixture文字列で、検出だけでは実credentialと判定できない |
| info | 41 | 公開OAuth client ID、合成ID、ローカル・コンテナ接続、placeholder |

件数は履歴blob内の検出数であり、被害人数や攻撃回数ではない。
連絡先の残存には迷惑メール等のリスクがある。サーバー認証用secretの流出と同一視しない。
値や推測した個人情報はこの文書へ転載しない。

既存のスキャナーの判定を維持し、`review`を一括許可する例外は追加していない。
履歴の修正・秘匿化、credentialの失効、外部ログの侵害調査が必要になった場合は、
対象と影響を特定した追加作業として扱う。
