import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ContactForm } from "./ContactForm";
import styles from "./contact.module.css";

export const metadata: Metadata = {
  title: "お問い合わせ | COMPASS",
  description: "COMPASSへの公式お問い合わせと、代表へのご連絡を受け付けています。",
  alternates: { canonical: "/contact/" },
  robots: { index: false, follow: true },
  openGraph: {
    title: "お問い合わせ | COMPASS",
    description: "COMPASSへの公式お問い合わせと、代表へのご連絡を受け付けています。",
    url: "/contact/"
  }
};

export default function ContactPage() {
  return (
    <>
      <SiteHeader routeContext="contact" />
      <div className={styles.page}>
        <main id="main" className={styles.main}>
          <ContactForm />
        </main>
      </div>
      <SiteFooter routeContext="contact" />
    </>
  );
}
