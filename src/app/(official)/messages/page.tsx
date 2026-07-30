import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { MessageReader } from "./MessageReader";
import { parseMessageMarkdown } from "./messageParser";
import styles from "./messages.module.css";

export const metadata: Metadata = {
  title: "AIに仕事を奪われる？ | COMPASS",
  description: "AIに仕事を奪われるのを待つのではなく、先に部下にした。AI時代の学び、専門性、責任、そして未来をつくることについてのCOMPASS創設者メッセージ。",
  alternates: { canonical: "/messages/" },
  openGraph: {
    type: "article",
    locale: "ja_JP",
    siteName: "COMPASS",
    title: "AIに仕事を奪われる？ | COMPASS",
    description: "私は先に、AIを部下にしました。AI時代を観客席ではなく、つくる側から考えるメッセージ。",
    url: "/messages/",
    images: ["/images/hero.desktop.highlight.png"]
  },
  twitter: {
    card: "summary_large_image",
    title: "AIに仕事を奪われる？ | COMPASS",
    description: "私は先に、AIを部下にしました。AI時代を観客席ではなく、つくる側から考えるメッセージ。",
    images: ["/images/hero.desktop.highlight.png"]
  }
};

async function loadMessage() {
  const source = await readFile(
    path.join(process.cwd(), "src", "app", "(official)", "messages", "message.md"),
    "utf8"
  );
  return parseMessageMarkdown(source);
}

export default async function MessagesPage() {
  const message = await loadMessage();
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: message.title,
    inLanguage: "ja",
    mainEntityOfPage: "https://compass-official.pages.dev/messages/",
    author: { "@type": "Person", name: "Yuto Matsui" },
    publisher: {
      "@type": "EducationalOrganization",
      name: "COMPASS",
      url: "https://compass-official.pages.dev/",
      logo: { "@type": "ImageObject", url: "https://compass-official.pages.dev/images/compass-mark.svg" }
    },
    articleSection: message.chapters.map((chapter) => chapter.title)
  };

  return (
    <>
      <SiteHeader routeContext="messages" />
      <main id="main" className={styles.messagePage}>
        <MessageReader message={message} />
      </main>
      <SiteFooter routeContext="messages" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
    </>
  );
}
