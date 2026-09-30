# Interactive Desktop Hero の制作データ

編集対象は /INTRO_Interactive/ の681 CSS px以上のHeroです。主タイトル、日本語説明、AI表記、CTAを主役に据え、Blenderで制作した空間をThree.jsで描画します。680px以下は既存のMobile Heroを使います。

画面の題材を講義・COMPASSの意味に合わせる制約は設けません。判断基準は雰囲気、インパクト、リアリティ、および文字と背景を含む全体の構図です。合格済みのHeroは、段状の座席、曲面の天井、ガラス越しの景色、暖色の建築照明と実写の水平線を映す大型スクリーンで構成します。人物は配置していません。Heroのデザインはユーザー承認済みです。ヘッダー・下部の追加調整はPreviewでレビューします。

建築・家具・カメラ・照明・水面はBlenderの実際の3Dです。スクリーンにはCC0の撮影済みパノラマを材質として使います。AI生成画像、人物の平面画像、背景全体を画像として変形させる手法は使いません。第三者素材は ASSET_CREDITS.md に記録しています。

## 編集可能な元データ

- future-hall.blend: 材質画像をパックした空間、カメラ、照明、水面のモーフアニメーション。
- scripts/interactive/create_lecture_hall.py: 建築、150席の配置、スクリーン、カメラ。
- scripts/interactive/hall_atmosphere.py: 天井、ガラス、外景、照明、水面。
- scripts/interactive/prepare_screen_panorama.py: 実写パノラマからスクリーン用の画角を切り出す処理。
- scripts/interactive/export_lecture_hall.py: 反射用HDR、UV1、拡散照明のベイク、GLB書き出し。
- scripts/interactive/pack_lightmap.py: 照明のsRGB符号化。暗部を保ってglTFへ渡す。
- scripts/interactive/repack_hdr.cjs: HDRを画素を変えずに短いRGBEブロックで再保存し、バイナリへの秘密情報パターン誤検出を避ける。
- scripts/interactive/prepare_hall_materials.cjs: 親サイトに既に含まれる材質画像の抽出。
- scripts/interactive/render_poster.py: 同じBlenderカメラからのCyclesポスター書き出し。

却下された地球・金属造形・生成画像の案は公開アセットに含めません。以前の人物制作データはローカルの作業履歴と進捗バックアップに保持しています。

## 再制作

Blender 4.5.9 LTSで制作しています。パック済みのmasterは単独で開いて編集できます。

再生成する場合は、リポジトリのrootから prepare_hall_materials.cjs を実行します。追加のCC0材質は work/hall-materials/ に配置します。

- wood-diffuse.jpg / wood-normal.jpg / wood-roughness.jpg: Wood Table 001の2K材質。
- kloppenheim_06_puresky_2k.hdr: 外景と建築照明。
- qwantani_sunset.jpg: Qwantani Sunsetの公式Tonemapped JPG。

実行例:

```sh
blender -b --python-exit-code 1 --python scripts/interactive/prepare_screen_panorama.py -- --source work/hall-materials/qwantani_sunset.jpg --output work/hall-materials/screen-horizon.png
blender -b --python-exit-code 1 --python scripts/interactive/create_lecture_hall.py -- --output work/hall-delivery --master design/interactive/future-hall.blend
blender -b design/interactive/future-hall.blend --python-exit-code 1 --python scripts/interactive/render_poster.py -- --output work/hall-final-poster.png --samples 48 --width 1920
blender -b design/interactive/future-hall.blend --python-exit-code 1 --python scripts/interactive/export_lecture_hall.py -- --output work/hall-export --samples 24 --resolution 2048
```

ポスターはSharpでWebPに変換します。GLBはglTF Transform 4.5.0で、simplify（ratio 0.3、error 0.0003）→webp（emissiveTextureはlossless、baseColorTexture/normalTexture/metallicRoughnessTextureはquality 94）→meshopt（medium）の順に最適化します。材質extras、UV1、カメラ、アニメーションを保持します。現行モデルは204,918 triangles、11,869,980 bytesです。public/interactive/future-hall/ に置くのは lecture-hall.glb、room-light.hdr、sky.hdr、poster.webp の4ファイルです。

HDRは配置前に `node scripts/interactive/repack_hdr.cjs input.hdr output.hdr` で再保存します。復号したRGBE画素のSHA-256が一致することを処理内で検証します。

拡散光と接地の影はCyclesでベイクし、実行時はその照明を復元します。照明の範囲を正規化し、倍率とsRGB符号化の指定を材質extrasに保存します。照明テクスチャをlosslessで保存し、Web側では正しい色空間へ戻します。重複した拡散照明を除き、材質の反射は室内から撮影したHDRを使ってThree.jsで描画します。実行時の二重描画を伴う被写界深度処理は省き、建築と反射の描画を優先します。ポスターと実行時は同じ空間とカメラを使用します。

## 描画と確認

Mobileは新しい3Dモジュール、GLB、HDR、ポスターを取得しません。Desktopではポスターを先に表示し、準備完了後に3Dへ切り替えます。reduced motion、WebGL非対応、読み込み失敗、context lossではポスターを表示します。

681〜1199pxの縦画面では、上部の二行タイトル・CTAと下部の3D背景を一つの構図として配置します。1024px幅のiPad Proにも適用し、横向きではDesktop構図へ戻します。ポスターとThree.jsは同じ描画領域を使用します。

背景の停止ボタンは水面、光、カメラの緩やかな移動とマウスへの反応を止めます。画面外と非表示タブでは描画を停止し、680/681pxをまたぐリサイズとunmountではGPU資源・Observer・イベントを解放します。上限は30 FPS、DPR 1.5、230万pixelです。

対象Heroのレスポンシブ・停止/再開・非表示・失敗時・境界リサイズのテスト、Interactiveの行組み、Mobileの既存visual baseline、型検査、build/static exportを確認します。自動テストの合格と、見た目の品質の合格は区別します。
