# Agentの検証とPreview完了契約

Status: Canonical Operational Runbook
Scope: このrepositoryの全agent・依頼された全Web surface
Last updated: 2026-09-12

[AGENTS.md](../AGENTS.md)の検証と非本番納品契約を具体化する。既にユーザーが合格とした実装は土台として維持する。変更のついでに本文・写真・テーマや無関係な実装を作り直さない。

## リスクから選ぶ検証

| 変更 | 基本の確認 | 広げる条件 |
|---|---|---|
| 文書・agent指示のみ | 差分、`npm run verify:docs`、関連する指示の矛盾 | 実行スクリプト・環境・依存・権利台帳も変更した場合 |
| 局所CSS・カード表現 | 対象routeのDesktopとMobile、実表示、はみ出し、変更した操作 | 共通CSS、font、breakpoint、複数routeへ影響する場合 |
| セクション移動 | DOM順、Desktop/Mobileの表示、nav順・anchor、装飾番号 | routerやhost routingも変更する場合 |
| 操作・状態管理 | 変更した遷移と中断・keyboard/reduced-motion等の該当条件 | 共通コンポーネントに依存する他機能がある場合 |
| 認証・API・登録・データ・配信境界 | 専用runbookのunit/integration/security gate | 安全境界を跨ぐ変更では総合gateを追加 |
| 共通基盤・依存・大規模変更、明示された総合監査 | `npm run check`、必要なresponsive/repository gate | CI・専用runbookの責任範囲に従う |

テスト計画は「今回壊れ得ること→それを確認する最小ケース」で説明する。既存の検証を優先し、値をそのまま写しただけのテストや低影響の可逆変更への大量の新規テストを作らない。UIの最初の確認は対象のDesktop/Mobileを各1条件、追加境界は実際に変更したものだけとする。

反復開発は開発サーバーで確認し、配信用buildは変更をまとめてから1回行う。その同じ成果物をstatic verifier、必要なローカル確認、Cloudflare Previewに使用する。新たな関連変更がない限りbuildや合格済みテストを繰り返さない。

新しい不具合を見つけた場合は、その再現ケースに絞って修正・検証し、最後に必要な隣接操作を確認する。長いテストを無変更で反復しない。既存失敗は一度だけ切り分けて根拠と共に記録する。既知失敗を隠したり、timeout/retryを緩めて合格にしたりしない。

局所変更の検証が約5分を超えた時点、または検証が実装より著しく重くなった時点で、実行範囲・待ち方・実行環境を見直す。時間は再計画のきっかけであり、未確認項目を合格にする予算ではない。ユーザーに検証待ちを重ねる前に、何を確認できれば納品できるかを絞る。

CIの必須check、visual baselineの所有OS、安全境界の専用gateは保持する。局所変更のローカル検証に総合CIと同じ全範囲を強制しない。無関係な既存CI失敗がある場合でも、対象機能を確認した非本番Previewは提供し、総合gate未合格を明記する。merge・Productionの条件を省略しない。

## 視覚設計の見直し

デザイン品質への修正依頼では、影・transformを追加する前に、情報の主従と装飾の役割を決める。参考サイトを求められた場合は実表示を確認し、取り入れる構成と対象サイトへの適用理由を記録する。ブラウザーテストの合格をデザイン品質の合格と同一視しない。初期表示、本文と写真の視認性、余白、隣接セクションとの強弱をPreviewで確認する。

## PRとCloudflare Preview

依頼されたWeb UI実装は、原則として次まで行って完了とする。

1. 既存の非本番公開経路と認証を早期に確認する。
2. 専用branchで実装し、リスクに対応する検証を行う。
3. commit/pushしてPRを作成する。
4. Production以外のbranchへCloudflare Pages Previewを作成する。Production branch、secret、独自domain設定を変更しない。
5. 生成されたPreview URLの対象routeを実ブラウザーで確認し、PRとPreviewのURLを報告する。JP/ENなど複数対象はそれぞれ示す。

これはCOMPASS公式surfaceに限らず、ユーザーが明示的に依頼した独立surfaceにも適用する。編集許可のない別surfaceへ作業を広げることは許可しない。ローカル実装のみ・調査のみ・外部操作禁止などの明示指定は優先する。

localhostやパッチは補助資料であり、Cloudflare Previewを代替しない。認証不足やdeploy拒否などの具体的障害がある場合は早期に報告し、未完了の項目を明確にする。実装依頼に含まれる非本番commit/push/PR/Previewについて重複承認を求めない。Production公開・merge・認証設定変更は別の明示指示を必要とする。
