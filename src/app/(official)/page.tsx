import { App } from "../../App";
import { LegacyInteractions } from "../../components/LegacyInteractions";

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "COMPASS",
  alternateName: ["コンパス", "COMPASS 北里大学", "コンパス 北里大学", "COMPASS 北里薬学部"],
  url: "https://compass-official.pages.dev/",
  logo: "https://compass-official.pages.dev/images/compass-mark.svg",
  image: "https://compass-official.pages.dev/images/hero.desktop.highlight.png",
  description:
    "COMPASSは、北里大学薬学部を起点に、WebシステムとAIを中核として、資料、ワークショップ、学生との共創をつなぎ、学びとより良い意思決定を支える学生主導型教育・テクノロジープラットフォームです。",
  founder: { "@type": "Person", name: "松井優知", alternateName: "Yuto Matsui" },
  keywords:
    "COMPASS, コンパス, 北里大学, 北里薬学部, 教育テクノロジー, 教育DX, COMPASS Interactive, 未来戦略ライブラリ, 松井優知",
  hasPart: [
    {
      "@type": "SoftwareApplication",
      name: "COMPASS Interactive",
      applicationCategory: "EducationalApplication",
      url: "https://compass-official.pages.dev/INTRO_Interactive/"
    },
    {
      "@type": "CreativeWork",
      name: "未来戦略ライブラリ",
      url: "https://compass-official.pages.dev/future-strategy-library/"
    }
  ]
};

export default function OfficialPage() {
  return (
    <>
      <App />
      <LegacyInteractions />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
    </>
  );
}
