export const founderOrigin = "https://yuto-matsui.com";
export const compassOrigin = "https://compass-official.pages.dev";

export const heroSlides = [
  {
    src: "/images/founder-portfolio/yuto-matsui-nagano-lake-hero-20260831.webp",
    alt: "Yuto Matsui standing by a lake with the mountains of Nagano beyond",
    label: "Nagano / Lake",
    position: "50% 50%"
  },
  {
    src: "/images/founder-portfolio/yuto-matsui-illuminated-steps-hero-20260901.jpg",
    alt: "Yuto Matsui seated on illuminated steps at night",
    label: "Tokyo / Light",
    position: "50% 50%"
  },
  {
    src: "/images/founder-portfolio/yuto-matsui-nagano-mountain-hero-20260901.webp",
    alt: "Yuto Matsui standing in the Nagano highlands with mountains beyond",
    label: "Nagano / Highlands",
    position: "50% 48%"
  }
] as const;

export const expertise = [
  {
    number: "01",
    title: "Life Science Research",
    description:
      "Understanding the molecular mechanisms of neurodegenerative disease through experimental research.",
    image: "/images/founder-portfolio/source/life-science-unsplash.jpg",
    alt: "Microscope used for observing cell culture",
    accent: "biotic"
  },
  {
    number: "02",
    title: "AI-Native Development",
    description:
      "Expanding the scale of systems one person can design and build with AI.",
    image: "/images/founder-portfolio/source/software-development-unsplash.jpg",
    alt: "Software development environment displaying source code",
    accent: "signal"
  },
  {
    number: "03",
    title: "Higher Education",
    description:
      "Turning challenges in higher education into systems that work in the real world.",
    image: "/images/founder-portfolio/yuto-matsui-education-support.webp",
    alt: "Yuto Matsui presenting research fields on a whiteboard",
    accent: "academic"
  }
] as const;

export const products = [
  {
    key: "interactive",
    label: "COMPASS Interactive",
    title: "Real-time feedback and AI, built into the lecture experience.",
    links: [
      { label: "Product overview", href: `${compassOrigin}/INTRO_Interactive/` },
      {
        label: "ProtoPedia",
        href: "https://protopedia.net/prototype/private/59f061db-936a-4fa3-abc2-438a98711e9e"
      },
      { label: "Technical portfolio", href: `${compassOrigin}/INTRO_Interactive/developers/` }
    ]
  },
  {
    key: "library",
    label: "Future Strategy Library",
    title: "A student-built resource library for Kitasato University pharmacy students.",
    links: [{ label: "Explore the library", href: `${compassOrigin}/future-strategy-library/` }]
  },
  {
    key: "manifesto",
    label: "COMPASS Manifesto",
    title: "How should students live and build in the age of AI?",
    image: "/images/Image4.jpg",
    alt: "A luminous future city representing possibility in the age of AI",
    links: [{ label: "Read the manifesto", href: `${compassOrigin}/messages/` }]
  }
] as const;

export const statementParagraphs = [
  "I began programming in high school, around 2020. At university, I chose pharmaceutical science and entered molecular biology, where I began studying the mechanisms of neurodegenerative disease.",
  "Those two paths now define how I see the future.",
  "Research taught me how difficult it is to turn knowledge into progress. Engineering gave me another way to contribute: not only by generating knowledge, but by building the tools and systems that help people use it better.",
  "As AI advanced, I began bringing those two worlds together. I continued experimental research while expanding into full-stack development, cloud systems, and AI-native engineering. The combination changed what I believed one person could build—and the scale of problems I was prepared to take on.",
  "I first applied that approach to education.",
  "I saw useful academic opportunities and resources scattered across departments, personal networks, and chance encounters. So I built a platform to bring them together, formed a student team around it, and later developed a real-time learning system that was adopted in university lectures. What began as a student project grew into a working system used in real educational settings.",
  "In the laboratory, I see a different problem with much larger consequences. Scientific progress depends on the time and attention researchers can devote to thinking, experimenting, and interpreting results. Too much of both is still consumed by fragmented information, repetitive work, and tools that do not reflect how research is actually done.",
  "Today, I continue my work in experimental research while building at the intersection of life science and engineering.",
  "For me, that intersection is not simply about applying technology to science. It is about redesigning the ecosystem in which life science happens—how knowledge is created, connected, tested, and turned into discovery.",
  "Better systems can do more than make science more efficient. They can expand the questions researchers are able to ask, accelerate what they are able to discover, and bring more discoveries closer to the patients who need them.",
  "That is the scale at which I intend to contribute to life science—not through a single experiment, product, or company, but by helping build a better foundation for discovery itself.",
  "If that foundation can help science move faster, researchers go further, and ultimately more patients, then that is work worth devoting a life to."
] as const;

export const experience = [
  {
    area: "Life Science",
    years: "3+ years",
    focus: ["Molecular Biology", "Cell Biology", "Neuroscience"],
    image: "/images/founder-portfolio/source/experience-life-science.webp",
    alt: "Laboratory equipment used in molecular and cell biology"
  },
  {
    area: "Development",
    years: "4+ years",
    focus: ["Full-Stack Web Development", "Cloud Engineering", "Agentic Workflows"],
    image: "/images/founder-portfolio/source/experience-development.webp",
    alt: "Monitor displaying source code"
  },
  {
    area: "Education",
    years: "4+ years",
    focus: ["English Education", "Life Science Education", "AI Literacy"],
    image: "/images/founder-portfolio/source/experience-education.webp",
    alt: "University lecture hall with tiered seating"
  }
] as const;

export const credentials = [
  { mark: "IELTS", name: "IELTS Academic", score: "7.5", cefr: "Aligned with CEFR C1" },
  { mark: "TOEIC", name: "TOEIC Listening & Reading", score: "965", cefr: "Equivalent to CEFR C1" },
  { mark: "EIKEN", name: "EIKEN Grade 1", score: "Grade 1", cefr: "Equivalent to CEFR C1" }
] as const;

export const offHours = [
  {
    number: "01",
    label: "DRIVE",
    image: "/images/founder-portfolio/off-hours-drive.webp",
    alt: "A car driving along a highland road with snow-covered mountains beyond",
    copy:
      "I enjoy driving through natural landscapes. One of my favorite memories is a road trip through Nagano with friends."
  },
  {
    number: "02",
    label: "SHOGI",
    image: "/images/founder-portfolio/off-hours-shogi.webp",
    alt: "Entrance to the new Shogi Kaikan in Sendagaya",
    copy:
      "I have played shogi since elementary school and hold amateur 3-dan. I have also competed in several national tournaments."
  },
  {
    number: "03",
    label: "CLIMBING",
    image: "/images/founder-portfolio/off-hours-climbing.webp",
    alt: "Yuto Matsui climbing an indoor bouldering wall",
    copy:
      "I was part of my high school climbing club. I climb less often now, but I still enjoy hiking and time in nature."
  }
] as const;

export type FragmentPhoto = {
  key: string;
  src: string;
  width: number;
  height: number;
  alt: string;
  tone?: "warm" | "lift" | "tech";
  position?: string;
};

const fragmentRoot = "/images/founder-portfolio/fragments";

export const fragmentPhotos: readonly FragmentPhoto[] = [
  { key: "yuto-696", src: `${fragmentRoot}/yuto-696-1566.webp`, width: 1566, height: 1044, alt: "Yuto Matsui seated on illuminated steps", tone: "warm", position: "50% 58%" },
  { key: "dna-automation", src: `${fragmentRoot}/dna-automation-1920.webp`, width: 1920, height: 1280, alt: "Automated liquid-handling system processing DNA samples" },
  { key: "yuto-706", src: `${fragmentRoot}/yuto-706-1044.webp`, width: 1044, height: 1566, alt: "Yuto Matsui standing against a night-time cityscape", tone: "warm" },
  { key: "microfluidic", src: `${fragmentRoot}/microfluidic-1920.webp`, width: 1920, height: 1280, alt: "Precision microfluidic devices used in research and development" },
  { key: "code-terminal", src: `${fragmentRoot}/code-terminal-1920.webp`, width: 1920, height: 1280, alt: "Code editor and terminal on a development screen", tone: "tech" },
  { key: "yuto-701", src: `${fragmentRoot}/yuto-701-1108.webp`, width: 1108, height: 1477, alt: "Yuto Matsui reviewing microscopy data in the laboratory", position: "50% 58%" },
  { key: "pipette", src: `${fragmentRoot}/pipette-1920.webp`, width: 1920, height: 2658, alt: "A researcher pipetting a laboratory sample" },
  { key: "yuto-2360", src: `${fragmentRoot}/yuto-2360-anchor-1566.webp`, width: 1566, height: 1044, alt: "Yuto Matsui leaning against a tree among summer flowers", tone: "lift", position: "52% 54%" },
  { key: "code-data", src: `${fragmentRoot}/code-data-1920.webp`, width: 1920, height: 1278, alt: "Laptop displaying code and performance analysis charts", tone: "tech" },
  { key: "yuto-2339", src: `${fragmentRoot}/yuto-2339-rain-1044.webp`, width: 1044, height: 1566, alt: "Yuto Matsui looking toward a car in the rain", tone: "warm" },
  { key: "yuto-yokohama", src: `${fragmentRoot}/yuto-yokohama-city-1600.webp`, width: 1600, height: 2400, alt: "Yuto Matsui seated in a Yokohama streetscape" },
  { key: "yuto-nagano", src: `${fragmentRoot}/yuto-nagano-highland-1566.webp`, width: 1566, height: 1044, alt: "Yuto Matsui against the mountains and highlands of Nagano" },
  { key: "servers", src: `${fragmentRoot}/servers-1920.webp`, width: 1920, height: 1280, alt: "Rows of server racks in a data center", tone: "tech" },
  { key: "yuto-mist-lift", src: `${fragmentRoot}/yuto-mist-lift-1477.webp`, width: 1477, height: 1108, alt: "Yuto Matsui standing beside a ski lift fading into mist" },
  { key: "silicon-wafer", src: `${fragmentRoot}/silicon-wafer-1920.webp`, width: 1920, height: 1278, alt: "Silicon wafer held in front of a deposition chamber", tone: "warm" },
  { key: "yuto-697", src: `${fragmentRoot}/yuto-697-1044.webp`, width: 1044, height: 1566, alt: "Yuto Matsui seated beneath traditional lanterns", tone: "warm" },
  { key: "yuto-698", src: `${fragmentRoot}/yuto-698-atmosphere-1477.webp`, width: 1477, height: 1108, alt: "Yuto Matsui standing beside pine trees" },
  { key: "yuto-699", src: `${fragmentRoot}/yuto-699-1044.webp`, width: 1044, height: 1566, alt: "Yuto Matsui seated within curved architectural forms", tone: "warm" },
  { key: "yuto-704", src: `${fragmentRoot}/yuto-704-1372.webp`, width: 1372, height: 1192, alt: "A quiet profile of Yuto Matsui in front of pine branches" }
];
