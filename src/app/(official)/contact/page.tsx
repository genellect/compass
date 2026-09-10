import type { Metadata, Viewport } from "next";
import { ContactForm } from "./ContactForm";
import { ContactHeader, ContactFooter } from "./ContactChrome";
import styles from "./contact.module.css";

export const metadata: Metadata = {
  title: "Contact | お問い合わせ",
  description: "COMPASSへの公式お問い合わせと、代表へのご連絡を受け付けています。",
  alternates: { canonical: "/contact/" },
  robots: { index: false, follow: true },
  openGraph: {
    title: "Contact | お問い合わせ",
    siteName: "Contact",
    description: "COMPASSへの公式お問い合わせと、代表へのご連絡を受け付けています。",
    url: "/contact/"
  },
  twitter: {
    card: "summary",
    title: "Contact | お問い合わせ",
    description: "COMPASSへの公式お問い合わせと、代表へのご連絡を受け付けています。"
  }
};

export const viewport: Viewport = { themeColor: "#f6f8f7" };

export default function ContactPage() {
  return (
    <div className={styles.page} id="contact-top">
      <ContactHeader />
      <div className={styles.gallery}>
        <main id="main" className={styles.main}>
          <ContactForm />
        </main>
      </div>
      <ContactFooter />
    </div>
  );
}
