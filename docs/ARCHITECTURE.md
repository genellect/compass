# COMPASS Public Architecture

Status: Canonical
Scope: `my270yuto0413-cmyk/compass`公開repositoryと接続systemの境界
Last source verification: 2026-08-01 (`origin/main`)

## 1. System Boundary

| System | Responsibility | Repository / deployment |
|---|---|---|
| COMPASS公式site | Brand、公開情報、紹介route、公開form UI | この公開repository / `compass-official.pages.dev` |
| COMPASS Interactive | Student、Admin、Display、Archive、lecture lifecycle、AI・realtime product | 別の非公開repository / `compass-interactive.pages.dev` |
| 未来戦略ライブラリcontent | 登録者向け保護資料とaccess運用 | 公開source tree外 |
| Community delivery | Turnstile検証、schema検証、申請email | Pages Function + Community専用GAS |
| Contact delivery | Turnstile検証、email ownership確認、問い合わせemail | Pages Function + Contact専用GAS |

公開Developer routeが説明するInteractive本体の技術、metrics、directory構成を、このrepository自身の構成として合算しない。

## 2. Public Routes

| Route | Source | Purpose |
|---|---|---|
| `/` | `src/app/(official)/page.tsx` | COMPASS公式親site |
| `/future-strategy-library/` | `src/app/(official)/future-strategy-library/page.tsx` | Library紹介・登録導線 |
| `/messages/` | `src/app/(official)/messages/page.tsx` | COMPASS Manifesto |
| `/community/join/` | `src/app/(official)/community/join/page.tsx` | Community参加form |
| `/contact/` | `src/app/(official)/contact/page.tsx` | Contact form |
| `/INTRO_Interactive/` | `src/app/(interactive)/INTRO_Interactive/page.tsx` | Interactive紹介 |
| `/INTRO_Interactive/developers/` | `src/app/(interactive)/INTRO_Interactive/developers/page.tsx` | Interactive設計・技術紹介 |

canonical URLは`CODEX_LINKS.md`を参照する。

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
npm.cmd run check
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

`npm.cmd run check`はrepository内のcode・export contractを検証する。Production email delivery、Cloudflare dashboard設定、GAS deployment、Interactive本体の挙動、教育効果を証明しない。

## 5. Dynamic Functions on a Static Site

公開pageはstatic exportだが、次のAPIはCloudflare Pages Functionsとして動作する。

| Endpoint | Source | Action |
|---|---|---|
| `/api/community-registration` | `functions/api/community-registration.ts` | Community申請を検証しCommunity専用GASへ転送 |
| `/api/contact` | `functions/api/contact.ts` | 確認code発行・検証・問い合わせ送信をContact専用GASへ転送 |

Next.js development serverだけではPages Functionsは動作しない。localでfunctionを含めて確認する場合はstatic exportを作成し、`npm.cmd run dev:pages`を使用する。

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
- architecture・metricsの主張には、どのrepository / systemを説明するか明記する。
- automated testからProduction formや実emailを送信しない。

## 8. Analytics Boundary

公式Pages project内のofficial routeとInteractive紹介routeは、parent-site GA4 measurementを共有する。別deploymentの`compass-interactive.pages.dev`は対象外である。

Cloudflare Web AnalyticsはPages側の設定・injectionで管理する。site tokenやaccount credentialをsourceへcommitしない。詳細は`analytics-monitoring-operations.md`を参照する。

## 9. Deployment Boundary

RepositoryからのProduction exportはCloudflare Pages project `compass-official`へ配置される。Git push、Cloudflare deploy、secret変更、GAS deploymentは別の外部変更であり、明示承認を必要とする。

local / CI successとProduction acceptanceを分ける。Production確認では、少なくとも対象URL、canonical、主要copy、CTA destination、responsive overflow、console、必要なmanual integrationを確認する。

## 10. Known Boundary Risks

- active fileに`Legacy`という名称が残るため、誤削除riskがある。
- static exportとPages Functionsが同居し、Next.jsだけのlocal previewではAPIを確認できない。
- public Developer routeは別productの詳細を説明するため、repository境界を誤認しやすい。
- external dashboard・GAS・secret状態はGitだけでは現在性を証明できない。
- historical PDFとcompleted requirementがcanonical文書と同じfolderに残るため、`docs/README.md`のstatus区分を必ず参照する。
