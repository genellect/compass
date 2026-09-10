"use client";

import { useEffect, useRef } from "react";
import styles from "./contact.module.css";

export function ContactAtmosphere() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let release: (() => void) | undefined;
    let generation = 0;
    const sync = async () => {
      const current = ++generation;
      release?.();
      release = undefined;
      if (reduced.matches) return;
      try {
        const { mountContactGallery } = await import("./contact-gallery-scene");
        if (disposed || current !== generation) return;
        release = mountContactGallery(element);
      } catch {
        // The architectural CSS backdrop remains available if WebGL cannot load.
      }
    };
    void sync();
    reduced.addEventListener("change", sync);
    return () => { disposed = true; generation++; reduced.removeEventListener("change", sync); release?.(); };
  }, []);
  return <div className={styles.atmosphere} aria-hidden="true"><div className={styles.architecture} /><div className={styles.scene} ref={host} /></div>;
}
