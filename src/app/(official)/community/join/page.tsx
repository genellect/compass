import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
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
    <>
      <SiteHeader routeContext="community" />
      <div className={styles.page}>
        <main id="main" className={styles.main}>
          <a className={styles.backLink} href="/">公式サイトへ戻る <span aria-hidden="true">↗</span></a>
          <CommunityJoinForm />
        </main>
      </div>
      <SiteFooter routeContext="community" />
    </>
  );
}
