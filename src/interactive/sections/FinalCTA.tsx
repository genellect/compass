import { links } from "../content/interactiveContent";
import { Section } from "../components/ui/Section";
import styles from "../components/layout/product-ending.module.css";

export function FinalCTA() {
  return (
    <Section id="start" className={styles.closing}>
      <div className={styles.closingInner}>
        <div className={styles.closingCopy}>
          <p className={styles.eyebrow}>ENTER THE NEXT LECTURE</p>
          <h2>次の講義を、<br />ここから始めよう。</h2>
          <p className={styles.lead}>学生の疑問が届き、教員の次のひと言につながる講義を、3分のデモで体験できます。</p>
        </div>
        <div className={styles.closingActions}>
          <a className={styles.primary} href={links.demo}>講義を体験する<span aria-hidden="true">→</span></a>
          <p className={styles.proof}>登録不要・デモデータ・約3分</p>
          <a className={styles.secondary} data-cta-location="final-code-join" href={links.join}>講義コードで参加する<span aria-hidden="true">↗</span></a>
        </div>
      </div>
    </Section>
  );
}
