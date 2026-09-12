"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { DepthCard } from "./DepthCard";
import styles from "./portfolio-depth.module.css";

type Photo = { number: string; label: string; image: string; alt: string; copy: readonly string[] };
type Props = {
  photos: Photo[];
  language: "ja" | "en";
  classes: { grid: string; card: string; visual: string; copy?: string };
};
type Selection = { photo: Photo; trigger: HTMLButtonElement; width: number; height: number; origin: DOMRect; radius: string };

function ExpandIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" /></svg>;
}

export function OffHoursGallery({ photos, language, classes }: Props) {
  const [desktop, setDesktop] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const clearSelection = useCallback(() => setSelection(null), []);
  const request = useRef(0);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 901px)");
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => { request.current++; media.removeEventListener("change", sync); };
  }, []);

  async function open(photo: Photo, trigger: HTMLButtonElement) {
    if (selection || !desktop) return;
    const current = ++request.current;
    const visual = trigger.parentElement!;
    const image = visual.querySelector("img")!;
    if (!image.complete || !image.naturalWidth) {
      image.loading = "eager";
      try { await image.decode(); } catch { return; }
    }
    if (current !== request.current || !trigger.isConnected || !window.matchMedia("(min-width: 901px)").matches) return;
    // Keyboard focus can start the EN page's smooth scroll. Finish positioning
    // before freezing the page so the background cannot keep scrolling in flight.
    const bounds = visual.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
      visual.scrollIntoView({ behavior: "instant", block: "center" });
    }
    window.scrollTo({ top: window.scrollY, left: window.scrollX, behavior: "instant" });
    setSelection({ photo, trigger, width: image.naturalWidth, height: image.naturalHeight,
      origin: visual.getBoundingClientRect(), radius: getComputedStyle(visual).borderRadius });
  }

  return <>
    <div className={classes.grid}>
      {photos.map(photo => <DepthCard key={photo.label} depth="photo" editorial={language === "en"}
        className={classes.card} data-photo-open={selection?.photo.label === photo.label || undefined}>
        <div className={classes.visual} data-depth-photo>
          <Image src={photo.image} alt={photo.alt} fill sizes={language === "en" ? "(min-width: 901px) 32vw, 92vw" : "(min-width: 901px) 32vw, 100vw"} />
          <span aria-hidden="true">{photo.number}</span>
          {desktop && <button type="button" className={styles.photoTrigger}
            aria-label={language === "ja" ? `写真を拡大：${photo.label}` : `Enlarge photo: ${photo.label}`}
            aria-haspopup="dialog" onClick={event => open(photo, event.currentTarget)}>
            <span className={styles.expandIcon}><ExpandIcon /></span>
          </button>}
        </div>
        <div className={classes.copy}><h3>{photo.label}</h3><p>{language === "en" ? photo.copy[0] : photo.copy.map(line => <span key={line}>{line}</span>)}</p></div>
      </DepthCard>)}
    </div>
    {selection && createPortal(<PhotoDialog selection={selection} language={language} onClosed={clearSelection} />, document.body)}
  </>;
}

function PhotoDialog({ selection, language, onClosed }: { selection: Selection; language: "ja" | "en"; onClosed: () => void }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const photo = useRef<HTMLImageElement>(null);
  const flight = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const finish = useRef<(animate?: boolean) => void>(() => {});

  useLayoutEffect(() => {
    const root = dialog.current!;
    const flying = flight.current!;
    const image = photo.current!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const bodyOverflow = document.body.style.overflow;
    const gutter = document.documentElement.style.scrollbarGutter;
    document.documentElement.style.scrollbarGutter = "stable";
    document.body.style.overflow = "hidden";
    root.showModal();
    closeButton.current?.focus({ preventScroll: true });
    let disposed = false;
    let closing = false;
    let animation: Animation | undefined;
    const rectFrame = (rect: DOMRect, radius: string) => ({
      left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: radius,
    });
    const run = (from: DOMRect, to: DOMRect, fromRadius: string, toRadius: string, done: () => void) => {
      animation?.cancel();
      root.dataset.traveling = "true";
      animation = flying.animate([rectFrame(from, fromRadius), rectFrame(to, toRadius)], {
        duration: 430, easing: "cubic-bezier(.22,.7,.2,1)", fill: "both",
      });
      void animation.finished.then(() => { if (!disposed) done(); }).catch(() => {});
    };
    const complete = () => { if (!disposed) onClosed(); };
    finish.current = (animate = true) => {
      if (closing) { if (!animate) complete(); return; }
      closing = true;
      root.dataset.closing = "true";
      const visual = selection.trigger.parentElement;
      const target = visual?.getBoundingClientRect();
      if (!animate || reduced.matches || !target || target.bottom < 0 || target.top > innerHeight) { complete(); return; }
      const current = root.dataset.traveling === "true" ? flying.getBoundingClientRect() : image.getBoundingClientRect();
      run(current, target, getComputedStyle(flying).borderRadius, selection.radius, complete);
    };
    if (!reduced.matches) {
      run(selection.origin, image.getBoundingClientRect(), selection.radius, "3px", () => {
        root.dataset.traveling = "false";
        animation?.cancel();
      });
    }
    const interrupt = () => finish.current(false);
    window.addEventListener("resize", interrupt);
    reduced.addEventListener("change", interrupt);
    return () => {
      disposed = true;
      animation?.cancel();
      window.removeEventListener("resize", interrupt);
      reduced.removeEventListener("change", interrupt);
      root.close();
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.scrollbarGutter = gutter;
      requestAnimationFrame(() => {
        if (selection.trigger.isConnected) selection.trigger.focus({ preventScroll: true });
      });
    };
  }, [selection, onClosed]);

  return <dialog ref={dialog} className={styles.dialog} data-language={language} aria-labelledby={id}
    onCancel={event => { event.preventDefault(); finish.current(); }}
    onKeyDown={event => {
      // The close button is this viewer's only interactive control.
      if (event.key === "Tab") { event.preventDefault(); closeButton.current?.focus({ preventScroll: true }); }
      if (event.key === "Escape") { event.preventDefault(); finish.current(); }
    }}
    onClick={event => { if (event.target === event.currentTarget) finish.current(); }}>
    <div className={styles.veil} aria-hidden="true" />
    <figure className={styles.figure}>
      <Image ref={photo} className={styles.expandedPhoto} src={selection.photo.image} alt={selection.photo.alt}
        width={selection.width} height={selection.height} loading="eager" />
      <figcaption className={styles.caption}>
        <h3 id={id}>{selection.photo.label}</h3>
        <p>{selection.photo.copy.map(line => <span key={line}>{line}</span>)}</p>
      </figcaption>
    </figure>
    <div ref={flight} className={styles.flight} aria-hidden="true"><Image src={selection.photo.image} alt="" fill sizes="100vw" loading="eager" /></div>
    <button ref={closeButton} type="button" className={styles.close} onClick={() => finish.current()}
      aria-label={language === "ja" ? "写真を閉じる" : "Close photo"}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
    </button>
  </dialog>;
}
