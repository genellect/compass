# 文書改訂の対応表

Status: Completed
Scope: 2026-09-10のREADME・エージェント文書・開発手順の整理
Last verified: 2026-09-10

基準コミット: `40c6b090d7e5e105fb4fc002452ac5983e247ee3`。
理念、正式な文言、独立サイトの編集範囲、データ保護、公開の承認条件を保持する。
READMEは人間が実装を理解する入口、AGENTS.mdはエージェントの作業規則として編集した。

| 元の内容 | 現在の所在・変更内容 |
|---|---|
| READMEの理念・活動領域 | README冒頭。正式なHero・Visionを維持 |
| READMEの環境別コマンド、API、DB、検証 | [Development Workflows](development-workflows.md)へ移動。詳細な手順を保持 |
| READMEの重複する構成・デプロイ表 | READMEのプロダクト表、論理構成図、技術スタックとソース案内へ統合 |
| READMEの3D・動画に関する不足 | 現行Habitat v3、MobileHabitat、Contact入口、制作スクリプトから説明を追加 |
| AGENTS / Claude / Copilot | 共通規則はAGENTSを参照。対象範囲、読み順、検証、既存承認の扱いを明記 |
| Cloud Developmentの環境説明 | Dev ContainerとCodex setup経路、doctorの適用条件、npm/uvの正本を明記 |
| 権利・素材・依存保守 | LICENSE、THIRD_PARTY_NOTICES、legal文書と依存保守手順を追加 |

## ソースに基づく事実訂正

- Project Guideの公開DBロールのraw SELECTに関する記載は過去の課題だった。
  現行の限定RPC・独立token境界と、外部環境での実効権限確認が必要な状態を記載した。
  根拠は[Admin Access Security Boundary](library-registration/admin-access-security-boundary.md)と
  `services/library-api/`内の既存migration・権限検証である。
- static export検証の`/en/`・`/en/index.html`という期待値を、既存`public/_routes.json`の`/en/*`へ合わせた。
  この配信契約はコミット`84b9662`（2026-08-31）で既に導入済みだった。今回、配信設定自体は変更していない。
- Next.js等のバージョンは修正ブランチの依存定義へ更新した。本番への反映済みという意味を持たない。
- Habitatの旧設計文書には過去の素材・容量方針が残る。READMEは現行v3の
  [Authoring Guide](../scripts/habitat/README.md)と[素材credits](../scripts/habitat/ASSET_CREDITS.md)を参照する。

## 継続編集の基準

- READMEでは、読み手が価値・構成・実装箇所・確認方法を追える文章にする。実測していない性能や本番稼働を断定しない。
- AGENTSでは、条件と実行事項を短い規則として書く。ユーザーの明示指示と既存の許可範囲を尊重する。
- 正式文言・数値・状態の変更にはソースや確認日を付ける。過去の記録を現行実装として引用しない。
- `npm run verify:docs`で主要文書のローカルリンク先を検証する。本文の意味、外部ページ、見出しアンカーはレビューで確認する。
