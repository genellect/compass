"use client";

import { useEffect, useRef, useState } from "react";
import {
  FUTURE_STRATEGY_LIBRARY_REGISTRATION_HREF,
  isExternalCompassHref
} from "../lib/futureStrategyLibrary";
import { resolveSiteHref, type SiteRouteContext } from "./siteRouteContext";

type NavItem = {
  description: string;
  external?: boolean;
  href: string;
  label: string;
  mobileDescription?: string;
  mobileLabel?: string;
};

type NavGroup = {
  id: "technology" | "resources" | "community";
  items: NavItem[];
  label: string;
};

type DirectNavItem = {
  activeId: "founder" | "contact";
  description: string;
  href: string;
  label: string;
  mobileLabel: string;
};

type MobileNavGroup = {
  id: "education" | "learning" | "community" | "other";
  items: NavItem[];
  label: string;
};

const libraryUrl = "/future-strategy-library/";

const navGroups: NavGroup[] = [
  {
    id: "technology",
    label: "Technology",
    items: [
      {
        href: "INTRO_Interactive/",
        label: "COMPASS Interactive",
        description: "疑問が届く、参加型講義システム",
        mobileDescription: "疑問が届く、参加型講義システム"
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
        href: libraryUrl,
        label: "未来戦略ライブラリ",
        description: "北里薬学生への未来の羅針盤",
        mobileDescription: "北里薬学生への未来の羅針盤"
      },
      {
        href: "/messages/",
        label: "AI時代をどう生きるか",
        description: "COMPASS Manifesto",
        mobileDescription: "COMPASS Manifesto"
      }
    ]
  },
  {
    id: "community",
    label: "Community",
    items: [
      {
        href: "#community",
        label: "COMPASSを知る",
        description: "学生の挑戦を、仲間と形にする"
      },
      {
        href: "/community/join/",
        label: "運営メンバーとして参加する",
        description: "興味を、最初の一歩に変える"
      }
    ]
  }
];

const directNavItems: DirectNavItem[] = [
  {
    activeId: "founder",
    href: "https://yuto-matsui.com/",
    label: "Founder",
    mobileLabel: "代表について",
    description: "COMPASSを始めた人を知る"
  },
  {
    activeId: "contact",
    href: "/contact/",
    label: "Contact",
    mobileLabel: "お問い合わせ",
    description: "ご意見・質問・相談はこちら"
  }
];

const mobileNavGroups: MobileNavGroup[] = [
  {
    id: "education",
    label: "教育を変える",
    items: [navGroups[0].items[0]]
  },
  {
    id: "learning",
    label: "学ぶ・考える",
    items: navGroups[1].items
  },
  {
    id: "community",
    label: "コミュニティに参加する",
    items: navGroups[2].items
  },
  {
    id: "other",
    label: "その他",
    items: directNavItems.map((item) => ({
      href: item.href,
      label: item.mobileLabel,
      description: item.description
    }))
  }
];

const focusableSelector = "a[href], button:not([disabled])";

function libraryViewportCategory() {
  if (window.innerWidth <= 720) return "mobile";
  if (window.innerWidth <= 1179) return "tablet";
  return "desktop";
}

function trackLibraryRegistration(placement: "header" | "mobile-menu") {
  const dataLayer = (window as Window & { dataLayer?: unknown[] }).dataLayer;
  dataLayer?.push({
    event: "fsl_cta_click",
    placement,
    viewport_category: libraryViewportCategory()
  });
}

export function SiteHeader({
  routeContext = "root",
  hideLibraryRegistrationAction = false
}: {
  routeContext?: SiteRouteContext;
  hideLibraryRegistrationAction?: boolean;
}) {
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("top");
  const [mobileMounted, setMobileMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingMobileTarget, setPendingMobileTarget] = useState<string | null>(null);
  const routeSection: Record<Exclude<SiteRouteContext, "root">, string> = {
    messages: "resources",
    library: "resources",
    community: "community",
    contact: "contact"
  };
  const visibleSection = routeContext === "root" ? activeSection : routeSection[routeContext];
  const resolveHref = (href: string) => resolveSiteHref(href, routeContext);
  const currentMobileHref =
    routeContext === "library" ? libraryUrl
      : routeContext === "messages" ? "/messages/"
        : routeContext === "community" ? "/community/join/"
          : routeContext === "contact" ? "/contact/"
            : null;
  const showLibraryRegistrationAction =
    routeContext === "library" && !hideLibraryRegistrationAction;
  const showParentActions = routeContext !== "library";
  const libraryRegistrationIsExternal = isExternalCompassHref(
    FUTURE_STRATEGY_LIBRARY_REGISTRATION_HREF
  );

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
    if (routeContext !== "root") return;
    const ids = ["top", "experience", "technology", "resources", "community", "founder", "manifesto", "contact"];
    const sectionMap: Record<string, string> = {
      experience: "technology",
      manifesto: "resources"
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
  }, [routeContext]);

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
      <header
        ref={headerRef}
        className="site-header"
        data-site-header
        data-fsl-landing-header={routeContext === "library" ? "true" : undefined}
      >
        <div className="header-inner">
          <a className="site-logo" href={resolveHref("#top")} aria-label="COMPASS Home">
            <span className="logo-mark" aria-hidden="true"><span /></span>
            <span className="logo-copy"><strong>COMPASS</strong><small>Better Decisions</small></span>
            {routeContext === "library" ? (
              <span className="site-product-context" aria-label="Future Strategy Library">
                <span className="site-product-context__long" aria-hidden="true">Future Strategy Library</span>
                <span className="site-product-context__short" aria-hidden="true">Library</span>
              </span>
            ) : null}
          </a>

          <nav className="desktop-nav" aria-label="Main navigation">
            {navGroups.map((group) => {
              const menuId = `${group.id}-menu`;
              const current = visibleSection === group.id;
              return (
                <div key={group.id} className={`nav-group${activeMenu === group.id ? " is-open" : ""}${current ? " is-current" : ""}`}>
                  <button
                    className="nav-trigger"
                    type="button"
                    aria-expanded={activeMenu === group.id}
                    aria-controls={menuId}
                    aria-current={current ? (routeContext === "root" ? "location" : "page") : undefined}
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
                        className="panel-link"
                        href={resolveHref(item.href)}
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
              <div key={item.activeId} className={`nav-group nav-group--direct${visibleSection === item.activeId ? " is-current" : ""}`}>
                <a
                  className={`nav-link${visibleSection === item.activeId ? " is-current" : ""}`}
                  href={resolveHref(item.href)}
                  aria-current={visibleSection === item.activeId ? (routeContext === "root" ? "location" : "page") : undefined}
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
            {showLibraryRegistrationAction ? (
              <a
                className="header-cta header-cta--interactive header-cta--registration"
                href={FUTURE_STRATEGY_LIBRARY_REGISTRATION_HREF}
                target={libraryRegistrationIsExternal ? "_blank" : undefined}
                rel={libraryRegistrationIsExternal ? "noopener noreferrer" : undefined}
                aria-label={
                  libraryRegistrationIsExternal
                    ? "無料で資料を見る（新しいタブで開きます）"
                    : "無料で資料を見る"
                }
                data-library-registration="true"
                data-placement="header"
                onClick={() => trackLibraryRegistration("header")}
              >
                無料で資料を見る
              </a>
            ) : showParentActions ? (
              <>
                <a className="header-cta header-cta--interactive" href={resolveHref("INTRO_Interactive/")}>
                  講義を体験する
                </a>
                <a className="header-cta header-cta--optional" href={libraryUrl}>
                  ライブラリを見る
                </a>
              </>
            ) : null}
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
            <div>
              <p>{routeContext === "library" ? "未来戦略ライブラリ" : "学生支援団体 COMPASS"}</p>
              <span>{routeContext === "library" ? "A COMPASS Resource" : "Strategic Constellation Compass"}</span>
            </div>
            <button className="mobile-menu-close" type="button" aria-label="メニューを閉じる" onClick={() => closeMobileMenu()}>
              <span aria-hidden="true" /><span aria-hidden="true" />
            </button>
          </div>
          {showLibraryRegistrationAction ? (
            <a
              className="mobile-menu-primary"
              href={FUTURE_STRATEGY_LIBRARY_REGISTRATION_HREF}
              target={libraryRegistrationIsExternal ? "_blank" : undefined}
              rel={libraryRegistrationIsExternal ? "noopener noreferrer" : undefined}
              aria-label={
                libraryRegistrationIsExternal
                  ? "無料で資料を見る（新しいタブで開きます）"
                  : "無料で資料を見る"
              }
              data-library-registration-mobile="true"
              data-placement="mobile-menu"
              onClick={() => {
                trackLibraryRegistration("mobile-menu");
                closeMobileMenu(false);
              }}
            >
              無料で資料を見る
            </a>
          ) : null}
          <nav className="mobile-nav" aria-label="Mobile menu links">
            {mobileNavGroups.map((group) => (
              <section key={group.id} className="mobile-nav-group" aria-labelledby={`mobile-${group.id}-title`}>
                <h2 id={`mobile-${group.id}-title`}>{group.label}</h2>
                {group.items.map((item) => (
                  <a
                    key={`${item.href}-${item.label}`}
                    href={resolveHref(item.href)}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noopener noreferrer" : undefined}
                    aria-current={item.href === currentMobileHref ? "page" : undefined}
                    onClick={(event) => handleMobileNavClick(event, resolveHref(item.href))}
                  >
                    <span className="mobile-nav-link-copy">
                      <strong className="mobile-nav-link-title">{item.mobileLabel ?? item.label}</strong>
                      {item.mobileDescription ? (
                        <small className="mobile-nav-link-description">{item.mobileDescription}</small>
                      ) : null}
                    </span>
                  </a>
                ))}
              </section>
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
}
