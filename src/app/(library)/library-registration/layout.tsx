import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../../../styles/legacy.css";
import "../../../styles/hero.css";
import "../../../styles/desktop-system.css";
import "../../../styles/official-immersive.css";
import "../../../styles/official-four-directions.css";
import "../../../styles/official-core-redesign.css";
import "../../../library-registration/registration.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://compass-official.pages.dev"),
  title: "利用登録 | 未来戦略ライブラリ",
  description: "未来戦略ライブラリの利用登録フォームです。",
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: "/images/compass-mark.svg?v=20260713", type: "image/svg+xml", sizes: "any" }]
  },
  formatDetection: { telephone: false }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#071522"
};

export default function LibraryRegistrationLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: 'document.documentElement.classList.add("js")' }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
