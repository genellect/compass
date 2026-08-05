export const links = {
  demo: "https://compass-interactive.pages.dev/demo",
  join: "https://compass-interactive.pages.dev/join",
  compassHome: "/"
};

export const hero = {
  eyebrow: "NEXT LECTURE EXPERIENCE",
  title: "LET EVERYTHING MOVE.",
  lead: "質問、投票、字幕、AI。講義の一瞬が、次の理解へつながっていく。",
  chips: ["資料と同期", "匿名で質問", "ライブ投票", "リアルタイム字幕", "5分ハイライト"]
};

export const heroLectureMock = {
  title: "Live Lecture",
  course: "分子生物学 II",
  participants: 218,
  questions: [
    "多くのRNAが一本鎖として機能するのはなぜですか？",
    "この実験系、RT-qPCRで検証できますか？",
    "KmとKdの違いをもう一度確認したいです。"
  ],
  quiz: {
    question: "正しい記述を2つ選んでください。",
    options: [
      { label: "A", text: "Ct値が低いほど初期鋳型量は多い", value: 44 },
      { label: "B", text: "Ct値が低いほど発現量は必ず低い", value: 11 },
      { label: "C", text: "ΔΔCt法では基準遺伝子で補正する", value: 39 },
      { label: "D", text: "PCR効率は常に100%である", value: 6 }
    ]
  },
  summary: [
    "本日の課題は、17時までに実験デザインを提出。",
    "ΔΔCt法の考え方を復習してください。",
    "質問が多かった概念: Ct値 / 内在性コントロール"
  ]
};

export const lectureReality = {
  eyebrow: "LECTURE MOMENT",
  title: "200人の講義室で、「わからない」は声にならない。",
  body: [
    "説明は進む。自分の理解だけが、少し前で止まっている。",
    "作用機序、反応機構、実験デザイン。一つの疑問を残したまま、その先の説明が遠くなっていく。",
    "質問したい。同じところで迷う誰かとつながりたい。それでも、大人数の講義室では声を上げるまでの距離が長い。",
    "その小さな「わからない」を、講義の中で動かし始める。それがCOMPASS\u00a0Interactiveである。"
  ],
  floatingWords: [
    "作用機序をつなげたい",
    "反応機構を深く理解したい",
    "RT-qPCRの対照を確認したい",
    "KmとVmaxを整理したい",
    "薬物動態を直感的に捉えたい",
    "クラスの気づきを共有したい"
  ]
};

export const studentCards = [
  {
    title: "生まれた疑問を、その場で共有できる。",
    body: "作用機序、反応機構、実験デザインの疑問を、講義中にそのまま投稿。学生の気づきがリアルタイムに教員とクラスへ届きます。",
    feature: "リアルタイム掲示板",
    phoneTitle: "Realtime Board",
    items: [
      "この実験系、RT-qPCRで検証できますか？",
      "基質濃度が60%まで低下したのに、反応速度があまり変わらないのはなぜですか？",
      "GPCRとチロシンキナーゼ型受容体の違いをもう一度確認したいです。"
    ],
    reaction: "同じところで迷いました"
  },
  {
    title: "わかったつもりを、その場で確認できる。",
    body: "聞いているときは理解した気がする。でも、選択肢を見た瞬間に迷う。リアルタイムクイズなら、講義中に自分の理解を確認できます。",
    feature: "リアルタイムクイズ",
    phoneTitle: "Biochemistry Quiz",
    quiz: {
      question: "Michaelis-Menten型酵素反応について、正しい記述を2つ選んでください。",
      options: [
        { label: "A", text: "Vmaxは酵素濃度に依存する", value: 41 },
        { label: "B", text: "Kmは反応速度がVmax/2となる基質濃度である", value: 62 },
        { label: "C", text: "Kmが大きいほど、常に基質親和性は高い", value: 18 },
        { label: "D", text: "競合阻害ではVmaxが低下する", value: 9 }
      ]
    }
  },
  {
    title: "クラスの共通する疑問が見える。",
    body: "リアクションを通じて、クラスで関心が集まっている論点を共有。仲間の視点が、自分の理解をさらに深めます。",
    feature: "リアクション",
    phoneTitle: "Shared Questions",
    items: [
      "ΔΔCt法でなぜハウスキーピング遺伝子が必要なんですか？",
      "ACE阻害薬で空咳が出る理由がまだ曖昧です。"
    ],
    reaction: "24人が同じ疑問を持っています"
  },
  {
    title: "聞き逃しても、復習の入口が残る。",
    body: "AI講義要約が、講義の要点、出題されたクイズ、学生の疑問を整理し、復習の入口をつくります。",
    feature: "AI講義要約",
    phoneTitle: "AI Summary",
    summary: [
      "競合阻害では見かけのKmが上昇し、Vmaxは大きく変化しない。",
      "RT-qPCRでは、発現量比較のために内在性コントロールが必要。",
      "ACE阻害薬の副作用はブラジキニン分解抑制と関連する。"
    ]
  },
  {
    title: "英語の専門用語を、その場で理解へつなぐ。",
    body: "英語スライド、英語論文、専門用語が講義中に出てきても、自動字幕・翻訳で講義への参加ハードルを下げます。",
    feature: "自動字幕・翻訳",
    phoneTitle: "Caption",
    caption: "The rate-limiting step is the dissociation of the leaving group.",
    translation: "律速段階は、脱離基が解離する過程です。"
  }
];

export const scienceTopics = [
  {
    id: "pharmacology",
    label: "薬理学",
    title: "作用機序を、その場で確認する。",
    lead: "受容体、作用機序、副作用、薬物相互作用の理解確認に。",
    comments: [
      "ACE阻害薬で空咳が起こる理由が、ブラジキニンとどう関係するのかわかりません。",
      "部分作動薬と競合拮抗薬の違いをもう一度整理したいです。"
    ],
    quiz: {
      question: "β1受容体遮断薬の作用として正しいものを2つ選んでください。",
      options: [
        { label: "A", text: "心拍数を低下させる", value: 69 },
        { label: "B", text: "レニン分泌を抑制する", value: 58 },
        { label: "C", text: "気管支平滑筋を弛緩させる", value: 19 },
        { label: "D", text: "ヒスタミンH1受容体を遮断する", value: 8 }
      ]
    }
  },
  {
    id: "molecular",
    label: "分子生物学",
    title: "セントラルドグマを、実験とつなげる。",
    lead: "遺伝子発現解析、RT-qPCR、Western blotの理解確認に。",
    comments: [
      "mRNA量が増えても、タンパク質量が増えるとは限らないのはなぜですか？",
      "RT-qPCRとWestern blotのどちらで検証すべきですか？"
    ],
    quiz: {
      question: "RT-qPCRでmRNA発現量を比較するとき、必要な設計を2つ選んでください。",
      options: [
        { label: "A", text: "内在性コントロール遺伝子を設定する", value: 74 },
        { label: "B", text: "逆転写を行わずにPCRする", value: 10 },
        { label: "C", text: "生物学的反復を設定する", value: 61 },
        { label: "D", text: "Ct値が低いほど発現量が低いと判断する", value: 14 }
      ]
    }
  },
  {
    id: "biochemistry",
    label: "生化学",
    title: "式と意味をつなげて理解する。",
    lead: "酵素反応、Km / Vmax、競合阻害を講義中に確認。",
    comments: [
      "Kmが小さいと、なぜ親和性が高いと言えるのですか？",
      "Lineweaver-Burkプロットで切片を見る理由がわかりません。"
    ],
    quiz: {
      question: "競合阻害について正しい記述を選んでください。",
      options: [
        { label: "A", text: "見かけのKmは増加する", value: 66 },
        { label: "B", text: "Vmaxは理論上変化しない", value: 59 },
        { label: "C", text: "阻害薬は基質結合部位と競合する", value: 72 },
        { label: "D", text: "酵素量は必ず減少する", value: 12 }
      ]
    }
  },
  {
    id: "organic",
    label: "有機化学",
    title: "反応機構の矢印を、理解につなげる。",
    lead: "SN1 / SN2、pKa、立体化学、構造活性相関の確認に。",
    comments: [
      "この求核攻撃は、なぜこの炭素に起こるのですか？",
      "pKaが変わると、薬物の膜透過性はどう変わりますか？"
    ],
    quiz: {
      question: "tert-ブチルハライドのSN1反応で律速段階となるのはどれですか？",
      options: [
        { label: "A", text: "求核剤の攻撃", value: 18 },
        { label: "B", text: "脱離基の解離によるカルボカチオン形成", value: 62 },
        { label: "C", text: "生成物の脱プロトン化", value: 14 },
        { label: "D", text: "生成物の再結晶化", value: 6 }
      ]
    }
  },
  {
    id: "experiment",
    label: "実験デザイン",
    title: "この実験で本当に言えることを考える。",
    lead: "対照群、再現性、解釈の妥当性を講義中に扱う。",
    comments: [
      "この実験系、RT-qPCRだけで結論できますか？",
      "ノックダウン効率はmRNAとタンパク質の両方で確認すべきですか？"
    ],
    quiz: {
      question: "siRNAによる遺伝子ノックダウン実験で確認すべき項目を2つ選んでください。",
      options: [
        { label: "A", text: "標的遺伝子のmRNA発現低下", value: 70 },
        { label: "B", text: "標的タンパク質の発現低下", value: 64 },
        { label: "C", text: "目的と無関係な遺伝子の過剰発現", value: 7 },
        { label: "D", text: "ネガティブコントロールとの比較", value: 76 }
      ]
    }
  }
];

export const studentFlow = [
  {
    step: "01",
    title: "講義ページに入る",
    body: "QRコードまたは参加リンクから、スマートフォンでもPCでも講義画面を開けます。",
    mockTitle: "Join Lecture",
    mockLines: ["薬理学 II", "参加者 218人", "今日のテーマ: 酵素阻害と薬物相互作用"]
  },
  {
    step: "02",
    title: "聞きながらコメントする",
    body: "疑問、気づき、もう一度聞きたいポイントを投稿。声に出さなくても、講義に参加できます。",
    mockTitle: "Realtime Board",
    mockLines: ["この阻害様式は競合阻害ですか？", "いまの式変形をもう一度見たいです。", "同じ疑問: 18人"]
  },
  {
    step: "03",
    title: "クイズで理解を確認する",
    body: "薬理、分子生物学、生化学、薬化学などの理解度チェックに回答します。",
    mockTitle: "理解度チェック",
    mockLines: ["正しい記述を2つ選択", "回答率 82%", "クラス全体の傾向を表示"]
  },
  {
    step: "04",
    title: "AI要約で振り返る",
    body: "講義後はAI要約で、重要ポイント、質問、課題を整理できます。",
    mockTitle: "AI Summary",
    mockLines: ["重要語句: Km / Vmax / 競合阻害", "課題: 実験デザインの妥当性を提出", "復習入口を自動整理"]
  }
];

export const features = [
  {
    eyebrow: "Realtime Board",
    title: "リアルタイム掲示板",
    headline: "すべての疑問が、講義を深める。",
    body: "学生の質問、コメント、気づきをリアルタイムに共有。専門講義で生まれる疑問を、その場で教員とクラス全体に届けます。",
    tags: ["質問", "コメント", "リアクション", "共有"]
  },
  {
    eyebrow: "Live Quiz",
    title: "ライブクイズ",
    headline: "理解の変化を、その場で共有する。",
    body: "講義中の問いにスマートフォンから回答。学生は理解を確かめ、教員はクラス全体の理解度をリアルタイムに捉えます。",
    tags: ["即時回答", "理解度", "ライブ集計"]
  },
  {
    eyebrow: "Realtime Quiz",
    title: "質問フォーカス",
    headline: "クラスの重要な疑問が、ひと目でわかる。",
    body: "リアクションが集まった質問を上位に表示。大人数講義でも、クラス全体に共通する重要な論点をすばやく共有します。",
    tags: ["注目質問", "リアクション", "優先表示"]
  },
  {
    eyebrow: "AI Summary",
    title: "AI講義要約",
    headline: "講義のすべてが、次の理解につながる。",
    body: "講義内容、コメント、質問、クイズ結果をAIが横断的に整理。重要ポイント、質問が集中したテーマ、理解度の傾向、復習内容を講義終了後にまとめます。",
    tags: ["要点整理", "理解度分析", "復習設計"]
  },
  {
    eyebrow: "Auto Caption & Translation",
    title: "リアルタイム字幕・翻訳",
    headline: "専門用語と英語を、理解へつなぐ。",
    body: "講義者の音声をリアルタイムに文字化し、専門用語の理解を支援。英語を含む講義では翻訳表示を通じて、多言語環境での参加を実現します。",
    tags: ["字幕", "翻訳", "多言語支援"]
  }
];

export const aiSupportCards = [
  {
    eyebrow: "REALTIME CAPTION",
    title: "聞き逃した言葉を、その場で追える。",
    body: "講義の言葉がリアルタイム字幕になり、専門用語や聞き逃した一節を自分のペースで確かめられる。流れて消える言葉が、理解として手元に残る。",
    tags: ["リアルタイム字幕", "専門用語", "聞き直し"],
    status: null
  },
  {
    eyebrow: "FIVE MINUTE HIGHLIGHT",
    title: "いま押さえたい要点が、見えてくる。",
    body: "直近5分の講義内容が短く整理され、重要な説明と資料のつながりをその場で確認できる。講義の途中でも、自分の理解を立て直せる。",
    tags: ["5分ハイライト", "要点整理", "振り返り"],
    status: null
  },
  {
    eyebrow: "COMMENT PULSE",
    title: "みんなの反応から、深めたい論点が見つかる。",
    body: "コメントとリアクションの動きが整理され、クラスがどこで立ち止まり、何を深めたいのかが見える。自分では気づかなかった問いにも出会える。",
    tags: ["コメント動向", "リアクション", "クラス共有"],
    status: null
  },
  {
    eyebrow: "ACADEMIC QUESTION",
    title: "その疑問が、学術的な問いに変わる。",
    body: "講義中のコメントから、さらに深く調べる価値のある質問が見つかる。素朴な疑問が、講義の先へ進むための学術的な問いとして整理される。",
    tags: ["質問候補", "講義資料", "探究の入口"],
    status: null
  },
  {
    eyebrow: "EVIDENCE-GROUNDED ANSWER",
    title: "問いが、根拠のある学びにつながる。",
    body: "学術的な質問が、PMID・DOIで確かめられる一次文献と結びつく。参考回答の根拠を自分でたどり、講義から研究へ理解を深められる。",
    tags: ["一次文献", "PMID・DOI", "根拠確認"],
    status: "搭載予定"
  },
  {
    eyebrow: "HUMAN REVIEW",
    title: "AIの出力を、そのまま答えにしない。",
    body: "要約や質問候補は教員が確認し、公開、固定、非表示、訂正を選べる。AIの整理と教員の説明が分かれ、誰の判断なのかを迷わず確かめられる。",
    tags: ["教員確認", "訂正履歴", "回答の区別"],
    status: null
  }
];

export const plannedAIModels = [
  {
    name: "GPT-Realtime-Whisper",
    role: "リアルタイム字幕",
    description: "講義音声を低遅延で文字に変え、専門用語や聞き逃した一節をその場で確かめられる。流れて消える言葉が、自分の理解として残る。",
    status: "搭載中",
    state: "live"
  },
  {
    name: "GPT-5.6 Luna",
    role: "5分要点・質問整理",
    description: "講義資料、字幕、投票、コメントを横断し、直近5分の要点、クラスの反応、学術的な質問候補を一度に整理。講義の途中でも、いま押さえるべきことが見える。",
    status: "搭載中",
    state: "live"
  },
  {
    name: "GPT-5.6 Terra",
    role: "一次文献に基づく学術回答",
    description: "学術的な質問をPMID・DOIで確認できる一次文献と結び、根拠をたどれる参考回答へ変える。AIの回答と教員の回答が分かれ、確かめる入口が見える。",
    status: "搭載予定",
    state: "planned"
  }
];

export const beforeAfter = {
  before: [
    "200〜300人の講義に、多様な疑問が生まれる。",
    "学生一人ひとりが、それぞれの視点で理解を進める。",
    "教員が専門知識と講義体験を届ける。",
    "クイズや課題に、学生の反応が集まる。",
    "講義後も、復習へ学びが続く。"
  ],
  after: [
    "疑問がリアルタイム掲示板に届く。",
    "同じ疑問を持つ学生が可視化される。",
    "クイズで理解度の分布が見える。",
    "AIが重要ポイントと課題を整理する。",
    "講義後の復習につながるログが残る。"
  ]
};

export const teacherCards = [
  {
    title: "理解度を、その場で把握できる。",
    body: "リアルタイムクイズにより、学生の理解が変化するポイントを講義中に確認できます。"
  },
  {
    title: "すべての疑問を、クラスの学びに変える。",
    body: "掲示板に集まる疑問をAIが整理し、共通する質問をまとめて表示。大人数講義でも、最適な補足説明をすばやく届けます。"
  },
  {
    title: "学生の理解が動く瞬間を捉える。",
    body: "コメント数、クイズ回答率、リアクションの変化から、講義中の集中度や参加状況の変化を把握できます。"
  },
  {
    title: "講義後の振り返りが、次回設計につながる。",
    body: "AI要約と講義ログにより、次回講義の冒頭で補足する内容や課題に入れる確認問題を見つけやすくなります。"
  }
];

export const teacherDashboard = {
  responseRate: 82,
  signals: ["コメント急増: 酵素阻害の説明後", "理解度変化: Km / Vmax の比較問題", "質問集中: RT-qPCRの内在性コントロール"],
  keywords: ["Km", "競合阻害", "Vmax", "Lineweaver-Burk", "ΔΔCt法"]
};

export const useCases = [
  {
    title: "200〜300人の大人数講義",
    body: "質問が出にくい講義でも、コメントとクイズで学生の反応を拾えます。"
  },
  {
    title: "薬理学・薬物治療学",
    body: "作用機序、副作用、薬物相互作用、PK/PDの理解確認に活用できます。"
  },
  {
    title: "分子生物学・生化学",
    body: "セントラルドグマ、酵素反応、遺伝子発現解析、実験手法の理解確認に。"
  },
  {
    title: "薬化学・有機化学",
    body: "反応機構、pKa、立体化学、構造活性相関を、クイズと質問で段階的に理解できます。"
  },
  {
    title: "研究セミナー・卒業研究指導",
    body: "実験デザイン、対照群、再現性、解釈の妥当性について、コメントしながら考える場をつくれます。"
  }
];

export const architecturePrinciples = [
  {
    title: "リアルタイムに反応が届く",
    body: "コメント、クイズ回答、講義状態を即時に同期し、学生の反応をその瞬間の講義へ反映します。",
    tags: ["Supabase Realtime", "PostgreSQL"]
  },
  {
    title: "スマートフォンで直感的に使える",
    body: "片手で参加できるUI、短い導線、読みやすいカード設計で、講義への参加をスムーズにします。",
    tags: ["React", "TypeScript", "Vite", "Responsive Components"]
  },
  {
    title: "講義ごとに情報を守る",
    body: "講義、ユーザー、ロールごとにデータアクセスを制御し、許可された情報を安全に扱います。",
    tags: ["Row Level Security", "Role-based Access Control", "Lecture-scoped Data Access"]
  },
  {
    title: "AIが理解と復習を加速する",
    body: "質問整理、参考回答、講義要約、モデレーションを一つのAI学習支援レイヤーとして提供します。",
    tags: ["OpenAI API", "Google Workspace API", "Google Apps Script"]
  },
  {
    title: "継続的に進化する",
    body: "Cloudflare PagesとGitHubを組み合わせ、改善をすばやく反映する開発フローを構築します。",
    tags: ["Cloudflare Pages", "GitHub", "CI/CD-ready Workflow"]
  }
];

export const technologyCards = [
  ["フロントエンド", "React / TypeScript / Vite"],
  ["バックエンド基盤", "Supabase（PostgreSQL / Realtime / Auth）"],
  ["アクセス制御", "Row Level Security / Lecture-scoped Access"],
  ["AI・音声処理", "OpenAI API / Realtime API"],
  ["外部連携", "Google Workspace API / Google Apps Script"],
  ["ホスティング", "Cloudflare Pages"],
  ["開発・継続改善", "GitHub / CI/CD / OpenAI Codex"]
];

export const technologyGlossary = [
  ["UI", "ユーザーが実際に見て操作する画面とボタンの構成"],
  ["React", "画面の変化を効率的に管理するWeb開発技術"],
  ["TypeScript", "大規模な開発でも高い品質を保つプログラミング言語"],
  ["Supabase", "データベース、認証、リアルタイム通信を統合する基盤"],
  ["PostgreSQL", "コメントや講義情報を安全に保存・整理するデータベース"],
  ["Realtime", "コメントやクイズ結果を画面更新なしで即時に届ける仕組み"],
  ["RLS", "ユーザーと講義ごとに閲覧可能なデータを制御する仕組み"],
  ["API", "異なるサービスの機能を安全につなぐ接続方式"],
  ["CI/CD", "プログラミングコードの品質確認から公開までを自動化する仕組み"],
  ["Cloudflare Pages", "Webサイト・Webアプリを高速かつ安全に世界中に公開するサービス"]
];

export const securityCards = [
  {
    title: "講義ごとのアクセス管理",
    body: "コメントやクイズを講義単位で管理し、許可された参加者だけが必要な情報へアクセスします。"
  },
  {
    title: "安心して参加できる投稿環境",
    body: "投稿管理、通報、AIモデレーションを組み合わせ、すべての参加者が学びに集中できる環境を提供します。"
  },
  {
    title: "AI利用の透明性",
    body: "AIが生成した参考回答と講義者による回答を明確に区別し、信頼できる学習体験を届けます。"
  }
];
