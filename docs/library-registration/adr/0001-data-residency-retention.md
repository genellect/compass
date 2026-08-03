# ADR-0001: データ保存地域と保存期間

Status: Accepted for Phase 5 / Production confirmation required  
Date: 2026-07-16

## Decision

- Neonを使用する場合はSingaporeを第一候補とする。
- PostgreSQLには必要最小限の氏名、大学メール、学籍番号、所属、状態、同意証跡を保存する。
- 時刻はUTCで保存し、画面ではAsia/Tokyoで表示する。
- 停止済み利用者と承認済み同意証跡は利用終了後1年、不承認申請は90日、operationは1年、PIIを最小化した監査ログは3年保存する。
- exportはサーバーに恒久保存しない。
- 国外保存と委託先監督をプライバシー本文へ反映するまでは実PIIを保存しない。

## Consequences

- 0円PostgreSQLの実現可能性を維持できる。
- 国外処理に関する外的環境の把握と委託先確認が必要になる。
- 国内保存が必須になった場合はDBサービスを再選定する。
