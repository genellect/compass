"use client";

import { useEffect, useRef } from "react";

type MatrixMode = "mobile" | "tablet" | "desktop";

type MatrixRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  mode: MatrixMode;
};

type MatrixNode = {
  column: number;
  row: number;
  phase: number;
  offsetX: number;
  offsetY: number;
  kind: 0 | 1 | 2;
};

const MAX_RENDER_PIXELS = 2_300_000;
const DESKTOP_FRAME_INTERVAL = 1000 / 45;
const MOBILE_FRAME_INTERVAL = 1000 / 30;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function createRegion(width: number, height: number, viewportWidth: number): MatrixRegion {
  if (viewportWidth <= 680) {
    const isShort = height <= 650;
    return {
      x: width * 0.04,
      y: height * 0.08,
      width: width * 0.92,
      height: height * 0.84,
      columns: isShort ? 6 : 7,
      rows: isShort ? 4 : 5,
      mode: "mobile",
    };
  }

  if (viewportWidth <= 959) {
    return {
      x: width * 0.05,
      y: height * 0.06,
      width: width * 0.9,
      height: height * 0.86,
      columns: 9,
      rows: 6,
      mode: "tablet",
    };
  }

  return {
    x: width * 0.05,
    y: height * 0.08,
    width: width * 0.9,
    height: height * 0.84,
    columns: viewportWidth >= 2200 ? 12 : 10,
    rows: viewportWidth >= 2200 ? 9 : 7,
    mode: "desktop",
  };
}

function buildNodes(region: MatrixRegion) {
  const random = seededRandom(
    0x4d4f5645 + region.columns * 101 + region.rows * 17 + Math.round(region.width),
  );
  const nodes: MatrixNode[] = [];
  for (let row = 0; row < region.rows; row += 1) {
    for (let column = 0; column < region.columns; column += 1) {
      nodes.push({
        column,
        row,
        phase: random() * Math.PI * 2,
        offsetX: (random() - 0.5) * region.width * 0.36,
        offsetY: (random() - 0.5) * region.height * 0.42,
        kind: ((column + row * 2) % 3) as 0 | 1 | 2,
      });
    }
  }
  return nodes;
}

function createGlowSprite(color: string) {
  const sprite = document.createElement("canvas");
  const size = 96;
  sprite.width = size;
  sprite.height = size;
  const context = sprite.getContext("2d");
  if (!context) return sprite;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.09, color);
  gradient.addColorStop(0.28, `${color}ad`);
  gradient.addColorStop(0.58, `${color}35`);
  gradient.addColorStop(1, `${color}00`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return sprite;
}

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3;
}

function gridPoint(region: MatrixRegion, column: number, row: number) {
  const columnProgress = region.columns <= 1 ? 0 : column / (region.columns - 1);
  const rowProgress = region.rows <= 1 ? 0 : row / (region.rows - 1);
  const skew = (rowProgress - 0.5) * region.width * (region.mode === "desktop" ? 0.055 : 0.035);
  return {
    x: region.x + columnProgress * region.width + skew,
    y: region.y + rowProgress * region.height,
  };
}

export function LectureSignalMatrix() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = canvas?.closest<HTMLElement>(".hero-signal-stage");
    const hero = canvas?.closest<HTMLElement>(".hero-section--signal");
    if (!canvas || !stage || !hero) return;

    const context = canvas.getContext("2d", { alpha: true }) as CanvasRenderingContext2D | null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(pointer: fine)");
    const glowSprites = context
      ? [createGlowSprite("#7cecff"), createGlowSprite("#82ffc4"), createGlowSprite("#ad9bff")]
      : [];

    let cssWidth = 1;
    let cssHeight = 1;
    let renderScale = 1;
    let region = createRegion(1, 1, window.innerWidth);
    let nodes = buildNodes(region);
    let animationFrame = 0;
    let previousFrame = 0;
    let animationStartedAt = 0;
    let lastTimestamp = 0;
    let isIntersecting = true;
    let isReduced = reducedMotion.matches;
    let pointerX = 0;
    let pointerY = 0;
    let pointerTargetX = 0;
    let pointerTargetY = 0;

    const setMotionState = (state: "running" | "paused" | "reduced") => {
      canvas.dataset.motionState = state;
    };

    const stopAnimation = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };

    const drawFrame = (depth: number, alpha: number) => {
      if (!context) return;
      const offsetX = depth * (region.mode === "desktop" ? 14 : 8);
      const offsetY = depth * (region.mode === "desktop" ? -10 : -6);
      const topLeft = gridPoint(region, 0, 0);
      const topRight = gridPoint(region, region.columns - 1, 0);
      const bottomRight = gridPoint(region, region.columns - 1, region.rows - 1);
      const bottomLeft = gridPoint(region, 0, region.rows - 1);
      context.beginPath();
      context.moveTo(topLeft.x + offsetX, topLeft.y + offsetY);
      context.lineTo(topRight.x + offsetX, topRight.y + offsetY);
      context.lineTo(bottomRight.x + offsetX, bottomRight.y + offsetY);
      context.lineTo(bottomLeft.x + offsetX, bottomLeft.y + offsetY);
      context.closePath();
      context.strokeStyle = `rgba(124,236,255,${alpha})`;
      context.lineWidth = depth === 0 ? 1.2 : 0.7;
      context.stroke();
    };

    const draw = (timestamp: number) => {
      if (!context) return;
      if (!animationStartedAt) animationStartedAt = timestamp;
      lastTimestamp = timestamp;
      const elapsed = isReduced ? 4.2 : (timestamp - animationStartedAt) / 1000;
      const organized = isReduced ? 1 : easeOutCubic(clamp((elapsed - 0.25) / 2.35, 0, 1));
      const scanProgress = isReduced ? 0.72 : ((elapsed - 2.6) / 7.4 + 1) % 1;
      const parallaxX = isReduced ? 0 : pointerX * 4;
      const parallaxY = isReduced ? 0 : pointerY * 4;

      context.setTransform(renderScale, 0, 0, renderScale, 0, 0);
      context.clearRect(0, 0, cssWidth, cssHeight);
      pointerX += (pointerTargetX - pointerX) * 0.04;
      pointerY += (pointerTargetY - pointerY) * 0.04;

      context.save();
      context.translate(parallaxX, parallaxY);
      context.globalCompositeOperation = "screen";

      drawFrame(2, 0.04);
      drawFrame(1, 0.07);
      drawFrame(0, 0.18);

      const lineAlpha = 0.035 + organized * 0.08;
      for (let row = 0; row < region.rows; row += 1) {
        const first = gridPoint(region, 0, row);
        const last = gridPoint(region, region.columns - 1, row);
        context.beginPath();
        context.moveTo(first.x, first.y);
        context.lineTo(last.x, last.y);
        context.strokeStyle = `rgba(159,228,245,${lineAlpha})`;
        context.lineWidth = 0.7;
        context.stroke();
      }

      for (let column = 0; column < region.columns; column += 1) {
        const first = gridPoint(region, column, 0);
        const last = gridPoint(region, column, region.rows - 1);
        context.beginPath();
        context.moveTo(first.x, first.y);
        context.lineTo(last.x, last.y);
        context.strokeStyle = `rgba(159,228,245,${lineAlpha * 0.9})`;
        context.lineWidth = 0.7;
        context.stroke();
      }

      const scanX = region.x + scanProgress * region.width;
      const scanGradient = context.createLinearGradient(scanX - 42, 0, scanX + 42, 0);
      scanGradient.addColorStop(0, "rgba(124,236,255,0)");
      scanGradient.addColorStop(0.45, "rgba(124,236,255,0.07)");
      scanGradient.addColorStop(0.5, "rgba(195,255,224,0.24)");
      scanGradient.addColorStop(0.55, "rgba(124,236,255,0.07)");
      scanGradient.addColorStop(1, "rgba(124,236,255,0)");
      context.fillStyle = scanGradient;
      context.fillRect(scanX - 42, region.y - 18, 84, region.height + 36);
      context.beginPath();
      context.moveTo(scanX, region.y - 12);
      context.lineTo(scanX + region.width * 0.055, region.y + region.height + 12);
      context.strokeStyle = "rgba(194,255,220,0.48)";
      context.lineWidth = 1.2;
      context.stroke();

      nodes.forEach((node, index) => {
        const target = gridPoint(region, node.column, node.row);
        const x = target.x + node.offsetX * (1 - organized);
        const y = target.y + node.offsetY * (1 - organized);
        const normalizedX = (target.x - region.x) / Math.max(1, region.width);
        const scanDistance = Math.abs(normalizedX - scanProgress);
        const isScanned = scanDistance < 0.085;
        const isKeyNode = (node.column + node.row * 2) % 7 === 0;
        const sprite = glowSprites[node.kind];
        const baseSize = region.mode === "desktop" ? 15 : region.mode === "tablet" ? 13 : 11;
        const glowSize = isScanned ? baseSize * 3.2 : isKeyNode ? baseSize * 2.2 : baseSize * 1.35;
        context.globalAlpha = isScanned ? 0.9 : isKeyNode ? 0.58 : 0.3 + organized * 0.16;
        context.drawImage(sprite, x - glowSize / 2, y - glowSize / 2, glowSize, glowSize);

        context.globalAlpha = isScanned ? 1 : isKeyNode ? 0.86 : 0.62;
        context.fillStyle = node.kind === 1 ? "#bfffdc" : node.kind === 2 ? "#c8bcff" : "#c8f8ff";
        const nodeSize = isScanned ? 3.4 : isKeyNode ? 2.6 : 1.55;
        context.fillRect(x - nodeSize / 2, y - nodeSize / 2, nodeSize, nodeSize);

        if (organized > 0.86 && index % 9 === 0) {
          const cellWidth = region.width / Math.max(1, region.columns - 1) * 0.54;
          const cellHeight = region.height / Math.max(1, region.rows - 1) * 0.42;
          context.strokeStyle = isScanned ? "rgba(194,255,220,0.36)" : "rgba(124,236,255,0.1)";
          context.lineWidth = 0.65;
          context.strokeRect(x - cellWidth / 2, y - cellHeight / 2, cellWidth, cellHeight);
        }
      });

      const focus = gridPoint(region, Math.max(1, region.columns - 3), Math.floor(region.rows / 2));
      const focusSize = region.mode === "desktop" ? Math.min(92, region.width * 0.16) : Math.min(66, region.width * 0.18);
      context.globalAlpha = 0.72;
      context.drawImage(glowSprites[1], focus.x - focusSize / 2, focus.y - focusSize / 2, focusSize, focusSize);
      context.globalAlpha = 0.9;
      context.strokeStyle = "rgba(194,255,220,0.58)";
      context.lineWidth = 1;
      context.strokeRect(focus.x - focusSize * 0.18, focus.y - focusSize * 0.18, focusSize * 0.36, focusSize * 0.36);
      context.beginPath();
      context.moveTo(focus.x - focusSize * 0.3, focus.y);
      context.lineTo(focus.x + focusSize * 0.3, focus.y);
      context.moveTo(focus.x, focus.y - focusSize * 0.3);
      context.lineTo(focus.x, focus.y + focusSize * 0.3);
      context.stroke();

      context.restore();
      canvas.dataset.renderState = "ready";
      canvas.dataset.renderer = "canvas2d";
    };

    const shouldAnimate = () => !isReduced && isIntersecting && document.visibilityState === "visible";

    const animate = (timestamp: number) => {
      const interval = cssWidth <= 680 ? MOBILE_FRAME_INTERVAL : DESKTOP_FRAME_INTERVAL;
      if (timestamp - previousFrame >= interval) {
        draw(timestamp);
        previousFrame = timestamp;
      }
      if (shouldAnimate()) animationFrame = requestAnimationFrame(animate);
      else animationFrame = 0;
    };

    const startAnimation = () => {
      stopAnimation();
      if (!context) {
        setMotionState("paused");
        return;
      }
      if (shouldAnimate()) {
        setMotionState("running");
        animationFrame = requestAnimationFrame(animate);
      } else {
        setMotionState(isReduced ? "reduced" : "paused");
        draw(isReduced ? 4200 : lastTimestamp || 0);
      }
    };

    const resize = () => {
      const stageRect = stage.getBoundingClientRect();
      cssWidth = Math.max(1, stageRect.width);
      cssHeight = Math.max(1, stageRect.height);
      region = createRegion(cssWidth, cssHeight, window.innerWidth);
      nodes = buildNodes(region);

      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      const budgetScale = Math.sqrt(MAX_RENDER_PIXELS / Math.max(1, cssWidth * cssHeight));
      renderScale = Math.max(0.5, Math.min(pixelRatio, budgetScale));
      canvas.width = Math.max(1, Math.round(cssWidth * renderScale));
      canvas.height = Math.max(1, Math.round(cssHeight * renderScale));
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      canvas.dataset.pixelRatio = renderScale.toFixed(3);

      if (context) draw(isReduced ? 4200 : lastTimestamp || 0);
      else {
        canvas.dataset.renderState = "ready";
        canvas.dataset.renderer = "css";
        setMotionState("paused");
      }
      startAnimation();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!finePointer.matches || isReduced) return;
      const rect = stage.getBoundingClientRect();
      pointerTargetX = clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
      pointerTargetY = clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1);
    };

    const handlePointerLeave = () => {
      pointerTargetX = 0;
      pointerTargetY = 0;
    };

    const handleReducedMotion = (event: MediaQueryListEvent) => {
      isReduced = event.matches;
      animationStartedAt = 0;
      startAnimation();
    };

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        isIntersecting = entry?.isIntersecting ?? true;
        startAnimation();
      },
      { rootMargin: "120px 0px" },
    );

    resizeObserver.observe(stage);
    intersectionObserver.observe(hero);
    hero.addEventListener("pointermove", handlePointerMove, { passive: true });
    hero.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    reducedMotion.addEventListener("change", handleReducedMotion);
    document.addEventListener("visibilitychange", startAnimation);
    resize();

    return () => {
      stopAnimation();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      hero.removeEventListener("pointermove", handlePointerMove);
      hero.removeEventListener("pointerleave", handlePointerLeave);
      reducedMotion.removeEventListener("change", handleReducedMotion);
      document.removeEventListener("visibilitychange", startAnimation);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="hero-signal-matrix"
      aria-hidden="true"
      tabIndex={-1}
      data-render-state="pending"
      data-renderer="pending"
      data-motion-state="paused"
      data-pixel-ratio="1"
    />
  );
}
