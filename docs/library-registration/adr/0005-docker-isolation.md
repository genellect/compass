# ADR-0005: Docker開発環境の独立境界

Status: Accepted  
Date: 2026-07-19

## Decision

- 今後のFastAPI、migration、PostgreSQL回帰、container image検証にはDockerを使う。
- Compose project名を`compass-library-registration-dev`へ固定する。
- networkは`fsl-registration-dev-network`、volumeは
  `fsl-registration-dev-postgres-data`、host portはDB `55432`、API `58000`へ固定する。
- 全resourceへ`com.compass.project=future-strategy-library-registration`を付ける。
- 操作は`scripts/library-docker-dev.ps1`を経由し、対象project名とownership labelを
  検証してから実行する。
- `COMPASS Interactive`のcontainer、image、network、volume、port、repository、
  processを停止、削除、再利用、rename、clean upしない。
- 衝突または所有label不一致を検出した場合は登録基盤側を中断する。
- `Down`は登録基盤containerとnetworkだけを対象とし、volumeを削除しない。
- Docker内データは合成データだけとし、Google/Drive/Gmail副作用を無効にする。

## Priority rule

競合、port不足、memory不足、Docker Engine不調などにより両projectの同時運用が
難しい場合、`COMPASS Interactive`の稼働と保護を優先する。登録基盤側を停止し、
Interactive側へ変更を加えない。

## Evidence

2026-07-19にPostgreSQL 17、Alembic、FastAPI health、Python全43件をDocker内で
実行しPASSした。実行前後で`compass-interactive`の11 container IDを比較し、
同一であることを確認した。既存の`vector` restart状態は検証前から存在し、本作業
では停止・修正していない。
