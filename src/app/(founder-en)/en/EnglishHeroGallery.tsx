"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { heroSlides } from "./content";
import styles from "./english-founder.module.css";

const intervalMs = 8_000;

export function EnglishHeroGallery() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      if (!document.hidden) {
        setActiveIndex((current) => (current + 1) % heroSlides.length);
      }
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <div
      className={styles.heroGallery}
      role="region"
      aria-roledescription="carousel"
      aria-label="Portraits of Yuto Matsui"
    >
      <div className={styles.heroAperture} aria-live="off">
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
              sizes="(min-width: 1101px) 43vw, (min-width: 701px) 48vw, 88vw"
              style={{ objectPosition: slide.position }}
            />
          </figure>
        ))}
        <span className={styles.heroApertureRule} aria-hidden="true" />
      </div>

      <div className={styles.heroGalleryControls}>
        <div className={styles.heroDots} aria-label="Select a portrait">
          {heroSlides.map((slide, index) => (
            <button
              key={slide.src}
              type="button"
              aria-label={`Show portrait ${index + 1}`}
              aria-pressed={activeIndex === index}
              data-active={activeIndex === index}
              onClick={() => setActiveIndex(index)}
            >
              <span />
            </button>
          ))}
        </div>
        <span className={styles.heroGalleryMeta} aria-hidden="true">
          {String(activeIndex + 1).padStart(2, "0")} / {String(heroSlides.length).padStart(2, "0")} · {heroSlides[activeIndex].label}
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

