"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./products-cinematic.module.css";

export type SculptureKind = "interactive" | "library" | "manifesto";

export function ProductSculpture({ kind, paused }: { kind: SculptureKind; paused: boolean }) {
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
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      try {
        const { mountSculpture } = await import("./product-sculpture-engine");
        if (disposed) return;
        cleanup = mountSculpture(element, kind, () => pause.current, () => setReady(true));
      } catch {
        // The static sculptural composition and all links remain available.
      }
    }, { rootMargin: "240px" });
    observer.observe(element);
    return () => { disposed = true; observer.disconnect(); cleanup?.(); };
  }, [kind]);

  return (
    <div ref={host} className={styles.scene} data-scene={kind} data-ready={ready} aria-hidden="true">
      <div className={styles.fallback}><i /><i /><i /></div>
    </div>
  );
}
