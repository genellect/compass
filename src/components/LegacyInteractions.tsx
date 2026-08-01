"use client";

import { useEffect } from "react";

export function LegacyInteractions() {
  useEffect(() => {
    let cancelled = false;
    const root = document.documentElement;
    const revealWasInitialized = root.classList.contains("reveal-ready");

    void import("../legacy-interactions")
      .then(() => {
        if (cancelled || !revealWasInitialized) return;
        document.querySelectorAll("[data-reveal]").forEach((target) => {
          target.classList.add("is-visible");
        });
      })
      .catch(() => {
        if (cancelled) return;
        root.classList.remove("reveal-ready");
        document.querySelectorAll("[data-reveal]").forEach((target) => {
          target.classList.add("is-visible");
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
