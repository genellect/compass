import type { Metadata } from "next";
import { CommunityJoinForm } from "./CommunityJoinForm";
import styles from "./community-join.module.css";

export const metadata: Metadata = {
  title: "COMPASS Communityに参加する | COMPASS",
  description: "学生支援団体COMPASS Communityへの登録申請フォームです。",
  alternates: { canonical: "/community/join/" },
  robots: { index: false, follow: true },
  openGraph: {
    title: "COMPASS Communityに参加する | COMPASS",
    description: "学生支援団体COMPASS Communityへの登録申請フォームです。",
    url: "/community/join/"
  }
};

export default function CommunityJoinPage() {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#registration-form">フォームへ移動</a>

      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="COMPASS公式サイトへ戻る">
          <span className={styles.brandMark} aria-hidden="true"><span /></span>
          <span><strong>COMPASS</strong><small>Better Decisions</small></span>
        </a>
        <a className={styles.backLink} href="/">公式サイトへ戻る <span aria-hidden="true">↗</span></a>
      </header>

      <main className={styles.main}>
        <CommunityJoinForm />
      </main>

      <footer className={styles.footer}>
        <span>学生支援団体COMPASS</span>
        <span>© 2026 COMPASS</span>
      </footer>
    </div>
  );
}
