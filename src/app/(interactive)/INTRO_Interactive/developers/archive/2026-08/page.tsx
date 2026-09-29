import type { Metadata } from "next";
import Link from "next/link";
import { ArchivedDeveloperApp } from "../../../../../../interactive/developer/archive-2026-08/ArchivedDeveloperApp";
import styles from "../../../../../../interactive/developer/archive-2026-08/archive.module.css";

export const metadata: Metadata = {
  title: "8月時点のアーカイブ | COMPASS Interactive",
  description: "審査員向けに保存したCOMPASS Interactiveの旧開発者ページ。",
  alternates: { canonical: "/INTRO_Interactive/developers/archive/2026-08/" },
  robots: { index: false, follow: true }
};

export default function AugustArchivePage() {
  return <div className={styles.archive}>
    <nav className={styles.archiveNotice} aria-label="アーカイブの案内">
      <strong>8月時点のアーカイブ</strong>
      <Link href="/INTRO_Interactive/developers/">開発者向け技術情報へ</Link>
      <Link href="/INTRO_Interactive/developers/archive/">アーカイブ一覧へ</Link>
    </nav>
    <ArchivedDeveloperApp />
  </div>;
}
