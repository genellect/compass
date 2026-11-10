"use client";

import { useState } from "react";
import { ProductSculpture, type SculptureKind } from "./ProductSculpture";
import sceneStyles from "./products-cinematic.module.css";
import styles from "./products-equal.module.css";

type Product = {
  key: SculptureKind | "cytellect" | "topos";
  label: string;
  links: readonly { label: string; href: string }[];
  recognition?: readonly { event: string; result?: string }[];
};

const STILLS = {
  cytellect: { src: "/images/founder-products/cytellect/well-hero.webp", width: 1920, height: 1080, ja: "Cytellectの紹介サイトで使用している6穴プレートとピペット", en: "A six-well culture plate and pipette, from the Cytellect landing page" },
  topos: { src: "/images/founder-products/topos/readme-hero.webp", width: 1280, height: 640, ja: "Toposのプロダクト紹介画像。議論の分析画面と発言率の変化", en: "Topos product image showing its discussion analysis screens" },
  platform: { src: "/habitat/night-v1/top.webp", width: 1920, height: 1080, ja: "COMPASS親サイトの光る円環と通路", en: "An illuminated circular gateway from the COMPASS homepage" }
} as const;

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
                  {product.key === "cytellect" || product.key === "topos" || product.key === "platform" ? (
                    <div className={styles.still} data-scene={product.key}>
                      <img
                        src={STILLS[product.key].src}
                        alt={english ? STILLS[product.key].en : STILLS[product.key].ja}
                        width={STILLS[product.key].width} height={STILLS[product.key].height} loading="lazy" decoding="async"
                      />
                    </div>
                  ) : <ProductSculpture kind={product.key} paused={paused} />}
                </div>
                <div className={styles.copy}>
                <div className={styles.identity}><span className={styles.mark} aria-hidden="true" />{product.label}</div>
                {product.key === "topos" && english ? <><h3 className={styles.visuallyHidden}>{product.label}</h3><div className={styles.title} aria-hidden="true" /></> : <h3 className={styles.title}>
                  {product.key === "interactive" ? <><span>LET EVERYTHING</span><strong>MOVE.</strong></>
                    : product.key === "cytellect" ? <><span>Get your microscopy</span><strong>publication-ready.</strong></>
                      : product.key === "topos" ? <><span>誰の考えも<wbr />埋もれない議論を、</span><strong>すべての教室に。</strong></>
                      : product.key === "platform" ? <><span>Don’t Just Learn.</span><strong>Build What’s Next.</strong></>
                      : english ? <><span>LIFE IN THE</span><strong>AGE OF AI.</strong></>
                        : <><span>AI時代を</span><strong>どう生きるか。</strong></>}
                </h3>}
                {product.recognition && product.recognition.length > 0 && (
                  <ul className={styles.recognition} aria-label={english ? `${product.label} recognition` : `${product.label}の実績`}>
                    {product.recognition.map(item => <li key={item.event}><span>{item.event}</span>{item.result && <strong>{item.result}</strong>}</li>)}
                  </ul>
                )}
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
