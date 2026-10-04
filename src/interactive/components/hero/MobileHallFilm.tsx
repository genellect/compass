"use client";

import { useEffect, useRef, useState } from "react";

/** A portrait render of the Desktop scene, without its WebGL cost on phones. */
export function MobileHallFilm() {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pausedRef = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const mobile = matchMedia("(max-width: 680px)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }).connection;
    const update = () => setEnabled(mobile.matches && !reduced.matches && !connection?.saveData);
    update();
    mobile.addEventListener("change", update);
    reduced.addEventListener("change", update);
    connection?.addEventListener("change", update);
    return () => {
      mobile.removeEventListener("change", update);
      reduced.removeEventListener("change", update);
      connection?.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const video = videoRef.current;
    if (!enabled || !video || !host) return;
    let visible = true;
    let disposed = false;
    let failed = false;
    const sync = () => {
      if (disposed || failed) return;
      if (visible && document.visibilityState === "visible" && !pausedRef.current) {
        void video.play().catch(() => {
          if (disposed || failed || !visible || document.visibilityState !== "visible") return;
          pausedRef.current = true;
          setPaused(true);
        });
      } else video.pause();
    };
    const playing = () => { host.dataset.renderState = "ready"; host.dataset.motionState = "running"; };
    const stopped = () => { host.dataset.motionState = "paused"; };
    const ready = () => { setLoaded(true); };
    const error = () => { failed = true; video.pause(); host.dataset.renderState = "fallback"; setLoaded(false); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? false; sync(); });
    observer.observe(host);
    video.addEventListener("loadeddata", ready);
    video.addEventListener("playing", playing);
    video.addEventListener("pause", stopped);
    video.addEventListener("error", error);
    document.addEventListener("visibilitychange", sync);
    // No src is assigned until the Mobile and motion preferences are known.
    video.src = "/interactive/future-hall/mobile-hall.mp4";
    video.load();
    sync();
    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      video.removeEventListener("loadeddata", ready);
      video.removeEventListener("playing", playing);
      video.removeEventListener("pause", stopped);
      video.removeEventListener("error", error);
      video.pause(); video.removeAttribute("src"); video.load();
      host.dataset.renderState = "poster"; host.dataset.motionState = "paused";
      setLoaded(false);
    };
  }, [enabled]);

  return (
    <div className="mobile-hall-film" ref={hostRef} data-render-state="poster" data-motion-state="paused">
      <picture>
        <source media="(max-width: 680px)" srcSet="/interactive/future-hall/mobile-poster.webp" />
        <img className="mobile-hall-film__poster" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="" width="720" height="1280" fetchPriority="high" />
      </picture>
      {enabled && <video ref={videoRef} className="mobile-hall-film__video" muted loop playsInline preload="auto" aria-hidden="true" disablePictureInPicture />}
      <div className="mobile-hall-film__veil" aria-hidden="true" />
      {enabled && loaded && <button type="button" className="mobile-hall-film__motion" aria-pressed={paused} onClick={() => {
        const next = !pausedRef.current;
        pausedRef.current = next; setPaused(next);
        if (next) videoRef.current?.pause();
        else void videoRef.current?.play().catch(() => { pausedRef.current = true; setPaused(true); });
      }}><span aria-hidden="true">{paused ? "▷" : "Ⅱ"}</span>{paused ? "背景を再生" : "背景を停止"}</button>}
    </div>
  );
}
