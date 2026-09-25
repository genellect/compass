"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./night-backdrop.module.css";

/** Reuses the approved Blender plate and filmed water without loading a 3D engine. */
export function NightBackdrop({ scene }: { scene: "manifesto" | "community" }) {
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const media = matchMedia("(min-width: 901px) and (prefers-reduced-motion: no-preference)");
    const sync = () => setMoving(media.matches && !document.hidden && !paused);
    sync();
    media.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      media.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [paused]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (moving) {
      element.src ||= "/habitat/night-v1/reflections.mp4";
      void element.play().catch(() => {});
    } else element.pause();
  }, [moving]);

  return <>
    <div className={styles.backdrop} data-night-backdrop={scene} data-moving={moving} aria-hidden="true"
      style={{ "--night-plate": `url(/habitat/night-v1/${scene}.webp)`, "--night-water": `url(/habitat/night-v1/${scene}.water.webp)` } as CSSProperties}>
      <div className={styles.scene}><div className={styles.plate} /><div className={styles.water}><video ref={video} muted loop playsInline preload="none" /></div></div>
      <div className={styles.shade} />
    </div>
    <button className={styles.control} type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>
      {paused ? "背景の動きを再開" : "背景の動きを停止"}
    </button>
  </>;
}
