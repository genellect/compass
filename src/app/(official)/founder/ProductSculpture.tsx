"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./products-cinematic.module.css";
import { PLATFORM_GLYPHS, PLATFORM_MEDIA } from "./platform-glyphs";

export type SculptureKind = "interactive" | "library" | "manifesto" | "platform";

function KineticWeaveFallback() {
  const threads = Array.from({ length: 17 }, (_, index) => index);
  return <svg className={styles.portalFallback} viewBox="0 0 320 320" focusable="false">
    <defs>
      <linearGradient id="weave-metal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#6adce5" />
        <stop offset="0.5" stopColor="#edf6ff" />
        <stop offset="1" stopColor="#6c5ed4" />
      </linearGradient>
    </defs>
    <g fill="none" stroke="url(#weave-metal)" strokeLinecap="round">
      {threads.map(index => {
        const start = 56 + index * 12;
        const end = 264 - index * 12;
        return <path key={index} opacity={0.34 + (index % 5) * 0.1} strokeWidth={2 + (index % 3) * 0.8} d={`M16 ${start} C92 ${start - 64}, 118 ${144 + (index - 8) * 2}, 160 160 S236 ${end + 54}, 304 ${end}`} />;
      })}
    </g>
  </svg>;
}

function ManifestoFallback() {
  return <svg className={styles.manifestoFallback} viewBox="0 0 420 260" focusable="false">
    <defs>
      <linearGradient id="manifesto-line" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#eef5fb" />
        <stop offset="0.45" stopColor="#8b79e7" />
        <stop offset="0.78" stopColor="#d6ac69" />
        <stop offset="1" stopColor="#78dbdf" />
      </linearGradient>
    </defs>
    <g fill="none" stroke="url(#manifesto-line)" strokeWidth="5">
      {[0, 1, 2, 3, 4, 5].map(index => <path key={index} opacity={0.92 - index * 0.1} d={`M${70 + index * 24} ${39 + index * 14} H${346 - index * 20} V${222 - index * 17} H${92 + index * 19}`} />)}
    </g>
    <path d="M58 217 C142 153 233 188 361 52" fill="none" stroke="#8de5e2" strokeWidth="2" strokeOpacity="0.7" />
  </svg>;
}

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
      </svg> : kind === "interactive" ? <KineticWeaveFallback /> : kind === "manifesto" ? <ManifestoFallback /> : <div className={styles.fallback}><i /><i /><i /></div>}
    </div>
  );
}
