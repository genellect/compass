// @ts-nocheck -- legacy visual enhancement layer; navigation and disclosure state now live in React.
(function () {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobileQuery = window.matchMedia("(max-width: 900px)");
  const hero = document.querySelector(".hero");
  const isLivingIntelligence = hero?.classList.contains("hero--living-intelligence") ?? false;

  const revealTargets = Array.from(document.querySelectorAll("[data-reveal]"));
  if ("IntersectionObserver" in window && !reduceMotion) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });

    revealTargets.forEach((target, index) => {
      target.style.transitionDelay = `${Math.min((index % 6) * 70, 280)}ms`;
      revealObserver.observe(target);
    });
  } else {
    revealTargets.forEach((target) => target.classList.add("is-visible"));
  }

  if (hero && !hero.classList.contains("hero--editorial") && !reduceMotion) {
    let pointerFrame = null;
    hero.addEventListener("pointermove", (event) => {
      if (mobileQuery.matches) return;
      if (pointerFrame) return;

      pointerFrame = requestAnimationFrame(() => {
        const rect = hero.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width - 0.5) * 22;
        const y = ((event.clientY - rect.top) / rect.height - 0.5) * 18;
        root.style.setProperty("--hero-gaze-x", `${x.toFixed(2)}px`);
        root.style.setProperty("--hero-gaze-y", `${y.toFixed(2)}px`);
        pointerFrame = null;
      });
    }, { passive: true });

    hero.addEventListener("pointerleave", () => {
      root.style.setProperty("--hero-gaze-x", "0px");
      root.style.setProperty("--hero-gaze-y", "0px");
    });

    let scrollFrame = null;
    const updateHeroScroll = () => {
      const rect = hero.getBoundingClientRect();
      const progress = Math.max(-1, Math.min(1, rect.top / Math.max(window.innerHeight, 1)));
      root.style.setProperty("--hero-scroll", `${(progress * 42).toFixed(2)}px`);
      scrollFrame = null;
    };

    window.addEventListener("scroll", () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(updateHeroScroll);
    }, { passive: true });
    updateHeroScroll();
  }

  const canvas = document.querySelector(".hero-particles");
  if (!canvas) return;

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return;

  let width = 0;
  let height = 0;
  let particles = [];
  let animationId = null;
  let particleAnimationStart = 0;

  const particleCount = () => {
    if (mobileQuery.matches) {
      if (isLivingIntelligence) {
        return Math.min(44, Math.max(34, Math.floor((window.innerWidth * window.innerHeight) / 9000)));
      }
      return Math.min(78, Math.max(52, Math.floor((window.innerWidth * window.innerHeight) / 6800)));
    }
    return Math.min(96, Math.floor((window.innerWidth * window.innerHeight) / 14500));
  };

  const createParticle = () => {
    const isMobile = mobileQuery.matches;
    const livingMobile = isMobile && isLivingIntelligence;

    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: livingMobile
        ? (Math.random() - 0.5) * 0.09
        : isMobile ? (Math.random() - 0.58) * 0.28 : (Math.random() - 0.5) * 0.18,
      vy: livingMobile
        ? (Math.random() - 0.52) * 0.08
        : isMobile ? (Math.random() - 0.74) * 0.24 : (Math.random() - 0.5) * 0.18,
      radius: livingMobile
        ? Math.random() * 1.05 + 0.5
        : isMobile ? Math.random() * 2.2 + 0.55 : Math.random() * 1.8 + 0.4,
      warmth: Math.random(),
      phase: Math.random() * Math.PI * 2,
      layer: Math.random() * 0.8 + 0.2
    };
  };

  const drawLivingIntelligenceField = (time = 0) => {
    const cyan = "115, 231, 255";
    const mint = "140, 255, 200";
    const violet = "188, 174, 255";

    const drawNeuralBand = ({ centerY, bandHeight, alpha, phase = 0, reverse = false }) => {
      const layerXs = [0.035, 0.25, 0.5, 0.75, 0.965].map((ratio) => width * ratio);
      const nodeCounts = reverse ? [2, 4, 5, 6, 4] : [4, 6, 5, 4, 2];
      const layers = layerXs.map((x, layer) => (
        Array.from({ length: nodeCounts[layer] }, (_, node) => {
          const count = nodeCounts[layer];
          const normalized = count === 1 ? 0 : node / (count - 1) - 0.5;
          return {
            x,
            y: centerY + normalized * bandHeight + Math.sin(time * 0.00018 + node * 1.37 + layer + phase) * 2.4
          };
        })
      ));

      context.save();
      context.globalCompositeOperation = "screen";

      for (let layer = 0; layer < layers.length - 1; layer += 1) {
        layers[layer].forEach((from, fromIndex) => {
          layers[layer + 1].forEach((to, toIndex) => {
            if ((fromIndex * 3 + toIndex * 2 + layer) % 4 > 1) return;
            const gradient = context.createLinearGradient(from.x, from.y, to.x, to.y);
            gradient.addColorStop(0, `rgba(${cyan}, ${alpha * 0.48})`);
            gradient.addColorStop(0.52, `rgba(${violet}, ${alpha * 0.7})`);
            gradient.addColorStop(1, `rgba(${mint}, ${alpha * 0.44})`);
            context.beginPath();
            context.moveTo(from.x, from.y);
            context.bezierCurveTo(
              from.x + (to.x - from.x) * 0.38,
              from.y,
              from.x + (to.x - from.x) * 0.62,
              to.y,
              to.x,
              to.y
            );
            context.strokeStyle = gradient;
            context.lineWidth = 0.7;
            context.stroke();
          });
        });
      }

      layers.forEach((layer, layerIndex) => {
        layer.forEach((node, nodeIndex) => {
          const pulse = 0.45 + Math.sin(time * 0.0012 + layerIndex * 1.6 + nodeIndex + phase) * 0.24;
          context.beginPath();
          context.arc(node.x, node.y, 1.3 + pulse * 0.65, 0, Math.PI * 2);
          context.fillStyle = layerIndex === 2
            ? `rgba(${violet}, ${alpha * 3.6})`
            : layerIndex % 2 === 0
              ? `rgba(${cyan}, ${alpha * 3.25})`
              : `rgba(${mint}, ${alpha * 3})`;
          context.fill();

          if ((nodeIndex + layerIndex) % 4 === 0) {
            context.beginPath();
            context.arc(node.x, node.y, 5 + pulse * 3, 0, Math.PI * 2);
            context.strokeStyle = `rgba(${layerIndex === 2 ? violet : cyan}, ${alpha * 0.9})`;
            context.lineWidth = 0.55;
            context.stroke();
          }
        });
      });

      for (let packet = 0; packet < 7; packet += 1) {
        const travel = (time * 0.000115 + packet * 0.143 + phase) % 1;
        const scaled = travel * (layers.length - 1);
        const layerIndex = Math.min(layers.length - 2, Math.floor(scaled));
        const localProgress = scaled - layerIndex;
        const fromLayer = layers[layerIndex];
        const toLayer = layers[layerIndex + 1];
        const from = fromLayer[(packet + layerIndex) % fromLayer.length];
        const to = toLayer[(packet * 2 + layerIndex + 1) % toLayer.length];
        const eased = localProgress * localProgress * (3 - 2 * localProgress);
        const x = from.x + (to.x - from.x) * eased;
        const y = from.y + (to.y - from.y) * eased;
        context.shadowBlur = 10;
        context.shadowColor = `rgba(${packet % 2 === 0 ? cyan : mint}, 0.72)`;
        context.beginPath();
        context.arc(x, y, packet % 3 === 0 ? 2 : 1.35, 0, Math.PI * 2);
        context.fillStyle = `rgba(${packet % 2 === 0 ? cyan : mint}, 0.78)`;
        context.fill();
        context.shadowBlur = 0;
      }

      context.restore();
    };

    drawNeuralBand({
      centerY: Math.max(122, height * 0.155),
      bandHeight: Math.min(102, height * 0.13),
      alpha: 0.12,
      phase: 0.08
    });
    drawNeuralBand({
      centerY: height * 0.5,
      bandHeight: Math.min(230, height * 0.29),
      alpha: 0.052,
      phase: 0.42,
      reverse: true
    });
    drawNeuralBand({
      centerY: Math.min(height - 62, height * 0.9),
      bandHeight: Math.min(92, height * 0.11),
      alpha: 0.095,
      phase: 0.76,
      reverse: true
    });

    const centerX = width * 0.5;
    const centerY = height * 0.45;
    const orbitWidth = Math.min(width * 0.46, 176);
    const orbitHeight = Math.min(height * 0.2, 164);

    context.save();
    context.globalCompositeOperation = "screen";
    context.translate(centerX, centerY);
    context.rotate(Math.sin(time / 9200) * 0.028);

    [
      { scale: 1, color: `rgba(${cyan}, 0.07)`, phase: 0 },
      { scale: 0.72, color: `rgba(${mint}, 0.052)`, phase: Math.PI / 3 },
      { scale: 0.46, color: `rgba(${violet}, 0.045)`, phase: Math.PI / 1.8 }
    ].forEach((orbit) => {
      context.save();
      context.rotate(orbit.phase + time * 0.00001);
      context.beginPath();
      context.ellipse(0, 0, orbitWidth * orbit.scale, orbitHeight * orbit.scale, -0.26, 0, Math.PI * 2);
      context.strokeStyle = orbit.color;
      context.lineWidth = 0.75;
      context.setLineDash([2, 8]);
      context.lineDashOffset = -time * 0.004;
      context.stroke();
      context.restore();
    });
    context.setLineDash([]);

    for (let index = 0; index < 7; index += 1) {
      const angle = time * 0.000035 + index * (Math.PI * 2 / 7);
      const nodeX = Math.cos(angle) * orbitWidth;
      const nodeY = Math.sin(angle) * orbitHeight;
      context.beginPath();
      context.arc(nodeX, nodeY, index % 2 === 0 ? 1.55 : 1.05, 0, Math.PI * 2);
      context.fillStyle = index % 2 === 0
        ? `rgba(${cyan}, 0.46)`
        : `rgba(${mint}, 0.36)`;
      context.fill();
    }

    context.restore();
  };

  const drawMobileLightRays = (time = 0, elapsed = 0) => {
    if (!mobileQuery.matches) return;
    if (isLivingIntelligence) {
      drawLivingIntelligenceField(time);
      return;
    }

    const compassX = width * 0.54;
    const compassY = height * 0.2;
    const horizonY = height * 0.78;
    const intro = Math.max(0, 1 - elapsed / 2400);
    const introBloom = Math.sin((1 - intro) * Math.PI);

    context.save();
    context.globalCompositeOperation = "screen";

    const rayGradient = context.createLinearGradient(compassX, compassY, width * 0.72, horizonY);
    rayGradient.addColorStop(0, `rgba(255, 255, 255, ${0.18 + introBloom * 0.18})`);
    rayGradient.addColorStop(0.34, `rgba(115, 231, 255, ${0.14 + introBloom * 0.12})`);
    rayGradient.addColorStop(0.72, `rgba(214, 164, 58, ${0.1 + introBloom * 0.1})`);
    rayGradient.addColorStop(1, "rgba(115, 231, 255, 0)");

    context.strokeStyle = rayGradient;
    context.lineWidth = 1.1 + introBloom * 0.8;
    context.globalAlpha = 0.34 + introBloom * 0.22;

    for (let i = 0; i < 7; i += 1) {
      const targetX = width * (0.18 + i * 0.16);
      const targetY = horizonY + Math.sin(time / 1800 + i) * 18;
      context.beginPath();
      context.moveTo(compassX, compassY);
      context.lineTo(targetX, targetY);
      context.stroke();
    }

    if (intro > 0) {
      const ringRadius = (1 - intro) * Math.max(width, height) * 0.42 + 22;
      const ringGradient = context.createRadialGradient(compassX, compassY, Math.max(0, ringRadius - 34), compassX, compassY, ringRadius);
      ringGradient.addColorStop(0, "rgba(115, 231, 255, 0)");
      ringGradient.addColorStop(0.68, `rgba(115, 231, 255, ${0.26 * introBloom})`);
      ringGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      context.strokeStyle = ringGradient;
      context.lineWidth = 2.4;
      context.globalAlpha = 0.9;
      context.beginPath();
      context.arc(compassX, compassY, ringRadius, 0, Math.PI * 2);
      context.stroke();

      const coreGradient = context.createRadialGradient(compassX, compassY, 0, compassX, compassY, 92 + introBloom * 58);
      coreGradient.addColorStop(0, `rgba(255, 255, 255, ${0.42 * introBloom})`);
      coreGradient.addColorStop(0.28, `rgba(214, 164, 58, ${0.24 * introBloom})`);
      coreGradient.addColorStop(1, "rgba(115, 231, 255, 0)");
      context.fillStyle = coreGradient;
      context.beginPath();
      context.arc(compassX, compassY, 92 + introBloom * 58, 0, Math.PI * 2);
      context.fill();
    }

    const phase = (time % 5200) / 5200;
    const shine = Math.sin(phase * Math.PI);
    const headX = width * (1.08 - phase * 1.24);
    const headY = height * (0.14 + phase * 0.24);
    const trailGradient = context.createLinearGradient(headX - width * 0.22, headY + height * 0.08, headX, headY);
    trailGradient.addColorStop(0, "rgba(115, 231, 255, 0)");
    trailGradient.addColorStop(0.56, `rgba(115, 231, 255, ${0.18 * shine})`);
    trailGradient.addColorStop(1, `rgba(255, 255, 255, ${0.42 * shine})`);

    context.globalAlpha = 1;
    context.strokeStyle = trailGradient;
    context.lineWidth = 1.4 + introBloom * 0.9;
    context.beginPath();
    context.moveTo(headX - width * 0.22, headY + height * 0.08);
    context.lineTo(headX, headY);
    context.stroke();

    context.restore();
  };

  const resizeCanvas = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    particles = Array.from({ length: particleCount() }, createParticle);
  };

  const drawStaticParticles = () => {
    context.clearRect(0, 0, width, height);
    drawMobileLightRays(1800, 2600);

    particles.forEach((particle) => {
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fillStyle = particle.warmth > 0.86
        ? "rgba(214, 164, 58, 0.58)"
        : "rgba(115, 231, 255, 0.58)";
      context.fill();
    });
  };

  const renderParticles = (time = 0) => {
    const isMobile = mobileQuery.matches;
    const livingMobile = isMobile && isLivingIntelligence;
    const connectionDistance = livingMobile ? 112 : isMobile ? 118 : 132;
    const connectionStrength = livingMobile ? 0.105 : isMobile ? 0.16 : 0.11;
    if (!particleAnimationStart) particleAnimationStart = time;
    const elapsed = time - particleAnimationStart;

    context.clearRect(0, 0, width, height);
    drawMobileLightRays(time, elapsed);

    for (let i = 0; i < particles.length; i += 1) {
      const particle = particles[i];
      const sway = livingMobile
        ? Math.sin(time * 0.0008 + particle.phase) * particle.layer * 0.025
        : isMobile ? Math.sin(time * 0.0012 + particle.phase) * particle.layer * 0.07 : 0;

      particle.x += particle.vx + sway;
      particle.y += particle.vy - (livingMobile ? 0 : isMobile ? particle.layer * 0.012 : 0);

      if (particle.x < -20) particle.x = width + 20;
      if (particle.x > width + 20) particle.x = -20;
      if (particle.y < -20) particle.y = height + 20;
      if (particle.y > height + 20) particle.y = -20;

      if (isMobile) {
        context.shadowBlur = livingMobile ? particle.radius * 3 + 2 : particle.radius * 5 + 4;
        context.shadowColor = particle.warmth > 0.86
          ? livingMobile ? "rgba(140, 255, 200, 0.24)" : "rgba(214, 164, 58, 0.46)"
          : livingMobile ? "rgba(115, 231, 255, 0.28)" : "rgba(115, 231, 255, 0.46)";
      }

      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fillStyle = particle.warmth > 0.86
        ? livingMobile ? "rgba(140, 255, 200, 0.38)" : "rgba(214, 164, 58, 0.64)"
        : livingMobile ? "rgba(115, 231, 255, 0.42)" : "rgba(115, 231, 255, 0.66)";
      context.fill();
      context.shadowBlur = 0;

      for (let j = i + 1; j < particles.length; j += 1) {
        const other = particles[j];
        const dx = particle.x - other.x;
        const dy = particle.y - other.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > connectionDistance) continue;

        context.beginPath();
        context.moveTo(particle.x, particle.y);
        context.lineTo(other.x, other.y);
        context.strokeStyle = particle.warmth > 0.86 || other.warmth > 0.86
          ? `rgba(214, 164, 58, ${connectionStrength * 0.75 * (1 - distance / connectionDistance)})`
          : `rgba(115, 231, 255, ${connectionStrength * (1 - distance / connectionDistance)})`;
        context.lineWidth = 1;
        context.stroke();
      }
    }

    animationId = requestAnimationFrame(renderParticles);
  };

  const startParticleLayer = () => {
    const particlesEnabled =
      !hero?.classList.contains("hero--editorial") || mobileQuery.matches;
    if (!particlesEnabled) {
      context.clearRect(0, 0, width, height);
      return;
    }

    resizeCanvas();
    if (reduceMotion) {
      drawStaticParticles();
    } else {
      renderParticles();
    }
  };

  startParticleLayer();

  window.addEventListener("resize", () => {
    if (animationId) cancelAnimationFrame(animationId);
    particleAnimationStart = 0;
    startParticleLayer();
  });
})();

export {};
