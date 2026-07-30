"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./future-strategy-library.module.css";

const memberCount = 73;
const materialCount = 100;

export function LibraryStats() {
  const sectionRef = useRef<HTMLElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const hasAnimatedRef = useRef(false);
  const [isActive, setIsActive] = useState(false);
  const [counts, setCounts] = useState({ members: 0, materials: 0 });

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const finish = () => {
      setIsActive(true);
      setCounts({ members: memberCount, materials: materialCount });
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }

    const startCounting = () => {
      if (hasAnimatedRef.current) return;
      hasAnimatedRef.current = true;
      setIsActive(true);

      const startedAt = performance.now();
      const duration = 1600;
      const tick = (now: number) => {
        const progress = Math.min((now - startedAt) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);

        setCounts({
          members: Math.round(memberCount * eased),
          materials: Math.round(materialCount * eased)
        });

        if (progress < 1) animationFrameRef.current = requestAnimationFrame(tick);
      };

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        startCounting();
        observer.disconnect();
      },
      { threshold: 0.28 }
    );

    observer.observe(section);

    return () => {
      observer.disconnect();
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`${styles.statsSection} ${isActive ? styles.statsActive : ""}`}
      aria-labelledby="library-stats-title"
    >
      <div className={styles.statsOrbit} aria-hidden="true" />
      <div className={styles.sectionShell}>
        <header className={styles.statsIntro}>
          <h2 id="library-stats-title">
            <span>数字で見る、</span>
            <span>未来戦略ライブラリ</span>
          </h2>
          <p>学生の「知りたかった」を、少しずつ形にしてきました。</p>
        </header>

        <div className={styles.statsGrid}>
          <article className={styles.statCard} aria-label="創設日 2024年2月">
            <p className={`${styles.statValue} ${styles.statDate}`} aria-hidden="true">2024<span>.02</span></p>
            <p className={styles.statLabel}>創設日</p>
          </article>

          <article className={`${styles.statCard} ${styles.statCardLive}`} aria-label={`登録者数 ${memberCount}名以上 2026年6月時点`}>
            <p className={styles.statValue} aria-hidden="true">
              <span data-count-target={memberCount}>{counts.members}</span><small className={styles.statPlus}>+</small>
            </p>
            <p className={styles.statLabel}>登録者数 <span>(2026年6月時点）</span></p>
          </article>

          <article className={styles.statCard} aria-label={`掲載資料数 ${materialCount}点以上`}>
            <p className={styles.statValue} aria-hidden="true">
              <span data-count-target={materialCount}>{counts.materials}</span><small className={styles.statPlus}>+</small>
            </p>
            <p className={styles.statLabel}>掲載資料数</p>
          </article>
        </div>
      </div>
    </section>
  );
}
