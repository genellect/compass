"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { fragmentPhotos, fragmentPreview, type FragmentPhoto } from "./content";
import styles from "./english-founder.module.css";

const previewIntervalMs = 9_000;
const resumeDelayMs = 4_000;

function Photo({
  photo,
  className,
  duplicate = false,
  dataAttribute
}: {
  photo: FragmentPhoto;
  className: string;
  duplicate?: boolean;
  dataAttribute?: "preview" | "archive" | "mobile";
}) {
  return (
    <figure
      className={className}
      data-tone={photo.tone}
      data-preview-photo={dataAttribute === "preview" ? photo.key : undefined}
      data-archive-photo={dataAttribute === "archive" ? photo.key : undefined}
      data-mobile-archive-photo={dataAttribute === "mobile" ? photo.key : undefined}
      aria-hidden={duplicate || undefined}
    >
      <Image
        src={photo.src}
        alt={duplicate ? "" : photo.alt}
        width={photo.width}
        height={photo.height}
        sizes="(min-width: 901px) 42vw, (min-width: 701px) 56vw, 82vw"
        loading="lazy"
        style={{ objectPosition: photo.position }}
      />
    </figure>
  );
}

export function EnglishFragments() {
  const [expanded, setExpanded] = useState(false);
  const [activePreview, setActivePreview] = useState(0);
  const mobileRailRef = useRef<HTMLDivElement>(null);
  const manuallyPausedRef = useRef(false);
  const resumeTimerRef = useRef<number | null>(null);

  const desktopRows = useMemo(() => [
    fragmentPhotos.filter((_, index) => index % 2 === 0),
    fragmentPhotos.filter((_, index) => index % 2 === 1)
  ], []);

  useEffect(() => {
    if (expanded || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      if (!document.hidden) {
        setActivePreview((current) => (current + 1) % fragmentPreview.length);
      }
    }, previewIntervalMs);

    return () => window.clearInterval(timer);
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;

    const rail = mobileRailRef.current;
    const mobileQuery = window.matchMedia("(max-width: 700px)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!rail || !mobileQuery.matches || motionQuery.matches) return;

    let frame = 0;
    let lastTime = performance.now();
    const move = (time: number) => {
      const elapsed = Math.min(time - lastTime, 64);
      lastTime = time;

      if (!manuallyPausedRef.current && !document.hidden) {
        rail.scrollLeft += elapsed * 0.018;
        const loopPoint = rail.scrollWidth / 2;
        if (loopPoint > 0 && rail.scrollLeft >= loopPoint) rail.scrollLeft -= loopPoint;
      }
      frame = window.requestAnimationFrame(move);
    };

    frame = window.requestAnimationFrame(move);
    return () => window.cancelAnimationFrame(frame);
  }, [expanded]);

  useEffect(() => () => {
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
  }, []);

  const pauseForInteraction = () => {
    manuallyPausedRef.current = true;
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => {
      manuallyPausedRef.current = false;
    }, resumeDelayMs);
  };

  return (
    <section id="fragments" className={styles.fragments} aria-labelledby="fragments-title">
      <div className={styles.sectionShell}>
        <header className={styles.fragmentsHeading}>
          <div>
            <p className={styles.sectionIndex}>06 / Archive</p>
            <h2 id="fragments-title">FRAGMENTS</h2>
          </div>
          <p>Research, systems, cities, and the quiet moments between them.</p>
        </header>

        <div
          id="english-fragments-preview"
          className={styles.fragmentsPreview}
          hidden={expanded}
          aria-hidden={expanded}
        >
          {fragmentPreview.map((photo, index) => {
            const offset = (index - activePreview + fragmentPreview.length) % fragmentPreview.length;
            return (
              <div
                key={photo.key}
                className={styles.previewSlot}
                data-offset={offset}
                aria-hidden={offset > 2}
              >
                <Photo photo={photo} className={styles.previewPhoto} dataAttribute="preview" />
              </div>
            );
          })}
          <div className={styles.previewCounter} aria-hidden="true">
            <span>{String(activePreview + 1).padStart(2, "0")}</span>
            <span />
            <span>{String(fragmentPreview.length).padStart(2, "0")}</span>
          </div>
        </div>

        <div
          id="english-fragments-archive"
          className={styles.fragmentsArchive}
          hidden={!expanded}
          aria-hidden={!expanded}
        >
          <div className={styles.desktopArchive}>
            {desktopRows.map((row, rowIndex) => (
              <div key={rowIndex} className={styles.archiveViewport}>
                <div className={styles.archiveTrack} data-row={rowIndex + 1}>
                  {[false, true].map((duplicate) => (
                    <div key={duplicate ? "duplicate" : "primary"} className={styles.archiveGroup}>
                      {row.map((photo) => (
                        <Photo
                          key={`${photo.key}-${duplicate ? "duplicate" : "primary"}`}
                          photo={photo}
                          className={styles.archivePhoto}
                          duplicate={duplicate}
                          dataAttribute={duplicate ? undefined : "archive"}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div
            ref={mobileRailRef}
            className={styles.mobileArchive}
            aria-label="Scrollable photo archive"
            onPointerDown={pauseForInteraction}
            onTouchStart={pauseForInteraction}
            onWheel={pauseForInteraction}
            onKeyDown={pauseForInteraction}
          >
            {[false, true].map((duplicate) => (
              <div key={duplicate ? "duplicate" : "primary"} className={styles.mobileArchiveGroup}>
                {fragmentPhotos.map((photo) => (
                  <Photo
                    key={`${photo.key}-${duplicate ? "duplicate" : "primary"}`}
                    photo={photo}
                    className={styles.mobileArchivePhoto}
                    duplicate={duplicate}
                    dataAttribute={duplicate ? undefined : "mobile"}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          className={styles.disclosureButton}
          aria-expanded={expanded}
          aria-controls="english-fragments-archive"
          onClick={() => setExpanded((current) => !current)}
        >
          <span>{expanded ? "Close archive" : "Open the full archive — 19 images"}</span>
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        </button>
      </div>
    </section>
  );
}
