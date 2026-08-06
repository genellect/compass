"use client";

import { useEffect, useRef, useState } from "react";

import styles from "../future-strategy-library.module.css";
import { RegistrationCTA } from "./RegistrationCTA.client";

const MOBILE_QUERY = "(max-width: 720px)";

export function MobileRegistrationPrompt() {
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const activatedRef = useRef(false);
  const activationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const body = document.body;

    const update = () => {
      const hero = document.querySelector<HTMLElement>('[data-library-section="hero"]');
      const finalSection = document.querySelector<HTMLElement>('[data-library-section="final"]');
      const header = document.querySelector<HTMLElement>(".site-header");

      if (!media.matches || !hero || !finalSection || dismissed) {
        setVisible(false);
        return;
      }

      const headerOffset = header?.getBoundingClientRect().height ?? 0;
      const heroHasPassed = hero.getBoundingClientRect().bottom <= headerOffset + 8;
      const finalSectionIsNear = finalSection.getBoundingClientRect().top <= window.innerHeight * 0.82;
      const menuIsOpen = body.classList.contains("menu-open");

      const shouldShow = heroHasPassed && !finalSectionIsNear && !menuIsOpen;
      if (shouldShow && !activatedRef.current) {
        activatedRef.current = true;
        setMounted(true);
        activationFrameRef.current = window.requestAnimationFrame(() => setVisible(true));
        return;
      }

      setVisible(shouldShow);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    media.addEventListener("change", update);

    const menuObserver = new MutationObserver(update);
    menuObserver.observe(body, { attributes: true, attributeFilter: ["class"] });

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      media.removeEventListener("change", update);
      menuObserver.disconnect();
      if (activationFrameRef.current !== null) {
        window.cancelAnimationFrame(activationFrameRef.current);
      }
    };
  }, [dismissed]);

  if (!mounted) return null;

  return (
    <aside
      className={`${styles.mobileRegistrationPrompt} ${visible ? styles.mobileRegistrationPromptVisible : ""}`}
      aria-label="未来戦略ライブラリの無料登録"
      aria-hidden={!visible}
      data-mobile-registration-prompt
      data-visible={visible ? "true" : "false"}
    >
      <span className={styles.mobileRegistrationPromptLabel}>北里薬学生限定</span>
      <button
        type="button"
        className={styles.mobileRegistrationPromptClose}
        aria-label="登録案内を閉じる"
        onClick={() => setDismissed(true)}
        tabIndex={visible ? 0 : -1}
      >
        <span aria-hidden="true">×</span>
      </button>
      <RegistrationCTA placement="sticky" tabIndex={visible ? 0 : -1} />
    </aside>
  );
}
