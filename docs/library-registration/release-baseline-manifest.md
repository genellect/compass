# Release Baseline Manifest

## Historical R0（2026-08-01）

作成日: 2026-08-01<br>
source baseline: `origin/main` `8a3cccedb5ea642b08c15bc8acd9424528ee078b`<br>
release branch: `codex/library-registration-release-baseline-20260801`

## 移植した範囲

- `src/app/(library)/library-registration/`
- `src/library-registration/`
- `services/library-api/`のsource、migration、test、lockfile、Dockerfile
- `contracts/library-registration/`
- `docs/library-registration/`
- 登録専用PowerShell helper、compose、Docker ignore

## 意図的に移植しなかったもの

- 旧root `.env.example`、`.gitignore`、`package*.json`、`next.config.ts`、`tsconfig.json`、
  `scripts/verify-next-build.mjs`の上書き版。現行mainへ必要差分だけ手動統合した。
- `.venv*`、`.pytest_cache`、`__pycache__`、`.next*`、SQLite DB、`outputs/`。
- OAuth token、client secret JSON、refresh token、Neon接続文字列等の秘密情報。
- 旧静的`future-strategy-library/`directory。

## 保護した範囲

- 旧worktreeは比較証跡として変更していない。
- `COMPASS Interactive`のpath、Git、Docker network/volume/containerに触れていない。
- 現行`/future-strategy-library/`とGoogleフォームCTAを維持している。
- push、PR、Cloudflare deploy、Cloud Run/Neon/Google設定変更を行っていない。

## Baseline verification

正式PASSには以下が必要である。

```powershell
npm.cmd run check
python -m pytest -q
docker compose -f compose.library-dev.yaml config
```

加えてGit差分からsecret、token、PII、cache、DB fileがないことを確認する。

2026-08-01に上記を完了し、`R0 PASS / LOCAL ONLY / NOT RELEASED`と判定した。
結果は`release-baseline-verification-2026-08-01.md`に記録する。

このR0 PASSは当時のsource baselineに対する結果であり、2026-08-02のrelease候補のcanonical PASSへ
読み替えない。

## Current release candidate（2026-08-02）

- branch: `codex/library-registration-preview-20260802`
- base: `origin/main` `ce06cd7fce1d1425f53ccca23d248ff88acbbeb3`
- main integration merge: `966f71bdf3b543bd2ec7ef3505ef282e06f9200e`
- current head: `git rev-parse HEAD`とcanonical evidence `head_commit`の一致を正本とする。
- DB bootstrap修正後のbackend全回帰、Phase 9/10A PostgreSQL gate、Phase 8A合成200件・同時2・
  dump/restoreは対象gate PASS。
- 旧`local-preproduction-gate.json`は修正前HEADのFAILであり、current canonical evidenceではない。
- canonical gateはclean worktreeを要求し、pre/post HEAD、source manifest、file count、status fingerprintを
  別々に記録して不変を機械検証する。
- billing/card、GCP apply、Cloudflare Preview、Neon production、Drive、GitHub push、実PII、人間E2Eは
  実施していない。
- FastAPI + Neon + Cloud Runを本命profileとし、runtime前にCloud Run spend cap、project alert、
  notification channel、public ingress停止境界の外部Gateを必須とする。

最終clean HEADでcanonical gateの`status=pass`、matching `head_commit`、pre/post不変、cleanup PASSが
揃った場合だけ`LOCAL CANONICAL PASS`とする。source commit後は過去証跡を無効化する。外部Gateは
常に別であり、本候補は`NOT RELEASED / PRODUCTION BLOCKED`である。
