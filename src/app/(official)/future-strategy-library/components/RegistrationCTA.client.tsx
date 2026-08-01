"use client";

import Link from "next/link";

import styles from "../future-strategy-library.module.css";
import {
  FUTURE_STRATEGY_LIBRARY_REGISTRATION_HREF,
  isExternalCompassHref
} from "../../../../lib/futureStrategyLibrary";

type Placement = "header" | "hero" | "materials" | "final";

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

const placementClasses: Record<Placement, string> = {
  header: styles.ctaHeader,
  hero: styles.ctaHero,
  materials: styles.ctaMaterials,
  final: styles.ctaFinal
};

function viewportName() {
  if (window.innerWidth <= 720) return "mobile";
  if (window.innerWidth <= 1179) return "tablet";
  return "desktop";
}

export function RegistrationCTA({ placement }: { placement: Placement }) {
  const isExternal = isExternalCompassHref(FUTURE_STRATEGY_LIBRARY_REGISTRATION_HREF);

  const handleClick = () => {
    window.dataLayer?.push({
      event: "fsl_cta_click",
      placement,
      viewport_category: viewportName()
    });
  };

  const content = (
    <>
      <span>大学アカウントで無料登録する</span>
      <span className={styles.ctaArrow} aria-hidden="true">↗</span>
      {isExternal ? <span className={styles.srOnly}>（新しいタブで開きます）</span> : null}
    </>
  );

  const sharedProps = {
    className: `${styles.registrationAction} ${placementClasses[placement]}`,
    "data-library-registration": "true",
    "data-placement": placement,
    onClick: handleClick
  };

  if (!isExternal) {
    return (
      <Link href={FUTURE_STRATEGY_LIBRARY_REGISTRATION_HREF} {...sharedProps}>
        {content}
      </Link>
    );
  }

  return (
    <a
      href={FUTURE_STRATEGY_LIBRARY_REGISTRATION_HREF}
      target="_blank"
      rel="noopener noreferrer"
      {...sharedProps}
    >
      {content}
    </a>
  );
}
