# 空間探索モードの検証記録

基準: main `3f68ac71e8c019cf1dd7a485dd54283c90d69036`、2026-09-13。
Status: Implemented, verification pending。Productionへの公開判断には使用しない。

## 確認できた範囲

- 9室全81組の経路、斜めの壁抜け防止、到達不能位置、iPad除外、性能判定: Vitest 5件合格。
- 探索専用ブラウザ検証: 既存本文・リンク、Community開閉、文字コントラスト、低い画面・幅境界、移動・停止・スキップ・戻る、context喪失、音響の明示起動、除外端末の取得抑止を確認。
- 追加のTV検証: 入室まで映像を取得しないこと、実デコードによる時刻進行、停止・再開、本文を閉じた時のフォーカス復帰を確認。
- 専用ブラウザ検証は合計7件合格。移動済み位置で「紹介を読む」が開かない問題を修正後、該当ケースを再確認した。
- `npm run check`を実行。フォーム等96件、Library 101件、Nodeの既存チェック42件が合格。残る1件はWindowsの一時ディレクトリのsandbox制限で停止し、同じテストのみ通常のWindows権限で再実行して合格。コードの期待値は緩めていない。
- 既存Habitatの単体4件、TypeScript、Next.jsのbuild、static export検証が合格。
- Windowsの全responsive 279件は、個別結果が239件合格・40件失敗。全ケース出力後の終了処理が停止したため、そのプロセスを中断した。全体合格とは扱わない。
- 40件の内訳は、変更していないFounder/英語ポートフォリオの操作・寸法等30件、親サイトDesktopのResources見出し改行1件、親サイト・Library・Manifestoの既存画像baselineとの不一致9件。Mobile Heroのbaselineは旧粒子背景・中央揃えで、現在のmainのISS背景・左揃えより古い。期待値やbaselineは書き換えていない。全失敗の変更前再実行は行っていないため、40件すべてを既存失敗と断定しない。
- 変更前PR #124のfull-browser-auditも失敗している: https://github.com/genellect/compass/actions/runs/34685185224/job/103530855462
- 公開ソース634ファイルの検査で高確度の私的資料パターン0件、維持対象文書のローカルリンク122件の検査が合格。

`scene-config.ts`、`/habitat/v3/`、`/habitat/mobile-v1/`、共通ヘッダー・フッター、Interactive、独立ポートフォリオの対象ソースに、基準mainとの差分はない。baselineを更新していない。

## 配信と描画

`report-assets.mjs`による測定:

| 項目 | 結果 |
| --- | ---: |
| 最初の空間に必要な新規素材 | 7,131,279 bytes |
| 新規配信素材全体（動画・音声を含む） | 9,180,260 bytes |
| モード管理TSX/判定を個別transpile・minifyしたgzip | 4,376 bytes |
| 1440×900のHero / 描画呼び出し | 117 |
| 同構図の三角形（shadow等を含むrenderer.info） | 438,170 |
| 同構図のGPU資源推定 | 499.1 MiB |

素材容量は既存v3モデル/HDRやNext共通runtimeを除く。cold状態での手動起動では既存モデルの追加取得も発生する。モード管理のgzipは独立したモジュール測定であり、配信の実測差分とは区別する。

GPU資源はテクスチャ・geometry・描画bufferの推定値であり、ドライバーの実使用量ではない。経路途中の複数モデルの入れ替えを含むピークは未確定。

## 性能と品質の未検証事項

Windows / Intel Iris Xe環境でEdge headlessの通常時計による起動判定を実行し、通常表示への復帰を確認した。これは高性能PCや実機ブラウザの60fps認定ではない。機能fixtureでは時計を固定しているため、その60fpsを性能実績として用いない。

高性能PCでの15分以上の継続測定、Firefox/Safari、実機iPhone/Android/iPad、全9室の自由視点に対する最終的な照明・材質・視覚品質の承認は未完了。

現在のPreviewは情報設計・移動・表示切替を確認する制作段階の版であり、「実写級の完成版」ではない。追加の制作と、今回のPreviewに対する明示承認なしにProductionへ公開しない。
