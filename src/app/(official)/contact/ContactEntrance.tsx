"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./contact-entry.module.css";

type Target = "representative" | "compass";
type Props = { onSelect: (target: Target) => void; onComplete: () => void };
const mediaRoot = "/media/contact-entry";

/** Blender-authored films are presentation only. Destination is committed first. */
export function ContactEntrance({ onSelect, onComplete }: Props) {
  const [selected, setSelected] = useState<Target | null>(null);
  const [layout, setLayout] = useState<"desktop" | "mobile">("desktop");
  const [finishing, setFinishing] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const completed = useRef(false);

  useEffect(() => {
    if (selected) return;
    const mobile = matchMedia("(max-width: 700px)");
    const sync = () => setLayout(mobile.matches ? "mobile" : "desktop");
    sync();
    mobile.addEventListener("change", sync);
    return () => mobile.removeEventListener("change", sync);
  }, [selected]);

  const finish = () => {
    if (completed.current) return;
    completed.current = true;
    video.current?.pause();
    onComplete();
  };
  const finishRef = useRef(finish);
  useEffect(() => { finishRef.current = finish; });

  useEffect(() => {
    if (!selected) return;
    const element = video.current;
    if (!element) return;
    let started = false;
    const loadDeadline = window.setTimeout(() => { if (!started) finishRef.current(); }, 800);
    const totalDeadline = window.setTimeout(() => finishRef.current(), 2700);
    const playing = () => { started = true; window.clearTimeout(loadDeadline); };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const onReduced = () => { if (reduced.matches) finishRef.current(); };
    const onHidden = () => { if (document.hidden) finishRef.current(); };
    element.addEventListener("playing", playing);
    reduced.addEventListener("change", onReduced);
    document.addEventListener("visibilitychange", onHidden);
    skip.current?.focus({ preventScroll: true });
    void element.play().catch(() => finishRef.current());
    return () => {
      window.clearTimeout(loadDeadline);
      window.clearTimeout(totalDeadline);
      element.removeEventListener("playing", playing);
      reduced.removeEventListener("change", onReduced);
      document.removeEventListener("visibilitychange", onHidden);
      element.pause();
    };
  }, [selected]);

  const choose = (target: Target) => {
    if (selected || completed.current) return;
    onSelect(target);
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || saveData) { finish(); return; }
    // Freeze the framing through playback, including device rotation.
    setLayout(matchMedia("(max-width: 700px)").matches ? "mobile" : "desktop");
    setSelected(target);
  };

  return (
    <section className={styles.entrance} aria-labelledby={selected ? undefined : "target-title"} aria-label={selected ? "入室しています" : undefined} data-contact-entrance>
      <div className={styles.scene} data-entering={Boolean(selected)} data-finishing={finishing}>
        <picture className={styles.poster}>
          <source media="(max-width: 700px)" srcSet={`${mediaRoot}/lobby-mobile.webp`} />
          {/* The first rendered frame exactly matches both branch films. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${mediaRoot}/lobby-desktop.webp`} alt="" width="1280" height="720" fetchPriority="high" />
        </picture>
        <div className={styles.shade} />
        {!selected ? <>
          <div className={styles.heading}>
            <p>DESTINATION</p>
            <h2 id="target-title">どちらへのご連絡ですか？</h2>
          </div>
          <div className={styles.doors}>
            <button className={styles.door} type="button" onClick={() => choose("representative")} data-door="representative">
              <span className={styles.number}>01 / 執務室</span>
              <span className={styles.room}>Yuto Matsui</span>
              <span className={styles.access} aria-hidden="true">◈ TOUCH TO ENTER</span>
              <span className={styles.label}>代表へのご連絡 <span aria-hidden="true">↗</span></span>
            </button>
            <button className={styles.door} type="button" onClick={() => choose("compass")} data-door="compass">
              <span className={styles.number}>02 / 会議室</span>
              <span className={styles.room}>COMPASS</span>
              <span className={styles.access} aria-hidden="true">◈ TOUCH TO ENTER</span>
              <span className={styles.label}>COMPASSへのお問い合わせ <span aria-hidden="true">↗</span></span>
              <span className={styles.description}>活動・サービスに関する公式窓口</span>
            </button>
          </div>
        </> : <>
          <video ref={video} className={styles.film} src={`${mediaRoot}/${selected}-${layout}.mp4`} muted playsInline preload="auto" aria-hidden="true" onEnded={finish} onError={finish} onTimeUpdate={() => { if ((video.current?.currentTime ?? 0) >= 1.7) setFinishing(true); }} />
          <div className={styles.fade} />
          <p className={styles.status} role="status">{selected === "representative" ? "Yuto Matsui" : "COMPASS"} — 入室しています</p>
          <button ref={skip} type="button" className={styles.skip} onClick={finish}>スキップ <span aria-hidden="true">→</span></button>
        </>}
      </div>
      {!selected ? <button className={styles.bypass} type="button" onClick={finish}>演出なしで入力へ <span aria-hidden="true">→</span></button> : null}
    </section>
  );
}
