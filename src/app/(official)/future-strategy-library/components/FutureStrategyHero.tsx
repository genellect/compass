import styles from "../future-strategy-library.module.css";
import { libraryMetrics, materials } from "../content";
import { RegistrationCTA } from "./RegistrationCTA.client";

/*
 * The Hero leads with the product itself: the three published covers are
 * fanned beside the registration action so a first-time visitor sees what the
 * free account unlocks before reading anything else. The covers repeat the
 * Featured Materials images, so they are decorative here (empty alt).
 */
export function FutureStrategyHero() {
  return (
    <section className={styles.hero} aria-labelledby="library-title" data-library-section="hero">
      <div className={styles.heroInner}>
        <div className={styles.heroLower}>
          <div className={styles.heroEditorial}>
            <h1 id="library-title" className={styles.heroTitle}>
              <span>BEYOND THE </span><span>SYLLABUS.</span>
            </h1>

            <div className={styles.heroCopy}>
              <p className={styles.heroSubhead}>
                <span>未来は、知っている人から</span><span>動き出す。</span>
              </p>
              <p className={styles.heroDescription}>
                北里大学薬学部生のための、<br />
                学生目線の資料ライブラリ。
              </p>
              <div className={styles.heroActionGroup}>
                <RegistrationCTA placement="hero" />
                <p className={styles.actionMicrocopy}>
                  <span>北里大学薬学部生限定 ·</span>{" "}
                  <span>登録・利用無料 ·</span>{" "}
                  <span>大学アカウント認証</span>
                </p>
              </div>
            </div>

            <dl className={styles.proofRail} aria-label="未来戦略ライブラリの実績">
              <div>
                <dt>{libraryMetrics.startedAt}</dt>
                <dd>活動開始</dd>
              </div>
              <div>
                <dt>{libraryMetrics.registeredUsers}<span>+</span></dt>
                <dd>利用登録者 <small>{libraryMetrics.registeredUsersAsOf}</small></dd>
              </div>
              <div>
                <dt>{libraryMetrics.materialCount}<span>+</span></dt>
                <dd>掲載資料</dd>
              </div>
            </dl>
          </div>

          <div className={styles.heroShelf} aria-hidden="true">
            {materials.map((material, index) => (
              <img
                key={material.image}
                className={styles.heroCover}
                data-cover={index}
                src={material.image}
                alt=""
                width="600"
                height="800"
                sizes="(max-width: 900px) 34vw, 22vw"
                fetchPriority={index === 0 ? "high" : "auto"}
                decoding="async"
              />
            ))}
          </div>
        </div>

        <div className={styles.heroHorizonRule} aria-hidden="true">
          <span>SYLLABUS / CURRENT</span>
          <span>BEYOND / VISIBLE CHOICES</span>
        </div>
      </div>
    </section>
  );
}
