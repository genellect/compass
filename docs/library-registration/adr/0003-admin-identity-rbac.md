# ADR-0003: 管理者IDとRBAC

Status: Accepted / owner-controlled dual-account allowlist
Date: 2026-07-16
Revised: 2026-08-03

## Decision

- 管理者の主識別子はGoogle OIDCの`sub`とする。
- メールだけで管理者権限を与えない。
- 初期許可対象は、同一の運営責任者が管理する大学Workspace 1件と個人Gmail 1件の2アカウントだけとする。
- 正確なメールアドレスは公開repositoryへ置かず、Productionの`GOOGLE_ADMIN_ALLOWED_EMAILS`／
  Secret Managerで完全一致private allowlistとして管理する。未設定、空、重複、不正形式はfail closedとする。
- 両アカウントは実token確認後、異なるGoogle `sub`をcreate-only bootstrapし、どちらも`admin` roleとする。
- 役割は`viewer`、`operator`、`admin`。
- `admin`だけが利用停止、Drive削除、一括import確定、管理者変更を行える。
- 全変更操作へ理由と監査ログを必須とする。
- 管理認可ではWorkspace domain、学生・教員、学部、学年、学籍番号で分岐しない。allowlist外の
  Google accountは同じ大学Workspace利用者を含め一律拒否する。
- 将来の追加は運営責任者の明示承認、Secret Manager変更、変更記録、実token確認、個別`sub`
  bootstrapを必須とする。初期allowlistの2件という状態を、恒久的な固定長制約にはしない。
- 第二管理者は設けず、PASSまたはProduction Gateの要件としない。2アカウントが同一人物に属する
  single-operator riskを受容し、両アカウント個別のMFA・recoveryと緊急停止手順で低減する。
- repositoryはpublicであるため、source、管理URL、OAuth Client ID、Cloud Run hostが既知でも破れないことを
  前提にする。Cloudflare Access、同一origin allowlist proxy、private edge secret、pre-auth rate limit、
  Google完全一致allowlist、`sub` RBACを重ね、secret値と実identityはruntimeだけに置く。

## Consequences

- URL流出や一般大学アカウントだけでは名簿へアクセスできない。
- Phase 6AではGoogle `sub`に基づくRBAC照合までを実装する。管理者画面の
  session、CSRF、失効処理はPhase 8で実装し、Production Gateで2つのowner-controlled account、
  private allowlist、MFA・recovery、deny-by-defaultを結合して検証する。
- 同一人物が両アカウントを失った場合、第三者が即時復旧できない残余riskは継続する。
