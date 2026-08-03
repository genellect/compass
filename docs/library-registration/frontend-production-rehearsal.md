# Library frontend production-shaped rehearsal

Status: Local operational runbook
Scope: Production Gate統合前のフロントエンド静的export検証のみ
Last verified: 2026-08-02
UI refresh verification: LOCAL E2E PASS / PRODUCTION EXTERNAL PENDING (2026-08-02)

## Purpose

`google` modeのNext.js static exportを、実資格情報・実API・実個人情報を使わずにローカルで生成し、通常のexport検証とProduction専用検証を実行する。その後、成功・失敗にかかわらず`out/`を明示的な`mock` modeで再buildし、mock専用検証まで完了させる。

このrehearsalはProduction acceptanceではない。Google OAuth、Library API、Cloudflare、Neon、Driveへの通信、Git操作、deployは行わない。OAuth Client IDは非secretの合成形式、API originはRFC 5737 TEST-NET-1予約アドレスを使用する。Next telemetryを無効化し、npmをoffline modeに固定する。

## Minimal UI refresh contract（LOCAL E2E PASS）

今回の最小改装は登録画面のpresentationに限定する。登録専用heroと独自headerを撤去し、親サイトの
`SiteHeader`を、登録route内の登録CTAだけ非表示にして再利用する。header直下は登録見出しとフォームへ
直結し、利用者向けの平易な案内、入力状況・不足項目の可視化を行う。対象folderはMy Drive上に
あるため、「Google Drive共有フォルダの閲覧権限」と案内し、「共有ドライブ」とは表現しない。

可視UIには「検証」「モック」「Phase」「API」「Preview」「Decision」等の開発・内部判定語を出さない。
local/test modeは非可視の安全markerと自動testだけで区別する。

可視仕様は次のとおりとする。

- H1: 「ようこそ、／未来戦略ライブラリへ。」
- 導入文: 「必要事項を入力してください。現在は北里大学薬学部生の方を対象としており、登録は3分ほどで完了します。」
- section 01: 「大学アカウント認証」
- 利用規約・個人情報は折りたたみ、利用規約checkboxは本文を開いた後だけ有効。
- submit panelは「登録内容を確認する」CTA一つだけ。
- account選択肢は大学学生・大学教職員等だけとし、個人Gmailを表示しない。個人Google accountの
  server rejectionは維持する。
- registrationのGoogle Identity Services chooserは`runtimeConfig.expectedHostedDomain`を`hd`として
  必須で受け取り、大学domain外accountを候補から除外する。共通`GoogleSignInButton`の`hd`は、
  registration以外の保護surfaceではoptionalである。

2026-08-02の最終local E2Eでは次をPASSした。

- Desktop 1440pxで大学学生、薬学部、`PP23000`、規約・個人情報同意のhappy pathが自動承認表示となる。
- 利用規約・個人情報を開閉でき、規約checkboxは開封前に無効、開封後に有効となる。
- Mobile menuを開閉できる。
- mobile titleは左右20px、`clamp(1.3rem, 6.5vw, 1.72rem)`、`nowrap`で欠けない。
- 320px・390pxで`scrollWidth=clientWidth`、横overflowなし。
- browser console logはDesktop・Mobileとも0件。

API payload、Google ID token検証、資格判定、DB transaction、Drive outbox、冪等性、rate limit、
kill switchのcontractは変更していない。chooserの`hd`だけを認可根拠にせず、serverはissuer、audience、
`email_verified`、`hd`を再検証する。このLOCAL E2E PASSは正規host OAuth、Cloudflare、Cloud Run、
Neon、実Google認証、実Drive、人間受入を証明せず、Production external gatesは引き続きPENDINGである。

## Boundary validation

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\library-frontend-production-rehearsal.ps1 -Action Validate
```

次の場合は開始前にfailする。

- 実行rootが`COMPASS Interactive`内またはその上位directoryである
- `compass-official-site`ではない
- Production専用またはmock専用verifierが存在しない

## Run

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\library-frontend-production-rehearsal.ps1 -Action Run
```

実行順序:

1. 関連するprocess環境変数を値を表示せずmemoryへ退避
2. 予約済み合成値で両Library modeを`google`にして実build
3. `npm.cmd run verify`
4. `node.exe scripts/verify-library-production-build.mjs`
5. `finally`で両Library modeを`mock`に固定して再build
6. 通常verifyと`verify-library-mock-build.mjs`を実行
7. 呼出元の環境変数を復元
8. secret値を含まないJSON evidenceを`outputs/frontend-production-rehearsal/<UTC>/evidence.json`へ保存

Production側のbuildまたはverifyが失敗しても、mock再buildは必ず試行される。mock復元が失敗した場合は最優先でfailし、`out/`を利用可能と判定してはならない。

## Acceptance markers

Production-shaped中間成果物:

- registration HTML: `GOOGLE API=true`, `LOCAL MOCK=false`
- admin HTML: `ADMIN API=true`, `SYNTHETIC MOCK=false`
- `_headers`: 合成API originがexactly once

最終`out/`:

- registration HTML: `LOCAL MOCK=true`, `GOOGLE API=false`
- admin HTML: `SYNTHETIC MOCK=true`, `ADMIN API=false`
- `_headers`および全HTML/JS: rehearsal API origin/OAuth clientが残存しない

## Evidence handling

evidenceはstatus、stage名、exception type、成果物SHA-256、boolean markerだけを保持する。退避した環境変数の値、token、credential、個人情報、HTML本文は保存しない。`outputs/`はGit ignore対象である。
