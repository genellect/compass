"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import styles from "./founder.module.css";

const SLIDES = [
  {
    src: "/images/founder-portfolio/yuto-matsui-profile-hero.webp",
    alt: "横顔のYuto Matsui / 松井優知",
    location: "PORTRAIT / SIDE",
    motion: "from-left"
  },
  {
    src: "/images/founder-portfolio/yuto-matsui-nagano-lake-hero-20260831.webp",
    alt: "長野の湖と山々を背景に立つYuto Matsui / 松井優知",
    location: "NAGANO / NATURE",
    motion: "from-right"
  },
  {
    src: "/images/founder-portfolio/yuto-matsui-lab-hero.webp",
    alt: "分析機器が並ぶ研究室で微笑むYuto Matsui / 松井優知",
    location: "LAB / LIFE SCIENCE",
    motion: "soft-rise"
  }
] as const;

const INTERVAL_MS = 5200;

export function FounderHeroGallery() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const signals = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 640px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (paused || reduced.matches || !mobile.matches || document.hidden) signals.current?.pauseAnimations();
      else signals.current?.unpauseAnimations();
    };
    sync();
    mobile.addEventListener("change", sync);
    reduced.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      mobile.removeEventListener("change", sync);
      reduced.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [paused]);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      if (!document.hidden && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setActiveIndex((current) => (current + 1) % SLIDES.length);
      }
    }, INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <div
      className={styles.heroPhoto}
      role="region"
      aria-roledescription="carousel"
      aria-label="Yuto Matsui ポートレート"
      data-paused={paused}
    >
      <div className={styles.photoFrame} aria-live="off">
        {SLIDES.map((slide, index) => (
          <figure
            key={slide.src}
            className={styles.photoSlide}
            data-active={index === activeIndex}
            data-motion={slide.motion}
            aria-hidden={index !== activeIndex}
          >
            <Image
              src={slide.src}
              alt={index === activeIndex ? slide.alt : ""}
              fill
              priority
              sizes="(min-width: 901px) 46vw, (max-width: 640px) 100vw, 88vw"
            />
          </figure>
        ))}
        <div className={styles.photoScan} aria-hidden="true" />
      </div>

      <svg ref={signals} className={styles.mobileHeroSignals} viewBox="0 0 430 100" preserveAspectRatio="none" aria-hidden="true">
        <g className={styles.mobileSignalBio}>
          <path d="M-20 15 C110 15 130 83 252 54 S382 8 450 24" />
          <circle r="2.5"><animateMotion dur="10.4s" repeatCount="indefinite" path="M-20 15 C110 15 130 83 252 54 S382 8 450 24" /></circle>
        </g>
        <g className={styles.mobileSignalAi}>
          <path d="M-20 60 C102 92 177 8 280 42 S391 92 450 62" />
          <circle r="2.5"><animateMotion dur="15.6s" repeatCount="indefinite" path="M-20 60 C102 92 177 8 280 42 S391 92 450 62" /></circle>
        </g>
        <g className={styles.mobileSignalEducation}>
          <path d="M-20 86 C97 26 165 92 283 63 S384 44 450 12" />
          <circle r="2.5"><animateMotion dur="13s" repeatCount="indefinite" path="M-20 86 C97 26 165 92 283 63 S384 44 450 12" /></circle>
        </g>
      </svg>

      <div className={styles.photoControls}>
        <div className={styles.photoDots} aria-label="表示する写真を選択">
          {SLIDES.map((slide, index) => (
            <button
              key={slide.src}
              type="button"
              data-active={index === activeIndex}
              aria-label={`写真 ${index + 1} を表示`}
              aria-pressed={index === activeIndex}
              onClick={() => setActiveIndex(index)}
            >
              <span />
            </button>
          ))}
        </div>
        <span className={styles.photoMeta} aria-hidden="true">
          {String(activeIndex + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")} · {SLIDES[activeIndex].location}
        </span>
        <button
          type="button"
          className={styles.pauseButton}
          aria-label={paused ? "写真の自動切替を再開" : "写真の自動切替を一時停止"}
          aria-pressed={paused}
          onClick={() => setPaused((current) => !current)}
        >
          <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>
        </button>
      </div>
    </div>
  );
}
