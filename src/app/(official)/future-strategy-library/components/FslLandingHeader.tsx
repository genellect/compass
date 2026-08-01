import styles from "../future-strategy-library.module.css";
import { RegistrationCTA } from "./RegistrationCTA.client";

export function FslLandingHeader() {
  return (
    <>
      <a className={styles.skipLink} href="#main">本文へスキップ</a>
      <header className={styles.landingHeader} data-fsl-landing-header>
        <div className={styles.headerInner}>
          <a className={styles.headerBrand} href="/" aria-label="COMPASS公式サイトへ">
            <span className={styles.brandMark} aria-hidden="true"><span /></span>
            <span className={styles.brandCopy}>
              <strong>COMPASS</strong>
              <small>Better Decisions</small>
            </span>
            <span className={styles.headerDivider} aria-hidden="true" />
            <span className={styles.productName}>Future Strategy Library</span>
          </a>

          <nav className={styles.anchorNav} aria-label="未来戦略ライブラリ ページ内ナビゲーション">
            <a href="#materials">資料例</a>
            <a href="#fields">四つの分野</a>
            <a href="#access">利用条件</a>
          </nav>

          <RegistrationCTA placement="header" />
        </div>
      </header>
    </>
  );
}
