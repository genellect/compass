// Shared wording for the existing Mobile menu and Desktop page index.
export const mainMobileGroups = [
  {
    label: "EXPERIENCE",
    items: [
      { href: "#students", label: "講義の体験", note: "Experience" },
      { href: "#features", label: "講義の流れ", note: "Learning Journey" },
      { href: "#ai-support", label: "AI学習支援", note: "AI for Learning" }
    ]
  },
  {
    label: "FOR EDUCATORS",
    items: [
      { href: "#teachers", label: "学生の反応を活かす", note: "Teaching Flow" },
      { href: "#educator-operations", label: "教員の使い方", note: "Operations" },
      { href: "#adoption", label: "導入・ご相談", note: "Adoption" }
    ]
  },
  {
    label: "PRODUCT",
    items: [
      { href: "#developers", label: "設計・技術", note: "Architecture" },
      { href: "https://yuto-matsui.com/", label: "開発者・プロダクト設計者", note: "Profile" }
    ]
  }
];

export const pageNavigation = mainMobileGroups.flatMap(group => group.items).filter(item => item.href.startsWith("#"));

export const siteDestinations = [
  { href: "/", label: "COMPASS公式サイト" },
  { href: "/INTRO_Interactive/developers/", label: "開発者向け技術情報" },
  { href: "https://yuto-matsui.com/", label: "Meet the Developer" },
];
