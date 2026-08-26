"use client";

import { useEffect, useRef, useState } from "react";
import { links } from "../../content/interactiveContent";
import { CTAButton } from "../ui/CTAButton";

type HeaderVariant = "main" | "developer";

type HeaderProps = {
  variant?: HeaderVariant;
};

const mainNavItems = [
  { href: "#students", label: "学生の体験" },
  { href: "#ai-support", label: "AI学習支援" },
  { href: "#educator-operations", label: "教員の使い方" },
  { href: "#adoption", label: "導入・ご相談" },
  { href: "#developers", label: "設計・技術" }
];

const developerNavItems = [
  { href: "#stack", label: "Stack" },
  { href: "#architecture", label: "Architecture" },
  { href: "#security", label: "Security" },
  { href: "#decisions", label: "Decisions" },
  { href: "#verification", label: "Verification" }
];

const mainMobileGroups = [
  {
    label: "EXPERIENCE",
    items: [
      { href: "#students", label: "講義の体験", note: "Experience" },
      { href: "#features", label: "講義の流れ", note: "Learning Journey" },
      { href: "#ai-support", label: "AI学習支援", note: "AI for Learning" }
    ]
  },
  {
    label: "FOR EDUCATORS",
    items: [
      { href: "#teachers", label: "学生の反応を活かす", note: "Teaching Flow" },
      { href: "#educator-operations", label: "教員の使い方", note: "Operations" },
      { href: "#use-cases", label: "こんな場面で", note: "Use Scenes" },
      { href: "#security", label: "安心して使える理由", note: "Trust & Privacy" },
      { href: "#adoption", label: "導入・ご相談", note: "Adoption" }
    ]
  },
  {
    label: "PRODUCT",
    items: [
      { href: "#developers", label: "設計・技術", note: "Architecture" },
      { href: "/INTRO_Interactive/developers/#developer-profile", label: "開発者・プロダクト設計者", note: "Profile" }
    ]
  }
];

const developerMobileGroups = [
  {
    label: "PRODUCT",
    items: [
      { href: "/INTRO_Interactive/", label: "紹介ページへ戻る", note: "Product Experience" },
      { href: "/INTRO_Interactive/#teachers", label: "教員の使い方", note: "For Teachers" }
    ]
  },
  {
    label: "DEVELOPER",
    items: [
      { href: "#stack", label: "Stack", note: "Technology Stack" },
      { href: "#architecture", label: "Architecture", note: "System Boundaries" },
      { href: "#security", label: "Security", note: "Security Model" },
      { href: "#decisions", label: "Decisions", note: "Selected Decisions" },
      { href: "#verification", label: "Verification", note: "Evidence" }
    ]
  }
];

export function Header({ variant = "main" }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const isDeveloper = variant === "developer";
  const navItems = isDeveloper ? developerNavItems : mainNavItems;
  const mobileGroups = isDeveloper ? developerMobileGroups : mainMobileGroups;
  const topHref = isDeveloper ? "#developer-top" : "#top";

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => toggleRef.current?.focus());
  };

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open) return;

      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
        return;
      }

      if (event.key !== "Tab" || !menuRef.current) return;
      const focusable = Array.from(
        menuRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.body.classList.toggle("menu-open", open);
    document.addEventListener("keydown", handleKeyDown);
    if (open) window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>(".mobile-menu-close")?.focus());

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("menu-open");
    };
  }, [open]);

  return (
    <header className={`site-header ${isDeveloper ? "site-header--developer" : ""} ${scrolled ? "is-scrolled" : ""}`}>
      <div className="header-inner">
        <a className="site-logo" href={topHref} aria-label={isDeveloper ? "開発者ページトップへ" : "COMPASS Interactive トップへ"}>
          <span className="logo-mark" aria-hidden="true"><span /></span>
          <span className="logo-copy">
            <strong>COMPASS Interactive</strong>
            <small>{isDeveloper ? "For Developers" : "Lecture Experience"}</small>
          </span>
        </a>

        <nav className="desktop-nav" aria-label="ページ内ナビゲーション">
          {navItems.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
        </nav>

        <div className="header-actions" aria-label="体験へのリンク">
          <a className="header-compass-link" href={links.compassHome}>COMPASS</a>
          <CTAButton className="header-join" href={links.demo}>{isDeveloper ? "Demo" : "デモを体験"} <span aria-hidden="true">→</span></CTAButton>
        </div>

        <button
          ref={toggleRef}
          className={`menu-toggle ${open ? "is-menu-open" : ""}`}
          type="button"
          aria-label={open ? "メニューを閉じる" : "メニューを開く"}
          aria-hidden={open}
          aria-controls="mobile-menu"
          aria-expanded={open}
          tabIndex={open ? -1 : 0}
          onClick={() => setOpen((current) => !current)}
        >
          <span /><span />
        </button>
      </div>

      <div className={`mobile-scrim ${open ? "is-open" : ""}`} hidden={!open} onClick={() => closeMenu(true)} />
      <aside
        ref={menuRef}
        className={`mobile-menu ${open ? "is-open" : ""}`}
        id="mobile-menu"
        aria-hidden={!open}
        aria-label="ナビゲーションメニュー"
        aria-modal="true"
        role="dialog"
        hidden={!open}
      >
        <div className="mobile-menu-panel">
          <div className="mobile-menu-top">
            <a className="mobile-menu-brand" href={topHref} onClick={() => closeMenu(true)}>
              <span>COMPASS Interactive</span>
              <small>{isDeveloper ? "FOR DEVELOPERS" : "THE NEXT LECTURE EXPERIENCE"}</small>
            </a>
            <button className="mobile-menu-close" type="button" aria-label="メニューを閉じる" onClick={() => closeMenu(true)}>
              <span /><span />
            </button>
          </div>

          <div className="mobile-menu-hero">
            <span>{isDeveloper ? "ENGINEERING CASE STUDY" : "登録不要・約3分"}</span>
            <strong>{isDeveloper ? "One real-time foundation for the entire lecture." : "未来の講義を、いま体験。"}</strong>
            <CTAButton className="mobile-join" href={links.demo}>{isDeveloper ? "講義デモを開く" : "講義を体験する"} <span aria-hidden="true">→</span></CTAButton>
            {!isDeveloper && <a className="mobile-code-join" data-cta-location="mobile-menu-code-join" href={links.join}>講義コードをお持ちの方</a>}
          </div>

          <nav className="mobile-nav mobile-nav--grouped" aria-label="モバイルナビゲーション">
            {mobileGroups.map((group) => (
              <div className="mobile-nav-group" key={group.label}>
                <p className="mobile-nav-group__label">{group.label}</p>
                {group.items.map((item) => (
                  <a key={item.href} href={item.href} onClick={() => closeMenu(true)}>
                    <span>{item.label}</span><small>{item.note}</small>
                  </a>
                ))}
              </div>
            ))}
          </nav>

          <a className="mobile-home-cta" href={links.compassHome}>COMPASS 公式サイトへ戻る</a>
        </div>
      </aside>
    </header>
  );
}
