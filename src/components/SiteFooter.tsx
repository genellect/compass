import {
  FUTURE_STRATEGY_LIBRARY_REGISTRATION_HREF,
  isExternalCompassHref
} from "../lib/futureStrategyLibrary";
import { resolveSiteHref, type SiteRouteContext } from "./siteRouteContext";

const libraryUrl = "/future-strategy-library/";

export function SiteFooter({ routeContext = "root" }: { routeContext?: SiteRouteContext }) {
  const resolveHref = (href: string) => resolveSiteHref(href, routeContext);
  const usesRootFooterUi = routeContext === "root" || routeContext === "contact";
  const registrationIsExternal = isExternalCompassHref(
    FUTURE_STRATEGY_LIBRARY_REGISTRATION_HREF
  );

  return (
    <>
<footer
  className="site-footer"
  data-route-context={routeContext}
  data-ui-variant={usesRootFooterUi ? "root" : routeContext}
>
  <div className="container footer-inner">
    <div className="footer-brand">
      <p className="footer-logo">COMPASS</p>
      <p>{usesRootFooterUi ? "Don’t Just Learn. Build What’s Next." : "Better Education. Better Decisions."}</p>
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
      <a href="https://yuto-matsui.com/">Founder</a>
      <a href="/contact/">Contact</a>
    </nav>

    <nav className="footer-cta" aria-label="Footer calls to action">
      {routeContext === "library" ? (
        <a
          href={FUTURE_STRATEGY_LIBRARY_REGISTRATION_HREF}
          target={registrationIsExternal ? "_blank" : undefined}
          rel={registrationIsExternal ? "noopener noreferrer" : undefined}
        >
          大学アカウントで無料登録する {registrationIsExternal ? "↗" : "→"}
        </a>
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

    <p className="copyright">
      <span>© 2026 COMPASS. All rights reserved.</span>
      {usesRootFooterUi ? (
        <a
          className="footer-source-link"
          href="https://github.com/genellect/compass"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="COMPASS source code on GitHub"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" />
          </svg>
          <span>Source</span>
        </a>
      ) : null}
    </p>
  </div>
</footer>
    </>
  );
}
