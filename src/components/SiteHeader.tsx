"use client";

import { useEffect, useRef, useState } from "react";

type NavItem = {
  className?: string;
  description: string;
  external?: boolean;
  href: string;
  label: string;
};

type NavGroup = {
  id: "technology" | "resources" | "community";
  items: NavItem[];
  label: string;
};

type DirectNavItem = {
  activeId: "founder" | "contact" | "message";
  description: string;
  href: string;
  label: string;
  mobileLabel: string;
};

const navGroups: NavGroup[] = [
  {
    id: "technology",
    label: "Technology",
    items: [
      {
        href: "INTRO_Interactive/",
        label: "COMPASS Interactive",
        description: "疑問が届き、講義が動く体験へ",
        className: "panel-link-interactive"
      },
      {
        href: "#technology",
        label: "Technology Core",
        description: "学びを支える仕組みと考え方"
      }
    ]
  },
  {
    id: "resources",
    label: "Resources",
    items: [
      {
        href: "https://compass-official.pages.dev/future-strategy-library/",
        label: "未来戦略ライブラリ",
        description: "まだ知らない進路と可能性へ",
        external: true
      },
      {
        href: "https://forms.gle/sW49M329Dcets8ga9",
        label: "COMPASS Essentials",
        description: "薬学部以外にも、選べる学びを",
        external: true
      }
    ]
  },
  {
    id: "community",
    label: "Community",
    items: [
      { href: "#community", label: "About COMPASS", description: "仲間と始める、新しい挑戦" },
      {
        href: "/community/join/",
        label: "Join COMPASS",
        description: "興味を、最初の一歩に変える"
      }
    ]
  }
];

const mobileNavGroups: NavGroup[] = navGroups;

const directNavItems: DirectNavItem[] = [
  {
    activeId: "founder",
    href: "#founder",
    label: "Founder",
    mobileLabel: "代表紹介を見る",
    description: "COMPASSを始めた人を知る"
  },
  {
    activeId: "contact",
    href: "/contact/",
    label: "Contact",
    mobileLabel: "お問い合わせ",
    description: "ご意見・質問・相談はこちら"
  },
  {
    activeId: "message",
    href: "messages/index.html",
    label: "Message",
    mobileLabel: "後輩へのメッセージ",
    description: "迷いながら進む、後輩のあなたへ"
  }
];

const focusableSelector = "a[href], button:not([disabled])";

export function SiteHeader() {
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("top");
  const [mobileMounted, setMobileMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingMobileTarget, setPendingMobileTarget] = useState<string | null>(null);

  const closeMobileMenu = (restoreFocus = true) => {
    setMobileOpen(false);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setMobileMounted(false), 280);
    if (restoreFocus) window.setTimeout(() => toggleRef.current?.focus(), 0);
  };

  const openMobileMenu = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    setMobileMounted(true);
    window.requestAnimationFrame(() => setMobileOpen(true));
  };

  useEffect(() => {
    const ids = ["top", "experience", "technology", "resources", "community", "contact", "founder", "message"];
    const sectionMap: Record<string, string> = {
      experience: "technology"
    };
    const elements = ids.map((id) => document.getElementById(id)).filter((item): item is HTMLElement => Boolean(item));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveSection(sectionMap[visible.target.id] ?? visible.target.id);
      },
      { rootMargin: "-18% 0px -62% 0px", threshold: [0, 0.12, 0.4] }
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handlePointer = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setActiveMenu(null);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setActiveMenu(null);
      if (mobileOpen) closeMobileMenu();
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [mobileOpen]);

  useEffect(() => {
    document.body.classList.toggle("menu-open", mobileOpen);
    if (!mobileOpen) return;
    const focusable = Array.from(mobilePanelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    focusable[0]?.focus();
    return () => document.body.classList.remove("menu-open");
  }, [mobileOpen]);

  useEffect(() => {
    if (mobileOpen || !pendingMobileTarget) return;
    const target = document.querySelector<HTMLElement>(pendingMobileTarget);
    if (!target) {
      setPendingMobileTarget(null);
      return;
    }

    const timer = window.setTimeout(() => {
      target.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start"
      });
      setPendingMobileTarget(null);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [mobileOpen, pendingMobileTarget]);

  const handleMobileKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(mobilePanelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleMobileNavClick = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    closeMobileMenu(false);
    if (!href.startsWith("#")) return;

    const target = document.querySelector<HTMLElement>(href);
    if (!target) return;

    event.preventDefault();
    window.history.pushState(null, "", href);
    setPendingMobileTarget(href);
  };

  return (
    <>
      <a className="skip-link" href="#main">本文へスキップ</a>
      <header ref={headerRef} className="site-header" data-site-header>
        <div className="header-inner">
          <a className="site-logo" href="#top" aria-label="COMPASS Home">
            <span className="logo-mark" aria-hidden="true"><span /></span>
            <span className="logo-copy"><strong>COMPASS</strong><small>Better Decisions</small></span>
          </a>

          <nav className="desktop-nav" aria-label="Main navigation">
            {navGroups.map((group) => {
              const menuId = `${group.id}-menu`;
              const current = activeSection === group.id;
              return (
                <div key={group.id} className={`nav-group${activeMenu === group.id ? " is-open" : ""}${current ? " is-current" : ""}`}>
                  <button
                    className="nav-trigger"
                    type="button"
                    aria-expanded={activeMenu === group.id}
                    aria-controls={menuId}
                    aria-current={current ? "location" : undefined}
                    onClick={() => setActiveMenu((open) => open === group.id ? null : group.id)}
                    onKeyDown={(event) => {
                      if (event.key !== "ArrowDown") return;
                      event.preventDefault();
                      setActiveMenu(group.id);
                      window.requestAnimationFrame(() => document.querySelector<HTMLAnchorElement>(`#${menuId} a`)?.focus());
                    }}
                  >
                    {group.label}
                  </button>
                  <div id={menuId} className="nav-panel">
                    {group.items.map((item) => (
                      <a
                        key={`${item.href}-${item.label}`}
                        className={`panel-link ${item.className ?? ""}`.trim()}
                        href={item.href}
                        target={item.external ? "_blank" : undefined}
                        rel={item.external ? "noopener noreferrer" : undefined}
                        onClick={() => setActiveMenu(null)}
                      >
                        <span>{item.label}</span><small>{item.description}</small>
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
            {directNavItems.map((item) => (
              <div key={item.activeId} className={`nav-group nav-group--direct${activeSection === item.activeId ? " is-current" : ""}`}>
                <a
                  className={`nav-link${activeSection === item.activeId ? " is-current" : ""}`}
                  href={item.href}
                  aria-current={activeSection === item.activeId ? "location" : undefined}
                  title={item.description}
                >
                  {item.label}
                </a>
                <div className="nav-panel nav-panel--direct" aria-hidden="true">
                  <p>{item.description}</p>
                </div>
              </div>
            ))}
          </nav>

          <div className="header-actions" aria-label="Primary actions">
            <a className="header-cta" href="https://compass-official.pages.dev/future-strategy-library/" target="_blank" rel="noopener noreferrer">
              ライブラリを見る
            </a>
            <a className="header-cta header-cta--interactive" href="INTRO_Interactive/">
              講義を体験する
            </a>
          </div>

          <button
            ref={toggleRef}
            className="menu-toggle"
            type="button"
            aria-label={mobileOpen ? "メニューを閉じる" : "メニューを開く"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            onClick={() => mobileOpen ? closeMobileMenu() : openMobileMenu()}
          >
            <span aria-hidden="true" /><span aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className={`mobile-scrim${mobileOpen ? " is-visible" : ""}`} hidden={!mobileMounted} onClick={() => closeMobileMenu()} />
      <aside
        id="mobile-menu"
        className={`mobile-menu${mobileOpen ? " is-open" : ""}`}
        aria-label="Mobile navigation"
        aria-hidden={!mobileOpen}
        hidden={!mobileMounted}
        onKeyDown={handleMobileKeyDown}
      >
        <div ref={mobilePanelRef} className="mobile-menu-panel">
          <div className="mobile-menu-top">
            <div><p>学生支援団体 COMPASS</p><span>Strategic Constellation Compass</span></div>
            <button className="mobile-menu-close" type="button" aria-label="メニューを閉じる" onClick={() => closeMobileMenu()}>
              <span aria-hidden="true" /><span aria-hidden="true" />
            </button>
          </div>
          <nav className="mobile-nav" aria-label="Mobile menu links">
            {mobileNavGroups.map((group) => (
              <section key={group.id} className="mobile-nav-group" aria-labelledby={`mobile-${group.id}-title`}>
                <h2 id={`mobile-${group.id}-title`}>{group.label}</h2>
                {group.items.map((item) => (
                  <a
                    key={`${item.href}-${item.label}`}
                    className={item.className === "panel-link-interactive" ? "mobile-nav-highlight" : undefined}
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noopener noreferrer" : undefined}
                    onClick={(event) => handleMobileNavClick(event, item.href)}
                  >
                    {item.label}
                  </a>
                ))}
              </section>
            ))}
            {directNavItems.map((item) => (
              <section key={item.activeId} className="mobile-nav-group" aria-labelledby={`mobile-${item.activeId}-title`}>
                <h2 id={`mobile-${item.activeId}-title`}>{item.label}</h2>
                <a href={item.href} onClick={(event) => handleMobileNavClick(event, item.href)}>{item.mobileLabel}</a>
              </section>
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
}
