import styles from "../future-strategy-library.module.css";
import { HeroIntelligenceField } from "./HeroIntelligenceField.client";
import { KnowledgeHorizonGraphic } from "./KnowledgeHorizonGraphic";
import { RegistrationCTA } from "./RegistrationCTA.client";

type FutureStrategyHeroProps = {
  variant?: "page" | "preview";
};

function FutureStrategyHeroComposition({ preview }: { preview: boolean }) {
  return (
    <div className={styles.heroInner}>
      <div className={styles.heroLower}>
        <div className={styles.heroEditorial}>
          {preview ? (
            <p className={`${styles.heroTitle} ${styles.heroEnter}`}>
              <span>BEYOND THE </span><span>SYLLABUS.</span>
            </p>
          ) : (
            <h1 id="library-title" className={`${styles.heroTitle} ${styles.heroEnter}`}>
              <span>BEYOND THE </span><span>SYLLABUS.</span>
            </h1>
          )}

          <div className={styles.heroCopy}>
            <p className={`${styles.heroSubhead} ${styles.heroEnter}`}>
              <span>未来は、知っている人から</span><span>動き出す。</span>
            </p>
            {!preview ? (
              <>
                <p className={`${styles.heroDescription} ${styles.heroEnter}`}>
                  北里大学薬学部生のための、<br />
                  学生目線の資料ライブラリ。
                </p>
                <div className={`${styles.heroActionGroup} ${styles.heroEnter}`}>
                  <RegistrationCTA placement="hero" />
                  <p className={styles.actionMicrocopy}>
                    <span>北里大学薬学部生限定 ·</span>{" "}
                    <span>登録・利用無料 ·</span>{" "}
                    <span>大学アカウント認証</span>
                  </p>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <KnowledgeHorizonGraphic />
      </div>

      <div className={styles.heroHorizonRule} aria-hidden="true">
        <span>SYLLABUS / CURRENT</span>
        <span>BEYOND / VISIBLE CHOICES</span>
      </div>
    </div>
  );
}

export function FutureStrategyHero({ variant = "page" }: FutureStrategyHeroProps) {
  const preview = variant === "preview";

  if (preview) {
    return (
      <div
        className={`${styles.hero} ${styles.heroPreview}`}
        data-library-hero-preview="true"
        aria-hidden="true"
      >
        <div className={styles.heroGrid} />
        <div className={styles.heroAtmosphere} />
        <FutureStrategyHeroComposition preview />
      </div>
    );
  }

  return (
    <section className={styles.hero} aria-labelledby="library-title" data-library-section="hero">
      <div className={styles.heroGrid} aria-hidden="true" />
      <div className={styles.heroAtmosphere} aria-hidden="true" />
      <HeroIntelligenceField className={styles.heroIntelligenceField} />
      <FutureStrategyHeroComposition preview={false} />
    </section>
  );
}
