# PC空間探索モード

Status: Implemented, verification pending

ルート親サイトにのみ追加する独立した探索モード。既存の通常3D、ISS Mobile、iPad条件、関連サイト、フォームは保護する。新しい情報の出し方は [INFORMATION_DESIGN.md](INFORMATION_DESIGN.md) に記録する。

## 実装

`ExplorerGate.tsx` がPCと既存描画の安定性を確認し、`engine.ts` を遅延読み込みする。新しい描画の性能検査が通った時だけ切り替える。旧rendererを破棄し、その静止画を介して新rendererへ移る。失敗時は対応する現行セクションへ戻る。

初期到着・入室時は空間を表示し、読む操作で既存コンポーネントを表示する。HTMLを複製せず、CommunityのdetailsやFounderの写真・リンクを共有する。Blenderの文字とナビゲーションの名称は既存文言を使用する。

全9室をA*で接続し、Blender由来の床メッシュと家具の占有領域で移動を制限する。ポインターのクリック／ドラッグを区別する。行き先のホバー・フォーカスは経路を示し、クリックすると往復可能な移動を開始する。

## 再生成

必要なのはBlender 4.5.11 LTS、FFmpeg、Node.js、作業用の`@gltf-transform` 4.5.0環境。WebのbuildではBlenderを使用しない。4.5.13は当該Windowsで起動できなかったため使用していない。

作業用の入力・マスター・未最適化素材を`public/`やGitへ置かない。各コマンドのパスは制作用環境に合わせて指定する。WindowsでBlenderに渡すパスは絶対パスにする。

1. `unpack-assets.mjs`で変更していないv3素材を制作用に展開する。
2. `create_facility.py`に`--source --output --master --materials --font`を渡し、施設、家具、移動範囲を生成する。
3. 生成マスターを開いて`bake_architecture.py --output RAW --resolution 2048 --samples 32`を実行する。間接光と接地影を別UVへベイクする。
4. `node scripts/explorer/prepare-assets.mjs TOOLCHAIN RAW`で共通建築・部屋・案内を最適化する。
5. ベイク済みマスターを開いて`compose_exhibits.py --repo REPO --output RAW --font FONT --master EDITABLE_MASTER`を実行する。立体文字・構造補修・InteractiveのTVを別モデルへ書き出す。
6. `node scripts/explorer/prepare-exhibits.mjs TOOLCHAIN RAW`で展示を最適化する。この段階で最新のカメラ構図・展示マニフェストを確定する。
7. `prepare-photography.mjs SOURCE_PHOTO`、`prepare-film.mjs FFMPEG SOURCE_CLIP`、`prepare-audio.mjs FFMPEG SOURCE_AUDIO_DIRECTORY`で配信用メディアを生成する。

`public/habitat/explorer/v1/` と `public/media/explorer/audio/`だけが新規の配信素材。NASA・CC0・OFLの出典は配信側`credits.txt`に記載する。既存`/habitat/v3/`は上書きしない。

## 検証と公開境界

- `npx vitest run tests/explorer-navigation.test.ts`
- `npx playwright test tests/responsive/explorer.spec.ts`
- 広範囲の親ページ変更として`npm run check`とWindowsのresponsive gate

専用テストの決定的な描画時間は機能・画像比較用であり、実機fpsを証明しない。実機性能は通常の時計で別に測る。`inspect-browser.mjs --deterministic`も同じ制限がある。

確認スクリプトの配信先は`EXPLORER_BASE_URL`で指定できる。未指定時はローカル開発用の`http://127.0.0.1:8813/`を使用する。

`NEXT_PUBLIC_COMPASS_EXPLORER=off`で新モードを無効化できる。保存するのは表示設定、部屋・カメラ、停止状態のみで、フォームや解析へ項目を追加しない。

このモードはPR・Cloudflare Previewで確認する。Production公開はこのPreviewへの明示承認後に行う。機能テスト合格を実写級品質や高性能PCの実機合格と扱わない。
