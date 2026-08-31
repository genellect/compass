"use client";

import { useEffect, useRef, useState } from "react";
import { FounderJapaneseLink } from "../../../components/FounderJapaneseLink";
import { founderOrigin } from "./content";
import { GitHubIcon, InstagramIcon } from "./EnglishSocialIcons";
import styles from "./english-founder.module.css";

const links = [
  { label: "Expertise", href: "#expertise" },
  { label: "Statement", href: "#statement" },
  { label: "Selected Work", href: "#work" },
  { label: "Experience", href: "#experience" },
  { label: "Fragments", href: "#fragments" },
  { label: "Off Hours", href: "#off-hours" },
  { label: "Contact", href: "#contact" }
] as const;

const englishPortfolioUrl = `${founderOrigin}/en/`;

export function EnglishMobileMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const firstLink = panelRef.current?.querySelector<HTMLAnchorElement>("a[href]");
    firstLink?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.mobileMenuRoot}>
      <span className={styles.mobileHeaderLanguage} aria-label="Language">
        <FounderJapaneseLink>JP</FounderJapaneseLink>
        <span>/</span>
        <a href={englishPortfolioUrl} aria-current="page">EN</a>
      </span>
      <button
        ref={triggerRef}
        type="button"
        className={styles.mobileMenuTrigger}
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        aria-controls="english-mobile-menu"
        onClick={() => setOpen((current) => !current)}
      >
        <span /><span />
      </button>

      <div
        ref={panelRef}
        id="english-mobile-menu"
        className={styles.mobileMenuPanel}
        data-open={open}
        aria-hidden={!open}
      >
        <div className={styles.mobileMenuHeader}>
          <span>YUTO MATSUI</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation">Close</button>
        </div>
        <nav className={styles.mobileMenuLinks} aria-label="Mobile portfolio navigation">
          {links.map((link, index) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
              <span>{String(index + 1).padStart(2, "0")}</span>{link.label}
            </a>
          ))}
        </nav>
        <div className={styles.mobileMenuFooter}>
          <nav className={styles.mobileMenuSocials} aria-label="Social profiles">
            <a href="https://www.instagram.com/n.m.w.314/?__pwa=1#" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><InstagramIcon /></a>
            <a href="https://github.com/genellect" target="_blank" rel="noopener noreferrer" aria-label="GitHub"><GitHubIcon /></a>
          </nav>
          <div className={styles.mobileMenuLanguage}>
            <span>Language</span>
            <div><FounderJapaneseLink>JP</FounderJapaneseLink><span>/</span><a href={englishPortfolioUrl} aria-current="page">EN</a></div>
          </div>
        </div>
      </div>
    </div>
  );
}
