"use client";

import { useEffect, useRef, useState } from "react";
import brand from "@/components/parent-brand.module.css";
import styles from "./contact-chrome.module.css";
import { CONTACT_RETURN_TO_ENTRANCE } from "./contact-entry-events";

const links = [
  { label: "Yuto Matsui — JP", href: "https://yuto-matsui.com/" },
  { label: "Yuto Matsui — EN", href: "https://yuto-matsui.com/en/" },
  { label: "COMPASS Platform", href: "https://compass-official.pages.dev/" },
  { label: "COMPASS Interactive", href: "https://compass-official.pages.dev/INTRO_Interactive/" },
] as const;

function ContactLinks({ onNavigate }: { onNavigate?: () => void }) {
  return links.map(({ label, href }) => (
    <a href={href} key={href} onClick={onNavigate}>
      <span>{label}</span><span aria-hidden="true">↗</span>
    </a>
  ));
}

export function ContactHeader() {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) setOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    const desktop = matchMedia("(min-width: 901px)");
    const dismissOnDesktop = () => { if (desktop.matches) setOpen(false); };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    desktop.addEventListener("change", dismissOnDesktop);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
      desktop.removeEventListener("change", dismissOnDesktop);
    };
  }, [open]);

  return (
    <header className={styles.header} data-contact-header>
      <a className={styles.skip} href="#main">本文へスキップ</a>
      <div className={styles.headerInner}>
        <a className={`site-logo ${brand.parentBrand} ${styles.brand}`} href="/contact/" aria-label="CONTACT — 3Dの入口へ戻る" onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          setOpen(false);
          if (!window.dispatchEvent(new Event(CONTACT_RETURN_TO_ENTRANCE, { cancelable: true }))) event.preventDefault();
        }}>
          <span className="logo-mark" aria-hidden="true"><span /></span>
          <span className={styles.wordmark}>CONTACT</span>
        </a>
        <nav className={styles.desktopNav} aria-label="Contact navigation"><ContactLinks /></nav>
        <div className={styles.mobileMenu} ref={menu} onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}>
          <button type="button" ref={trigger} className={styles.menuButton} aria-expanded={open} aria-controls="contact-navigation" onClick={() => setOpen((value) => !value)}>
            Menu<span className={styles.menuGlyph} aria-hidden="true"><i /><i /></span>
          </button>
          <nav id="contact-navigation" className={styles.bubble} aria-label="Contact navigation" hidden={!open}>
            <ContactLinks onNavigate={() => setOpen(false)} />
          </nav>
        </div>
      </div>
    </header>
  );
}

export function ContactFooter() {
  return (
    <footer className={styles.footer} data-contact-footer>
      <div className={styles.footerInner}>
        <div className={styles.footerTop}>
          <a className={styles.footerTitle} href="#contact-top">CONTACT</a>
          <a className={styles.backTop} href="#contact-top">Back to top <span aria-hidden="true">↑</span></a>
        </div>
        <nav className={styles.footerNav} aria-label="Contact footer navigation"><ContactLinks /></nav>
        <p className={styles.copyright}>© {new Date().getFullYear()} Yuto Matsui. All rights reserved.</p>
      </div>
    </footer>
  );
}
