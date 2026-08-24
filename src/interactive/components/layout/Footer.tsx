import { links } from "../../content/interactiveContent";

type FooterProps = {
  variant?: "main" | "developer";
};

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
          <p className="footer-note">{variant === "developer" ? "One real-time foundation for the entire lecture." : "疑問が動けば、講義が変わる。"}</p>
          <p className="footer-copy">© 2026 COMPASS. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
