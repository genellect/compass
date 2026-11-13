"use client";

import { useState, type CSSProperties } from "react";
import { ProductSculpture, type SculptureKind } from "./ProductSculpture";
import sceneStyles from "./products-cinematic.module.css";
import styles from "./products-equal.module.css";

type Product = {
  key: SculptureKind | "cytellect" | "topos";
  label: string;
  headline?: readonly [string, string];
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
  // Recognition blocks in one row share the height of the longest list.
  const ledgerRows = Math.max(0, ...products.map(product => product.recognition?.length ?? 0));
  return (
    <div className={`${sceneStyles.world} ${styles.world}`} data-products-cinematic="true" data-language={language} data-paused={paused} style={{ "--ledger-rows": ledgerRows } as CSSProperties}>
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
                        src={!english && product.key === "cytellect" ? "/images/founder-products/cytellect/research-jp.png" : STILLS[product.key].src}
                        alt={!english && product.key === "cytellect" ? "顕微鏡画像から論文の図へ。顕微鏡と解析結果のビジュアル" : english ? STILLS[product.key].en : STILLS[product.key].ja}
                        width={!english && product.key === "cytellect" ? 1280 : STILLS[product.key].width} height={!english && product.key === "cytellect" ? 1280 : STILLS[product.key].height} loading="lazy" decoding="async"
                      />
                    </div>
                  ) : <ProductSculpture kind={product.key} paused={paused} />}
                </div>
                <div className={styles.copy}>
                <div className={styles.identity}><span className={styles.mark} aria-hidden="true" />{product.label}</div>
                <h3 className={styles.title}>
                  {english && product.headline ? <><span>{product.headline[0]}</span><strong>{product.headline[1]}</strong></>
                    : product.key === "interactive" ? <><span>LET EVERYTHING</span><strong>MOVE.</strong></>
                    : product.key === "cytellect" ? english ? <><span>Get your microscopy</span><strong>publication-ready.</strong></> : <><span>眠る顕微鏡画像を、</span><strong>病気を解くデータへ。</strong></>
                      : product.key === "topos" ? <><span>誰の考えも<wbr />埋もれない議論を、</span><strong>すべての教室に。</strong></>
                      : product.key === "platform" ? <><span>Don’t Just Learn.</span><strong>Build What’s Next.</strong></>
                      : english ? <><span>LIFE IN THE</span><strong>AGE OF AI.</strong></>
                        : <><span>AI時代を</span><strong>どう生きるか。</strong></>}
                </h3>
                {product.recognition && product.recognition.length > 0 && (
                  <ul className={styles.recognition} aria-label={english ? `${product.label} recognition` : `${product.label}の実績`}>
                    {product.recognition.map(item => <li key={item.event}><span>{item.event}</span>{item.result && <strong>{item.result}</strong>}</li>)}
                  </ul>
                )}
                <a className={styles.destination} href={primary.href} aria-label={`${product.label}: ${primary.label}`} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
                  <span>{primary.label}</span><Arrow />
                </a>
                {!english && (product.key === "cytellect" || product.key === "topos") && (
                  <a className={styles.repository} href={product.key === "cytellect" ? "https://github.com/genellect/cytellect" : "https://github.com/genellect/devfest2026-t167"} target="_blank" rel="noopener noreferrer" aria-label={`${product.label}のソースをGitHubで見る（新しいタブ）`} title="GitHubでソースを見る">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.53v-2.06c-3.09.67-3.74-1.31-3.74-1.31-.5-1.28-1.24-1.62-1.24-1.62-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.14 1.71 1.14.99 1.7 2.6 1.21 3.23.92.1-.72.39-1.21.71-1.49-2.47-.28-5.07-1.24-5.07-5.49 0-1.21.43-2.2 1.14-2.98-.11-.28-.49-1.41.11-2.94 0 0 .93-.3 3.05 1.14A10.6 10.6 0 0 1 12 6.26c.94 0 1.88.13 2.77.37 2.12-1.44 3.05-1.14 3.05-1.14.6 1.53.22 2.66.11 2.94.71.78 1.14 1.77 1.14 2.98 0 4.26-2.6 5.21-5.08 5.48.4.35.75 1.02.75 2.06V22c0 .29.2.64.76.53A11.1 11.1 0 0 0 12 .9Z"/></svg>
                  </a>
                )}
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
