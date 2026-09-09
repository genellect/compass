"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { FilmController, FilmPhoto } from "./fragment-film-engine";
import css from "./fragment-film.module.css";

export function FragmentFilm({ photos, active }: { photos: readonly FilmPhoto[]; active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<FilmController | null>(null);
  const pauseRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  useEffect(() => { pauseRef.current = paused; host.current?.dispatchEvent(new Event("film-motion-change")); }, [paused]);
  useEffect(() => {
    if (!active || fallback || !host.current) return;
    const element = host.current;
    let disposed = false;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      try {
        const { mountFilm } = await import("./fragment-film-engine");
        if (disposed) return;
        controller.current = mountFilm(element, photos, () => pauseRef.current, () => setReady(true), () => { setReady(false); setFallback(true); });
      } catch { if (!disposed) setFallback(true); }
    }, { rootMargin: "240px" });
    observer.observe(element);
    return () => { disposed = true; observer.disconnect(); controller.current?.dispose(); controller.current = null; setReady(false); };
  }, [active, fallback, photos]);
  return <div className={css.film} data-fragment-film data-ready={ready}>
    <div className={css.atmosphere} aria-hidden="true">
      <div className={css.lightField} />
      <div className={css.groundShadow} />
      <svg className={css.contours} viewBox="0 0 1440 700" preserveAspectRatio="none">
        <path d="M-120 545 C230 760 1150 665 1540 190" />
        <path d="M-80 562 C250 749 1190 644 1530 155" />
        <path d="M-160 578 C285 766 1200 613 1500 125" />
      </svg>
    </div>
    <div ref={host} className={css.viewport} tabIndex={ready ? 0 : -1} role="group" aria-label="湾曲した写真フィルム。左右キー、ドラッグ、横スクロールで移動" />
    <div className={css.fallback} tabIndex={ready ? -1 : 0} aria-label="FRAGMENTSの写真一覧">
      {photos.map(photo => <Image key={photo.key} src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} loading="lazy" draggable={false} />)}
    </div>
    {ready && <div className={css.controls}>
      <button type="button" onClick={() => controller.current?.step(-1)} aria-label="前の写真">←</button>
      <button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)} aria-label={paused ? "写真フィルムの自動送りを再開" : "写真フィルムの自動送りを一時停止"}>{paused ? "Play" : "Pause"}</button>
      <button type="button" onClick={() => controller.current?.step(1)} aria-label="次の写真">→</button>
    </div>}
  </div>;
}
