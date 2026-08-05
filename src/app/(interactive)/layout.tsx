import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { COMPASS_PARENT_GA_MEASUREMENT_ID } from "../../analytics";
import "../../interactive/styles/tokens.css";
import "../../interactive/styles/global.css";
import "../../interactive/styles/layout.css";
import "../../interactive/styles/components.css";
import "../../interactive/styles/sections.css";
import "../../interactive/styles/animations.css";
import "../../interactive/styles/experience.css";
import "../../interactive/styles/redesign.css";
import "../../interactive/styles/signal-hero.css";
import "../../styles/github-profile-link.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://compass-official.pages.dev"),
  title: "COMPASS Interactive | 参加型講義システム",
  description:
    "質問、投票、字幕、5分ごとの要点整理をひとつにつなぎ、学生の疑問を教員の次の説明へ届ける参加型講義システムです。",
  alternates: { canonical: "/INTRO_Interactive/" },
  icons: {
    icon: [{ url: "/images/compass-mark.svg?v=20260713", type: "image/svg+xml", sizes: "any" }]
  },
  openGraph: {
    locale: "ja_JP",
    type: "website",
    siteName: "COMPASS Interactive",
    title: "COMPASS Interactive | LET EVERYTHING MOVE.",
    description: "学生の疑問が届き、教員の次の説明が変わる。講義の一瞬を次の理解へつなぐ参加型講義システム。",
    url: "/INTRO_Interactive/",
    images: ["/images/hero.desktop.highlight.png"]
  },
  twitter: {
    card: "summary_large_image",
    title: "COMPASS Interactive | LET EVERYTHING MOVE.",
    description: "学生の疑問が届き、教員の次の説明が変わる。講義の一瞬を次の理解へつなぐ参加型講義システム。",
    images: ["/images/hero.desktop.highlight.png"]
  },
  formatDetection: { telephone: false }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07111f"
};

export default function InteractiveLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: 'document.documentElement.classList.add("js")' }} />
      </head>
      <body>
        {children}
        <noscript>
          <style>{`.reveal{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${COMPASS_PARENT_GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="compass-interactive-analytics" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${COMPASS_PARENT_GA_MEASUREMENT_ID}');`}
        </Script>
      </body>
    </html>
  );
}
