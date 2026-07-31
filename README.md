# COMPASS Official Website

COMPASSは、北里大学薬学部を起点に、Webシステム、AI、実践資料、教育活動、学生コミュニティをつなぐ、学生主導型の教育・テクノロジープラットフォームです。

- Production: <https://compass-official.pages.dev/>
- Hero: `Don’t Just Learn. Build What’s Next.`
- Vision: `学びを、意思決定の力へ。`

## このリポジトリに含まれるもの

- COMPASS公式親サイト
- COMPASS Interactive紹介サイト・開発者向け紹介サイト
- 未来戦略ライブラリの紹介・登録導線
- COMPASS Manifesto
- Community参加フォームとContactフォーム
- Cloudflare Pages Functions
- Community / Contact用Google Apps Script
- form試験、型検査、static export検証

## このリポジトリに含まれないもの

- COMPASS Interactiveプロダクト本体の完全なソース
- COMPASS InteractiveのProduction database・認証・storage
- 保護された未来戦略ライブラリ資料
- Production利用者データと認証情報

COMPASS Interactive本体は、別の非公開リポジトリ・別デプロイで管理されます。このリポジトリのDeveloperページはその設計と技術を説明しますが、表示される技術構成や規模をこの公開リポジトリ自身の実装として扱わないでください。

## 技術構成

- Next.js 16（static export）
- React 19
- TypeScript 5.9
- Zod 4
- Cloudflare Pages / Pages Functions / Turnstile
- Google Apps Script
- GA4 / Cloudflare Web Analytics
- Vitest / custom export verification

## ローカル開発

Node.jsのversionは`.node-version`を参照してください。

```powershell
npm.cmd ci
npm.cmd run dev
```

通常のNext.js開発serverは静的routeのUI確認用です。Pages Functionsを含めて確認する場合は、先にexportを作成してからCloudflare Pagesのlocal runtimeを使用します。

```powershell
npm.cmd run build
npm.cmd run dev:pages
```

実フォーム送信や実メール送信は、明示承認なしに行わないでください。

## 検証

```powershell
npm.cmd run check
```

`check`はform関連のVitest、TypeScript検査、Production build、static export検証を順に実行します。個別commandは`package.json`を参照してください。

## 主要構成

```text
src/app/(official)/                 公式サイトと公開フォームroute
src/app/(interactive)/              Interactive紹介・Developer紹介route
src/components/                     共通UIと親サイトHero
src/sections/                       親サイトsection
src/interactive/                    Interactive紹介UI
functions/api/                      Cloudflare Pages Functions
google-apps-script/                 Community / Contactメール処理
tests/                              form schema・Function・GAS試験
scripts/                            build、asset、export検証
docs/                               architecture・governance・runbook
Project.guide/                      COMPASS理念と履歴資料
```

親サイトの現行entry pathは次の通りです。

```text
src/app/(official)/page.tsx
  → src/App.tsx
    → src/LegacyPageBody.tsx
```

`LegacyPageBody.tsx`は名称に反して現行Production経路です。未使用判断はimport graphとbuild出力で行ってください。

## Documentation

- [`AGENTS.md`](AGENTS.md) — coding agent向け実装契約
- [`Project.guide/PROJECT_GUIDE.md`](Project.guide/PROJECT_GUIDE.md) — 現行理念・brand・project原則
- [`docs/README.md`](docs/README.md) — 文書索引と正本区分
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — repository・deployment・data境界
- [`docs/CONTENT_GOVERNANCE.md`](docs/CONTENT_GOVERNANCE.md) — copy、CTA、status、metrics管理
- [`CODEX_LINKS.md`](CODEX_LINKS.md) — 正規公開URLと遷移契約

## 組織上の位置づけ

COMPASSは学生有志による任意の学生支援活動であり、北里大学、同大学の学部・研究室・関連機関の公式組織ではありません。試験、履修、進級、研究室配属、進路に関する重要事項は、必ず大学等の公式情報で確認してください。
