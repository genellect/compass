import type { Metadata, Viewport } from "next";
import { Manrope, Newsreader } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";
import { COMPASS_PARENT_GA_MEASUREMENT_ID } from "../../../analytics";
import "../../../interactive/styles/experience.css";
import "./english-founder-global.css";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-en-sans"
});

const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-en-editorial"
});

export const metadata: Metadata = {
  metadataBase: new URL("https://yuto-matsui.com"),
  icons: {
    icon: [{ url: "/images/compass-mark.svg?v=20260713", type: "image/svg+xml", sizes: "any" }]
  },
  formatDetection: { telephone: false }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#071310"
};

export default function EnglishFounderLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${manrope.variable} ${newsreader.variable}`} suppressHydrationWarning>
      <body>
        {children}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${COMPASS_PARENT_GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="yuto-english-portfolio-analytics" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${COMPASS_PARENT_GA_MEASUREMENT_ID}');`}
        </Script>
      </body>
    </html>
  );
}
