"use client";

import { useEffect, useRef } from "react";
import styles from "./founder.module.css";

/** Decorative only: the portrait and its layout never depend on WebGL. */
export function MobileHeroSculpture({ paused, activeIndex }: { paused: boolean; activeIndex: number }) {
  const root = useRef<HTMLDivElement>(null);
  const motion = useRef({ paused, activeIndex });

  useEffect(() => { motion.current = { paused, activeIndex }; }, [paused, activeIndex]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const mobile = window.matchMedia("(max-width: 640px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposeScene: (() => void) | undefined;
    let generation = 0;

    const configure = async () => {
      const currentGeneration = ++generation;
      disposeScene?.();
      disposeScene = undefined;
      if (!mobile.matches || reduced.matches) return;

      try {
        const THREE = await import("three");
        if (generation !== currentGeneration) return;
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.setAttribute("aria-hidden", "true");
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-2, 2, 2.5, -2.5, 0.1, 30);
        camera.position.z = 8;
        scene.add(new THREE.HemisphereLight(0xffffff, 0x6b8b9e, 2.8));
        const key = new THREE.DirectionalLight(0xffffff, 3.4);
        key.position.set(-3, 5, 5);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0x9bd4e2, 1.6);
        rim.position.set(4, -2, 3);
        scene.add(rim);

        // A continuous folded sheet, with a real front/back and changing normals.
        const vertices: number[] = [];
        const indices: number[] = [];
        const segments = 128;
        for (let i = 0; i <= segments; i++) {
          const t = (i / segments) * Math.PI * 2;
          const twist = Math.sin(t * 2 + 0.8) * 0.85;
          for (const edge of [-1, 1]) {
            const width = edge * (0.16 + 0.055 * Math.sin(t + 0.4));
            vertices.push(
              (2.08 + width * Math.cos(twist)) * Math.cos(t),
              (2.48 + width * Math.cos(twist)) * Math.sin(t),
              0.55 * Math.sin(t + 0.5) + width * Math.sin(twist)
            );
          }
          if (i < segments) {
            const a = i * 2;
            indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
          }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({ color: 0xc2d8e3, metalness: 0.3, roughness: 0.38, side: THREE.DoubleSide });
        const sheet = new THREE.Mesh(geometry, material);
        scene.add(sheet);

        const resize = () => {
          const { width, height } = element.getBoundingClientRect();
          if (!width || !height) return;
          const halfWidth = (width / height) * 2.65;
          camera.left = -halfWidth;
          camera.right = halfWidth;
          camera.top = 2.65;
          camera.bottom = -2.65;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
        };
        resize();
        element.appendChild(renderer.domElement);
        let raf = 0;
        let previous = 0;
        let elapsed = 0;
        let visible = true;
        let disposed = false;
        let target = motion.current.activeIndex;
        let turn = target;
        const render = (now: number) => {
          if (disposed) return;
          raf = requestAnimationFrame(render);
          if (now - previous < 1000 / 30) return;
          const delta = Math.min((now - previous) / 1000, 0.05);
          previous = now;
          if (!visible || document.hidden) return;
          if (!motion.current.paused) elapsed += delta;
          target = motion.current.activeIndex;
          turn += (target - turn) * 0.075;
          const phase = elapsed * Math.PI * 2 / 15.6;
          sheet.rotation.set(0.12 * Math.sin(phase), 0.22 * Math.sin(phase + 0.4), -0.19 + 0.11 * Math.sin(phase) + turn * 0.025);
          sheet.position.x = 0.035 * Math.sin(phase);
          renderer.render(scene, camera);
          element.dataset.ready = "true";
        };
        const observer = new ResizeObserver(resize);
        observer.observe(element);
        const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0 });
        intersection.observe(element);
        const contextLost = (event: Event) => { event.preventDefault(); element.dataset.ready = "false"; };
        renderer.domElement.addEventListener("webglcontextlost", contextLost);
        raf = requestAnimationFrame(render);
        disposeScene = () => {
          disposed = true;
          cancelAnimationFrame(raf);
          observer.disconnect();
          intersection.disconnect();
          renderer.domElement.removeEventListener("webglcontextlost", contextLost);
          renderer.domElement.remove();
          geometry.dispose();
          material.dispose();
          renderer.dispose();
          delete element.dataset.ready;
        };
      } catch {
        // CSS sculpture remains visible when WebGL is unavailable.
      }
    };
    void configure();
    mobile.addEventListener("change", configure);
    reduced.addEventListener("change", configure);
    return () => {
      generation++;
      disposeScene?.();
      mobile.removeEventListener("change", configure);
      reduced.removeEventListener("change", configure);
    };
  }, []);

  return <div ref={root} className={styles.mobileHeroSculpture} aria-hidden="true"><span /></div>;
}
