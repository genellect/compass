import type { Metadata } from "next";
import "../../../../interactive/styles/developer-refresh.css";
import { DeveloperApp } from "../../../../interactive/DeveloperApp";

export const metadata: Metadata = {
  title: "学びの熱を、設計で、途切れさせない。 | COMPASS Interactive",
  description:
    "教育現場で継続的に使える実用性と、その体験を支えるUX、アーキテクチャ、セキュリティ、検証を、一つのシステムに統合した開発者向けページです。",
  alternates: { canonical: "/INTRO_Interactive/developers/" },
  openGraph: {
    locale: "ja_JP",
    type: "website",
    siteName: "COMPASS Interactive",
    title: "学びの熱を、設計で、途切れさせない。 | COMPASS Interactive",
    description: "教育体験を支える技術基盤、設計判断、実装、検証を紹介します。",
    url: "/INTRO_Interactive/developers/",
    images: ["/images/hero.desktop.highlight.png"]
  },
  twitter: {
    card: "summary_large_image",
    title: "学びの熱を、設計で、途切れさせない。 | COMPASS Interactive",
    description: "教育体験を支える技術基盤、設計判断、実装、検証を紹介します。",
    images: ["/images/hero.desktop.highlight.png"]
  }
};

export default function DevelopersPage() {
  return <DeveloperApp />;
}
