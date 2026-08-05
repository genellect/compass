"use client";

import { useEffect, useRef } from "react";

type SignalPoint = {
  x: number;
  y: number;
  driftX: number;
  driftY: number;
  phase: number;
  tone: 0 | 1 | 2;
  weight: number;
};

const MAX_RENDER_PIXELS = 1_500_000;
const DESKTOP_FRAME_INTERVAL = 1000 / 24;
const MOBILE_FRAME_INTERVAL = 1000 / 18;

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function buildPoints(width: number, height: number) {
  const mobile = width <= 680;
  const tablet = width > 680 && width <= 959;
  const count = mobile ? 22 : tablet ? 34 : width >= 2200 ? 68 : 52;
  const random = seededRandom(0x41494d4f + Math.round(width) * 7 + Math.round(height));
  const points: SignalPoint[] = [];

  for (let index = 0; index < count; index += 1) {
    let normalizedX = 0.03 + random() * 0.94;
    let normalizedY = 0.08 + random() * 0.86;

    if (mobile) {
      const band = index % 4;
      if (band === 0) normalizedY = 0.1 + random() * 0.18;
      else if (band === 1) normalizedY = 0.7 + random() * 0.24;
      else if (band === 2) normalizedX = 0.025 + random() * 0.12;
      else normalizedX = 0.855 + random() * 0.12;
    } else if (normalizedX < 0.55 && normalizedY > 0.24 && normalizedY < 0.79) {
      normalizedY = random() > 0.5 ? 0.09 + random() * 0.13 : 0.82 + random() * 0.12;
    }

    points.push({
      x: normalizedX * width,
      y: normalizedY * height,
      driftX: 2 + random() * (mobile ? 4 : 8),
      driftY: 2 + random() * (mobile ? 4 : 7),
      phase: random() * Math.PI * 2,
      tone: (index % 3) as 0 | 1 | 2,
      weight: 0.5 + random() * 0.8,
    });
  }

  return points;
}

function isProtectedReadingZone(x: number, y: number, width: number, height: number) {
  if (width <= 680) {
    return x > width * 0.09 && x < width * 0.91 && y > height * 0.17 && y < height * 0.73;
  }
  if (width <= 959) {
    return x > width * 0.1 && x < width * 0.9 && y > height * 0.13 && y < height * 0.47;
  }
  return x < width * 0.56 && y > height * 0.23 && y < height * 0.79;
}

function toneColor(tone: SignalPoint["tone"], alpha: number) {
  if (tone === 1) return `rgba(130,255,196,${alpha})`;
  if (tone === 2) return `rgba(173,155,255,${alpha})`;
  return `rgba(124,236,255,${alpha})`;
}

export function HeroIntelligenceField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = canvas?.closest<HTMLElement>(".hero-section--signal");
    if (!canvas || !hero) return;

    const context = canvas.getContext("2d", { alpha: true }) as CanvasRenderingContext2D | null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cssWidth = 1;
    let cssHeight = 1;
    let renderScale = 1;
    let points = buildPoints(1, 1);
    let frame = 0;
    let previousFrame = 0;
    let startedAt = 0;
    let lastTimestamp = 0;
    let isReduced = reducedMotion.matches;
    let isIntersecting = true;

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const drawCornerFrame = (x: number, y: number, width: number, height: number, alpha: number) => {
      if (!context) return;
      const corner = Math.min(width, height) * 0.22;
      context.beginPath();
      context.moveTo(x + corner, y);
      context.lineTo(x, y);
      context.lineTo(x, y + corner);
      context.moveTo(x + width - corner, y + height);
      context.lineTo(x + width, y + height);
      context.lineTo(x + width, y + height - corner);
      context.strokeStyle = `rgba(124,236,255,${alpha})`;
      context.lineWidth = 0.8;
      context.stroke();
    };

    const draw = (timestamp: number) => {
      if (!context) return;
      if (!startedAt) startedAt = timestamp;
      lastTimestamp = timestamp;
      const elapsed = isReduced ? 5.2 : (timestamp - startedAt) / 1000;
      const mobile = cssWidth <= 680;
      const positions = points.map((point) => ({
        point,
        x: point.x + Math.sin(elapsed * 0.16 + point.phase) * point.driftX,
        y: point.y + Math.cos(elapsed * 0.13 + point.phase) * point.driftY,
      }));

      context.setTransform(renderScale, 0, 0, renderScale, 0, 0);
      context.clearRect(0, 0, cssWidth, cssHeight);
      context.save();
      context.globalCompositeOperation = "screen";

      drawCornerFrame(cssWidth * 0.68, cssHeight * 0.14, cssWidth * 0.2, cssHeight * 0.13, 0.1);
      drawCornerFrame(cssWidth * 0.08, cssHeight * 0.81, cssWidth * 0.18, cssHeight * 0.1, 0.07);
      if (!mobile) drawCornerFrame(cssWidth * 0.77, cssHeight * 0.73, cssWidth * 0.14, cssHeight * 0.12, 0.08);

      const maximumDistance = mobile ? Math.min(112, cssWidth * 0.31) : Math.min(205, cssWidth * 0.16);
      const maximumLines = mobile ? 24 : cssWidth >= 2200 ? 92 : 62;
      let lineCount = 0;

      for (let firstIndex = 0; firstIndex < positions.length && lineCount < maximumLines; firstIndex += 1) {
        const first = positions[firstIndex];
        for (let secondIndex = firstIndex + 1; secondIndex < positions.length && lineCount < maximumLines; secondIndex += 1) {
          const second = positions[secondIndex];
          const deltaX = second.x - first.x;
          const deltaY = second.y - first.y;
          const distance = Math.hypot(deltaX, deltaY);
          if (distance > maximumDistance) continue;
          const middleX = (first.x + second.x) / 2;
          const middleY = (first.y + second.y) / 2;
          if (isProtectedReadingZone(middleX, middleY, cssWidth, cssHeight)) continue;

          const proximity = 1 - distance / maximumDistance;
          const alpha = (mobile ? 0.035 : 0.045) + proximity * (mobile ? 0.06 : 0.075);
          context.beginPath();
          context.moveTo(first.x, first.y);
          context.lineTo(second.x, second.y);
          context.strokeStyle = toneColor(first.point.tone, alpha);
          context.lineWidth = 0.65;
          context.stroke();

          if ((lineCount + firstIndex) % 7 === 0) {
            const progress = (elapsed * 0.055 + first.point.phase / (Math.PI * 2)) % 1;
            const pulseX = first.x + deltaX * progress;
            const pulseY = first.y + deltaY * progress;
            context.beginPath();
            context.arc(pulseX, pulseY, mobile ? 1.3 : 1.7, 0, Math.PI * 2);
            context.fillStyle = toneColor(second.point.tone, 0.74);
            context.shadowColor = toneColor(second.point.tone, 0.7);
            context.shadowBlur = mobile ? 7 : 10;
            context.fill();
            context.shadowBlur = 0;
          }
          lineCount += 1;
        }
      }

      for (const { point, x, y } of positions) {
        const protectedZone = isProtectedReadingZone(x, y, cssWidth, cssHeight);
        const pulse = 0.72 + Math.sin(elapsed * 0.42 + point.phase) * 0.18;
        const radius = (mobile ? 1.2 : 1.45) * point.weight;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = toneColor(point.tone, protectedZone ? 0.12 : 0.38 * pulse);
        context.fill();

        if (!protectedZone && point.weight > 1.05) {
          context.strokeStyle = toneColor(point.tone, 0.1 * pulse);
          context.lineWidth = 0.7;
          context.strokeRect(x - radius * 4, y - radius * 4, radius * 8, radius * 8);
        }
      }

      const scanProgress = isReduced ? 0.63 : (elapsed * 0.035) % 1;
      const scanY = cssHeight * (0.12 + scanProgress * 0.76);
      const scanGradient = context.createLinearGradient(0, scanY, 0, scanY + 46);
      scanGradient.addColorStop(0, "rgba(124,236,255,0)");
      scanGradient.addColorStop(0.5, mobile ? "rgba(124,236,255,0.035)" : "rgba(124,236,255,0.055)");
      scanGradient.addColorStop(1, "rgba(124,236,255,0)");
      context.fillStyle = scanGradient;
      context.fillRect(0, scanY - 23, cssWidth, 46);

      context.restore();
      canvas.dataset.renderState = "ready";
      canvas.dataset.renderer = "canvas2d";
      canvas.dataset.frameCount = String(Number.parseInt(canvas.dataset.frameCount ?? "0", 10) + 1);
    };

    const shouldAnimate = () => !isReduced && isIntersecting && document.visibilityState === "visible";

    const animate = (timestamp: number) => {
      const interval = cssWidth <= 680 ? MOBILE_FRAME_INTERVAL : DESKTOP_FRAME_INTERVAL;
      if (timestamp - previousFrame >= interval) {
        draw(timestamp);
        previousFrame = timestamp;
      }
      if (shouldAnimate()) frame = requestAnimationFrame(animate);
      else frame = 0;
    };

    const start = () => {
      stop();
      if (!context) {
        canvas.dataset.motionState = "paused";
        return;
      }
      if (shouldAnimate()) {
        canvas.dataset.motionState = "running";
        frame = requestAnimationFrame(animate);
      } else {
        canvas.dataset.motionState = isReduced ? "reduced" : "paused";
        draw(isReduced ? 5200 : lastTimestamp || 0);
      }
    };

    const resize = () => {
      const rect = hero.getBoundingClientRect();
      cssWidth = Math.max(1, rect.width);
      cssHeight = Math.max(1, rect.height);
      points = buildPoints(cssWidth, cssHeight);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
      const budgetScale = Math.sqrt(MAX_RENDER_PIXELS / Math.max(1, cssWidth * cssHeight));
      renderScale = Math.max(0.34, Math.min(pixelRatio, budgetScale));
      canvas.width = Math.max(1, Math.round(cssWidth * renderScale));
      canvas.height = Math.max(1, Math.round(cssHeight * renderScale));
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      canvas.dataset.pixelRatio = renderScale.toFixed(3);
      if (context) draw(isReduced ? 5200 : lastTimestamp || 0);
      else {
        canvas.dataset.renderState = "ready";
        canvas.dataset.renderer = "css";
      }
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
    resizeObserver.observe(hero);
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
      className="hero-ai-field"
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
