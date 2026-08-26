"use client";

import { useEffect, useRef } from "react";

type SignalNode = {
  path: 0 | 1;
  progress: number;
  phase: number;
  tone: 0 | 1 | 2;
  weight: number;
};

const MOBILE_QUERY = "(max-width: 680px)";
const FRAME_INTERVAL = 1000 / 18;
const MAX_RENDER_PIXELS = 700_000;

const nodes: SignalNode[] = Array.from({ length: 14 }, (_, index) => ({
  path: (index % 2) as 0 | 1,
  progress: 0.04 + (index / 13) * 0.92,
  phase: index * 0.73,
  tone: (index % 3) as 0 | 1 | 2,
  weight: 0.78 + (index % 4) * 0.12,
}));

const toneColor = (tone: SignalNode["tone"], alpha: number) => {
  if (tone === 1) return `rgba(55,185,140,${alpha})`;
  if (tone === 2) return `rgba(111,99,181,${alpha})`;
  return `rgba(17,126,139,${alpha})`;
};

function pointOnPath(path: SignalNode["path"], progress: number, width: number, height: number) {
  const x = width * (0.04 + progress * 0.92);
  const center = path === 0 ? height * 0.36 : height * 0.7;
  const amplitude = path === 0 ? height * 0.13 : height * 0.1;
  const phase = path === 0 ? -0.35 : 0.72;
  const y = center + Math.sin(progress * Math.PI * 2 + phase) * amplitude;
  return { x, y };
}

export function MobileLearningSignal() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = canvas?.closest<HTMLElement>(".hero-section--signal");
    if (!canvas || !hero || !window.matchMedia(MOBILE_QUERY).matches) return;

    const context = canvas.getContext("2d", { alpha: true });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cssWidth = 1;
    let cssHeight = 1;
    let renderScale = 1;
    let animationFrame = 0;
    let previousFrame = 0;
    let startedAt = 0;
    let lastTimestamp = 0;
    let isReduced = reducedMotion.matches;
    let isIntersecting = true;

    const stop = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };

    const tracePath = (path: SignalNode["path"]) => {
      if (!context) return;
      context.beginPath();
      for (let step = 0; step <= 64; step += 1) {
        const point = pointOnPath(path, step / 64, cssWidth, cssHeight);
        if (step === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.strokeStyle = path === 0 ? "rgba(17,126,139,0.16)" : "rgba(55,185,140,0.13)";
      context.lineWidth = path === 0 ? 1.15 : 0.9;
      context.stroke();
    };

    const draw = (timestamp: number) => {
      if (!context) return;
      if (!startedAt) startedAt = timestamp;
      lastTimestamp = timestamp;
      const elapsed = isReduced ? 4.6 : (timestamp - startedAt) / 1000;

      context.setTransform(renderScale, 0, 0, renderScale, 0, 0);
      context.clearRect(0, 0, cssWidth, cssHeight);
      context.save();
      context.globalCompositeOperation = "source-over";

      tracePath(0);
      tracePath(1);

      for (const node of nodes) {
        const base = pointOnPath(node.path, node.progress, cssWidth, cssHeight);
        const driftX = Math.sin(elapsed * 0.36 + node.phase) * 3.4;
        const driftY = Math.cos(elapsed * 0.31 + node.phase) * 4.6;
        const pulse = 0.76 + Math.sin(elapsed * 0.55 + node.phase) * 0.18;
        const radius = 1.65 * node.weight;
        context.beginPath();
        context.arc(base.x + driftX, base.y + driftY, radius, 0, Math.PI * 2);
        context.fillStyle = toneColor(node.tone, 0.46 * pulse);
        context.fill();
      }

      const movingSignals = [
        { path: 0 as const, duration: 7.5, offset: 0.04, tone: 0 as const },
        { path: 1 as const, duration: 8.6, offset: 0.37, tone: 1 as const },
        { path: 0 as const, duration: 9.5, offset: 0.7, tone: 2 as const },
      ];

      for (const signal of movingSignals) {
        const progress = isReduced ? signal.offset : (elapsed / signal.duration + signal.offset) % 1;
        const point = pointOnPath(signal.path, progress, cssWidth, cssHeight);
        context.beginPath();
        context.arc(point.x, point.y, 6.2, 0, Math.PI * 2);
        context.strokeStyle = toneColor(signal.tone, 0.16);
        context.lineWidth = 1;
        context.stroke();
        context.beginPath();
        context.arc(point.x, point.y, 3, 0, Math.PI * 2);
        context.fillStyle = toneColor(signal.tone, 0.82);
        context.fill();
      }

      context.restore();
      canvas.dataset.renderState = "ready";
      canvas.dataset.renderer = "canvas2d";
      canvas.dataset.frameCount = String(Number.parseInt(canvas.dataset.frameCount ?? "0", 10) + 1);
    };

    const shouldAnimate = () => !isReduced && isIntersecting && document.visibilityState === "visible";

    const animate = (timestamp: number) => {
      if (timestamp - previousFrame >= FRAME_INTERVAL) {
        draw(timestamp);
        previousFrame = timestamp;
      }
      if (shouldAnimate()) animationFrame = requestAnimationFrame(animate);
      else animationFrame = 0;
    };

    const start = () => {
      stop();
      if (!context) {
        canvas.dataset.renderState = "ready";
        canvas.dataset.renderer = "css";
        canvas.dataset.motionState = "paused";
        return;
      }
      if (shouldAnimate()) {
        canvas.dataset.motionState = "running";
        animationFrame = requestAnimationFrame(animate);
      } else {
        canvas.dataset.motionState = isReduced ? "reduced" : "paused";
        draw(isReduced ? 4600 : lastTimestamp || 0);
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      cssWidth = Math.max(1, rect.width);
      cssHeight = Math.max(1, rect.height);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.4);
      const budgetScale = Math.sqrt(MAX_RENDER_PIXELS / Math.max(1, cssWidth * cssHeight));
      renderScale = Math.max(0.6, Math.min(pixelRatio, budgetScale));
      canvas.width = Math.max(1, Math.round(cssWidth * renderScale));
      canvas.height = Math.max(1, Math.round(cssHeight * renderScale));
      canvas.dataset.pixelRatio = renderScale.toFixed(3);
      start();
    };

    const handleReducedMotion = (event: MediaQueryListEvent) => {
      isReduced = event.matches;
      startedAt = 0;
      start();
    };

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isIntersecting = entry?.isIntersecting ?? true;
      start();
    });

    resizeObserver.observe(canvas);
    intersectionObserver.observe(hero);
    reducedMotion.addEventListener("change", handleReducedMotion);
    document.addEventListener("visibilitychange", start);
    resize();

    return () => {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      reducedMotion.removeEventListener("change", handleReducedMotion);
      document.removeEventListener("visibilitychange", start);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="hero-mobile-learning-field"
      aria-hidden="true"
      tabIndex={-1}
      data-render-state="pending"
      data-renderer="pending"
      data-motion-state="paused"
      data-pixel-ratio="1"
      data-frame-count="0"
    />
  );
}
