"use client";

import { useState } from "react";
import { ProductSculpture, type SculptureKind } from "./ProductSculpture";
import sceneStyles from "./products-cinematic.module.css";
import styles from "./products-equal.module.css";

type Product = {
  key: SculptureKind | "cytellect";
  label: string;
  links: readonly { label: string; href: string }[];
};

function Arrow() {
  return <svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M8 31 31 8M9 8h22v22" stroke="currentColor" strokeWidth="1.8" /></svg>;
}

export function FounderProducts({ products, language = "ja" }: { products: readonly Product[]; language?: "ja" | "en" }) {
  const [paused, setPaused] = useState(false);
  const english = language === "en";
  return (
    <div className={`${sceneStyles.world} ${styles.world}`} data-products-cinematic="true" data-language={language} data-paused={paused}>
      <div className={styles.grid}>
        {products.map(product => {
          const [primary, ...secondary] = product.links;
          const external = english || new URL(primary.href).origin !== "https://compass-official.pages.dev";
          return (
            <article key={product.key} className={`${sceneStyles.product} ${styles.product}`} data-product={product.key}>
              <div className={styles.stage}>
                <div className={styles.media}>
                  {product.key === "cytellect" || product.key === "platform" ? (
                    <div className={styles.still} data-scene={product.key}>
                      <img
                        src={product.key === "cytellect" ? "/images/founder-products/cytellect/well-hero.webp" : "/habitat/night-v1/top.webp"}
                        alt={product.key === "cytellect"
                          ? (english ? "A six-well culture plate and pipette, from the Cytellect landing page" : "Cytellectの紹介サイトで使用している6穴プレートとピペット")
                          : (english ? "An illuminated circular gateway from the COMPASS homepage" : "COMPASS親サイトの光る円環と通路")}
                        width={1920} height={1080} loading="lazy" decoding="async"
                      />
                    </div>
                  ) : <ProductSculpture kind={product.key} paused={paused} />}
                </div>
                <div className={styles.copy}>
                <div className={styles.identity}><span className={styles.mark} aria-hidden="true" />{product.label}</div>
                <h3 className={styles.title}>
                  {product.key === "interactive" ? <><span>LET EVERYTHING</span><strong>MOVE.</strong></>
                    : product.key === "cytellect" ? <><span>Get your microscopy</span><strong>publication-ready.</strong></>
                      : product.key === "platform" ? <><span>Don’t Just Learn.</span><strong>Build What’s Next.</strong></>
                      : english ? <><span>LIFE IN THE</span><strong>AGE OF AI.</strong></>
                        : <><span>AI時代を</span><strong>どう生きるか。</strong></>}
                </h3>
                <a className={styles.destination} href={primary.href} aria-label={`${product.label}: ${primary.label}`} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
                  <span>{primary.label}</span><Arrow />
                </a>
                </div>
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
