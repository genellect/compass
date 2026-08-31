# COMPASS Public Architecture

Status: Canonical
Scope: `genellect/compass`公開repositoryと接続systemの境界
Last source verification: 2026-08-28

未来戦略ライブラリの公開リポジトリ前提の認証・PII・artifact境界は
`docs/library-registration/public-repository-security-boundary.md` を正本とする。

## 1. System Boundary

| System | Responsibility | Repository / deployment |
|---|---|---|
| COMPASS公式site | Brand、公開情報、紹介route、公開form UI | この公開repository / `compass-official.pages.dev` |
| COMPASS Interactive | Student、Admin、Display、Archive、lecture lifecycle、AI・realtime product | 別の非公開repository / `compass-interactive.pages.dev` |
| 未来戦略ライブラリcontent | 登録者向け保護資料とaccess運用 | 公開source tree外 |
| Library公開登録API | Google認証、資格判定、PostgreSQL正本への登録 | 専用FastAPI public service / Production verification pending |
| Library管理API | 管理者Google認証、完全一致allowlist、`sub` RBAC、名簿・監査・export | 専用FastAPI admin service + 専用DB role / Production verification pending |
| Library worker | Drive権限付与と再試行 | internal FastAPI worker + 専用DB role / Production verification pending |
| Community delivery | Turnstile検証、schema検証、申請email | Pages Function + Community専用GAS |
| Contact delivery | Turnstile検証、email ownership確認、問い合わせemail | Pages Function + Contact専用GAS |

公開Developer routeが説明するInteractive本体の技術、metrics、directory構成を、このrepository自身の構成として合算しない。

## 2. Deployed Routes

| Route | Source | Purpose |
|---|---|---|
| `/` | `src/app/(official)/page.tsx` | COMPASS公式親site |
| `/future-strategy-library/` | `src/app/(official)/future-strategy-library/page.tsx` | Library紹介・登録導線 |
| `/library-registration/` | `src/app/(library)/library-registration/page.tsx` | Library利用登録 |
| `/library-registration/admin/` | `src/app/(library)/library-registration/admin/page.tsx` | 公開導線からリンクしない管理者画面（Access外部設定pending） |
| `/library-registration/admin/api/*` | `functions/library-registration/admin/api/[[path]].ts` | Cloudflare Access配下の同一origin管理API proxy |
| `/messages/` | `src/app/(official)/messages/page.tsx` | COMPASS Manifesto |
| `https://yuto-matsui.com/` | `src/app/(official)/founder/page.tsx` + `functions/index.ts` | Founder個人ポートフォリオ。static exportは同じPages成果物の`/founder/`に保持 |
| `https://yuto-matsui.com/en/` | `src/app/(founder-en)/en/page.tsx` + `functions/en/[[path]].ts` | Founder英語ポートフォリオ。独立した英語layoutとvisual systemを使用 |
| `/community/join/` | `src/app/(official)/community/join/page.tsx` | Community参加form |
| `/contact/` | `src/app/(official)/contact/page.tsx` | Contact form |
| `/INTRO_Interactive/` | `src/app/(interactive)/INTRO_Interactive/page.tsx` | Interactive紹介 |
| `/INTRO_Interactive/developers/` | `src/app/(interactive)/INTRO_Interactive/developers/page.tsx` | Interactive設計・技術紹介 |

canonical URLは`CODEX_LINKS.md`を参照する。

管理routeはstatic exportに存在しても、公開siteのheader、footer、navigation、CTA、sitemapからリンクしない。
ProductionではCloudflare Access、path/method allowlist型Pages proxy、Pages/GCP間のprivate edge secret、
管理専用OAuthの完全一致メールallowlist、server-side `sub` RBACを必須とする。Cloud Run管理routeは
edge secretのない直接origin要求を拒否する。Pages proxyのoriginはTerraform `admin_api_url` と
完全一致させ、公開登録serviceへは向けない。公開serviceは管理routeを常時404とし、公開DB roleは
管理者・監査・export表へアクセスできない。`noindex`、`robots.txt`、URL非掲載は認可ではない。

## 3. Official-Site Runtime

Next.jsは`output: "export"`、`trailingSlash: true`、unoptimized imageを使用する。build結果は`out/`へ出力され、Cloudflare Pagesへ配置される。

親siteの現行composition:

```text
src/app/(official)/page.tsx
  → src/App.tsx
    → src/LegacyPageBody.tsx
      → SiteHeader
      → Hero/index.tsx → NewHero.tsx
      → OfficialCoreSections.tsx
      → ManifestoSection.tsx
      → ContactSection.tsx
      → SiteFooter
```

`LegacyPageBody.tsx`はactiveなProduction経路である。`LegacyHero.tsx`や旧Section component等は、名称やexportの存在だけで削除対象にしない。import graph、build output、Git history、Production behaviorを確認した別taskで扱う。

## 4. Build and Export Pipeline

```text
npm run check
  ├─ test:registration  → Vitest: schema / Pages Function / GAS
  ├─ typecheck          → TypeScript
  ├─ build
  │   ├─ clean
  │   ├─ optimize:images
  │   ├─ next build --webpack
  │   └─ assemble-next-export.mjs
  └─ verify             → route / copy / CTA / asset / CSP / backend contract
```

`scripts/assemble-next-export.mjs`は`.nojekyll`、`_headers`、`_redirects`、Search Console verification、`robots.txt`、`sitemap.xml`を`out/`へ組み込む。

Founderの正式URLは日本語`https://yuto-matsui.com/`、英語`https://yuto-matsui.com/en/`である。同じ`compass-official` Pages成果物内の
`/founder/`を`functions/index.ts`がCustom Domainのrootへ内部配信する。旧Pages hostの
`/founder`、`/founder/`、`/founder/index.html`はCloudflare Bulk Redirectで新rootへ恒久301とし、
Pages Production hostの`/en/`はCustom Domainの英語routeへ恒久301とする。旧hostのsitemapにはFounderを含めない。
Custom Domainの`robots.txt`と`sitemap.xml`はhost-aware Pages Functionsが返し、Founder sitemapは
日本語・英語の2 URLと`ja`、`en`、`x-default`のhreflangを掲載する。

`npm run check`（cloud aliasは`npm run cloud:check`）はrepository内のcode・export contractを検証する。Production email delivery、Cloudflare dashboard設定、GAS deployment、Interactive本体の挙動、教育効果を証明しない。

## 5. Dynamic Functions on a Static Site

公開pageはstatic exportだが、次のAPIはCloudflare Pages Functionsとして動作する。

| Endpoint | Source | Action |
|---|---|---|
| `/api/community-registration` | `functions/api/community-registration.ts` | Community申請を検証しCommunity専用GASへ転送 |
| `/api/contact` | `functions/api/contact.ts` | 確認code発行・検証・問い合わせ送信をContact専用GASへ転送 |

Next.js development serverだけではPages Functionsは動作しない。localでfunctionを含めて確認する場合はstatic exportを作成し、`npm run dev:pages`を使用する。

## 6. Form Isolation

CommunityとContactは、次を分離する。

- endpoint
- Zod schema
- Turnstile site/secret keyとaction
- Cloudflare secret
- GAS projectとsource
- shared secret
- email workflow

CommunityのTurnstile actionは`community_registration`、Contactは`contact_verification`。明示的なarchitecture変更なしに統合しない。

### Community secret contract

- `TURNSTILE_SECRET_KEY`
- `GOOGLE_APPS_SCRIPT_URL`
- `GOOGLE_APPS_SCRIPT_SECRET`
- GAS: `FORM_SHARED_SECRET`

### Contact secret contract

- `CONTACT_TURNSTILE_SECRET_KEY`
- `CONTACT_RATE_LIMIT_SECRET`
- `CONTACT_GOOGLE_APPS_SCRIPT_URL`
- `CONTACT_GOOGLE_APPS_SCRIPT_SECRET`
- GAS: `CONTACT_FORM_SHARED_SECRET`
- GAS only: `CONTACT_OTP_PEPPER`

secret値はGit、chat、screenshot、logへ出さない。

## 7. Data Boundaries

- Production credentialをGitへ置かない。
- protected Library materialを`public/`やstatic exportへ置かない。
- form本文、氏名、email、学籍番号、生IP、OTP、lecture codeをanalyticsへ送らない。
- Production利用者datasetやdatabase dumpをこのrepositoryへ置かない。
- Library登録情報の正本はProduction PostgreSQLとし、旧Google Sheetは読み取り専用の移行証跡、
  CSV/XLSXは監査済み一時snapshotとする。双方向同期や複数正本を作らない。
- architecture・metricsの主張には、どのrepository / systemを説明するか明記する。
- automated testからProduction formや実emailを送信しない。

## 8. Analytics Boundary

公式Pages project内のofficial route、Interactive紹介route、`yuto-matsui.com`のFounder rootは、
parent-site GA4 measurementを共有する。二つのhostは同じGA4 Webデータストリームの
クロスドメイン対象として管理する。別deploymentの`compass-interactive.pages.dev`は対象外である。

Cloudflare Web AnalyticsはPages側の設定・injectionで管理する。site tokenやaccount credentialをsourceへcommitしない。詳細は`analytics-monitoring-operations.md`を参照する。

## 9. Deployment Boundary

RepositoryからのProduction exportはCloudflare Pages project `compass-official`へ配置される。Git push、Cloudflare deploy、secret変更、GAS deploymentは別の外部変更であり、明示承認を必要とする。

local / CI successとProduction acceptanceを分ける。Production確認では、少なくとも対象URL、canonical、主要copy、CTA destination、responsive overflow、console、必要なmanual integrationを確認する。

## Responsive Runtime Gate

Responsiveの実描画gateは`docs/responsive-browser-qa.md`を正本とする。`scripts/verify-next-build.mjs`はstatic export・copy・asset contractを検査するが、CSS cascade、実改行、clipping、height breakpointの代替にはならない。Playwright smokeを通常`check`へ、全viewport・interaction・境界監査をGitHub Actionsへ組み込む。

## 10. Known Boundary Risks

- active fileに`Legacy`という名称が残るため、誤削除riskがある。
- static exportとPages Functionsが同居し、Next.jsだけのlocal previewではAPIを確認できない。
- public Developer routeは別productの詳細を説明するため、repository境界を誤認しやすい。
- external dashboard・GAS・secret状態はGitだけでは現在性を証明できない。
- historical PDFとcompleted requirementがcanonical文書と同じfolderに残るため、`docs/README.md`のstatus区分を必ず参照する。
