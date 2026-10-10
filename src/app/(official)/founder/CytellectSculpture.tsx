"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import styles from "./products-cinematic.module.css";

const assetRoot = "/images/founder-products/cytellect";

export function CytellectSculpture({ paused }: { paused: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const pause = useRef(paused);
  const film = useRef<HTMLVideoElement>(null);
  const sync = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    pause.current = paused;
    sync.current?.();
  }, [paused]);

  useEffect(() => {
    const element = host.current;
    const video = film.current;
    if (!element || !video) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = matchMedia("(max-width: 900px)");
    let nearby = false;
    let visible = false;
    let disposed = false;
    let failed = false;
    let source = "";
    let frameRequest: number | null = null;
    const cancelFrame = () => {
      if (frameRequest !== null && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frameRequest);
      frameRequest = null;
    };
    const motion = () => {
      if (disposed) return;
      if (!reduced.matches && nearby && !failed) {
        const next = `${assetRoot}/kinetic-${mobile.matches ? "mobile" : "desktop"}.mp4`;
        if (source !== next) {
          cancelFrame();
          setReady(false);
          source = next;
          video.src = next;
          video.load();
        }
      }
      if (reduced.matches || !visible || document.hidden || pause.current || failed) {
        video.pause();
      } else if (source) {
        // An autoplay rejection must not erase the immediately available still.
        void video.play().catch(() => { if (!disposed) setReady(false); });
      }
    };
    const presented = () => {
      cancelFrame();
      if (video.requestVideoFrameCallback) {
        frameRequest = video.requestVideoFrameCallback(() => {
          frameRequest = null;
          if (!disposed && !reduced.matches && video.readyState >= 2) setReady(true);
        });
      } else if (!disposed && !reduced.matches && video.readyState >= 2) setReady(true);
    };
    const error = () => { failed = true; cancelFrame(); setReady(false); video.pause(); };
    const preference = () => {
      cancelFrame();
      setReady(false);
      if (reduced.matches) {
        video.pause();
        video.removeAttribute("src");
        video.load();
        source = "";
      }
      failed = false;
      motion();
    };
    const viewport = () => { failed = false; motion(); };
    const preloadObserver = new IntersectionObserver(([entry]) => {
      nearby = entry.isIntersecting;
      motion();
    }, { rootMargin: "240px" });
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio > 0;
      motion();
    });
    sync.current = motion;
    preloadObserver.observe(element);
    visibilityObserver.observe(element);
    reduced.addEventListener("change", preference);
    mobile.addEventListener("change", viewport);
    document.addEventListener("visibilitychange", motion);
    video.addEventListener("canplay", motion);
    video.addEventListener("playing", presented);
    video.addEventListener("error", error);
    return () => {
      disposed = true;
      sync.current = null;
      cancelFrame();
      preloadObserver.disconnect();
      visibilityObserver.disconnect();
      reduced.removeEventListener("change", preference);
      mobile.removeEventListener("change", viewport);
      document.removeEventListener("visibilitychange", motion);
      video.removeEventListener("canplay", motion);
      video.removeEventListener("playing", presented);
      video.removeEventListener("error", error);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, []);

  return <div ref={host} className={styles.scene} data-scene="cytellect" data-ready={ready} aria-hidden="true">
    <video ref={film} className={styles.cytellectFilm} muted playsInline loop preload="none" tabIndex={-1} />
    <picture>
      <source media="(max-width: 900px)" srcSet="/images/founder-products/cytellect/cell-field-mobile-poster.webp" />
      <Image className={styles.cellPoster} src="/images/founder-products/cytellect/cell-field-poster.webp" width={1120} height={640} sizes="(max-width: 900px) 100vw, 550px" alt="" loading="eager" />
    </picture>
  </div>;
}
