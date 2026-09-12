"use client";

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";
import styles from "./portfolio-depth.module.css";

type Props = ComponentPropsWithoutRef<"article"> & {
  depth: "expertise" | "experience" | "photo";
  editorial?: boolean;
};

const MOTION = "(min-width: 901px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

/** Static HTML first; only the card under the pointer schedules animation frames. */
export function DepthCard({ depth, editorial = false, className, children, ...props }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const media = window.matchMedia(MOTION);
    let frame = 0;
    let last = 0;
    let x = 0;
    let y = 0;
    let targetX = 0;
    let targetY = 0;
    let lift = 0;
    let targetLift = 0;
    let bounds: DOMRect | undefined;
    let entrance: Animation | undefined;
    let appeared = false;
    const angle = depth === "experience" ? 1.6 : depth === "expertise" ? (editorial ? 3.2 : 5.2) : editorial ? 2 : 3.4;

    const paint = () => {
      element.style.setProperty("--depth-rx", `${-y * angle}deg`);
      element.style.setProperty("--depth-ry", `${x * angle}deg`);
      element.style.setProperty("--depth-px", `${x * 2}px`);
      element.style.setProperty("--depth-py", `${y * 2}px`);
      element.style.setProperty("--depth-lift", `${-lift * (depth === "experience" ? 3 : depth === "expertise" ? 8 : 5)}px`);
    };
    const draw = (now: number) => {
      frame = 0;
      const blend = 1 - Math.exp(-Math.min(last ? now - last : 16, 40) / 65);
      last = now;
      x += (targetX - x) * blend;
      y += (targetY - y) * blend;
      lift += (targetLift - lift) * blend;
      if (Math.abs(targetX - x) + Math.abs(targetY - y) + Math.abs(targetLift - lift) < 0.002) {
        x = targetX;
        y = targetY;
        lift = targetLift;
        last = 0;
        if (!lift) element.removeAttribute("data-depth-moving");
      } else {
        frame = requestAnimationFrame(draw);
      }
      paint();
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = last = x = y = targetX = targetY = lift = targetLift = 0;
      bounds = undefined;
      element.removeAttribute("data-depth-active");
      element.removeAttribute("data-depth-moving");
      entrance?.cancel();
      paint();
    };
    const move = (event: PointerEvent) => {
      if (!media.matches || event.pointerType === "touch" || document.hidden) return;
      if (element.hasAttribute("data-photo-open")) return;
      if (!bounds) bounds = element.getBoundingClientRect();
      entrance?.cancel();
      element.dataset.depthActive = "true";
      element.dataset.depthMoving = "true";
      targetLift = 1;
      targetX = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      targetY = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      schedule();
    };
    const leave = () => {
      bounds = undefined;
      targetX = targetY = 0;
      targetLift = 0;
      element.removeAttribute("data-depth-active");
      if (media.matches) schedule();
      else reset();
    };
    const sync = () => {
      reset();
      element.dataset.depthEnabled = String(media.matches);
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) { reset(); return; }
      if (appeared || !media.matches || document.hidden) return;
      appeared = true;
      // One short arrival, never a looping float. The reading surface stays visible.
      if (depth !== "expertise") return;
      const index = Array.from(element.parentElement?.children ?? []).indexOf(element);
      entrance = element.animate([
        { transform: "perspective(1200px) translateY(16px) rotateX(5deg)" },
        { transform: "perspective(1200px) translateY(0) rotateX(0deg)" },
      ], { duration: 620, delay: editorial ? 0 : Math.max(0, index) * 65, easing: "cubic-bezier(.22,.7,.2,1)" });
    }, { threshold: 0.12 });

    sync();
    observer.observe(element);
    element.addEventListener("pointerenter", move);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerleave", leave);
    element.addEventListener("pointercancel", reset);
    media.addEventListener("change", sync);
    window.addEventListener("resize", reset);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset);
    return () => {
      reset();
      observer.disconnect();
      element.removeEventListener("pointerenter", move);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", leave);
      element.removeEventListener("pointercancel", reset);
      media.removeEventListener("change", sync);
      window.removeEventListener("resize", reset);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, [depth, editorial]);

  return <article {...props} ref={ref} className={`${className ?? ""} ${styles.card}`}
    data-depth-card={depth} data-depth-editorial={editorial || undefined}>{children}</article>;
}
