"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import styles from "./founder.module.css";

const SLIDES = [
  {
    src: "/images/founder-portfolio/yuto-matsui-profile-hero.webp",
    alt: "横顔のYuto Matsui / 松井優知",
    location: "PORTRAIT / SIDE",
    motion: "from-left"
  },
  {
    src: "/images/founder-portfolio/yuto-matsui-queens-square.webp",
    alt: "横浜の街角でベンチに座るYuto Matsui / 松井優知",
    location: "YOKOHAMA / CITY",
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

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      if (!document.hidden) {
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
              sizes="(min-width: 901px) 46vw, 88vw"
            />
          </figure>
        ))}
        <div className={styles.photoScan} aria-hidden="true" />
      </div>

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
