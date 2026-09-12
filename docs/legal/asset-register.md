# 素材の権利・出典台帳

Status: Canonical Index
Scope: 既存素材の出典索引と権利確認の境界。アセットや公開UIは変更しない
Last verified: 2026-09-10

| 対象 | 作者・取得元 | 条件・証跡 | 加工・配信の区分 |
|---|---|---|---|
| `public/habitat/v3/`内のPoly Haven由来モデル・テクスチャ | Rob Tuytel、colormass、Rico Cilliers、Vibrant Nordic | [ASSET_CREDITS](../../scripts/habitat/ASSET_CREDITS.md)、[CC0条件](https://polyhaven.com/license) | 原素材から軽量化・材質調整。GLB内に必要なテクスチャを格納 |
| Habitat Earth map | NASA Earth Observatory、Reto Stöckli | 同上のBlue Marble出典 | 地球画像を縮小し、独自の建築シーン内で使用 |
| `public/habitat/mobile-v1/` | NASAのISS写真・タイムラプス | [出典説明](../mobile-space-media.md)、[ファイル単位manifest](../../public/habitat/mobile-v1/manifest.json)、[NASA方針](https://www.nasa.gov/nasa-brand-center/images-and-media/) | クロップ・縮小・WebP/H.264変換。生成画像ではない |
| Founderの補助写真 | Jaron Nix、灿雄 邱、Rob Wingate、Nemuel Sereti、Fabio Sasso | [既存credits](../founder-image-credits.md)の各原ページ・確認日 | ローカル格納。独立サイトの素材として維持 |
| Founderの人物写真・本人提供写真 | Yuto Matsui提供 | [既存credits](../founder-image-credits.md) | 提供目的の範囲で利用。第三者への一般的な再許諾なし |
| Contactの建築映像・文字造形 | リポジトリの手続き的Blender制作 | [制作記録](../contact-door-entry.md) | 外部写真・HDRI・モデルを同梱しない。文字はmesh化しフォントファイルを再配布しない |
| COMPASSのロゴ・独自文章・独自造形 | 権利者保有分 | [LICENSE](../../LICENSE) | 第三者権利が混在する場合は該当部分を除外 |
| Manrope / Newsreader | 各フォントのProject Authors | [Manrope OFL](fonts/Manrope-OFL.txt)、[Newsreader OFL](fonts/Newsreader-OFL.txt) | `next/font/google`でビルド時取得・自己配信。OFL 1.1を維持 |
| PC探索の写真・映像 `public/habitat/explorer/v1/` | NASA / Earth Science and Remote Sensing Unit, Johnson Space Center。映像編集Marit Jentoft-Nilsen | [配信credits](../../public/habitat/explorer/v1/credits.txt)、[写真hash](../../public/habitat/explorer/v1/photography.json)、[映像hash](../../public/habitat/explorer/v1/film.json) | 2026-09-13 Codex確認。既存の実写原素材を縮小・符号化。AI生成・実在施設の写真とは扱わない |
| PC探索の環境音・操作音 `public/media/explorer/audio/` | Kinoton、Kenney | 同上の配信creditsに原URL・CC0、[音声hash](../../public/media/explorer/audio/manifest.json) | 2026-09-13 Codex確認。作者提供音源の抜粋・フィルタ・音量調整・MP3化。利用者の操作後のみ取得 |
| PC探索の立体文字 Inter | The Inter Project Authors | [SIL OFL 1.1全文](../../public/habitat/explorer/v1/Inter-OFL.txt) | 2026-09-13 Codex確認。既存Hero文言のmesh化。素材自体をCOMPASSの独占著作物として扱わない |

この表は素材群ごとの索引です。全ファイルについて著作権帰属を断定したものではありません。
新規素材や、上記証跡で特定できない素材には、パス、作者、原URL、取得時の条件、加工内容、
配信形態、確認日、確認者を追加してください。実在人物の同意や非公開の権利譲渡記録は別途保管します。

Python・npm・コンテナ・制作ソフトのライセンスと、生成した映像・画像の権利は分けて確認します。
特にCC0素材や第三者のOSSを、Yuto Matsui独占の商用利用・改変・再配布禁止素材として扱いません。
既存の公開creditsは維持し、通知不足の解消に配信物変更が必要な場合は、本番影響を伴う別差分にします。
