import type { Metadata } from "next";
import Image from "next/image";
import { LegacyInteractions } from "../../../components/LegacyInteractions";
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
    title: "ライフサイエンス研究",
    english: "Life Science Research",
    description: "神経変性疾患に関わる遺伝子変異と分子病態を、実験系研究の現場から捉える。",
    image: "/images/founder-portfolio/source/life-science-unsplash.jpg",
    alt: "細胞培養の観察に使われる顕微鏡",
    accent: "bio"
  },
  {
    id: "02",
    title: "AIネイティブ開発",
    english: "AI-native Development",
    description: "AIを追加機能ではなく、一人が設計・実装できるシステムの規模を拡張する基盤として使う。",
    image: "/images/founder-portfolio/source/ai-abstract-unsplash.jpg",
    alt: "情報の流れを想起させる青い光跡",
    accent: "ai"
  },
  {
    id: "03",
    title: "大学教育支援",
    english: "University Education Support",
    description: "学生と教育現場の課題を要件へ変換し、実際に使われるWebシステムとして届ける。",
    image: "/images/founder-portfolio/source/software-development-unsplash.jpg",
    alt: "ソースコードを表示した開発環境",
    accent: "education"
  }
] as const;

const works = [
  {
    number: "01",
    label: "Experimental Research",
    title: "Life Science Research",
    description: "神経変性疾患に関わる遺伝子変異と分子病態を研究。研究現場の不確実性と、仮説検証に必要な時間・認知資源を理解する。",
    meta: "Molecular biology / Neurodegeneration"
  },
  {
    number: "02",
    label: "Student-led Platform",
    title: "COMPASS Platform",
    description: "資料共有の招待・名簿管理の自動化から始まり、教育、情報、コミュニティを一つにつなぐ学生主導の基盤へ。",
    meta: "Founder / Product & Engineering",
    href: "/"
  },
  {
    number: "03",
    label: "Education Technology",
    title: "COMPASS Interactive",
    description: "質問、反応、教材、AIを同じ講義体験へ接続する大学講義支援システム。現場の課題を要件へ落とし、実装へ変換する。",
    meta: "Architecture / Frontend / Product",
    href: "/INTRO_Interactive/"
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
  sameAs: ["https://github.com/genellect"]
};

function ArrowIcon() {
  return <span aria-hidden="true">↗</span>;
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
          <a href="#practice">Practice</a>
          <a href="#work">Work</a>
          <a href="#story">Story</a>
          <a href="/" aria-label="COMPASS公式サイトへ">COMPASS <ArrowIcon /></a>
        </nav>
      </header>

      <main id="founder-main">
        <section id="top" className={styles.hero} aria-labelledby="founder-title">
          <div className={styles.heroPhoto}>
            <Image
              src="/images/founder-portfolio/yuto-matsui-profile-hero.webp"
              alt="横顔のYuto Matsui / 松井優知"
              fill
              priority
              sizes="(min-width: 901px) 59vw, 100vw"
              className={styles.heroPortrait}
            />
            <div className={styles.heroPhotoWash} aria-hidden="true" />
            <div className={styles.photoIndex} aria-hidden="true">
              <span>01</span>
              <span>Portrait / Interface</span>
            </div>
          </div>

          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Researcher · Engineer · Founder</p>
            <h1 id="founder-title">Yuto Matsui</h1>
            <p className={styles.japaneseName}>松井優知</p>
            <p className={styles.heroStatement}>
              研究現場を理解し、<br />
              解決を支えるシステムを実装する。
            </p>

            <ul className={styles.axisList} aria-label="専門領域">
              <li data-accent="bio"><span aria-hidden="true" />ライフサイエンス研究</li>
              <li data-accent="ai"><span aria-hidden="true" />AIネイティブ開発</li>
              <li data-accent="education"><span aria-hidden="true" />大学教育支援</li>
            </ul>

            <div className={styles.heroLinks}>
              <a href="#story">背景と価値観を読む <span aria-hidden="true">↓</span></a>
              <a href="https://github.com/genellect" target="_blank" rel="noopener noreferrer">
                GitHub <ArrowIcon />
              </a>
            </div>
          </div>

          <div className={styles.interfaceGraphic} aria-hidden="true">
            <svg viewBox="0 0 360 520" role="presentation">
              <path className={styles.bioLine} d="M8 86 C132 86 126 246 252 260" />
              <path className={styles.aiLine} d="M8 260 C132 260 154 260 252 260" />
              <path className={styles.educationLine} d="M8 434 C132 434 126 274 252 260" />
              <circle className={styles.bioNode} cx="8" cy="86" r="5" />
              <circle className={styles.aiNode} cx="8" cy="260" r="5" />
              <circle className={styles.educationNode} cx="8" cy="434" r="5" />
              <circle className={styles.interfaceNode} cx="252" cy="260" r="8" />
              <path className={styles.outputLine} d="M260 260 H352" />
            </svg>
          </div>
        </section>

        <section id="practice" className={styles.practice} aria-labelledby="practice-title">
          <div className={styles.sectionShell}>
            <header className={styles.sectionHeading} data-reveal>
              <p className={styles.sectionKicker}>Three fields, one practice</p>
              <h2 id="practice-title">三つの現場を、<br />ひとつの実装へ。</h2>
              <p>
                専門を並べるのではなく、研究で観察し、AIで拡張し、教育の現場へ届く仕組みとして統合します。
              </p>
            </header>

            <div className={styles.fieldGrid}>
              {fields.map((field) => (
                <article key={field.id} className={styles.fieldCard} data-reveal data-accent={field.accent}>
                  <div className={styles.fieldImage}>
                    <Image
                      src={field.image}
                      alt={field.alt}
                      fill
                      sizes="(min-width: 901px) 33vw, (min-width: 641px) 50vw, 100vw"
                    />
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

            <div className={styles.practiceFlow} data-reveal aria-label="研究から実装までの流れ">
              <div><small>01</small><strong>Observe</strong><span>現場と課題を理解する</span></div>
              <i aria-hidden="true">→</i>
              <div><small>02</small><strong>Define</strong><span>要件と判断軸に変える</span></div>
              <i aria-hidden="true">→</i>
              <div><small>03</small><strong>Build</strong><span>使える仕組みを実装する</span></div>
            </div>
          </div>
        </section>

        <section id="work" className={styles.work} aria-labelledby="work-title">
          <div className={styles.sectionShell}>
            <header className={styles.sectionHeading} data-reveal>
              <p className={styles.sectionKicker}>Selected work</p>
              <h2 id="work-title">考えを、<br />動くものにする。</h2>
              <p>研究、学生支援、大学教育。それぞれの現場で、課題を観察し、構造をつくり、実装へ進めています。</p>
            </header>

            <div className={styles.workList}>
              {works.map((work) => {
                const content = (
                  <>
                    <div className={styles.workNumber}>{work.number}</div>
                    <div className={styles.workIdentity}>
                      <p>{work.label}</p>
                      <h3>{work.title}</h3>
                    </div>
                    <p className={styles.workDescription}>{work.description}</p>
                    <div className={styles.workMeta}>
                      <span>{work.meta}</span>
                      {"href" in work ? <ArrowIcon /> : <span aria-hidden="true">—</span>}
                    </div>
                  </>
                );

                return "href" in work ? (
                  <a key={work.number} className={styles.workItem} href={work.href}>
                    {content}
                  </a>
                ) : (
                  <article key={work.number} className={styles.workItem}>
                    {content}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="story" className={styles.story} aria-labelledby="story-title">
          <div className={styles.storyShell}>
            <aside className={styles.storyPortrait} data-reveal>
              <div className={styles.storyPortraitFrame}>
                <Image
                  src="/images/founder-portfolio/yuto-matsui-front.webp"
                  alt="正面を向くYuto Matsui / 松井優知"
                  fill
                  sizes="(min-width: 901px) 34vw, 100vw"
                />
              </div>
              <div className={styles.storyPortraitCaption}>
                <span>Background &amp; values</span>
                <strong>THE INTERFACE</strong>
              </div>
            </aside>

            <div className={styles.essay}>
              <header className={styles.storyHeading} data-reveal>
                <p className={styles.sectionKicker}>Personal statement</p>
                <h2 id="story-title">研究とエンジニアリングの<br />インターフェース。</h2>
              </header>

              <section className={styles.essayChapter} aria-labelledby="chapter-origin" data-reveal>
                <header><span>01</span><h3 id="chapter-origin">Origin</h3></header>
                <p>高校時代の2020年頃から趣味でプログラミングを始め、Webフロントエンド開発を中心に学びました。当時は現在のようなLLMやコーディングエージェントはなく、実装、デバッグ、Git操作の多くを手作業で行う時代でした。開発そのものには強く惹かれましたが、大学では、より関心のあった生命科学・薬学を選びました。</p>
                <p>大学では学部2年次から実験系研究室に所属し、神経変性疾患に関わる遺伝子変異と分子病態を研究してきました。その一方で、生成AIとコーディングエージェントの急速な進歩をきっかけに、研究支援やデータ解析から再びソフトウェア開発へ軸足を広げました。</p>
                <p>そこで実感したのは、AIの価値は単にコーディングを高速化することではなく、<strong>一人の人間が設計・実装できるシステムの規模を拡張すること</strong>にあるという点です。</p>
              </section>

              <section className={styles.essayChapter} aria-labelledby="chapter-compass" data-reveal>
                <header><span>02</span><h3 id="chapter-compass">From a tool to COMPASS</h3></header>
                <p>この考えを最初に形にしたのが、現在の<strong>COMPASS Platform</strong>につながる開発です。当初は、学生向け資料を共有するGoogle Driveの招待や名簿管理を自動化する小さな仕組みでした。その後、学生支援団体<strong>COMPASS</strong>の設立、大学講義支援システム<strong>COMPASS Interactive</strong>の開発へと対象を広げてきました。</p>
                <p>現在は、生命科学研究を継続しながら、教育・研究支援システムの開発、研究OSの構築、ITベンチャーでのエンジニアリングにも取り組んでいます。研究現場の課題を理解し、それを要件へ落とし込み、実装可能なシステムへ変換することが、現在の私のエンジニアリングの中心です。</p>
              </section>

              <section className={styles.essayChapter} aria-labelledby="chapter-themes" data-reveal>
                <header><span>03</span><h3 id="chapter-themes">Two long-term themes</h3></header>
                <p>私が長期的に取り組んでいるテーマは、大きく二つあります。</p>
                <p>一つは、<strong>学生が自分の可能性を知り、将来の選択肢を広げられる仕組みをつくること</strong>です。能力や意欲があっても、情報や機会へのアクセスによって選択肢は大きく変わります。COMPASSでは、教育やキャリアに関する機会を、偶然だけに左右されにくい構造へ変えていくことを目指しています。</p>
                <p>もう一つは、<strong>AIとソフトウェアによって、生命科学研究の生産性と研究環境そのものを再設計すること</strong>です。</p>
                <p>実験研究では、不確実性の高い仮説検証に多くの時間と認知資源が必要です。一方、ソフトウェア開発では、AIによって情報処理、実装、検証の速度が大きく変わりました。私はこの二つの現場を同時に経験してきたからこそ、その間にまだ大きな未開拓領域があると考えています。</p>
              </section>

              <section className={styles.essayChapter} aria-labelledby="chapter-interface" data-reveal>
                <header><span>04</span><h3 id="chapter-interface">The interface</h3></header>
                <p>私が目指しているのは、<strong>研究者として生命科学の課題を理解し、エンジニアとして、その解決を支えるシステムを実装すること</strong>です。一人の研究成果だけでなく、多くの研究者の生産性や研究体験を改善することで、より大きなスケールで生命科学に貢献することを目指しています。</p>
                <p>そのため、生命科学、ソフトウェア開発、AIのいずれか一つに自分を限定するのではなく、<strong>研究とエンジニアリングのインターフェース</strong>を自分の専門領域として深めることを目指しています。</p>
              </section>

              <section className={`${styles.essayChapter} ${styles.essayClosing}`} aria-labelledby="chapter-future" data-reveal>
                <header><span>05</span><h3 id="chapter-future">Future</h3></header>
                <p>生命科学研究、ソフトウェア開発、大学教育、英語学習。扱う領域は異なりますが、根底にある考え方は共通しています。</p>
                <p className={styles.closingPrinciple}><strong>人が持つ能力や知識を、より大きな成果につなげる仕組みをつくること。</strong></p>
                <p>それを実現することが、私が目標とする未来です。</p>
              </section>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerPrimary}>
          <div>
            <strong>Yuto Matsui / 松井優知</strong>
            <span>Life Science · AI-native Development · University Education</span>
          </div>
          <nav aria-label="Personal links">
            <a href="https://github.com/genellect" target="_blank" rel="noopener noreferrer">GitHub <ArrowIcon /></a>
            <a href="/">COMPASS <ArrowIcon /></a>
            <a href="#top">Back to top ↑</a>
          </nav>
        </div>
        <details className={styles.credits}>
          <summary>Image credits</summary>
          <p>
            Life science: <a href="https://unsplash.com/photos/white-and-black-microscope-5HbxyB0_DBg" target="_blank" rel="noopener noreferrer">Jaron Nix / Unsplash</a> ·
            AI background: <a href="https://unsplash.com/photos/abstract-blue-light-streaks-on-a-dark-background-dOYVMySdXd0" target="_blank" rel="noopener noreferrer">灿雄 邱 / Unsplash</a> ·
            Software development: <a href="https://unsplash.com/photos/code-appears-on-a-computer-screen-XG5q_aosoPo" target="_blank" rel="noopener noreferrer">Rob Wingate / Unsplash</a>
          </p>
        </details>
        <p className={styles.copyright}>© 2026 Yuto Matsui. Personal portfolio hosted within the COMPASS site.</p>
      </footer>

      <LegacyInteractions />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
      />
    </div>
  );
}
