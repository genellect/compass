import { resolveSiteHref, type SiteRouteContext } from "./siteRouteContext";

const libraryUrl = "/future-strategy-library/";
const libraryRegistrationUrl =
  "https://docs.google.com/forms/d/e/1FAIpQLSf8gLujuK-giYnkCnv-Cxp7qon1kY8mhnGvfkA62hOlrJgAHA/viewform";

export function SiteFooter({ routeContext = "root" }: { routeContext?: SiteRouteContext }) {
  const resolveHref = (href: string) => resolveSiteHref(href, routeContext);

  return (
    <>
<footer className="site-footer">
  <div className="container footer-inner">
    <div className="footer-brand">
      <p className="footer-logo">COMPASS</p>
      <p>Better Education. Better Decisions.</p>
    </div>

    <nav className="footer-nav" aria-label="Footer navigation">
      <a href={resolveHref("#technology")}>Technology</a>
      <a
        href={resolveHref("#resources")}
        aria-current={routeContext === "messages" || routeContext === "library" ? "page" : undefined}
      >
        Resources
      </a>
      <a href={resolveHref("#community")}>Community</a>
      <a href={resolveHref("#founder")}>Founder</a>
      <a href="/contact/">Contact</a>
    </nav>

    <nav className="footer-cta" aria-label="Footer calls to action">
      {routeContext === "library" ? (
        <a href={libraryRegistrationUrl} target="_blank" rel="noopener noreferrer">大学アカウントで無料登録する ↗</a>
      ) : (
        <>
          <a href={resolveHref("INTRO_Interactive/")}>COMPASS Interactive紹介サイト</a>
          <a href={libraryUrl}>未来戦略ライブラリ紹介サイト</a>
          <a href="/messages/" aria-current={routeContext === "messages" ? "page" : undefined}>COMPASS Manifesto</a>
          <a href="/community/join/">Community参加フォーム</a>
        </>
      )}
    </nav>

    <div className="footer-note">
      {routeContext === "library" ? (
        <>
          <p>
            COMPASSは、学生有志による任意の学生支援活動であり、大学の公式組織ではありません。
            本サイトおよび関連資料は、大学・学部・研究室・所属機関の公式見解を示すものではありません。
          </p>
          <p>
            代表者名および連絡先を除き、運営者の所属研究室情報、登録者情報、その他の非公開情報は公表していません。
            著作権、中立性および情報管理に配慮して運営しています。
          </p>
        </>
      ) : (
        <>
          <p>
            COMPASSは、学生有志による任意の学生支援活動であり、大学公式組織ではありません。
            本サイトおよび関連資料の内容は、大学・学部・研究室・所属機関の見解を代表するものではありません。
          </p>
          <p>
            代表者名・連絡先を除き、特定の研究室名、運営者の所属研究室情報、登録者情報、
            その他の機密情報は公開しておらず、著作権・中立性・情報管理に十分配慮しています。
          </p>
        </>
      )}
    </div>

    <p className="copyright">© 2026 COMPASS. All rights reserved.</p>
  </div>
</footer>
    </>
  );
}
