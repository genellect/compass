"use client";

import { useEffect, useRef } from "react";
import styles from "./founder.module.css";

// Small orthographically projected ribbon surfaces: no WebGL, textures or loader.
// The same deterministic geometry is rendered on the server as the static fallback.
const COLORS = [[60, 143, 122], [81, 117, 197], [187, 142, 69]];
const SEGMENTS = 36;

function ribbonFrame(time: number) {
  const faces: { d: string; fill: string; z: number }[] = [];
  for (let ribbon = 0; ribbon < 3; ribbon++) {
    const phase = time * (Math.PI * 2 / 18) + ribbon * 2.1;
    const tilt = 0.48 + Math.sin(phase * 0.6) * 0.26;
    const point = (t: number, side: number) => {
      const angle = t * Math.PI * 1.6 + phase;
      const twist = angle * 0.6 + ribbon;
      const x = -18 + t * 466;
      const y = Math.sin(angle) * 20 + side * 3 * Math.cos(twist);
      const z = Math.cos(angle) * 12 + side * 3 * Math.sin(twist);
      return { x, y: 35 + y * Math.cos(tilt) - z * Math.sin(tilt), z: y * Math.sin(tilt) + z * Math.cos(tilt) };
    };
    for (let i = 0; i < SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const p = [point(t, -1), point((i + 1) / SEGMENTS, -1), point((i + 1) / SEGMENTS, 1), point(t, 1)];
      const light = 0.8 + 0.2 * Math.abs(Math.cos(t * Math.PI * 0.96 + phase * 0.6 + ribbon));
      faces.push({
        d: p.map((v, n) => `${n ? "L" : "M"}${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(" ") + "Z",
        fill: `rgb(${COLORS[ribbon].map(c => Math.round(c * light + 247 * (1 - light))).join(" ")})`,
        z: p.reduce((sum, v) => sum + v.z, 0) / 4
      });
    }
  }
  return faces.sort((a, b) => a.z - b.z);
}

const STILL = ribbonFrame(0);

export function MobileHeroRibbons({ paused }: { paused: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const elapsed = useRef(0);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const mobile = matchMedia("(max-width: 640px)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const paths = Array.from(element.querySelectorAll("path"));
    let visible = true;
    let raf = 0;
    let previous = 0;
    const running = () => mobile.matches && !reduced.matches && !paused && !document.hidden && visible;
    const tick = (now: number) => {
      if (!running()) { raf = 0; return; }
      if (!previous) previous = now;
      if (now - previous >= 1000 / 24) {
        elapsed.current += Math.min(now - previous, 100) / 1000;
        previous = now;
        ribbonFrame(elapsed.current).forEach((face, i) => {
          paths[i].setAttribute("d", face.d);
          paths[i].setAttribute("fill", face.fill);
          paths[i].setAttribute("stroke", face.fill);
        });
      }
      raf = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      previous = 0;
      if (running()) raf = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(element);
    mobile.addEventListener("change", sync);
    reduced.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      mobile.removeEventListener("change", sync);
      reduced.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [paused]);

  return <svg ref={svg} className={styles.mobileHeroSignals} viewBox="0 0 430 70" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    {STILL.map((face, i) => <path key={i} d={face.d} fill={face.fill} stroke={face.fill} strokeWidth="0.25" />)}
  </svg>;
}
