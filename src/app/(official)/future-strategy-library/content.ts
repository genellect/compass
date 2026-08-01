export const libraryMetrics = {
  startedAt: "2024.02",
  registeredUsers: 73,
  materialCount: 100,
  registeredUsersAsOf: "2026年6月時点"
} as const;

export const knowledgeCoordinates = [
  { number: "01", code: "EXAM", label: "試験対策", domain: "PHARMACY" },
  { number: "02", code: "ENGLISH", label: "英語", domain: "ENGLISH" },
  { number: "03", code: "AI", label: "AI活用", domain: "AI LITERACY" },
  { number: "04", code: "LAB", label: "研究室", domain: "RESEARCH & CAREER" },
  { number: "05", code: "GRADUATE", label: "大学院", domain: "RESEARCH & CAREER" },
  { number: "06", code: "CAREER", label: "キャリア", domain: "RESEARCH & CAREER" }
] as const;

export const fields = [
  {
    number: "01",
    name: "PHARMACY",
    accent: "cyan",
    title: ["まず、次の試験を乗り切る。", "でも、そこで終わらない。"],
    paragraphs: [
      "試験前に使える対策資料から、暗記に頼りすぎない理解の組み立て方まで。",
      "講義で学んだ知識が、実習・研究・臨床へどうつながるのかを扱います。"
    ]
  },
  {
    number: "02",
    name: "ENGLISH",
    accent: "gold",
    title: ["点数を取る。", "その英語を、使える力に変える。"],
    paragraphs: [
      "TOEIC・英検などの資格対策から、論文読解、研究発表、英会話まで。",
      "試験のために覚えた英語を、その先で実際に使うところまで支えます。"
    ]
  },
  {
    number: "03",
    name: "AI LITERACY",
    accent: "violet",
    title: ["AIを使う。AIに使われない。"],
    paragraphs: [
      "学習・研究・制作のどこをAIに任せ、どこを人間が確かめるのか。",
      "便利さだけでなく、精度・責任・信頼まで含めたAI活用を考えます。"
    ]
  },
  {
    number: "04",
    name: "RESEARCH & CAREER",
    accent: "mint",
    title: ["配属されてから考えるには、", "進路は少し大きすぎる。"],
    paragraphs: [
      "研究テーマ、指導環境、大学院進学、その先の仕事まで。",
      "誰かの正解を押しつけるのではなく、自分で比較し、選ぶための判断材料を整理します。"
    ]
  }
] as const;

export const materials = [
  {
    category: "ENGLISH / INTRODUCTION",
    title: "翻訳できる時代に、なぜ英語を学ぶのか。",
    titleLines: ["翻訳できる時代に、", "なぜ英語を学ぶのか。"],
    paragraphs: [
      "翻訳AIがあっても、英語を使える人の選択肢は減りません。むしろ、これまで以上に広がります。",
      "資格勉強を、試験のためだけで終わらせず、専門性を世界へ届ける力へ変えるための導入資料です。"
    ],
    image: "/images/future-strategy-library/why-english.webp",
    alt: "翻訳できる時代に、なぜ英語を学ぶのか。という英語学習資料の表紙"
  },
  {
    category: "AI LITERACY",
    title: "AIで、未来を設計する。",
    titleLines: ["AIで、未来を設計する。"],
    paragraphs: [
      "答えを出させるだけなら、AIの力のほんの一部です。",
      "学習、研究、開発、情報整理、アイデアの実現。AIを「便利なチャットボット」で終わらせず、自分の可能性を広げるための実践ガイドです。"
    ],
    image: "/images/future-strategy-library/ai-guide-sanitized.webp",
    alt: "AIで、未来を設計する。というAI活用資料の表紙"
  },
  {
    category: "RESEARCH & CAREER",
    title: "研究を、未来の仕事にする。",
    titleLines: ["研究を、未来の仕事にする。"],
    paragraphs: [
      "研究室は、配属先を決めるだけの場所ではありません。",
      "研究テーマ、指導環境、大学院、企業、アカデミア。研究室選びとその先の進路を、一続きで考えるガイドです。"
    ],
    image: "/images/future-strategy-library/research-career.webp",
    alt: "研究を、未来の仕事にする。という研究・キャリア資料の表紙"
  }
] as const;

export const trustFacts = [
  { term: "FOR", lines: ["北里大学薬学部生限定"] },
  { term: "PRICE", lines: ["登録・利用ともに無料"] },
  { term: "VERIFICATION", lines: ["北里大学の大学アカウントで認証"] },
  { term: "RULE", lines: ["個人の学習利用に限ります", "無断共有・転載・再配布は禁止です"] }
] as const;

export const footerLinks = [
  { label: "COMPASS公式サイト", href: "/" },
  { label: "COMPASS Interactive", href: "/INTRO_Interactive/" },
  { label: "COMPASS Manifesto", href: "/messages/" },
  { label: "Community", href: "/community/join/" },
  { label: "Contact", href: "/contact/" }
] as const;
