"use client";

import { useEffect, useRef, useState } from "react";
import type { HallController } from "./futureHallScene";

/** This small shell never imports Three.js or requests a model on Mobile. */
export function FutureLectureHall() {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<HallController | null>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const desktop = matchMedia("(min-width: 681px)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let generation = 0;
    let abort: AbortController | undefined;
    let unmounted = false;
    const update = async () => {
      const current = ++generation;
      abort?.abort();
      controllerRef.current?.dispose();
      controllerRef.current = null;
      setReady(false);
      host.dataset.renderState = "poster";
      host.dataset.motionState = "paused";
      if (!desktop.matches || reduced.matches) return;
      const request = new AbortController();
      abort = request;
      host.dataset.renderState = "loading";
      host.dataset.loadStage = "module";
      try {
        const { createFutureHall } = await import("./futureHallScene");
        if (unmounted || current !== generation) return;
        const controller = await createFutureHall(host, request.signal, () => {
          if (!unmounted && current === generation) setReady(false);
        });
        if (unmounted || current !== generation) {
          controller.dispose();
          return;
        }
        controllerRef.current = controller;
        controller.setPaused(pausedRef.current);
        host.dataset.renderState = "ready";
        setReady(true);
      } catch {
        if (!unmounted && current === generation) {
          host.dataset.renderState = "fallback";
          host.dataset.motionState = "paused";
        }
      }
    };
    void update();
    desktop.addEventListener("change", update);
    reduced.addEventListener("change", update);
    return () => {
      unmounted = true;
      generation += 1;
      abort?.abort();
      controllerRef.current?.dispose();
      controllerRef.current = null;
      desktop.removeEventListener("change", update);
      reduced.removeEventListener("change", update);
    };
  }, []);

  return (
    <div className="future-hall">
      <div className="future-hall__scene" ref={hostRef} aria-hidden="true" data-render-state="poster" data-motion-state="paused">
        <picture>
          <source media="(min-width: 681px)" srcSet="/interactive/future-hall/poster.webp" />
          {/* A transparent inline Mobile source prevents hidden-image downloads. */}
          <img className="future-hall__poster" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="" width="1920" height="1200" fetchPriority="high" />
        </picture>
      </div>
      <div className="future-hall__veil" aria-hidden="true" />
      {ready && (
        <button className="future-hall__motion" type="button" aria-pressed={paused} onClick={() => {
          const next = !paused;
          pausedRef.current = next;
          setPaused(next);
          controllerRef.current?.setPaused(next);
        }}>
          <span aria-hidden="true">{paused ? "▷" : "Ⅱ"}</span>
          {paused ? "背景を再生" : "背景を停止"}
        </button>
      )}
    </div>
  );
}
