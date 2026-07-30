import type { Metadata } from "next";
import { ContactForm } from "./ContactForm";
import styles from "./contact.module.css";

export const metadata: Metadata = {
  title: "お問い合わせ | COMPASS",
  description: "COMPASSの教育活動・講演・共同企画・監修等に関するお問い合わせフォームです。",
  alternates: { canonical: "/contact/" },
  robots: { index: false, follow: true },
  openGraph: {
    title: "お問い合わせ | COMPASS",
    description: "COMPASSの教育活動・講演・共同企画・監修等に関するお問い合わせフォームです。",
    url: "/contact/"
  }
};

export default function ContactPage() {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#contact-form">フォームへ移動</a>

      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="COMPASS公式サイトへ戻る">
          <span className={styles.brandMark} aria-hidden="true"><span /></span>
          <span><strong>COMPASS</strong><small>Better Decisions</small></span>
        </a>
        <a className={styles.backLink} href="/">公式サイトへ戻る <span aria-hidden="true">↗</span></a>
      </header>

      <main className={styles.main}>
        <ContactForm />
      </main>

      <footer className={styles.footer}>
        <span>学生支援団体COMPASS</span>
        <span>© 2026 COMPASS</span>
      </footer>
    </div>
  );
}
