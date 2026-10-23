# Release Baseline Verification — 2026-08-01

判定: `R0 PASS / LOCAL ONLY / NOT RELEASED`

## Scope

- baseline: `origin/main` `8a3cccedb5ea642b08c15bc8acd9424528ee078b`
- branch: `codex/library-registration-release-baseline-20260801`
- worktree: `work/compass-library-registration-release`
- external publication: なし
- CTA変更: なし
- production Google/Neon/Cloudflare変更: なし
- COMPASS Interactive操作: なし

## Frontend

`npm.cmd run check`を修正版依存で実行した。

| 検証 | 結果 |
|---|---|
| Community/Contact | 57 tests PASS |
| Library registration | 20 tests PASS |
| TypeScript | `tsc --noEmit` PASS |
| Next.js | 16.2.11 production static build PASS |
| Routes | 公式route 8件 + not-foundをstatic生成 |
| Registration export | `/library-registration/index.html`生成・検証PASS |
| Existing Library | 現行GoogleフォームCTAを維持 |
| Registration privacy | noindex/noanalytics、Googleフォームlinkなし |

ローカル静的exportを実ブラウザで確認した。

| Browser check | 結果 |
|---|---|
| Desktop 1440×1000 | h1 1件、横overflowなし、console warning/error 0件 |
| Mobile 390×844 | h1 1件、横overflowなし、console warning/error 0件 |
| Mock E2E | 合成学生、薬学部、学部3年、全角小文字`ｐｐ２３０００`、両同意で自動承認 |
| Normalization | 判定結果に`PP23000`を表示 |
| Side effects | LOCAL MOCK表示、外部送信・Drive付与なし |

## Dependency audit

- Next.jsを16.2.10から16.2.11へ更新した。
- Sharpを0.34.5から0.35.3へ更新した。
- Next.js内部依存へPostCSS 8.5.19、Sharp 0.35.3 overrideを固定した。
- `npm.cmd audit --audit-level=high`: `found 0 vulnerabilities`。
- 更新後に全frontend checkを再実行してPASSした。

## FastAPI/Python

- 登録API専用`.venv`を作成し、`uv sync --frozen`で`uv.lock`を再現した。
- `python -m pytest -q`: 83 tests PASS。
- ローカルPhase 5 APIは既定OFFへ変更し、試験/composeでだけ明示ONにした。
- 既定値変更に合わせ、Phase 5 API testも明示opt-inへ修正した。

## Docker/PostgreSQL

- Docker Client/Engine: 29.6.1。
- Docker Compose: v5.3.0。
- `docker compose -f compose.library-dev.yaml config --quiet`: PASS。
- scopeは`future-strategy-library-registration` labelと`fsl-registration-dev-*`だけ。
- PostgreSQL 17 container: healthy。
- migration container: successful。
- Alembic current: `a8c4d7e219bf (head)`。
- `/health`: `status=ok`, `phase=7-foundation`。
- `/phase5/health/db`: PostgreSQL、外部副作用OFFを確認。
- API container内Python 83 tests: PASS。
- 検証後、container/networkを`compose down`し、合成データvolumeだけ保持した。

## Static/security boundary

- `/library-registration/*`にGIS/Cloud Run preview用CSP、`DENY`、noindex headerを追加した。
- `https://*.run.app`はAPI origin未確定時のpreview暫定値であり、Production Gateで
  exact originへ狭める。
- OAuth/Neon/Drive credential、実token、実PII、credential JSON、DB file、Python cacheを
  差分に含めていない。
- 通常buildはmock、外部副作用OFF、Drive API OFF、kill switch ONのままである。

## Remaining gates

- Phase 7B実Google Drive E2E: pending。
- Preview deploy/hosted browser check: pending and requires approval。
- Production platform hardening、管理者運用、旧名簿移行、出力: pending。
- Pilot Gate / Production Cutover Gate: BLOCKED。
