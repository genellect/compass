# Responsive Browser QA

Status: Canonical Operational Runbook

Scope: COMPASS public website routes and UI-only browser behavior

Last verified: 2026-08-02

## 1. Purpose

このrunbookは、物理解像度だけでは見落とすレスポンシブ崩れを、実際のCSS viewportで再現・検出するための正本です。静的HTML、CSS文字列、build成功だけでは合格にしません。Chromiumでページを描画し、文字、改行、CTA、navigation、展開状態、consoleを統合監査します。

今回のFSL不具合では、1920px級の物理画面でもWindows 150%表示とbrowser chromeによりCSS viewportが約`1275×553`となり、`max-height: 760px`の縮小ruleが発火しました。`1024×768`や`3840×2160`をCSS viewportとして直接試すだけでは、この条件を再現できません。

## 2. Public route inventory

- `/`
- `/future-strategy-library/`
- `/messages/`
- `/INTRO_Interactive/`
- `/INTRO_Interactive/developers/`
- `/community/join/`
- `/contact/`
- `https://yuto-matsui.com/`
- `https://yuto-matsui.com/en/`

フォーム監査は表示・keyboard・layoutに限定し、確認コード送信、実メール、実登録、Production API mutationを行いません。

## 3. Required viewport matrix

Smoke gate:

| CSS viewport | Contract |
|---|---|
| `390×844` | 基準iPhone |
| `1024×768` | Laptop境界 |
| `1280×720` | Windows 150%相当 |
| `1275×553` | Windows拡大率 + browser chrome再現 |
| `1536×672` | Windows 125%相当 |

Full gateでは、`320×568`、`430×932`、`768×1024`、`1024×600`、`1366×768`、`1440×900`、`1920×720`、`2560×1200`、`2560×1440`、`3840×2160`を追加します。FSLでは高さ`759/760/761px`、`899/900/901px`、`1299/1300/1301px`、Desktop境界`900/901px`、wide layout境界`1179/1180px`、large layout境界`2399/2400px`も検査します。Contactでは`320/340/341px`を検査します。

物理画面を報告するときは、`innerWidth/innerHeight`、`outerWidth/outerHeight`、`devicePixelRatio`、`visualViewport.scale`、Windows display scaling、browser zoomを併記します。

## 4. Automated contracts

### Geometry and rendering

- HTTP 200、visible `h1`が1個、横overflowが1px以下
- 全routeの必須sectionがDOMに存在し、route別に指定した重要見出し、本文、CTA、form fieldが`opacity: 0`を含む非表示状態やゼロ寸法になっていない
- 現在表示されている非装飾textの実glyph範囲を`Range.getClientRects()`で取得し、意図的な横scroll領域を除いて左右・上下とも`overflow: hidden/clip`祖先に隠れない
- 見出しの実描画行を`Range.getClientRects()`で復元
- 行頭の閉じ括弧・句読点、行末の開き括弧、1文字孤立行を禁止
- FSLはMobileでtitle、subhead、説明、登録CTAを、Desktopでさらに階段graphicとhorizonを初期画面内に収容
- 短尺DesktopではFSL titleと階段graphicの最低可読サイズを保証
- 階段graphic内のSVG labelを実表示8px以上とし、Hero clippingを禁止
- `760→761px`、`899→900px`、`1299→1300px`の高さ境界と、`1179→1180px`、`2399→2400px`の幅境界で縦位置、横位置、文字サイズ、container幅、graphic幅が急変しない

### Interaction history contracts

- 全routeのMobile hamburger menuを開閉できる
- `aria-expanded`、focus移動、Escape close、body scroll lockが正しい
- 親サイトと公式子routeのDesktop navigation順序とcurrent stateを維持
- Communityの折り畳みを開いた後もtext・graphic・CTAがclipしない
- Manifesto全12章の見出しがMobile/Desktopとも1〜2行でsheet内に収まる
- FSL、Manifesto、Interactiveの主要CTAが初期画面内にあり、中央点をhit-testできる
- 代表紹介、Interactive紹介、Developer紹介の`GitHub Portfolio` destinationを維持
- reduced-motionでも本文とCTAが消えない
- fixtureで明示的にstubした通信を除くrequest failure、page error、未許可console errorを禁止
- iPhone device contextで`pointer: coarse`、`hover: none`、touch、DPRを再現し、幅だけを縮めたDesktop contextで代用しない
- responsive testからAnalytics、Turnstile、外部form、登録・Contact mutationを遮断し、監査自身による計測汚染や実送信を起こさない

### Copy boundary

UI監査のために本文を言い換えません。意味のある改行はcomponent側のsemantic lineとroute contractで管理し、偶然のwrapへ依存しません。親Hero／Resources／Manifesto／Community、FSL Hero、Manifesto Heroと全12章、Interactive Hero、Developer Heroは、Mobile/Desktop別の実描画行配列を固定します。copy変更時は`docs/CONTENT_GOVERNANCE.md`に従い、画面、metadata、test、static verifierを同時に更新します。

### Visual regression

構造・座標テストに加え、承認済みHeroをChromium screenshot baselineとして保護します。対象は親サイト、FSL、Manifesto、Interactive、Developerの主要Mobile/Desktopと、FSLの`1275×553`および4Kです。animation、transition、caret、video、canvas乱数を安定化してから比較します。

baselineはUI承認後にWindows + repository指定Chromiumで一度だけ生成し、通常のCIが自動更新してはいけません。差分画像を人間が確認し、意図した変更である場合だけ次を実行します。

```powershell
npm.cmd run test:responsive:update-snapshots
```

#### Platform boundary

Playwrightはsnapshotをplatform別に解決します。現行baselineは`tests/responsive/visual-regression.spec.ts-snapshots/*-win32.png`のみであり、Linux（Codespaces、Codex Cloud、Claude Code、Dev Container）から`visual-regression.spec.ts`を実行すると`*-linux.png`を探して必ず失敗します。

したがってvisual regressionの判定元は次のいずれかだけです。

1. Windows hostでの`npm.cmd run check:responsive:full`
2. GitHub Actions **Responsive Quality Gate**（`windows-latest`）

cloud sessionから`test:responsive:update-snapshots`を実行しないでください。承認済みWindows baselineの横にLinux baselineを作り、以後どちらが正本か判別できなくなります。

## 5. Local commands

### Cloud / Linux（Codespaces、Codex Cloud、Claude Code、Dev Container）

```bash
npm ci
npx playwright install chromium
npm run cloud:check
npm run check:responsive:cloud
```

`check:responsive:cloud`は`check:responsive:full`からvisual regressionだけを除いた同一内容です。viewport matrix、breakpoint境界、interaction contract、interactive hero、manifesto章、semantic line、mobile device emulationをすべて含みます。visual regressionは上のPlatform boundaryに従い、CIの結果を使用します。

### Windows

```powershell
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run check
npm.cmd run check:responsive:full
```

既にbuild済みなら`npm run test:responsive`、`npm run test:responsive:cloud`、または（Windowsのみ）`npm.cmd run test:responsive:full`を実行できます。

Hero visual baselineだけを確認する場合はWindowsで`npm.cmd run test:responsive:visual`を使います。

Production成果物へ同じsmokeを適用する場合:

```bash
RESPONSIVE_BASE_URL="https://compass-official.pages.dev" npm run test:responsive
```

```powershell
$env:RESPONSIVE_BASE_URL="https://compass-official.pages.dev"
npm.cmd run test:responsive
Remove-Item Env:RESPONSIVE_BASE_URL
```

このsmokeは公開pageの読み取り監査だけを行い、form送信やmutationを実行しません。

## 6. Failure evidence

failure時は`test-results/`と`playwright-report/`へviewport、DPR、実描画行、element geometry、clipping violation、console error、screenshot、Playwright traceを保存します。GitHub Actionsはfailure artifactを14日間保持します。artifactを確認せず、閾値を緩めてテストを通してはいけません。

## 7. CI and deployment

`.github/workflows/responsive-quality.yml`はpull request、`main` push、manual dispatchで完全gateを実行します。branch protectionでは、このjobをrequired checkに設定してください。

`.github/workflows/production-responsive-smoke.yml`はmanual dispatch、またはdeployment workflowからの`workflow_call`でhosted URLを監査します。監査先はHTTPSのcanonical `https://compass-official.pages.dev`だけを許可し、credentials、custom port、path、query、fragment付きURLを拒否します。deployment workflowではstepとしてではなく、deploy jobを`needs`に指定した別jobの`jobs.<id>.uses`から、このreusable workflowを呼び出してください。

Local / CI PASSとProduction acceptanceは別です。Productionではcanonical URL、実配信asset、console、responsive layoutを再確認し、必要に応じてEdge実画面もhuman gateとして残します。

## 8. Future registration E2E

未来戦略ライブラリ登録基盤のE2Eは、UI-only responsive suiteと分離します。

- 専用test environmentとtest accountを使用
- Production database、実メール、実Drive権限を通常CIから操作しない
- test data cleanupとidempotencyを保証
- secretはGitHub Environmentsで管理し、fork PRへ渡さない
- responsive suiteは高速・常時実行、registration E2Eはprotected environmentで実行

## 9. Human acceptance gate

Hero、navigation、font、breakpoint、animation、authentication、registration、form基盤を変更した場合は、自動監査後も実機またはEdge responsive modeで最終確認します。合格報告には、検証URL、CSS viewport、DPR、commit SHA、未実施のmanual gateを明記します。
