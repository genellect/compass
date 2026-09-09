"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { FragmentFilm, FragmentFilmAtmosphere } from "../../(official)/founder/FragmentFilm";
import { fragmentPhotos, type FragmentPhoto } from "./content";
import styles from "./english-founder.module.css";

const resumeDelayMs = 4_000;

function Photo({
  photo,
  duplicate,
  rhythm
}: {
  photo: FragmentPhoto;
  duplicate: boolean;
  rhythm: number;
}) {
  return (
    <figure
      className={styles.fragmentRailPhoto}
      data-tone={photo.tone}
      data-rhythm={rhythm}
      data-fragment-photo={duplicate ? undefined : photo.key}
      aria-hidden={duplicate || undefined}
    >
      <Image
        src={photo.src}
        alt={duplicate ? "" : photo.alt}
        width={photo.width}
        height={photo.height}
        sizes="(min-width: 901px) 38vw, (min-width: 701px) 52vw, 78vw"
        loading="lazy"
        draggable={false}
        style={{ objectPosition: photo.position }}
      />
    </figure>
  );
}

export function EnglishFragments() {
  const railRef = useRef<HTMLDivElement>(null);
  const manuallyPausedRef = useRef(false);
  const resumeTimerRef = useRef<number | null>(null);
  const dragRef = useRef({ active: false, startX: 0, startScroll: 0 });
  const [view, setView] = useState<"3d" | "original">("3d");
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 901px) and (orientation: landscape)");
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!rail || motionQuery.matches || (wide && view === "3d")) return;

    let frame = 0;
    let lastTime = performance.now();
    const move = (time: number) => {
      const elapsed = Math.min(time - lastTime, 64);
      lastTime = time;

      if (!manuallyPausedRef.current && !dragRef.current.active && !document.hidden) {
        rail.scrollLeft += elapsed * 0.024;
        const loopPoint = rail.scrollWidth / 2;
        if (loopPoint > 0 && rail.scrollLeft >= loopPoint) rail.scrollLeft -= loopPoint;
      }
      frame = window.requestAnimationFrame(move);
    };

    frame = window.requestAnimationFrame(move);
    return () => window.cancelAnimationFrame(frame);
  }, [view, wide]);

  useEffect(() => () => {
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
  }, []);

  const holdAutoMotion = () => {
    manuallyPausedRef.current = true;
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
  };

  const resumeAutoMotionLater = () => {
    holdAutoMotion();
    resumeTimerRef.current = window.setTimeout(() => {
      manuallyPausedRef.current = false;
    }, resumeDelayMs);
  };

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    holdAutoMotion();
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startScroll: event.currentTarget.scrollLeft
    };
    event.currentTarget.dataset.dragging = "true";
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    event.preventDefault();
    event.currentTarget.scrollLeft = dragRef.current.startScroll - (event.clientX - dragRef.current.startX);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    event.currentTarget.dataset.dragging = "false";
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resumeAutoMotionLater();
  };

  return (
    <section id="fragments" className={styles.fragments} aria-labelledby="fragments-title" data-fragment-view={view}>
      <FragmentFilmAtmosphere variant="en" />
      <div className={styles.sectionShell}>
        <header className={styles.fragmentsHeading}>
          <div>
            <p className={styles.sectionIndex}>06 / Archive</p>
            <h2 id="fragments-title">FRAGMENTS</h2>
          </div>
          <p>Research, systems, cities, and the quiet moments between them.</p>
          <div className={styles.fragmentViewSwitch} role="group" aria-label="FRAGMENTS presentation">
            <button type="button" aria-pressed={view === "3d"} aria-controls="english-fragment-film" onClick={() => setView("3d")}>3D</button>
            <button type="button" aria-pressed={view === "original"} aria-controls="english-fragment-original" onClick={() => setView("original")}>Original</button>
          </div>
        </header>

        <div className={styles.fragmentFilmView} id="english-fragment-film">
          <FragmentFilm photos={fragmentPhotos} active={wide && view === "3d"} language="en" />
        </div>
        <div
          ref={railRef}
          className={styles.fragmentsRail}
          id="english-fragment-original"
          role="region"
          tabIndex={0}
          aria-label="Scrollable photo archive"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onTouchStart={holdAutoMotion}
          onTouchEnd={resumeAutoMotionLater}
          onWheel={resumeAutoMotionLater}
          onKeyDown={resumeAutoMotionLater}
        >
          {[false, true].map((duplicate) => (
            <div
              key={duplicate ? "duplicate" : "primary"}
              className={styles.fragmentRailGroup}
              aria-hidden={duplicate || undefined}
            >
              {fragmentPhotos.map((photo, index) => (
                <Photo
                  key={`${photo.key}-${duplicate ? "duplicate" : "primary"}`}
                  photo={photo}
                  duplicate={duplicate}
                  rhythm={index % 5}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
