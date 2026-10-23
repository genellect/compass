# ADR-0006: リリース基線・本番topology・公開ゲート

日付: 2026-08-01<br>
状態: Accepted for implementation; production deployment pending

## Context

Phase 3〜7の実装は旧feature worktreeで進んだが、現行公式サイトmainから大きく遅れ、
未追跡ファイルと既存変更を含むため、そのworktree自体をrelease sourceにできない。
また、静的frontend、公開API、Drive操作workerを一つの「公開完了」と扱うと、
ローカル試験成功からCTA切替までの安全境界が失われる。

## Decision

1. 最新`origin/main`から独立branch/worktreeを作り、登録関連fileだけを選別移植する。
2. 現行Next.jsの`/future-strategy-library/`を正とし、旧静的directoryを再導入しない。
3. `/library-registration/`はnoindexの独立routeとして先に統合し、GoogleフォームCTAを維持する。
4. productionはCloudflare Pages、Cloud Run public API、Cloud Run private worker、Neonを
   分離する。workerはCloud Scheduler OIDC + Cloud Run IAMを主認証にする。
5. Alembicはruntime起動時ではなく、direct接続を使う明示migration jobで実行する。
6. Preview、Limited Pilot、Production Cutoverを別gate・別承認・別commitにする。
7. OAuth組織ゲートとフォーム内容によるDrive承認を固定された二層として維持する。

## Consequences

- 旧worktreeの未整理差分を現在mainへ混入させず、通常のreview可能なdiffを得られる。
- route統合だけを先に検証し、CTAを変更せずrollbackできる。
- public API侵害時にworker/Drive credentialへ直接到達する面積を減らせる。
- Cloud Run serviceとdeployment設定は増えるが、同じcontainer imageを使って重複を抑えられる。
- API origin確定前のCSP `https://*.run.app`はpreview用暫定値であり、Production Gateで
  exact originへ狭める必要がある。

## Rejected alternatives

- 旧feature worktreeをreset/cleanしてmerge sourceにする: 既存差分を失うため不採用。
- Drive worker routeをpublic APIと同じ外部公開境界に置く: secret漏えい時の影響が大きい。
- 登録route追加と公式CTA切替を同時に行う: rollbackと原因分離が困難。
- Google `hd`だけでDriveを自動付与する: 固定資格判定を迂回するため禁止。
