import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ContactForm } from "./ContactForm";
import styles from "./contact.module.css";

export const metadata: Metadata = {
  title: "お問い合わせ | COMPASS",
  description: "COMPASSおよび代表（松井）へのお問い合わせ・ご連絡を受け付けています。",
  alternates: { canonical: "/contact/" },
  robots: { index: false, follow: true },
  openGraph: {
    title: "お問い合わせ | COMPASS",
    description: "COMPASSおよび代表（松井）へのお問い合わせ・ご連絡を受け付けています。",
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
