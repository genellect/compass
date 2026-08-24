import { links } from "../../content/interactiveContent";

type FooterProps = {
  variant?: "main" | "developer";
};

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" />
    </svg>
  );
}

export function Footer({ variant = "main" }: FooterProps) {
  const mainPrefix = variant === "developer" ? "/INTRO_Interactive/" : "";

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <a className="footer-logo" href={variant === "developer" ? "#developer-top" : "#top"}>
          <span className="logo-mark" aria-hidden="true">
            <span />
          </span>
          <span>
            <strong>COMPASS Interactive</strong>
            <small>{variant === "developer" ? "Architecture / Security / Engineering" : "リアルタイム×AIで、講義を次の次元へ。"}</small>
          </span>
        </a>
        <nav className="footer-nav" aria-label="フッターナビゲーション">
          <a href={links.demo}>デモを体験</a>
          {variant === "developer" ? (
            <>
              <a href="#stack">Stack</a>
              <a href="#architecture">Architecture</a>
              <a href="#security">Security</a>
              <a href="#decisions">Decisions</a>
              <a href="#verification">Verification</a>
            </>
          ) : (
            <>
              <a href={`${mainPrefix}#students`}>学生の体験</a>
              <a href={`${mainPrefix}#ai-support`}>AI学習支援</a>
              <a href={`${mainPrefix}#teachers`}>教員の使い方</a>
              <a href={`${mainPrefix}#use-cases`}>こんな場面で</a>
              <a href="/contact/">導入相談</a>
              <a href="/INTRO_Interactive/developers/">設計・技術</a>
            </>
          )}
          <a href={links.compassHome}>COMPASSへ戻る</a>
        </nav>
        <div className="footer-meta">
          {variant === "developer" ? (
            <p className="footer-note">One real-time foundation for the entire lecture.</p>
          ) : (
            <nav className="footer-reference-links" aria-label="関連リンク">
              <a
                className="footer-reference-link"
                href="https://github.com/genellect/compass-interactive"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="COMPASS Interactive source code on GitHub"
              >
                <GitHubIcon />
                <span>Source</span>
              </a>
              <a
                className="footer-reference-link"
                href="https://protopedia.net/prototype/private/59f061db-936a-4fa3-abc2-438a98711e9e"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>ProtoPedia</span>
              </a>
            </nav>
          )}
          <p className="footer-copy">© 2026 COMPASS. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
