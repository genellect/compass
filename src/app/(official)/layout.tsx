import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import "../../styles/legacy.css";
import "../../styles/hero.css";
import "../../styles/desktop-system.css";
import "../../styles/official-immersive.css";
import "../../styles/official-four-directions.css";
import "../../styles/official-core-redesign.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://compass-official.pages.dev"),
  title: "COMPASS | 学生主導の教育・テクノロジープラットフォーム",
  description:
    "COMPASSは、北里大学薬学部を起点に、WebシステムとAIを中核として、資料、ワークショップ、学生との共創をつなぎ、学びとより良い意思決定を支える任意の学生支援活動です。",
  keywords:
    "COMPASS, コンパス, 北里大学, 北里薬学部, 学生主導, 教育テクノロジー, 教育DX, リアルタイム講義支援, 未来戦略ライブラリ, AI活用教育, 生命科学教育, 学生コミュニティ, 松井優知",
  authors: [{ name: "COMPASS / 松井優知" }],
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" }
  },
  icons: {
    icon: [{ url: "/images/compass-mark.svg?v=20260713", type: "image/svg+xml", sizes: "any" }]
  },
  openGraph: {
    locale: "ja_JP",
    type: "website",
    siteName: "COMPASS",
    title: "COMPASS | 学生主導の教育・テクノロジープラットフォーム",
    description:
      "WebシステムとAIを中核に、資料、ワークショップ、共創をつなぎ、学生の学びとより良い意思決定を支えます。",
    url: "/",
    images: ["/images/hero.desktop.highlight.png"]
  },
  twitter: {
    card: "summary_large_image",
    title: "COMPASS | 学生主導の教育・テクノロジープラットフォーム",
    description:
      "WebシステムとAIを中核に、資料、ワークショップ、共創をつなぎ、学生の学びとより良い意思決定を支えます。",
    images: ["/images/hero.desktop.highlight.png"]
  },
  formatDetection: { telephone: false }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(min-width: 901px)", color: "#050A14" },
    { media: "(max-width: 900px)", color: "#020812" }
  ]
};

export default function OfficialLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: 'document.documentElement.classList.add("js")' }} />
      </head>
      <body>
        {children}
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-EHKJ8B8N0Y" strategy="afterInteractive" />
        <Script id="compass-official-analytics" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-EHKJ8B8N0Y');`}
        </Script>
      </body>
    </html>
  );
}
