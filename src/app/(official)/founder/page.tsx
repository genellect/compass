import type { Metadata } from "next";
import Image from "next/image";
import { LectureSignalMatrix } from "../../../interactive/components/hero/LectureSignalMatrix";
import { ProductExperienceMock } from "../../../interactive/components/ui/ProductExperienceMock";
import { LegacyInteractions } from "../../../components/LegacyInteractions";
import { EssayContinuation } from "./EssayContinuation";
import { FounderFragments } from "./FounderFragments";
import { FounderHeroGallery } from "./FounderHeroGallery";
import { MobileExternalMenu } from "./MobileExternalMenu";
import styles from "./founder.module.css";

export const metadata: Metadata = {
  title: "Yuto Matsui / 松井優知 | Life Science, AI & Education",
  description:
    "ライフサイエンス研究、AIネイティブ開発、大学教育支援を横断するYuto Matsui / 松井優知の個人ポートフォリオ。",
  alternates: { canonical: "/founder/" },
  authors: [{ name: "Yuto Matsui / 松井優知" }],
  openGraph: {
    locale: "ja_JP",
    type: "profile",
    siteName: "Yuto Matsui",
    title: "Yuto Matsui / 松井優知",
    description: "ライフサイエンス研究・AIネイティブ開発・大学教育支援。",
    url: "/founder/",
    images: [
      {
        url: "/images/founder-portfolio/yuto-matsui-profile-hero.webp",
        width: 1600,
        height: 2400,
        alt: "Yuto Matsui / 松井優知"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Yuto Matsui / 松井優知",
    description: "ライフサイエンス研究・AIネイティブ開発・大学教育支援。",
    images: ["/images/founder-portfolio/yuto-matsui-profile-hero.webp"]
  }
};

const fields = [
  {
    id: "01",
    title: "分子生物学研究",
    english: "Molecular Biology Research",
    description: "神経変性疾患の分子病態を、実験研究の現場から理解する。",
    image: "/images/founder-portfolio/source/life-science-unsplash.jpg",
    alt: "細胞培養の観察に使われる顕微鏡",
    accent: "bio"
  },
  {
    id: "02",
    title: "AIネイティブ開発",
    english: "AI-native Development",
    description: "AIとともに、一人が設計・実装できるシステムの規模を広げる。",
    image: "/images/founder-portfolio/source/software-development-unsplash.jpg",
    alt: "ソースコードを表示したPCの開発環境",
    accent: "ai"
  },
  {
    id: "03",
    title: "大学教育支援",
    english: "University Education Support",
    description: "学生と教育現場の課題を、実際に使われる仕組みへ変換する。",
    image: "/images/founder-portfolio/yuto-matsui-education-support.webp",
    alt: "ホワイトボードに研究分野を書き示すスーツ姿のYuto Matsui",
    accent: "education"
  }
] as const;

const products = [
  {
    key: "interactive",
    label: "COMPASS Interactive",
    title: "リアルタイム × AIが、講義を次の次元へ。",
    image: "/images/hero.desktop.highlight.webp",
    alt: "DNA、コンパス、ネットワークで構成されたCOMPASS Interactiveのビジュアル",
    links: [
      { label: "紹介サイト", href: "/INTRO_Interactive/" },
      {
        label: "ProtoPedia",
        href: "https://protopedia.net/prototype/private/59f061db-936a-4fa3-abc2-438a98711e9e"
      },
      { label: "開発者向けポートフォリオ", href: "/INTRO_Interactive/developers/" }
    ]
  },
  {
    key: "library",
    label: "未来戦略ライブラリ",
    title: "北里大学薬学部生のための、学生目線の資料ライブラリ。",
    image: "/images/future-strategy-library/knowledge-horizon-og.png",
    alt: "未来戦略ライブラリのBeyond the Syllabusビジュアル",
    links: [{ label: "ライブラリを見る", href: "/future-strategy-library/" }]
  },
  {
    key: "manifesto",
    label: "COMPASS Manifesto",
    title: "AI時代をどう生きるか。",
    image: "/images/Image4.jpg",
    alt: "AI時代の可能性を象徴する光に包まれた未来都市",
    links: [{ label: "Manifestoを読む", href: "/messages/" }]
  }
] as const;

const credentials = [
  { kind: "eiken", mark: "英検", name: "実用英語技能検定", score: "1級" },
  { kind: "toeic", mark: "TOEIC", name: "TOEIC L&R", score: "965" },
  { kind: "ielts", mark: "IELTS", name: "IELTS Academic", score: "7.5" }
] as const;

const offHours = [
  {
    id: "01",
    label: "DRIVE",
    image: "/images/founder-portfolio/off-hours-drive.webp",
    alt: "雪山と新緑を背景に高原道路を走る車",
    copy: [
      "自然の中で車を走らせるのが好きです。",
      "一番の思い出は、友人との長野ドライブです。"
    ]
  },
  {
    id: "02",
    label: "SHOGI",
    image: "/images/founder-portfolio/off-hours-shogi.webp",
    alt: "新将棋会館のエントランスと将棋会館の石碑",
    copy: [
      "将棋は小学生から始め、棋力はアマチュア三段です。",
      "全国大会にも何度か出場しました。"
    ]
  },
  {
    id: "03",
    label: "CLIMBING",
    image: "/images/founder-portfolio/off-hours-climbing.webp",
    alt: "ボルダリングウォールを登るYuto Matsui",
    copy: [
      "高校時代はクライミング部。",
      "最近は頻度こそ減りましたが、登山や自然の中で過ごすことが好きです。"
    ]
  }
] as const;

const personSchema = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Yuto Matsui",
  alternateName: "松井優知",
  url: "https://compass-official.pages.dev/founder/",
  image: "https://compass-official.pages.dev/images/founder-portfolio/yuto-matsui-profile-hero.webp",
  knowsAbout: [
    "Life science research",
    "AI-native software development",
    "University education support"
  ],
  founder: {
    "@type": "Organization",
    name: "COMPASS",
    url: "https://compass-official.pages.dev/"
  },
  sameAs: ["https://github.com/genellect", "https://www.instagram.com/n.m.w.314/"]
};

function ArrowIcon() {
  return <span aria-hidden="true">↗</span>;
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" role="presentation">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.25" />
      <circle className={styles.iconFill} cx="17.4" cy="6.7" r="1.1" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" role="presentation">
      <path className={styles.iconFill} d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.61-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.58 9.58 0 0 1 12 6.82c.85 0 1.71.11 2.51.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}

function CompassIcon() {
  return <Image src="/images/compass-mark.svg" alt="" width={28} height={28} aria-hidden="true" />;
}

function InteractiveHeroPreview() {
  return (
    <div
      className={`${styles.interactiveHeroPreview} hero-section--signal`}
      aria-label="COMPASS Interactive紹介サイトのHeroプレビュー"
    >
      <div className={styles.interactiveHeroGrid}>
        <div className={styles.interactiveHeroCopy}>
          <span className={styles.interactiveEyebrow}>NEXT LECTURE EXPERIENCE</span>
          <p className={styles.interactiveHeroTitle} aria-label="LET EVERYTHING MOVE.">
            <span>LET EVERYTHING</span>
            <strong>MOVE.</strong>
          </p>
          <p className={styles.interactiveHeroLead}>
            <span>リアルタイム×AIが、</span>
            <span>講義を次の次元へ。</span>
          </p>
        </div>

        <div className={`${styles.interactiveHeroStage} hero-signal-stage`} aria-hidden="true">
          <LectureSignalMatrix />
          <ProductExperienceMock compact className="founder-interactive-product-preview" />
        </div>
      </div>
    </div>
  );
}

export default function FounderPage() {
  return (
    <div className={styles.page} data-founder-page>
      <a className={styles.skipLink} href="#founder-main">本文へスキップ</a>

      <header className={styles.header}>
        <a className={styles.wordmark} href="#top" aria-label="Yuto Matsui ポートフォリオの先頭へ">
          <strong>YUTO MATSUI</strong>
          <span>Research × Engineering</span>
        </a>
        <nav className={styles.navigation} aria-label="Portfolio navigation">
          <a href="#expertise">Expertise</a>
          <a href="#story">Story</a>
          <a href="#products">Products</a>
          <a href="#credentials">Credentials</a>
          <a href="#off-hours">Off Hours</a>
          <a href="#contact-cta">Contact</a>
        </nav>
        <nav className={styles.mobileNavigation} aria-label="Mobile portfolio navigation">
          <a href="#message">Message</a>
          <a href="#products">Product</a>
          <a href="#contact-cta">Contact</a>
          <MobileExternalMenu className={styles.mobileExternalLinks}>
            <div className={styles.mobileExternalPopover} aria-label="Yuto Matsuiの外部リンク">
              <a href="https://www.instagram.com/n.m.w.314/?__pwa=1#" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><InstagramIcon /></a>
              <a href="https://github.com/genellect" target="_blank" rel="noopener noreferrer" aria-label="GitHub"><GitHubIcon /></a>
              <a href="/" aria-label="COMPASS公式サイト"><CompassIcon /></a>
            </div>
          </MobileExternalMenu>
        </nav>
      </header>

      <main id="founder-main">
        <section id="top" className={styles.hero} aria-labelledby="founder-title">
          <div className={styles.heroAmbient} aria-hidden="true"><span /><span /><span /></div>
          <FounderHeroGallery />

          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Life science · AI · Education</p>
            <h1 id="founder-title">Yuto Matsui</h1>
            <p className={styles.japaneseName}>松井優知</p>
            <p className={styles.heroStatement}>境界を越え、新しい可能性へ。</p>

            <ul className={styles.axisList} aria-label="専門領域">
              <li data-accent="bio"><span aria-hidden="true" />ライフサイエンス研究</li>
              <li data-accent="ai"><span aria-hidden="true" />AIネイティブ開発</li>
              <li data-accent="education"><span aria-hidden="true" />大学教育支援</li>
            </ul>

            <nav className={styles.socialLinks} aria-label="Yuto Matsuiの外部リンク">
              <a href="https://www.instagram.com/n.m.w.314/?__pwa=1#" target="_blank" rel="noopener noreferrer" aria-label="Instagram" title="Instagram">
                <InstagramIcon />
              </a>
              <a href="https://github.com/genellect" target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="GitHub">
                <GitHubIcon />
              </a>
              <a href="/" aria-label="COMPASS公式サイト" title="COMPASS公式サイト">
                <CompassIcon />
              </a>
            </nav>
          </div>

          <div className={styles.interfaceGraphic} aria-hidden="true">
            <svg viewBox="0 0 410 220" role="presentation">
              <path className={styles.bioLine} d="M8 34 C124 34 135 110 250 110" />
              <path className={styles.aiLine} d="M8 110 H250" />
              <path className={styles.educationLine} d="M8 186 C124 186 135 110 250 110" />
              <circle className={styles.bioNode} cx="8" cy="34" r="4" />
              <circle className={styles.aiNode} cx="8" cy="110" r="4" />
              <circle className={styles.educationNode} cx="8" cy="186" r="4" />
              <circle className={styles.interfaceNode} cx="250" cy="110" r="7" />
              <path className={styles.outputLine} d="M258 110 H402" />
            </svg>
          </div>
        </section>

        <section id="expertise" className={styles.expertise} aria-labelledby="expertise-title">
          <div className={styles.sectionShell}>
            <header className={styles.compactHeading} data-reveal>
              <h2 id="expertise-title">Expertise</h2>
            </header>
            <div className={styles.fieldGrid}>
              {fields.map((field) => (
                <article key={field.id} className={styles.fieldCard} data-reveal data-accent={field.accent}>
                  <div className={styles.fieldImage}>
                    <Image src={field.image} alt={field.alt} fill sizes="(min-width: 901px) 32vw, (min-width: 641px) 50vw, 100vw" />
                    <div className={styles.fieldOverlay} aria-hidden="true" />
                    <span className={styles.fieldNumber}>{field.id}</span>
                  </div>
                  <div className={styles.fieldCopy}>
                    <p>{field.english}</p>
                    <h3>{field.title}</h3>
                    <span>{field.description}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <FounderFragments />

        <section id="story" className={styles.story} aria-labelledby="story-title">
          <div className={styles.storyShell}>
            <aside className={styles.storyPortrait} data-reveal>
              <div className={styles.storyPortraitFrame}>
                <Image src="/images/founder-portfolio/yuto-matsui-front.webp" alt="正面を向くYuto Matsui / 松井優知" fill sizes="(min-width: 901px) 38vw, 92vw" />
                <div className={styles.storyPhotoGrid} aria-hidden="true" />
              </div>
              <div className={styles.storyPortraitCaption}>
                <span>Background &amp; values</span>
                <strong>THE INTERFACE</strong>
              </div>
            </aside>

            <div className={styles.essay}>
              <header id="message" className={styles.storyHeading} data-reveal>
                <p className={styles.sectionKicker}>Personal statement</p>
                <h2 id="story-title">
                  研究と<span className={styles.mobileStoryBreak} aria-hidden="true"><br /></span>エンジニアリングの<br />
                  インターフェース。
                </h2>
              </header>

              <section className={styles.essayChapter} aria-labelledby="chapter-origin" data-reveal>
                <header><span>01</span><h3 id="chapter-origin">Origin</h3></header>
                <p>高校時代の2020年頃から趣味でプログラミングを始め、Webフロントエンド開発を中心に学びました。当時は現在のようなLLMやコーディングエージェントはなく、実装、デバッグ、Git操作の多くを手作業で行う時代でした。開発そのものには強く惹かれましたが、大学では、より関心のあった生命科学・薬学を選びました。</p>
                <p>大学では学部2年次から実験系研究室に所属し、神経変性疾患に関わる遺伝子変異と分子病態を研究してきました。その一方で、生成AIとコーディングエージェントの急速な進歩をきっかけに、研究支援やデータ解析から再びソフトウェア開発へ軸足を広げました。</p>
                <p>そこで実感したのは、AIの価値は単にコーディングを高速化することではなく、一人の人間が設計・実装できるシステムの規模を拡張することにあるという点です。</p>
              </section>

              <EssayContinuation
                className={styles.essayContinuation}
                buttonClassName={styles.essayContinuationButton}
                contentClassName={styles.essayContinuationContent}
              >
                <section className={styles.essayChapter} aria-labelledby="chapter-compass">
                  <header><span>02</span><h3 id="chapter-compass">From a tool to COMPASS</h3></header>
                  <p>この考えを最初に形にしたのが、現在のCOMPASS Platformにつながる開発です。当初は、学生向け資料を共有するGoogle Driveの招待や名簿管理を自動化する小さな仕組みでした。その後、学生支援団体COMPASSの設立、大学講義支援システムCOMPASS Interactiveの開発へと対象を広げてきました。</p>
                  <p>現在は、生命科学研究を継続しながら、教育・研究支援システムの開発、研究OSの構築、ITベンチャーでのエンジニアリングにも取り組んでいます。研究現場の課題を理解し、それを要件へ落とし込み、実装可能なシステムへ変換することが、現在の私のエンジニアリングの中心です。</p>
                </section>

                <section className={styles.essayChapter} aria-labelledby="chapter-themes">
                  <header><span>03</span><h3 id="chapter-themes">Two long-term themes</h3></header>
                  <p>私が長期的に取り組んでいるテーマは、大きく二つあります。</p>
                  <p>一つは、学生が自分の可能性を知り、将来の選択肢を広げられる仕組みをつくることです。能力や意欲があっても、情報や機会へのアクセスによって選択肢は大きく変わります。COMPASSでは、教育やキャリアに関する機会を、偶然だけに左右されにくい構造へ変えていくことを目指しています。</p>
                  <p>もう一つは、AIとソフトウェアによって、生命科学研究の生産性と研究環境そのものを再設計することです。</p>
                  <p>実験研究では、不確実性の高い仮説検証に多くの時間と認知資源が必要です。一方、ソフトウェア開発では、AIによって情報処理、実装、検証の速度が大きく変わりました。私はこの二つの現場を同時に経験してきたからこそ、その間にまだ大きな未開拓領域があると考えています。</p>
                </section>

                <section className={styles.essayChapter} aria-labelledby="chapter-interface">
                  <header><span>04</span><h3 id="chapter-interface">The interface</h3></header>
                  <p>私が目指しているのは、研究者として生命科学の課題を理解し、エンジニアとして、その解決を支えるシステムを実装することです。一人の研究成果だけでなく、多くの研究者の生産性や研究体験を改善することで、より大きなスケールで生命科学に貢献することを目指しています。</p>
                  <p>そのため、生命科学、ソフトウェア開発、AIのいずれか一つに自分を限定するのではなく、研究とエンジニアリングのインターフェースを自分の専門領域として深めることを目指しています。</p>
                </section>

                <section className={`${styles.essayChapter} ${styles.essayClosing}`} aria-labelledby="chapter-future">
                  <header><span>05</span><h3 id="chapter-future">Future</h3></header>
                  <p>生命科学研究、ソフトウェア開発、大学教育、英語学習。扱う領域は異なりますが、根底にある考え方は共通しています。</p>
                  <p className={styles.closingPrinciple}>人が持つ能力や知識を、より大きな成果につなげる仕組みをつくること。</p>
                  <p>それを実現することが、私が目標とする未来です。</p>
                </section>
              </EssayContinuation>
            </div>
          </div>
        </section>

        <section id="products" className={styles.products} aria-labelledby="products-title">
          <div className={styles.sectionShell}>
            <header className={styles.productsHeading} data-reveal>
              <div><p className={styles.sectionKicker}>Products</p><h2 id="products-title">プロダクト紹介</h2></div>
            </header>
            <div className={styles.productGrid}>
              {products.map((product) => (
                <article key={product.key} className={styles.productCard} data-product={product.key} data-reveal>
                  <div className={styles.productVisual}>
                    {product.key === "interactive" ? (
                      <InteractiveHeroPreview />
                    ) : (
                      <>
                        <Image src={product.image} alt={product.alt} fill sizes="(min-width: 901px) 32vw, 100vw" />
                        <div className={styles.productWash} aria-hidden="true" />
                        <Image src="/images/compass-mark.svg" alt="" width={40} height={40} className={styles.productMark} aria-hidden="true" />
                      </>
                    )}
                  </div>
                  <div className={styles.productCopy}>
                    <p>{product.label}</p>
                    <h3>
                      {product.key === "interactive" ? (
                        <><span>リアルタイム × AIが、</span><span>講義を次の次元へ。</span></>
                      ) : product.key === "library" ? (
                        <><span>北里大学薬学部生のための、</span><span>学生目線の資料ライブラリ。</span></>
                      ) : product.title}
                    </h3>
                    <nav aria-label={`${product.label}へのリンク`}>
                      {product.links.map((link) => (
                        <a
                          key={link.href}
                          href={link.href}
                          target={link.href.startsWith("https://") ? "_blank" : undefined}
                          rel={link.href.startsWith("https://") ? "noopener noreferrer" : undefined}
                        >
                          <span>{link.label}</span><ArrowIcon />
                        </a>
                      ))}
                    </nav>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="credentials" className={styles.credentials} aria-labelledby="credentials-title">
          <div className={styles.sectionShell}>
            <header className={styles.compactHeading} data-reveal>
              <p className={styles.sectionKicker}>Credentials</p>
              <h2 id="credentials-title">English Proficiency</h2>
            </header>
            <div className={styles.credentialGrid}>
              {credentials.map((credential) => (
                <article key={credential.name} className={styles.credentialCard} data-credential={credential.kind} data-reveal>
                  <span className={styles.credentialMark} aria-hidden="true">{credential.mark}</span>
                  <div><p>{credential.name}</p><strong>{credential.score}</strong></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="off-hours" className={styles.offHours} aria-labelledby="off-hours-title">
          <div className={styles.sectionShell}>
            <header className={styles.offHoursHeading} data-reveal>
              <p className={styles.sectionKicker}>Away from the desk</p>
              <h2 id="off-hours-title">OFF HOURS</h2>
            </header>
            <div className={styles.offHoursGrid}>
              {offHours.map((item) => (
                <article key={item.label} className={styles.offHoursCard}>
                  <div className={styles.offHoursVisual}>
                    <Image src={item.image} alt={item.alt} fill sizes="(min-width: 901px) 32vw, 100vw" />
                    <span aria-hidden="true">{item.id}</span>
                  </div>
                  <div className={styles.offHoursCopy}>
                    <h3>{item.label}</h3>
                    <p>{item.copy.map((line) => <span key={line}>{line}</span>)}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="contact-cta" className={styles.contact} aria-labelledby="contact-title">
          <div className={styles.contactShell} data-reveal>
            <div>
              <p className={styles.contactKicker}>お問い合わせ</p>
              <h2 id="contact-title">CONTACT</h2>
            </div>
            <div className={styles.contactCopy}>
              <p>ご興味を持っていただけましたら、下記のフォームからお気軽にご連絡ください。学生・教職員・団体・企業の方を問わず、さまざまな方とのご縁を歓迎しています。</p>
              <a href="/contact/">Contact form <ArrowIcon /></a>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerPrimary}>
          <div><strong>Yuto Matsui / 松井優知</strong><span>Life Science · AI-native Development · University Education</span></div>
          <nav aria-label="Personal links">
            <a href="https://www.instagram.com/n.m.w.314/?__pwa=1#" target="_blank" rel="noopener noreferrer">Instagram <ArrowIcon /></a>
            <a href="https://github.com/genellect" target="_blank" rel="noopener noreferrer">GitHub <ArrowIcon /></a>
            <a href="/">COMPASS <ArrowIcon /></a>
            <a href="#top">Back to top ↑</a>
          </nav>
        </div>
        <details className={styles.credits}>
          <summary>Image credits</summary>
          <p>
            Life science: <a href="https://unsplash.com/photos/white-and-black-microscope-5HbxyB0_DBg" target="_blank" rel="noopener noreferrer">Jaron Nix / Unsplash</a> ·
            Software development: <a href="https://unsplash.com/photos/code-appears-on-a-computer-screen-XG5q_aosoPo" target="_blank" rel="noopener noreferrer">Rob Wingate / Unsplash</a> ·
            Education portrait: Yuto Matsui / personal archive ·
            Manifesto visual: COMPASS visual archive ·
            Drive: <a href="https://unsplash.com/photos/a-car-drives-along-a-scenic-mountain-road-e6XJTEz5SfA" target="_blank" rel="noopener noreferrer">Zixplore / Unsplash</a> ·
            Shogi: <a href="https://commons.wikimedia.org/wiki/File:Hulic_Shogi-kaikan_Sendagaya_Building_entrance_2024-09-12.jpg" target="_blank" rel="noopener noreferrer">Asanagi / Wikimedia Commons (CC0)</a> ·
            FRAGMENTS — DNA automation: <a href="https://unsplash.com/photos/gray-laboratory-machine-to8o0bqOA6Q" target="_blank" rel="noopener noreferrer">National Cancer Institute / Unsplash</a> ·
            Pipetting: <a href="https://unsplash.com/photos/person-using-pipette-in-laboratory-wDxFn_dBEC0" target="_blank" rel="noopener noreferrer">CDC / Unsplash</a> ·
            Code by window: <a href="https://unsplash.com/photos/laptop-displaying-code-on-a-wooden-table-by-window-FhWWzP6LAkY" target="_blank" rel="noopener noreferrer">Alen Kuriakose / Unsplash</a> ·
            Code and terminal: <a href="https://unsplash.com/photos/computer-screen-displaying-code-and-terminal-prompts-N4pwMINNNL8" target="_blank" rel="noopener noreferrer">Bernd Dittrich / Unsplash</a> ·
            Development analysis: <a href="https://unsplash.com/photos/laptop-screen-displaying-code-and-data-charts-GQOylIn892U" target="_blank" rel="noopener noreferrer">Daniil Komov / Unsplash</a> ·
            Servers: <a href="https://unsplash.com/photos/a-rack-of-servers-in-a-server-room-2JJ3wBHu4_0" target="_blank" rel="noopener noreferrer">Kevin Ache / Unsplash</a> ·
            Personal portraits, FRAGMENTS &amp; climbing: Yuto Matsui / personal archive
          </p>
        </details>
        <p className={styles.copyright}>© 2026 Yuto Matsui. Personal portfolio hosted within the COMPASS site.</p>
      </footer>

      <LegacyInteractions />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }} />
    </div>
  );
}
