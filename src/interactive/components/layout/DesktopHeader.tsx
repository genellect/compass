"use client";

import { useEffect, useRef, useState } from "react";
import { links } from "../../content/interactiveContent";
import { mainMobileGroups, siteDestinations } from "./navigation";
import styles from "./desktop-header.module.css";

export function DesktopHeader() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); }
    };
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const resize = () => setOpen(false);
    document.addEventListener("keydown", keydown);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", resize, {passive:true});
    return () => {
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", resize);
    };
  }, [open]);
  return (
    <div className={styles.desktop} ref={root} data-interactive-desktop-header
      onBlur={event => {if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);}}>
      <a className={styles.brand} href="#top" aria-label="COMPASS Interactive トップへ" onClick={()=>setOpen(false)}>
        <span className={styles.parentBrand}>
          <span className={styles.mark} aria-hidden="true"><span /></span><strong>COMPASS</strong>
        </span>
        <span className={styles.productBrand}>Interactive</span>
      </a>
      <nav className={styles.destinations} aria-label="公式サイト・技術情報・開発者">
        {siteDestinations.map((item,index)=><a className={index === 0 ? styles.official : undefined} key={item.href} href={item.href} aria-label={item.label}>
          <span className={styles.destinationCopy}><span>{item.label}</span>{item.detail && <small>{item.detail}</small>}</span><span className={styles.destinationArrow} aria-hidden="true">↗</span>
        </a>)}
      </nav>
      <div className={styles.actions}>
        <a className={styles.demo} href={links.demo}>講義を体験する<span aria-hidden="true">→</span></a>
        <button ref={toggle} className={styles.toggle} type="button" aria-label="ページ内ナビゲーション"
          aria-expanded={open} aria-controls="desktop-page-navigation" onClick={()=>setOpen(current=>!current)}
          onKeyDown={event=>{
            if (event.key !== "ArrowDown") return;
            event.preventDefault(); setOpen(true);
            requestAnimationFrame(()=>panel.current?.querySelector<HTMLAnchorElement>("a")?.focus());
          }}>
          <span className={styles.menuLabel}>Menu</span><span className={styles.menuIcon} aria-hidden="true"><i/><i/></span>
        </button>
      </div>
      <div ref={panel} className={styles.panel} id="desktop-page-navigation" hidden={!open}>
        <nav className={styles.pageLinks} aria-label="ページ内ナビゲーション">
          {mainMobileGroups.map(group=><div className={styles.pageGroup} key={group.label}>
            {group.items.filter(item=>item.href.startsWith("#")).map(item=><a key={item.href} href={item.href} onClick={()=>setOpen(false)}>{item.label}<span aria-hidden="true">↓</span></a>)}
          </div>)}
        </nav>
        <div className={styles.participate}><a href={links.join}>講義コードで参加する<span aria-hidden="true">→</span></a></div>
      </div>
    </div>
  );
}
