# COMPASS 3D 独立ページ

Status: Implemented, scoped verification passed, visual review pending
対象: `/3d/` と、親サイトの既存操作群に加える入口のみ。

## 通常サイトとの境界

`LegacyPageBody.tsx` は基準 main の構成へ戻す。`Habitat.tsx` の変更は `ExplorerEntry` の import と操作群内への追加だけである。旧3Dの画質・対象条件・音響・停止設定、ISS Mobile、iPad、関連ページ、独立サイト、フォームを変更しない。

入口は既存 `scene-config.ts` の条件とPC入力を参照する。iPadOSのDesktop UAも除外する。親ページには新renderer、モデル、性能測定、先読みを置かない。通常の `<a href="/3d/">` による文書間移動を使い、Nextのprefetchやrendererの並行稼働を避ける。保存済みの旧ON/OFFは新ページの選択として使わない。

`src/app/(spatial)/` は専用layoutを持ち、通常サイトのCSS・初期化処理を読み込まない。`ExplorerPage.tsx` が対応条件・停止設定を確認してから `engine.ts` を動的importする。描画失敗時は通常サイト、館内案内の既存リンク、再試行を維持する。ページ離脱でGPU/音声/イベント/取得を破棄し、BFCacheからの再表示では再初期化する。

## 操作

- WASD / 矢印キーで4.8m/s、Shift併用で7m/s。キーを離すと停止。ドラッグの視線を自動補正しない。設定から見回す感度と任意のPointer Lockを選べる。
- 床クリックは補助移動。先に見える壁やガラスがあれば奥の床を選択しない。
- 扉・室名をクリック、または近くでEを押すと、接近・開扉・通過を連続して行い、入口の内側で自由操作へ戻る。室内からは退出する。連打で処理を重複させず、別の行き先、移動キー、Escで中断できる。閉じた扉と未取得の室内へ進めない。
- 床・扉への補助移動は最大6m/s。扉通過は2.8m/sまで減速。館内案内の主操作は実移動、「移動を省略」だけ短いフェードで到着する。
- Esc、blur、非表示、メニュー表示で移動を停止。入力要素とリンクのキー操作を奪わない。

## 衝突・移動データ

`build-floor.mjs` は配信用建築GLBの床面から `floor.json` を作る。古い家具の占有セルは流用しない。

`collision.ts` は描画に使う建築、ガラス、家具、展示、扉の実形状に対し、半径0.3mの直立bodyを使う。平面施設に合わせたXZ索引で候補三角形を絞り、最大5cmの移動ごとに衝突補正と壁沿いの移動を行う。薄いガラスも両面で扱う。扉の当たり判定は葉の変換が変わった時だけ更新する。経路用マスクは静的bodyとの衝突で更新するが、実移動でも独立して衝突を確認する。

前版の格子内A*検証だけでは、観測窓の壁抜けを発見できなかった。新しいテストは実配信GLBを読み、格子と独立した形状への衝突、往復・扉・大きな移動量を検証する。

## 情報と描画

Heroは床、家具、行き先と立体文字を同時に見せる。旧家具モデルに混在した別建築の床・天井は、新ページ専用の `top.glb` から除く。v3は上書きしない。

8室で共用していた巨大な端末を非表示にし、資料・冊子・小型端末を閲覧卓に配置する。選んだ物を持ち上げて開き、対応するHTML本文を画面の半分以下の安定した読書面へ表示する。本文を開く前は室名・主題・選択操作だけを置く。Founderの卓とInteractiveの物理TVは、既存植栽・設備で隠れない位置へ移す。元のGLB・NASA遠景・家具・人物写真は上書きしない。

`experience-content.ts` は公開Library表紙と紹介文、Interactiveの既存質問例だけを参照する。独立サイトのアプリやCSSを読み込まない。`exhibit-documents.ts` はビルド時に実際のManifestoから3章の全文を取り出す。Communityは元の全文とnative detailsの形式・開閉状態を保持する。Founderでは公開Storyの実際の経緯を切り替えて読み、独立したWeb Portfolioへ進む。

Interactiveの質問デモは選んだ既存質問が卓上端末からTVへ移るローカル演出で、実講義への送信・AI応答・架空の参加人数はない。紹介動画は明示的な再生操作後だけ既存のYouTube公式プレーヤーをTV面に読み込む。閲覧中の室内音量を抑え、動画終了操作で戻す。動画サービスが利用できない場合も元のYouTubeリンクを用意する。

`occlusion.ts` は室内視線の三角形を3m単位の空間索引へ登録し、視線上のセルだけを調べる。広い遠景を室内索引へ含めず、ガラスの両面と動的な扉による遮蔽を残す。`collision.ts` の経路マスクは部屋単位でキャッシュし、家具の読み込みごとに全施設を再計算しない。

描画は直接のMSAAレンダリングとし、全画面の後処理bufferや本文を開く度のcubemap生成を使わない。現在の部屋と近い開口を優先し、離れた室内のGPU資源を解放する。旧モデルの圧縮済み先読みは隣接2室まで。60fps上限、継続的に遅い場合は解像度と影を落とし、維持できなければ3Dを破棄する。音響は明示操作後だけ取得・再生する。既存の室内・扉音源に、歩行距離と資料選択に対応する短いフィルタ済み接触音をWeb Audioで加える。追加の有料音源、BGM、音声APIはない。

## 再生成

制作用: Blender 4.5.11 LTS、既存の `@gltf-transform` 作業用環境。Web buildにBlenderは不要。

1. 元施設を必要に応じて `create_facility.py`、`bake_architecture.py`、`prepare-assets.mjs` で生成する。
2. ベイク済みmasterで `compose_exhibits.py --repo REPO --output RAW --font FONT --master MASTER` を実行する。
3. `node scripts/explorer/prepare-exhibits.mjs TOOLCHAIN RAW`
4. `node scripts/explorer/prepare-arrival.mjs TOOLCHAIN`
5. `node scripts/explorer/build-floor.mjs`
6. 開発サーバー上の初期Canvasを `node scripts/explorer/inspect-browser.mjs` で記録する。
7. `node scripts/explorer/prepare-poster.mjs` で同じ構図の軽量WebPを生成する。
8. `node scripts/explorer/report-assets.mjs`

`prepare-arrival.mjs` は旧室名文字の座標変換も一度だけ補正する。制作masterと未最適化ファイルはpublic/Gitへ入れない。配信素材は `/habitat/explorer/v1/`、音響は `/media/explorer/audio/`。NASA・CC0・OFLの出典は目立つCTAにせず館内案内から参照する。

## 検証と公開

- `npx vitest run tests/explorer-navigation.test.ts tests/explorer-collision.test.ts tests/explorer-content.test.tsx tests/explorer-experience.test.ts`
- `npx playwright test tests/responsive/explorer.spec.ts`
- `EXPLORER_SOAK=1 npx playwright test tests/responsive/explorer-soak.spec.ts --workers=1` は15分の継続移動。Windowsでは環境変数をPowerShellで設定する。
- 配信用build、型検査、static export、公開ソース境界、通常サイトの取得抑止を検証する。今回の局所更新では未変更のフォーム・独立サイトを含む総合gateを反復しない。過去の `npm run check` 失敗記録は保持する。

機能テスト、ソフトウェアGPU、エミュレーションの結果を実機認定としない。実行結果と未確認事項は [VERIFICATION.md](VERIFICATION.md) に記録する。

PR #125 とCloudflare Previewで提供する。Production公開は新Previewの明示承認後。`NEXT_PUBLIC_COMPASS_EXPLORER=off` で入口と新ページの起動を停止でき、通常サイトは維持される。
