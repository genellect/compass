# 夜の観測庭園 — 親サイトDesktop背景

既存コンテンツの背後に、近景の建築・水面・遠い星空がつながる一つの空間を置く。足場と建築の細部を尺度とし、スクロールに沿って開口部の手前から先へ視点が移る。写真素材をオリジナルのBlender造形の材質・照明・遠景に使用する。実写水面の短い映像を反射の変形に組み込み、通常表示では水と視点が継続して動く。

## 配信素材

- `*.map.webp`: Blenderから書き出した距離・水面・発光部分のデータ。960×540、lossless WebP。
- `*.water.webp`: 同じ水面マスクの透明度画像。低速時のブラウザー標準映像合成で使用する。
- `reflections.mp4`: 実写水面を640×360・15fps・12秒・音声なしに加工。WebGLの最初の描画後に取得する。
- `manifest.json`: 既存9セクションの構図。全景は一つのBlender空間を異なる位置から描画する。
- `*.webp`: 同じBlenderシーンの1920×1080描画。Heroの初期表示とreduced motion、読み込み失敗時の代替に使う。

光・反射・影はBlenderで事前計算する。建築と星空は原寸画像をブラウザーの合成レイヤーで表示し、視点の揺らぎ・セクション間の移動を付ける。WebGLは距離・水面・発光マップを使い、実写映像による水面の変形と光の変化だけを透明な1描画で合成する。これは奥行き情報を使う背景表現で、自由移動できる3D探索ではない。GLBやHDRはブラウザーへ配信しない。

WebGLはhydration後1.2秒遅らせ、Heroの本文・リンク・背景静止画を先に表示する。水面・光の合成バッファは最大36万画素に抑え、建築の原寸画像は鮮明に保つ。必要なセクションの画像だけを準備し、離れたセクションのGPUリソースを破棄する。タブ非表示・停止操作で映像と描画を止め、unmountでGPU・映像リソースを破棄する。

28fps未満が3計測区間続く場合、WebGLを破棄し、同じ原寸画像・実写動画・水面マスクをブラウザー標準の合成で動かす。低速時も背景を静止させない。OSのreduced motion、利用者の停止操作、素材取得エラー時の静止表示は維持する。ISSの条件と実装はこの処理に含めない。

## 再生成

Blender 4.5、Node.js、repositoryのsharpを使用する。取得元と加工内容は[credits.md](credits.md)を参照する。

```sh
blender --background --python scripts/habitat/create_night.py -- --source work/night-source --output work/night-renders --master work/compass-night-observatory.blend
node scripts/habitat/prepare-night.mjs work/night-renders
```

`--draft --section top`はHeroの構図確認用。公開用は両指定を外す。入力は`night.hdr`、`stone-{Diffuse,Rough,nor_gl}.jpg`、`rock-{Diffuse,Rough,nor_gl}.jpg`、`water-frame.png`。水面の動画変換例はcreditsに記載する。

Blenderは編集用のGLB、HDR、パック済み`.blend`も書き出すが、これらはブラウザーの読み込み経路に含めない。既存HTML、CTA、ISSの条件・素材、独立した`/3d/`の素材は変更しない。
