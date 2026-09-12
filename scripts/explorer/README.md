# PC空間探索モード

Status: Implemented, verification pending

ルート親サイトにのみ追加する独立した探索モード。既存の通常3D、ISS Mobile、iPad条件、関連サイト、フォームは保護する。新しい情報の出し方は [INFORMATION_DESIGN.md](INFORMATION_DESIGN.md) に記録する。

## 実装

`ExplorerGate.tsx` が対象PCを確認し、`engine.ts` を遅延読み込みする。ユーザーの2026-09-13の訂正に基づき、表示選択は`3D ON / OFF`だけとし、初期値はON。旧3Dの55fpsを待つ二重判定を撤去した。旧rendererを破棄し、その静止画を介して新rendererへ移る。OFF・描画失敗時は対応するセクションの静止表示へ戻り、別のリアルタイム3Dを再開しない。MobileとiPadの既存条件は維持する。

起動判定は実描画の約3秒の安定区間で、中央値28fps以上、フレーム間隔p95が55ms以内、取得できるGPU時間p95が40ms以内を基準とする。60fpsは上限目標であり、起動の必須条件ではない。基準未達時は描画画素数と発光処理、影の解像度を段階調整してから再判定する。稼働中も平均27fps未満が2区間続けば同様に軽量化し、最低段階でも維持できない場合はOFFへ戻る。静的な影は部屋・扉・配置が変わった時だけ更新する。

初期到着・入室時は空間を表示し、読む操作で既存コンポーネントを表示する。HTMLを複製せず、CommunityのdetailsやFounderの写真・リンクを共有する。Blenderの文字とナビゲーションの名称は既存文言を使用する。

全9室をA*で接続し、Blender由来の床メッシュと家具の占有領域で移動を制限する。ポインターのクリック／ドラッグを区別する。行き先のホバー・フォーカスは経路を示し、クリックすると往復可能な移動を開始する。

表示切替はルート専用portalで既存ヘッダーの操作領域に配置し、独立した切替CTAや重複する行き先CTAを追加しない。3D表示中の既存ヘッダーから各部屋へ移動する。共有ヘッダーのソース、室内の最終リンク、外部サイト、修飾キーによる別タブ操作は変更しない。

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

`NEXT_PUBLIC_COMPASS_EXPLORER=off`で新しいPC表示全体を無効化できる。保存するのは`compass-3d-mode`のON/OFF、部屋・カメラ、停止状態のみで、フォームや解析へ項目を追加しない。旧3択の「通常表示」は旧リアルタイム3Dを意味していたため、OFFとは見なさず、新規ON/OFF設定だけを引き継ぐ。

このモードはPR・Cloudflare Previewで確認する。Production公開はこのPreviewへの明示承認後に行う。機能テスト合格を実写級品質や高性能PCの実機合格と扱わない。
