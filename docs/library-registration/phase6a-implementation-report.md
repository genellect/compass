# Phase 6A Google認証・登録API基盤 実装記録

> **履歴文書:** 技術証跡は保持するが、第二管理者を後続Production条件とする記述はADR-0003と`phase-roadmap-v3.md`で廃止済みである。

実施日: 2026-07-28<br>
正式判定: `PASS`

## 1. 実装境界

Phase 6AはPrimary 1名と合成データで実装した。第二管理者、MFA、OAuth
引継ぎ、国外保存承認はPhase 6B/Pre-Production Gateへ延期し、実PIIの
外部DB保存、Drive権限付与、Gmail送信は有効化していない。

OAuth第1層は、Google IDトークンが許可Workspace組織に属することだけを
確認する。学生・教員によるOAuth分岐は行わない。Drive付与可否は従来どおり
フォーム固定条件（在籍区分、薬学部、学年、`PP/PL/MP + 数字5桁`、同意等）
をFastAPIが別に判定する。

## 2. 実装内容

- Google公式`google-auth`で署名、`aud`、`iss`、`exp`を検証する。
- `email_verified=true`と許可`hd=st.kitasato-u.ac.jp`を追加検証する。
- Google `sub`を`library_identities`へ結び、メールを変更可能属性として扱う。
- IDトークン本体、Client Secret、OAuth tokenをDB、ログ、ブラウザ保存領域へ
  保存しない。
- `POST /phase6/auth/verify`で、検証済みメールと`hd`だけをUIへ返す。
- `POST /phase6/registrations`はクライアント提供の認証事実を受け付けず、
  サーバー生成の事実とDB既存状態から再判定する。
- idempotency keyをGoogle subject hashへ結び、別`sub`によるreplayを拒否する。
- 既存memberに別`sub`が自動linkされることを防ぎ、個別確認へ送る。
- `GET /phase6/admin/authorization`はメールではなくactiveな管理者`sub`とroleを
  照合する。管理者session/CSRFはPhase 8の範囲とする。
- CORS allowlist、Bearer境界、トークン長上限、generic error、request IDを
  導入した。
- Frontendは既定`mock`モードを維持し、明示的な公開Client ID/API URL設定時
  だけGoogle Identity Servicesを読み込む。
- Google Identity Servicesの初期化には`hd`を指定せず、個人アカウントを含む
  任意のGoogleアカウントを選択可能にする。組織判定はFastAPIが検証した
  IDトークンの`hd`だけで行う。
- FrontendはIDトークンをReactメモリ上だけに保持し、APIへ
  `Authorization: Bearer`で送る。

## 3. Schema

Alembic revision: `6bb0eb9832ab`

- `library_applications.authentication_subject_hash`
- `library_identities.email_verified`
- `library_identities.issuer`
- `library_identities.audience`
- `library_identities.last_verified_at`

subject hashはidempotency keyの所有主体照合用であり、raw `sub`やtokenを
申請履歴へ複製しない。

## 4. 自動・ローカル検証結果

| 検証 | 結果 |
| --- | --- |
| Python全回帰 | `64 passed` |
| TypeScript/Vitest | `19 passed` |
| TypeScript型検査 | PASS |
| Next.js static build | PASS |
| 静的export・凍結site完全一致 | PASS |
| Desktop 1440px | 横overflowなし、H1 1件、初期submit無効 |
| Mobile 390px | 横overflowなし、H1 1件、フォーム操作可 |
| ローカル学生モック | 薬学部・学部生・3年・PP23000・両同意でapproved |
| Browser console | warning/error 0件 |
| Docker isolation validation | PASS |
| Docker PostgreSQL 17 migration | head `6bb0eb9832ab` |
| Docker API | user `app`、healthy |
| Docker Python regression | `64 passed` |
| Neon direct migration | `3ee520dc1b7a`から`6bb0eb9832ab`へ前進適用成功 |
| Neon pooled schema verification | revision・Phase 6A追加カラム・外部副作用無効を確認 |
| Phase 6既定停止 | `/phase6/auth/verify`が404 |
| OAuth account chooser | Client初期化の`hd`指定なしを自動テストで確認 |
| Workspace認証手動E2E | 検証済み大学メールを編集不可表示、`POST /phase6/auth/verify` 200 |
| 個人Googleアカウント手動E2E | アカウント選択後、許可Workspace外として拒否表示を確認 |
| 認証確認だけのDB非永続化 | members、identities、applicationsはいずれも0件 |
| Port 3001 CORS preflight | 200、許可origin一致 |
| Docker停止 | 登録container 0、専用volume保持 |
| COMPASS Interactive | 11 containerを観測、停止・再作成・変更なし |

合成データ専用Neonの接続文字列はローカル環境変数からだけ取得し、値を
コマンド出力、Git、文書へ保存していない。Alembicはdirect接続、アプリ相当の
schema検証はpooled接続で行った。検証には読み取り専用の
`scripts/verify_phase6a_neon.py`を使用した。

## 5. 手動E2E・最終ゲート結果

1. 公開Web Client IDを用意する。Windows User環境変数が未設定なら、wrapperの
   対話promptへ入力でき、ファイルやUser環境へは保存されない。
2. Web OAuth ClientのAuthorized JavaScript originsへwrapperで使うoriginを
   追加する。今回のE2Eでは`http://127.0.0.1:3001`を登録済みである。
3. `scripts/start-phase6a-local-e2e.ps1`を起動する。このwrapperがローカル
   PostgreSQL、`EXTERNAL_SIDE_EFFECTS_ENABLED=false`、Google frontend設定を
   process内だけで固定する。
4. 大学Workspaceアカウントによる`hd`第1層通過は確認済みである。
   登録submitは押さず、`/phase6/auth/verify`後もメールや`sub`がDBへ保存されて
   いないことを確認済みである。
5. 画面の認証解除後、個人Googleアカウントを選択し、許可Workspace外として
   拒否されることを確認済みである。Googleのアカウント選択画面自体は個人
   アカウントを候補から除外しない。
6. 合成データ専用Neonへrevisionを前進適用し、pooled接続で回帰確認済みである。

大学Workspaceの正系と個人Googleアカウントの否定系を含むローカル実Google
E2Eは`PASS`した。Neon前進適用、pooled接続検証、Docker全回帰も成功したため、
Phase 6Aを正式に`PASS`とする。第二管理者はPhase 6Aには不要であり、Phase 6B/
Production Gateまでに準備する。実PII保存、Drive権限付与、Gmail送信、Phase 6B
昇格は引き続き許可しない。
