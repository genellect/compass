import type { Metadata } from "next";
import "../../../../interactive/styles/developer-refresh.css";
import { DeveloperApp } from "../../../../interactive/DeveloperApp";

export const metadata: Metadata = {
  title: "COMPASS Interactive — Architecture, Security & Engineering",
  description:
    "匿名参加、資料同期、Live Poll、字幕、AI、講義後Reviewを同じ講義状態で動かすCOMPASS Interactive。ReactからPostgreSQL、Cloudflare、Windows Presenter Bridge、CIまでの設計と検証を紹介します。",
  alternates: { canonical: "/INTRO_Interactive/developers/" },
  openGraph: {
    locale: "ja_JP",
    type: "website",
    siteName: "COMPASS Interactive",
    title: "講義全体を動かす、リアルタイム基盤。— COMPASS Interactive",
    description: "Architecture、Security、Engineeringと、その検証証拠を紹介します。",
    url: "/INTRO_Interactive/developers/"
  },
  twitter: {
    card: "summary_large_image",
    title: "講義全体を動かす、リアルタイム基盤。— COMPASS Interactive",
    description: "Architecture、Security、Engineeringと、その検証証拠を紹介します。"
  }
};

export default function DevelopersPage() {
  return <DeveloperApp />;
}
