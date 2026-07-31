import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
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
    <>
      <SiteHeader routeContext="contact" />
      <div className={styles.page}>
        <main id="main" className={styles.main}>
          <a className={styles.backLink} href="/">公式サイトへ戻る <span aria-hidden="true">↗</span></a>
          <ContactForm />
        </main>
      </div>
      <SiteFooter routeContext="contact" />
    </>
  );
}
