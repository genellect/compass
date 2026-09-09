"use client";

import { useState } from "react";
import { ProductSculpture, type SculptureKind } from "./ProductSculpture";
import styles from "./products-cinematic.module.css";

type Product = {
  key: SculptureKind;
  label: string;
  links: readonly { label: string; href: string }[];
};

function Arrow() {
  return <svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M8 31 31 8M9 8h22v22" stroke="currentColor" strokeWidth="1.8" /></svg>;
}

export function FounderProducts({ products, language = "ja" }: { products: readonly Product[]; language?: "ja" | "en" }) {
  const [paused, setPaused] = useState(false);
  const english = language === "en";
  const platform: Product = { key: "platform", label: "COMPASS Platform", links: [{ label: english ? "Explore COMPASS" : "COMPASSを体験する", href: "https://compass-official.pages.dev/" }] };
  const cards = [
    ...products.map(product => ({ product, layout: product.key === "interactive" ? "shared" : "compact" } as const)),
    { product: platform, layout: "wide" as const },
    ...products.filter(product => product.key === "library").map(product => ({ product, layout: "wide" as const }))
  ];
  return (
    <div className={styles.world} data-products-cinematic="true" data-language={language} data-paused={paused}>
      <div className={styles.grid}>
        {cards.map(({ product, layout }) => {
          const [primary, ...secondary] = product.links;
          const external = english || new URL(primary.href).origin !== "https://compass-official.pages.dev";
          return (
            <article key={`${layout}-${product.key}`} className={styles.product} data-product={product.key} data-layout={layout}>
              <div className={styles.stage}>
                <ProductSculpture kind={product.key} paused={paused} layout={layout} />
                <div className={styles.shade} aria-hidden="true" />
                <div className={styles.identity}><span className={styles.mark} aria-hidden="true" />{product.label}</div>
                <h3 className={styles.title}>
                  {product.key === "interactive" ? <><span>LET EVERYTHING</span><strong>MOVE.</strong></>
                    : product.key === "library" ? <><span>BEYOND THE</span><strong>SYLLABUS.</strong></>
                      : product.key === "platform" ? <><span>Don’t Just Learn.</span><strong>Build What’s Next.</strong></>
                      : english ? <><span>LIFE IN THE</span><strong>AGE OF AI.</strong></>
                        : <><span>AI時代を</span><strong>どう生きるか。</strong></>}
                </h3>
                <a className={styles.destination} href={primary.href} aria-label={`${product.label}: ${primary.label}`} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
                  <span>{primary.label}</span><Arrow />
                </a>
              </div>
              {secondary.length > 0 && <nav className={styles.secondary} aria-label={english ? `${product.label} links` : `${product.label}へのリンク`}>
                {secondary.map((link) => {
                  const opensNew = english || new URL(link.href).origin !== "https://compass-official.pages.dev";
                  return <a key={link.href} href={link.href} target={opensNew ? "_blank" : undefined} rel={opensNew ? "noopener noreferrer" : undefined}>{link.label}<span aria-hidden="true">↗</span></a>;
                })}
              </nav>}
            </article>
          );
        })}
      </div>
      <button className={styles.motion} type="button" aria-pressed={paused} aria-label={english ? (paused ? "Resume 3D motion" : "Pause 3D motion") : (paused ? "3Dの自動モーションを再開" : "3Dの自動モーションを一時停止")} onClick={() => setPaused(!paused)}>
        <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>{english ? (paused ? "Play" : "Pause") : (paused ? "再生" : "一時停止")}
      </button>
    </div>
  );
}
