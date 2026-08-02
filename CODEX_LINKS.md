# COMPASS Canonical Links

Status: Canonical
Last source verification: 2026-08-01
Reference: `origin/main`

`Join`、`Register`、`Get Started`等の一般ラベルだけから遷移先を推測しない。利用者の目的とroute-specific contractに対応するURLを選ぶ。

## Public Brand and Content

| Purpose | Canonical URL | Navigation |
|---|---|---|
| COMPASS公式home | <https://compass-official.pages.dev/> | Same tab |
| COMPASS Interactive紹介 | <https://compass-official.pages.dev/INTRO_Interactive/> | Same tab |
| COMPASS Interactive Developer紹介 | <https://compass-official.pages.dev/INTRO_Interactive/developers/> | Same tab |
| 未来戦略ライブラリ紹介 | <https://compass-official.pages.dev/future-strategy-library/> | Same tab |
| COMPASS Manifesto | <https://compass-official.pages.dev/messages/> | Same tab |
| Community参加 | <https://compass-official.pages.dev/community/join/> | Same tab |
| Contact | <https://compass-official.pages.dev/contact/> | Same tab |

## COMPASS Interactive Product

COMPASS Interactive本体は別deploymentである。

| Purpose | Canonical URL | Notes |
|---|---|---|
| 公開demo | <https://compass-interactive.pages.dev/demo> | 講義体験を開始する場合だけ使用 |
| Lecture join | <https://compass-interactive.pages.dev/join> | 講義codeを持つ利用者だけ使用 |

## Registration Destinations

### 未来戦略ライブラリ

- Primary label: `大学アカウントで無料登録する`
- Header / Mobile menu label: `無料で資料を見る`
- URL: <https://docs.google.com/forms/d/e/1FAIpQLSf8gLujuK-giYnkCnv-Cxp7qon1kY8mhnGvfkA62hOlrJgAHA/viewform>
- Source owner: `src/lib/futureStrategyLibrary.ts` / `src/components/SiteHeader.tsx`
- Placement contract: FSL shared Header（Mobileはhamburger内CTA）/ Hero / Featured Materials末尾 / Final CTA の4 journey
- Navigation: external formのためnew tab

### COMPASS Essentials

- URL: <https://forms.gle/sW49M329Dcets8ga9>
- Current label: `薬学部生以外の方はこちら`
- Source owner: `src/sections/OfficialCoreSections.tsx`
- Navigation: external formのためnew tab

Essentials URLを、未来戦略ライブラリ登録、Community参加、Contact、Interactive demo、lecture joinへ流用しない。

## Journey Ownership

| Journey | Destination |
|---|---|
| COMPASSを知る | 公式home |
| 参加型講義systemを知る | Interactive紹介 |
| 技術・設計を評価する | Developer紹介 |
| Interactiveを試す | Interactive demo |
| 講義codeで参加する | Interactive lecture join |
| Libraryを知る | Library紹介 |
| Libraryへ登録する | Library専用Google Form |
| 薬学部生以外が一部資料へアクセスする | Essentials Form |
| COMPASSの思想を読む | Manifesto |
| 運営・共同制作へ参加する | Community参加route |
| 問い合わせる | Contact route |

## Link Rules

- 同一domainのnavigationは同一tabを使用する。
- 承認済みの外部form・別productは、既存route contractに従いnew tabを使用できる。
- canonical destinationをplaceholderへ置換しない。
- protected material URLを公開sourceへ直接記載しない。
- registration destination変更前に、対象route、shared header/footer、test、static verifierを確認する。
- 親brandの基準は公式home。子service一つをCOMPASS全体の唯一のdesign referenceにしない。
