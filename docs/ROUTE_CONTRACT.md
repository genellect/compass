# COMPASS Route Contract

Status: Canonical
Scope: このrepositoryが配信するroute、canonical URL、journey別の遷移先、tabの扱い
Last source verification: 2026-10-23（`origin/claude/compass-repo-dev-ux-oern47` `1e9991b`のsourceと照合）

2026-10-23に旧`CODEX_LINKS.md`から改名した。内容は特定agent向けではなく、全員が従うroute・遷移先の契約である。

## 1. この文書の使い方

`Join`、`Register`、`Get Started`等の一般ラベルだけから遷移先を推測しない。利用者の目的（journey）とこの契約に対応するURLを選ぶ。

この表へのrouteの掲載は編集許可ではない。編集範囲は`AGENTS.md`のIndependent Website Boundariesと[`WEBSITE_BOUNDARIES.md`](WEBSITE_BOUNDARIES.md)に従う。

source上の根拠は`path:行`で示す。行番号は上記の照合時点のものである。遷移先を変更する場合は、該当source、shared header/footer、test、`scripts/verify-next-build.mjs`を同時に確認する。

## 2. Route一覧

surfaceは[`WEBSITE_BOUNDARIES.md`](WEBSITE_BOUNDARIES.md)の区分である。canonicalは各layout・pageの`alternates.canonical`と`metadataBase`から決まる。

| Route | Surface | Canonical URL | Index | Source |
|---|---|---|---|---|
| `/` | COMPASS公式 | <https://compass-official.pages.dev/> | index | `src/app/(official)/page.tsx`、canonicalは`src/app/(official)/layout.tsx:23` |
| `/future-strategy-library/` | COMPASS公式（Library紹介） | <https://compass-official.pages.dev/future-strategy-library/> | index | `src/app/(official)/future-strategy-library/page.tsx:14` |
| `/library-registration/` | COMPASS公式（Library登録） | canonical指定なし（origin `https://compass-official.pages.dev`） | `noindex, nofollow` | `src/app/(library)/library-registration/layout.tsx:12-15` |
| `/library-registration/admin/` | Library管理画面 | 公開導線へ掲載しない | `noindex, nofollow` | `src/app/(library)/library-registration/admin/page.tsx:8` |
| `/messages/` | COMPASS公式（Manifesto） | <https://compass-official.pages.dev/messages/> | index | `src/app/(official)/messages/page.tsx:14` |
| `/community/join/` | COMPASS公式（Community参加） | <https://compass-official.pages.dev/community/join/> | `noindex, follow` | `src/app/(official)/community/join/page.tsx:11-12` |
| `/contact/` | COMPASS公式（Contact） | <https://compass-official.pages.dev/contact/> | `noindex, follow` | `src/app/(official)/contact/page.tsx:9-10` |
| `/3d/` | COMPASS公式（3D体験）※ | <https://compass-official.pages.dev/3d/> | index | `src/app/(spatial)/layout.tsx:5-8` |
| `/INTRO_Interactive/` | Interactive紹介（独立） | <https://compass-official.pages.dev/INTRO_Interactive/> | index | `src/app/(interactive)/layout.tsx:18-22` |
| `/INTRO_Interactive/developers/` | 開発者紹介（独立） | <https://compass-official.pages.dev/INTRO_Interactive/developers/> | index | `src/interactive/developer/EngineeringDocs.tsx:31-35` |
| `/INTRO_Interactive/developers/<topic>/` | 開発者紹介（独立） | 各topicのURL | index | topicは`architecture`、`delivery`、`ai`、`security`、`developer`、`archive`（`EngineeringDocs.tsx:13-19`） |
| `/INTRO_Interactive/developers/archive/2026-08/` | 開発者紹介（独立） | <https://compass-official.pages.dev/INTRO_Interactive/developers/archive/2026-08/> | `noindex, follow` | `src/app/(interactive)/INTRO_Interactive/developers/archive/2026-08/page.tsx:9-10` |
| `https://yuto-matsui.com/` | yuto-matsui.com 日本語（独立Web） | <https://yuto-matsui.com/> | index | `src/app/(official)/founder/page.tsx:15,24`。static exportでは`/founder/`に置き、`functions/index.ts`がCustom Domainのrootへ配信する |
| `https://yuto-matsui.com/en/` | yuto-matsui.com 英語（独立Web） | <https://yuto-matsui.com/en/> | index | `src/app/(founder-en)/en/page.tsx:23,31`、配信は`functions/en/[[path]].ts` |

※ `/3d/`は`WEBSITE_BOUNDARIES.md`の表に記載がない。COMPASS公式のheaderから到達するが、surface区分は未確定である。

`https://compass-official.pages.dev/sitemap.xml`に掲載するのは`/`、`/future-strategy-library/`、`/INTRO_Interactive/`、`/messages/`の4件である（repository root `sitemap.xml`）。

### Pages Functions endpoint

| Endpoint | 用途 | Source |
|---|---|---|
| `/api/community-registration` | Community申請 | `functions/api/community-registration.ts` |
| `/api/contact` | Contactの確認code・問い合わせ | `functions/api/contact.ts` |
| `/library-registration/admin/api/*` | 管理API proxy。Cloudflare Access配下 | `functions/library-registration/admin/api/[[path]].ts` |

## 3. Redirect

| From | To | 種別 | 根拠 |
|---|---|---|---|
| `/interactive`、`/intro` | `/INTRO_Interactive/` | 301 | `_redirects:1-2` |
| `/library`、`/library/` | `/future-strategy-library/` | 301 | `_redirects:3-4` |
| `/future-strategy-library/index.html` | `/future-strategy-library/` | 301 | `_redirects:5` |
| `compass-official.pages.dev`の`/en`、`/en/`、`/en/index.html` | `https://yuto-matsui.com/en/` | 301 | `functions/_middleware.ts`、`functions/en/[[path]].ts:20-24` |
| `yuto-matsui.com`の`/en`、`/en/index.html` | `https://yuto-matsui.com/en/` | 301 | `functions/en/[[path]].ts:27-33` |
| 旧Pages hostの`/founder`、`/founder/`、`/founder/index.html` | `https://yuto-matsui.com/` | 301 | Cloudflare Bulk Redirect（外部設定。`docs/ARCHITECTURE.md`、`docs/founder-domain-operations.md`）。`functions/index.ts:16-37`にも同じ対応がある |

外部dashboardの設定はGitだけでは現在性を証明できない。Productionの挙動はcanonical URLで確認する。

## 4. Journey別の遷移先

各CTAは一つのjourneyへ所属する。同じ表示ラベルでもjourneyが違えば遷移先は違う。例として、公式headerの`講義を体験する`はInteractive demoではなくInteractive紹介へ遷移する（`src/components/SiteHeader.tsx:420-425`）。

| Journey | Destination | Tab | 主なsource |
|---|---|---|---|
| COMPASSを知る | `/` | 同一tab | header logo、Interactive headerの`COMPASS`（`src/interactive/content/interactiveContent.ts:4`） |
| 参加型講義systemを知る | `/INTRO_Interactive/` | 同一tab | header Technology menu、header CTA、footer CTA（`src/components/SiteFooter.tsx:55`）、`src/sections/OfficialCoreSections.tsx:11` |
| 3D体験を開く | `/3d/` | 同一tab | Desktopでhabitat有効時だけ、header CTAとTechnology menuに出る（`src/components/SiteHeader.tsx:44-47,346,422`） |
| 技術・設計を評価する | `/INTRO_Interactive/developers/` | 同一tab | Interactive紹介のnavigation・footer（`src/interactive/components/layout/navigation.ts:33`、`Footer.tsx:49`）、Founder page（`src/app/(official)/founder/page.tsx:95`） |
| Interactiveを試す | <https://compass-interactive.pages.dev/demo> | 同一tab（sourceにtarget指定なし） | `src/interactive/content/interactiveContent.ts:2`。講義体験を開始する場合だけ使用する |
| 講義codeで参加する | <https://compass-interactive.pages.dev/join> | 同一tab（sourceにtarget指定なし） | `src/interactive/content/interactiveContent.ts:3`。講義codeを持つ利用者だけに使用する |
| Libraryを知る | `/future-strategy-library/` | 同一tab | `SiteHeader.tsx:42`、`SiteFooter.tsx:9`、`OfficialCoreSections.tsx:12,187` |
| Libraryへ登録する | `/library-registration/` | 同一tab | 5章を参照 |
| 薬学部生以外が一部資料へアクセスする | COMPASS Essentials Form <https://forms.gle/sW49M329Dcets8ga9> | 新規tab | 6章を参照 |
| COMPASSの思想を読む | `/messages/` | 同一tab | header Resources menu、`SiteFooter.tsx:57` |
| 運営・共同制作へ参加する | `/community/join/` | 同一tab | header Community menu（`SiteHeader.tsx:92`）、`SiteFooter.tsx:58`、`OfficialCoreSections.tsx:14` |
| 問い合わせる | `/contact/` | 同一tab | `SiteHeader.tsx:110`、`SiteFooter.tsx:41` |
| 代表を知る | <https://yuto-matsui.com/> | 同一tab | `SiteHeader.tsx:103`（label `Founder`、Mobileは`代表について`）、`SiteFooter.tsx:40` |
| sourceを読む | <https://github.com/genellect/compass> | 新規tab | `SiteFooter.tsx:94` |
| Interactiveのsourceを読む | <https://github.com/genellect/compass-interactive> | Interactive footerは新規tab | `src/interactive/components/layout/Footer.tsx:61`、Founder page（`founder/page.tsx:93`） |

## 5. 未来戦略ライブラリ登録

既定の遷移先は同一originの`/library-registration/`で、同一tabで開く（`src/lib/futureStrategyLibrary.ts:8-11`）。

旧Google Formはrollback専用である。build時の`NEXT_PUBLIC_FSL_REGISTRATION_URL`に次のURLを完全一致で指定した場合だけ、全登録CTAがこのURLへ切り替わり、新規tab・`rel="noopener noreferrer"`で開く（`src/lib/futureStrategyLibrary.ts:1-6`）。それ以外の値はstatic export検証が拒否する（`scripts/verify-next-build.mjs:18-33`）。

- Rollback URL: <https://docs.google.com/forms/d/e/1FAIpQLSf8gLujuK-giYnkCnv-Cxp7qon1kY8mhnGvfkA62hOlrJgAHA/viewform>

| Placement | Label | Source |
|---|---|---|
| Header（`/future-strategy-library/`のみ） | `無料で資料を見る` | `src/components/SiteHeader.tsx:401-418` |
| Mobile menu内CTA | `無料で資料を見る` | `src/components/SiteHeader.tsx:469-487` |
| Hero | `大学アカウントで無料登録する` | `src/app/(official)/future-strategy-library/components/FutureStrategyHero.tsx:36` |
| Featured Materials末尾 | `大学アカウントで無料登録する` | `src/app/(official)/future-strategy-library/page.tsx:177` |
| Final CTA | `大学アカウントで無料登録する` | `src/app/(official)/future-strategy-library/page.tsx:272` |
| Mobile sticky prompt（client mount後） | `無料で登録する` | `src/app/(official)/future-strategy-library/components/MobileRegistrationPrompt.client.tsx:86` |

labelは`src/app/(official)/future-strategy-library/components/RegistrationCTA.client.tsx:52`で決まる。static export検証は、server renderされるHeader、Hero、Featured Materials、Final CTAの4件について、遷移先、tab、labelを検査する（`scripts/verify-next-build.mjs:1427-1453`）。

`/library-registration/`自身のheaderでは、自己参照になる登録CTAを表示しない（`src/library-registration/RegistrationMvp.tsx:295`）。

`/library-registration/admin/`を公開siteのheader、footer、navigation、CTA、sitemapへ置かない。`noindex`やリンク非掲載は認可の代替ではない（`docs/CONTENT_GOVERNANCE.md`の6章）。

## 6. COMPASS Essentials

- URL: <https://forms.gle/sW49M329Dcets8ga9>
- Current label: `薬学部生以外の方はこちら`
- Source owner: `src/sections/OfficialCoreSections.tsx:13,189`
- Navigation: 外部formのため新規tab（`OfficialCoreSections.tsx:16`）

Essentials URLを、未来戦略ライブラリ登録、Community参加、Contact、Interactive demo、lecture joinへ流用しない。公式headerのsourceにEssentials URLを置かない（`scripts/verify-next-build.mjs:1057`）。

## 7. Link Rules

- 同一domainのnavigationは同一tabを使用する。
- 承認済みの外部form・別productは、この契約に従い新規tabを使用できる。新規tabの外部linkには`rel="noopener noreferrer"`を付ける。
- canonical destinationをplaceholderへ置換しない。
- protected material URLを公開sourceへ直接記載しない。
- registration destination変更前に、対象route、shared header/footer、test、static verifierを確認する。
- 親brandの基準は公式home。子service一つをCOMPASS全体の唯一のdesign referenceにしない。
- 独立surface（Interactive紹介、開発者紹介、yuto-matsui.com）へのlinkは、その遷移先の設計や変更権限を意味しない。
