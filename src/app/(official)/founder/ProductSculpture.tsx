"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./products-cinematic.module.css";
import { PLATFORM_GLYPHS, PLATFORM_MEDIA } from "./platform-glyphs";

export type SculptureKind = "interactive" | "library" | "manifesto" | "platform";

export function ProductSculpture({ kind, paused, layout = "shared" }: { kind: SculptureKind; paused: boolean; layout?: "shared" | "compact" | "wide" }) {
  const host = useRef<HTMLDivElement>(null);
  const pause = useRef(paused);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    pause.current = paused;
    host.current?.dispatchEvent(new Event("sculpture-motion-change"));
  }, [paused]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    let generation = 0;
    let pendingFrame = 0;
    const media = window.matchMedia(PLATFORM_MEDIA);
    const enabled = () => layout === "shared" || (layout === "wide" ? media.matches : !media.matches);
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || !enabled()) return;
      observer.disconnect();
      const current = generation;
      try {
        const { mountSculpture } = await import("./product-sculpture-engine");
        if (disposed || current !== generation || !enabled()) return;
        cleanup = mountSculpture(element, kind, () => pause.current, () => setReady(true));
      } catch {
        // The static sculptural composition and all links remain available.
      }
    }, { rootMargin: "240px" });
    const sync = () => {
      generation++;
      cancelAnimationFrame(pendingFrame);
      observer.disconnect();
      cleanup?.();
      cleanup = undefined;
      setReady(false);
      element.dataset.ready = "false";
      // All outgoing scenes dispose before any incoming scene initializes.
      if (enabled()) pendingFrame = requestAnimationFrame(() => observer.observe(element));
    };
    sync();
    if (layout !== "shared") media.addEventListener("change", sync);
    return () => { disposed = true; generation++; cancelAnimationFrame(pendingFrame); media.removeEventListener("change", sync); observer.disconnect(); cleanup?.(); };
  }, [kind, layout]);

  return (
    <div ref={host} className={styles.scene} data-scene={kind} data-ready={ready} aria-hidden="true">
      {kind === "platform" ? <svg className={styles.platformFallback} viewBox="-10 -12 210 130" focusable="false">
        <g transform="translate(12 10)" fill="#3457b6">{PLATFORM_GLYPHS.map(d => <path key={d} d={d} fillRule="evenodd" />)}</g>
        <g stroke="#c9eafa" strokeWidth="0.8">{PLATFORM_GLYPHS.map((d, i) => <path key={d} d={d} fill={i ? "#8774ef" : "#43d9ef"} fillRule="evenodd" />)}</g>
      </svg> : <div className={styles.fallback}><i /><i /><i /></div>}
    </div>
  );
}
