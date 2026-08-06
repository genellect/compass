"use client";

import { useEffect, useRef } from "react";

type IntelligenceNode = {
  x: number;
  y: number;
  driftX: number;
  driftY: number;
  phase: number;
  tone: 0 | 1 | 2;
  weight: number;
};

type PositionedNode = IntelligenceNode & {
  renderX: number;
  renderY: number;
};

const MAX_RENDER_PIXELS = 1_350_000;
const FRAME_INTERVAL = 1000 / 22;

function seededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function isCopyZone(x: number, y: number, width: number, height: number) {
  return x < width * 0.43 && y > height * 0.18 && y < height * 0.8;
}

function isGraphicCore(x: number, y: number, width: number, height: number) {
  return x > width * 0.59 && y > height * 0.25 && y < height * 0.86;
}

function buildNodes(width: number, height: number) {
  const random = seededRandom(0x46534c41 + Math.round(width) * 5 + Math.round(height) * 11);
  const count = width >= 1800 ? 46 : width >= 1180 ? 38 : 32;
  const nodes: IntelligenceNode[] = [];

  for (let index = 0; index < count; index += 1) {
    const band = index % 4;
    let normalizedX = 0.08 + random() * 0.86;
    let normalizedY = 0.08 + random() * 0.84;

    if (band === 0) {
      normalizedX = 0.2 + random() * 0.76;
      normalizedY = 0.08 + random() * 0.14;
    } else if (band === 1) {
      normalizedX = 0.4 + random() * 0.34;
      normalizedY = 0.2 + random() * 0.62;
    } else if (band === 2) {
      normalizedX = 0.14 + random() * 0.82;
      normalizedY = 0.82 + random() * 0.1;
    } else {
      normalizedX = 0.77 + random() * 0.2;
      normalizedY = 0.14 + random() * 0.68;
    }

    let x = normalizedX * width;
    let y = normalizedY * height;
    if (isCopyZone(x, y, width, height)) {
      x = width * (0.44 + random() * 0.09);
    }

    nodes.push({
      x,
      y,
      driftX: 2 + random() * 6,
      driftY: 1.5 + random() * 5,
      phase: random() * Math.PI * 2,
      tone: (index % 3) as 0 | 1 | 2,
      weight: 0.55 + random() * 0.72,
    });
  }

  return nodes;
}

function toneColor(tone: IntelligenceNode["tone"], alpha: number) {
  if (tone === 1) return `rgba(130,255,196,${alpha})`;
  if (tone === 2) return `rgba(173,155,255,${alpha})`;
  return `rgba(124,236,255,${alpha})`;
}

export function HeroIntelligenceField({ className }: { className: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = canvas?.closest<HTMLElement>("[data-library-section='hero']");
    if (!canvas || !hero) return;

    const context = canvas.getContext("2d", { alpha: true });
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 1;
    let height = 1;
    let renderScale = 1;
    let nodes = buildNodes(1, 1);
    let frame = 0;
    let previousFrame = 0;
    let startedAt = 0;
    let lastTimestamp = 0;
    let isReduced = reducedMotionQuery.matches;
    let isIntersecting = true;
    let isDesktop = false;

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const positionedNodes = (elapsed: number): PositionedNode[] => nodes.map((node) => ({
      ...node,
      renderX: node.x + Math.sin(elapsed * 0.13 + node.phase) * node.driftX,
      renderY: node.y + Math.cos(elapsed * 0.11 + node.phase) * node.driftY,
    }));

    const draw = (timestamp: number) => {
      if (!context || !isDesktop) return;
      if (!startedAt) startedAt = timestamp;
      lastTimestamp = timestamp;
      const elapsed = isReduced ? 8.2 : (timestamp - startedAt) / 1000;
      const positions = positionedNodes(elapsed);

      context.setTransform(renderScale, 0, 0, renderScale, 0, 0);
      context.clearRect(0, 0, width, height);
      context.save();
      context.globalCompositeOperation = "screen";

      const glowX = width * (0.55 + Math.sin(elapsed * 0.055) * 0.025);
      const glowY = height * (0.43 + Math.cos(elapsed * 0.046) * 0.035);
      const glow = context.createRadialGradient(glowX, glowY, 0, glowX, glowY, width * 0.2);
      glow.addColorStop(0, "rgba(91,225,242,0.075)");
      glow.addColorStop(0.42, "rgba(79,143,255,0.026)");
      glow.addColorStop(1, "rgba(79,143,255,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      const maximumDistance = Math.min(196, width * 0.18);
      const maximumLines = width >= 1800 ? 64 : 50;
      let lineCount = 0;

      for (let firstIndex = 0; firstIndex < positions.length && lineCount < maximumLines; firstIndex += 1) {
        const first = positions[firstIndex];

        for (let secondIndex = firstIndex + 1; secondIndex < positions.length && lineCount < maximumLines; secondIndex += 1) {
          const second = positions[secondIndex];
          const deltaX = second.renderX - first.renderX;
          const deltaY = second.renderY - first.renderY;
          const distance = Math.hypot(deltaX, deltaY);
          if (distance > maximumDistance) continue;

          const middleX = (first.renderX + second.renderX) / 2;
          const middleY = (first.renderY + second.renderY) / 2;
          if (isCopyZone(middleX, middleY, width, height)) continue;

          const graphicFade = isGraphicCore(middleX, middleY, width, height) ? 0.34 : 1;
          const proximity = 1 - distance / maximumDistance;
          const alpha = (0.026 + proximity * 0.075) * graphicFade;
          context.beginPath();
          context.moveTo(first.renderX, first.renderY);
          context.lineTo(second.renderX, second.renderY);
          context.strokeStyle = toneColor(first.tone, alpha);
          context.lineWidth = 0.65;
          context.stroke();

          if ((lineCount + firstIndex) % 9 === 0) {
            const progress = (elapsed * 0.045 + first.phase / (Math.PI * 2)) % 1;
            const pulseX = first.renderX + deltaX * progress;
            const pulseY = first.renderY + deltaY * progress;
            const pulseFade = isGraphicCore(pulseX, pulseY, width, height) ? 0.42 : 1;
            context.beginPath();
            context.arc(pulseX, pulseY, 1.65, 0, Math.PI * 2);
            context.fillStyle = toneColor(second.tone, 0.74 * pulseFade);
            context.shadowColor = toneColor(second.tone, 0.7 * pulseFade);
            context.shadowBlur = 11;
            context.fill();
            context.shadowBlur = 0;
          }

          lineCount += 1;
        }
      }

      for (const node of positions) {
        if (isCopyZone(node.renderX, node.renderY, width, height)) continue;
        const graphicFade = isGraphicCore(node.renderX, node.renderY, width, height) ? 0.34 : 1;
        const pulse = 0.72 + Math.sin(elapsed * 0.36 + node.phase) * 0.18;
        const radius = 1.25 * node.weight;
        context.beginPath();
        context.arc(node.renderX, node.renderY, radius, 0, Math.PI * 2);
        context.fillStyle = toneColor(node.tone, 0.38 * pulse * graphicFade);
        context.fill();

        if (node.weight > 1.05 && graphicFade === 1) {
          context.beginPath();
          context.arc(node.renderX, node.renderY, radius * 3.6, 0, Math.PI * 2);
          context.strokeStyle = toneColor(node.tone, 0.09 * pulse);
          context.lineWidth = 0.65;
          context.stroke();
        }
      }

      const scanProgress = isReduced ? 0.58 : (elapsed * 0.025) % 1;
      const scanX = width * (0.36 + scanProgress * 0.58);
      const scan = context.createLinearGradient(scanX - 50, 0, scanX + 50, 0);
      scan.addColorStop(0, "rgba(124,236,255,0)");
      scan.addColorStop(0.5, "rgba(124,236,255,0.034)");
      scan.addColorStop(1, "rgba(124,236,255,0)");
      context.fillStyle = scan;
      context.fillRect(scanX - 50, height * 0.12, 100, height * 0.76);

      context.restore();
      canvas.dataset.renderState = "ready";
      canvas.dataset.frameCount = String(Number.parseInt(canvas.dataset.frameCount ?? "0", 10) + 1);
    };

    const shouldAnimate = () => isDesktop && !isReduced && isIntersecting && document.visibilityState === "visible";

    const animate = (timestamp: number) => {
      if (timestamp - previousFrame >= FRAME_INTERVAL) {
        draw(timestamp);
        previousFrame = timestamp;
      }

      if (shouldAnimate()) frame = requestAnimationFrame(animate);
      else frame = 0;
    };

    const start = () => {
      stop();
      if (!context || !isDesktop) {
        canvas.dataset.motionState = "paused";
        return;
      }

      if (shouldAnimate()) {
        canvas.dataset.motionState = "running";
        frame = requestAnimationFrame(animate);
      } else {
        canvas.dataset.motionState = isReduced ? "reduced" : "paused";
        draw(isReduced ? 8200 : lastTimestamp || 0);
      }
    };

    const resize = () => {
      const rect = hero.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      isDesktop = width > 900;
      nodes = buildNodes(width, height);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
      const budgetScale = Math.sqrt(MAX_RENDER_PIXELS / Math.max(1, width * height));
      renderScale = Math.max(0.4, Math.min(pixelRatio, budgetScale));
      canvas.width = Math.max(1, Math.round(width * renderScale));
      canvas.height = Math.max(1, Math.round(height * renderScale));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.dataset.pixelRatio = renderScale.toFixed(3);
      context?.clearRect(0, 0, width, height);
      if (isDesktop) draw(isReduced ? 8200 : lastTimestamp || 0);
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
    reducedMotionQuery.addEventListener("change", handleReducedMotion);
    document.addEventListener("visibilitychange", start);
    resize();

    return () => {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      reducedMotionQuery.removeEventListener("change", handleReducedMotion);
      document.removeEventListener("visibilitychange", start);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      tabIndex={-1}
      data-render-state="pending"
      data-motion-state="paused"
      data-pixel-ratio="1"
      data-frame-count="0"
    />
  );
}
