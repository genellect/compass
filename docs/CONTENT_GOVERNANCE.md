# COMPASS Content Governance

Status: Canonical
Scope: 公開copy、CTA、status、metrics、editorial update
Last verified: 2026-08-01

## 1. Canonical Brand Copy

| Surface | Copy |
|---|---|
| COMPASS Hero | `Don’t Just Learn. Build What’s Next.` |
| COMPASS Vision | `学びを、意思決定の力へ。` |
| COMPASS origin | `北里大学薬学部から、学び・研究・未来をつなぐ。` |
| COMPASS transition | `学生の「知る」を、「選ぶ」「動く」へ変える。` |
| Interactive | `わからないが、動き出す。` |
| Library Hero H1 | `BEYOND THE SYLLABUS.` |
| Library Hero Sub Hero | `未来は、知っている人から動き出す。` |
| Library Hero description | `北里大学薬学部生のための、学生目線の資料ライブラリ。` |
| Manifesto Hero | `そのAI、まだ質問相手ですか？` |
| Manifesto closing | `観客席から見ているには、この時代は面白すぎる。` |
| Community | `面白い大学生活は、待っていても始まらない。` |
| Founder | `面白そうなので、始めました。` |

technical refactor、dependency update、component整理のついでにcanonical copyを書き換えない。copy変更taskでは、画面本文、metadata、structured data、navigation description、test、static verifierの更新範囲を明示する。

Production UIとmetadataが異なる場合、どちらかを黙って正本化せず差分を報告する。例として、2026-08-01時点のManifesto H1は上表のcopyだが、page titleには旧表現が残る。これは別copy/SEO taskで判断する。

## 2. Classification Models

### Activity domains

Technology / Resources / Education / Community

### Public experiences

Interactive / Library / Manifesto / Community

Educationの提供形式としてWorkshopを表示できるが、活動領域そのものをWorkshopへ改名したと説明しない。ManifestoやFounderを独立事業領域として数えない。

## 3. Status Language

| Status | Meaning |
|---|---|
| `Production` | Production環境へ反映済み |
| `Operationally verified` | 明記した実環境・条件・日付で動作確認済み |
| `Implemented, verification pending` | codeは存在するが必要な実環境確認が未完了 |
| `Planned` | 承認済み方針で、実装未完了 |
| `Historical` | 過去contextとしてのみ保持 |

「実装済み」「稼働中」「検証済み」を互換語として使用しない。環境、日付、test条件を添える。

## 4. Metrics

登録者、資料、beta参加者、managed file、line、migration、function、test、load、performance等を記載する場合:

- measured systemを示す
- measurement dateを示す
- scopeと除外を示す
- targetとcompleted resultを分ける
- mock / demo dataを実績に含めない
- 変更時は全公開箇所を更新するか、sourceを一元化する

技術的な動作は教育効果の証明ではない。教育効果には、利用data、feedback、評価方法等の根拠を別途示す。

## 5. CTA Ownership

各CTAは一つのjourneyへ所属する。

| Journey | Canonical destination |
|---|---|
| Interactiveを知る | `/INTRO_Interactive/` |
| Interactiveを試す | `https://compass-interactive.pages.dev/demo` |
| 講義codeで参加する | `https://compass-interactive.pages.dev/join` |
| Libraryを知る | `/future-strategy-library/` |
| Library登録 | Library専用Google Form |
| Essentials access | Essentials専用Google Form |
| Manifestoを読む | `/messages/` |
| Community参加 | `/community/join/` |
| Contact | `/contact/` |

full URLとsource ownerは`CODEX_LINKS.md`を参照する。一般的な`Join`や`Register`だけを根拠に、別journeyのURLへ差し替えない。

## 6. Link and Navigation Rules

- 同一domainのrouteは原則同一tab。
- 外部formと別productは既存contractに従いnew tabを使用できる。
- external linkには必要に応じ`rel="noopener noreferrer"`を付ける。
- protected materialへの直接URLをpublic sourceへ置かない。
- CTA labelは遷移後の結果を予測できる表現にする。
- DesktopとMobileでlabelを変える場合も、journeyとdestinationは一致させる。

## 7. Editorial Principles

- 学生の疑問・関心から始め、根拠と次の行動へつなげる。
- 一つの資格、研究室、career、AI service、思想を唯一の正解にしない。
- 大学公式情報とCOMPASS独自contentを区別する。
- Japaneseの意味のある区切りで改行し、CSSによる偶然の改行へ依存しすぎない。
- Desktop / Mobileのcopy hierarchyを個別に確認する。
- AI startup的な抽象語より、利用者が理解できる具体的な価値を優先する。

## 8. Accessibility and Semantics

- routeごとに原則one `h1`。
- heading levelを見た目だけで選ばない。
- CTAとlinkには目的の分かるaccessible nameを与える。
- 重要imageには内容を説明するaltを付け、装飾は適切に非表示化する。
- contrast、focus、Japanese font size、line height、tap targetを守る。
- animationは`prefers-reduced-motion`を尊重し、停止してもcontentを失わない。

## 9. Evidence and AI

- external AI outputはuntrusted draftとして扱う。
- public fact、medical・academic guidance、security説明は人間がsourceを確認する。
- AI生成copyを、実績、利用者の声、大学公式見解として見せない。
- research・career・academic制度に関する重要事項は公式sourceでの再確認を促す。

## 10. Founder Content

Founder contentは、起源、interdisciplinary expertise、accountability、人間性を示すために使用できる。ただし学生価値、project evidence、共同制作の存在を上回らない。資格・経験年数等の変動情報には基準日または更新sourceを設ける。

## 11. Change Checklist

公開copy変更時に確認する。

- userが指定したcopyを正確に保持したか
- H1、metadata、Open Graph、structured dataの関係を確認したか
- navigation、footer、CTA labelとの矛盾がないか
- Desktop / Mobileの意味ある改行とoverflowを確認したか
- route別semantic line testと、該当するHero visual baselineの差分を確認したか
- route-specific test・static verifierを更新したか
- metricsとstatusに日付・scopeがあるか
- Productionへ反映した場合、canonical URLで再確認したか
