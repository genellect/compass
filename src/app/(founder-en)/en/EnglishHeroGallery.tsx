"use client";

import Image from "next/image";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { heroSlides } from "./content";
import styles from "./english-founder.module.css";

const intervalMs = 8_000;
const transitionMs = 1_040;
const segmentCount = 12;

type SegmentStyle = CSSProperties & {
  "--segment-delay": string;
  "--segment-image": string;
  "--segment-left": string;
  "--segment-mobile-position": string;
  "--segment-position": string;
  "--segment-right": string;
};

export function EnglishHeroGallery() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [enteringIndex, setEnteringIndex] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [cycle, setCycle] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);
  const transitionTimer = useRef<number | null>(null);
  const nextSlideRef = useRef<() => void>(() => {});

  const showSlide = useCallback((nextIndex: number) => {
    if (nextIndex === activeIndex || enteringIndex !== null) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setActiveIndex(nextIndex);
      setCycle((current) => current + 1);
      return;
    }

    setEnteringIndex(nextIndex);
    setCycle((current) => current + 1);

    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    transitionTimer.current = window.setTimeout(() => {
      setActiveIndex(nextIndex);
      setEnteringIndex(null);
      transitionTimer.current = null;
    }, transitionMs);
  }, [activeIndex, enteringIndex]);

  const showPrevious = useCallback(() => {
    showSlide((activeIndex - 1 + heroSlides.length) % heroSlides.length);
  }, [activeIndex, showSlide]);

  const showNext = useCallback(() => {
    showSlide((activeIndex + 1) % heroSlides.length);
  }, [activeIndex, showSlide]);

  useEffect(() => { nextSlideRef.current = showNext; }, [showNext]);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      if (!document.hidden) nextSlideRef.current();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [paused]);

  useEffect(() => () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
  }, []);

  useEffect(() => {
    const hero = rootRef.current?.closest<HTMLElement>("[data-hero-interface]");
    if (!hero) return;
    hero.dataset.heroCycle = String(cycle % 2);
    hero.dataset.heroPaused = String(paused);
  }, [cycle, paused]);

  useEffect(() => {
    const hero = rootRef.current?.closest<HTMLElement>("[data-hero-interface]");
    const precisePointer = window.matchMedia("(pointer: fine)");
    if (!hero || !precisePointer.matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const updatePointer = (event: PointerEvent) => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const bounds = hero.getBoundingClientRect();
        const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
        const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
        hero.style.setProperty("--hero-shift-x", `${(x * 6).toFixed(2)}px`);
        hero.style.setProperty("--hero-shift-y", `${(y * 4).toFixed(2)}px`);
      });
    };
    const resetPointer = () => {
      hero.style.setProperty("--hero-shift-x", "0px");
      hero.style.setProperty("--hero-shift-y", "0px");
    };

    hero.addEventListener("pointermove", updatePointer, { passive: true });
    hero.addEventListener("pointerleave", resetPointer);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      hero.removeEventListener("pointermove", updatePointer);
      hero.removeEventListener("pointerleave", resetPointer);
    };
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    pointerOrigin.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = pointerOrigin.current;
    pointerOrigin.current = null;
    if (!origin || event.pointerType === "mouse") return;

    const distanceX = event.clientX - origin.x;
    const distanceY = event.clientY - origin.y;
    if (Math.abs(distanceX) < 48 || Math.abs(distanceX) < Math.abs(distanceY) * 1.25) return;
    if (distanceX > 0) showPrevious();
    else showNext();
  };

  const enteringSlide = enteringIndex === null ? null : heroSlides[enteringIndex];
  const displayIndex = enteringIndex ?? activeIndex;

  return (
    <div
      ref={rootRef}
      className={styles.heroGallery}
      data-cycle={cycle % 2}
      data-transitioning={enteringIndex !== null}
      role="region"
      aria-roledescription="carousel"
      aria-label="Portraits of Yuto Matsui"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          showPrevious();
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          showNext();
        }
      }}
    >
      <div
        className={styles.heroVisual}
        aria-live="off"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { pointerOrigin.current = null; }}
      >
        {heroSlides.map((slide, index) => (
          <figure
            key={slide.src}
            className={styles.heroSlide}
            data-active={activeIndex === index}
            aria-hidden={activeIndex !== index}
          >
            <Image
              src={slide.src}
              alt={activeIndex === index ? slide.alt : ""}
              fill
              priority={index === 0}
              sizes="(min-width: 901px) 58vw, 100vw"
              style={{
                "--hero-position": slide.position,
                "--hero-mobile-position": slide.mobilePosition
              } as CSSProperties}
            />
          </figure>
        ))}

        {enteringSlide ? (
          <div className={styles.heroTransitionLayer} aria-hidden="true">
            {Array.from({ length: segmentCount }, (_, index) => {
              const start = (index * 100) / segmentCount;
              const end = ((index + 1) * 100) / segmentCount;
              const style: SegmentStyle = {
                "--segment-delay": `${index * 21}ms`,
                "--segment-image": `url(${enteringSlide.src})`,
                "--segment-left": `${start}%`,
                "--segment-mobile-position": enteringSlide.mobilePosition,
                "--segment-position": enteringSlide.position,
                "--segment-right": `${100 - end}%`
              };
              return <span key={`${enteringSlide.src}-${index}`} style={style} />;
            })}
          </div>
        ) : null}

        <span className={styles.heroVisualGradient} aria-hidden="true" />
        <span className={styles.heroSignalBoundary} aria-hidden="true" />
      </div>

      <div className={styles.heroSystemRail}>
        <div className={styles.heroProgress} aria-label="Select a portrait">
          {heroSlides.map((slide, index) => (
            <button
              key={slide.src}
              type="button"
              aria-label={`Show portrait ${index + 1}`}
              aria-pressed={activeIndex === index && enteringIndex === null}
              data-active={activeIndex === index && enteringIndex === null}
              data-entering={enteringIndex === index}
              onClick={() => showSlide(index)}
            >
              <span />
            </button>
          ))}
        </div>
        <span className={styles.heroGalleryMeta} aria-hidden="true">
          {String(displayIndex + 1).padStart(2, "0")} / {String(heroSlides.length).padStart(2, "0")} · {heroSlides[displayIndex].label}
        </span>
        <span className={styles.heroCoordinates} aria-hidden="true">
          35.68° N&nbsp;&nbsp;139.76° E&nbsp;&nbsp;2026 / TOKYO
        </span>
        <button
          type="button"
          className={styles.heroPause}
          aria-label={paused ? "Resume automatic portrait changes" : "Pause automatic portrait changes"}
          aria-pressed={paused}
          onClick={() => setPaused((current) => !current)}
        >
          <span aria-hidden="true">{paused ? "Play" : "Pause"}</span>
        </button>
      </div>
    </div>
  );
}
