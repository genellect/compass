"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { CellSceneController } from "./cytellect-scene-engine";
import styles from "./products-cinematic.module.css";

export function CytellectSculpture({ paused }: { paused: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const pause = useRef(paused);
  const controller = useRef<CellSceneController | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    pause.current = paused;
    controller.current?.syncMotion();
  }, [paused]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let nearby = false;
    let disposed = false;
    let request: AbortController | null = null;
    const stop = () => {
      request?.abort();
      request = null;
      controller.current?.dispose();
      controller.current = null;
      setReady(false);
    };
    const start = async () => {
      if (disposed || reduced.matches || !nearby || request) return;
      const pending = new AbortController();
      request = pending;
      try {
        const { mountCellScene } = await import("./cytellect-scene-engine");
        if (pending.signal.aborted) return;
        const scene = await mountCellScene(element, () => pause.current, pending.signal, () => setReady(false));
        if (disposed || pending.signal.aborted) { scene.dispose(); return; }
        controller.current = scene;
        setReady(true);
        scene.syncMotion();
      } catch {
        // The server-rendered poster and link remain available on any failure.
        if (!disposed && !pending.signal.aborted) setReady(false);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      nearby = entry.isIntersecting;
      if (nearby) void start();
    }, { rootMargin: "240px" });
    const preference = () => { stop(); void start(); };
    observer.observe(element);
    reduced.addEventListener("change", preference);
    return () => {
      disposed = true;
      observer.disconnect();
      reduced.removeEventListener("change", preference);
      request?.abort();
      controller.current?.dispose();
      controller.current = null;
    };
  }, []);

  return <div ref={host} className={styles.scene} data-scene="cytellect" data-ready={ready} aria-hidden="true">
    <Image className={styles.cellPoster} src="/images/founder-products/cytellect/cell-sculpture-poster.webp" width={1600} height={1000} sizes="(max-width: 900px) 100vw, 550px" alt="" loading="lazy" />
  </div>;
}
