import type { Metadata } from "next";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { LibraryStats } from "./LibraryStats";
import styles from "./future-strategy-library.module.css";

const registrationUrl =
  "https://docs.google.com/forms/d/e/1FAIpQLSf8gLujuK-giYnkCnv-Cxp7qon1kY8mhnGvfkA62hOlrJgAHA/viewform";

const fields = [
  {
    number: "01",
    name: "PHARMACY",
    heroName: "Pharmacy",
    title: "試験を乗り切る。理解も置いていかない。",
    paragraphs: [
      "試験対策を入口に、暗記だけでは終わらない理解へ。",
      "「とりあえず覚える」から一歩進み、知識を実習・研究・臨床へつなげるための学習資料を扱います。"
    ],
    accent: "cyan"
  },
  {
    number: "02",
    name: "ENGLISH",
    heroName: "English",
    title: "翻訳できる。だからこそ、使える人が強い。",
    paragraphs: [
      "資格の点数だけをゴールにしない英語学習へ。",
      "論文を読む、発表する、海外の研究者と話す。薬学の専門性を、世界へ接続するための学び方を届けます。"
    ],
    accent: "gold"
  },
  {
    number: "03",
    name: "AI LITERACY",
    heroName: "AI Literacy",
    title: "AIを使う。AIに使われない。",
    paragraphs: [
      "レポートを早く終わらせるだけでは、少しもったいない。",
      "学習、情報収集、研究、制作、意思決定まで。思考と成果を拡張しながら、責任と信頼を守るためのAI活用を扱います。"
    ],
    accent: "violet"
  },
  {
    number: "04",
    name: "RESEARCH & CAREER",
    heroName: "Research & Career",
    title: "配属されてから、初めて考えない。",
    paragraphs: [
      "研究室、大学院、就職を、別々のイベントとして考えない。",
      "何を研究するか。\n誰から学ぶか。\nその経験を、どこへつなげるか。",
      "将来を一つながりの意思決定として考えるための判断軸を届けます。"
    ],
    accent: "mint"
  }
] as const;

const materials = [
  {
    category: "ENGLISH / INTRODUCTION",
    title: ["翻訳できる時代に、", "なぜ英語を学ぶのか。"],
    paragraphs: [
      "翻訳AIがあっても、英語を使える人の選択肢は減りません。むしろ、これまで以上に広がります。",
      "資格勉強を、試験のためだけで終わらせず、専門性を世界へ届ける力へ変えるための導入資料です。"
    ],
    image: "/images/future-strategy-library/why-english.webp",
    alt: "翻訳できる時代に、なぜ英語を学ぶのか。という英語学習資料の表紙"
  },
  {
    category: "AI LITERACY",
    title: ["AIで、未来を設計する。"],
    paragraphs: [
      "答えを出させるだけなら、AIの力のほんの一部です。",
      "学習、研究、開発、情報整理、アイデアの実現。AIを「便利なチャットボット」で終わらせず、自分の可能性を広げるための実践ガイドです。"
    ],
    image: "/images/future-strategy-library/ai-guide-sanitized.webp",
    alt: "AIで、未来を設計する。というAI活用資料の表紙"
  },
  {
    category: "RESEARCH & CAREER",
    title: ["研究を、未来の仕事にする。"],
    paragraphs: [
      "研究室は、配属先を決めるだけの場所ではありません。",
      "研究テーマ、指導環境、大学院、企業、アカデミア。目の前の研究経験を、その先のキャリアへつなげるための判断ガイドです。"
    ],
    image: "/images/future-strategy-library/research-career.webp",
    alt: "研究を、未来の仕事にする。という研究・キャリア資料の表紙"
  }
] as const;

const trustPoints = [
  ["対象", "北里大学薬学部生"],
  ["費用", "登録・利用無料"],
  ["認証", "北里大学の大学アカウント必須"],
  ["利用条件", "個人での学習利用に限ります。無断共有・転載・再配布は禁止しています。"],
  ["運営", "学生有志による任意の学生支援活動"]
] as const;

export const metadata: Metadata = {
  title: "大学生のための未来戦略ライブラリ | COMPASS",
  description:
    "北里大学薬学部生向け。薬学の学習、英語、AI活用、研究室選び、大学院進学、キャリア形成を学生目線でつなぐ無料登録制の資料ライブラリです。",
  alternates: { canonical: "/future-strategy-library/" },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "COMPASS",
    title: "大学生のための未来戦略ライブラリ | COMPASS",
    description: "知ることが、未来を変える。学びから進路まで、選択肢と判断軸を届ける学生目線の資料ライブラリ。",
    url: "/future-strategy-library/",
    images: ["/images/future-strategy-library/library-horizon.webp"]
  },
  twitter: {
    card: "summary_large_image",
    title: "大学生のための未来戦略ライブラリ | COMPASS",
    description: "薬学、英語、AI、研究・キャリアを、未来の選択につなぐ資料ライブラリ。",
    images: ["/images/future-strategy-library/library-horizon.webp"]
  }
};

function RegistrationAction({ className }: { className?: string }) {
  return (
    <a
      className={`${styles.primaryAction}${className ? ` ${className}` : ""}`}
      href={registrationUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-library-registration
    >
      <span>大学アカウントで無料登録する</span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}

function MaterialAction() {
  return (
    <a
      className={styles.materialAction}
      href={registrationUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-library-material
    >
      <span>資料を見る</span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}

export default function FutureStrategyLibraryPage() {
  const learningResourceSchema = {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: "大学生のための未来戦略ライブラリ",
    alternateName: "Pharmacy Students’ Resource Library",
    description:
      "北里大学薬学部生に、薬学の学習、英語、AI活用、研究室選び、大学院進学、キャリア形成の選択肢と判断軸を届ける資料ライブラリ。",
    url: "https://compass-official.pages.dev/future-strategy-library/",
    inLanguage: "ja",
    isAccessibleForFree: true,
    audience: {
      "@type": "EducationalAudience",
      educationalRole: "student"
    },
    about: fields.map((field) => field.name),
    provider: {
      "@type": "EducationalOrganization",
      name: "COMPASS",
      url: "https://compass-official.pages.dev/"
    }
  };

  return (
    <>
      <SiteHeader routeContext="library" />
      <main id="main" className={styles.page} data-library-page="true">
        <section className={styles.hero} aria-labelledby="library-title">
          <div className={styles.heroGrid} aria-hidden="true" />
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.mobileHeroBackdrop} data-mobile-hero="legacy" aria-hidden="true" />
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <p className={styles.mobileLabel}>未来戦略ライブラリ</p>
              <p className={styles.kicker}>PHARMACY STUDENTS&apos; RESOURCE LIBRARY</p>
              <h1 id="library-title">
                <span>知ることが、</span>
                <span>未来を変える。</span>
              </h1>
              <p className={styles.heroLead}>
                北里大学薬学部生のための、<br />
                学生目線の資料ライブラリ。
              </p>
              <div className={styles.mobileNeeds} data-mobile-hero-needs="true" aria-label="主な資料テーマ">
                <span className={styles.needExam}>試験対策</span>
                <span className={styles.needPharmacy}>薬学部の学習</span>
                <span className={styles.needAi}>英語・AI活用</span>
              </div>
              <p className={styles.heroBody}>
                試験対策から英語、AI活用、研究室選び、大学院進学まで。
                今すぐ使える知識を、未来を選ぶための判断軸につなげます。
              </p>
              <RegistrationAction />
              <p className={styles.heroNote}>登録無料 · 大学アカウント必須 · 無断共有禁止</p>
            </div>

            <figure className={styles.heroVisual}>
              <img
                src="/images/future-strategy-library/library-horizon.webp"
                alt="学びの先に広がる都市と未来を見つめる学生たち"
                width="1536"
                height="1024"
                fetchPriority="high"
              />
              <div className={styles.heroVisualShade} aria-hidden="true" />
              <figcaption className={styles.decisionPanel}>
                <div>
                  <span>LIBRARY INDEX</span>
                  <strong>Four fields.<br />One decision system.</strong>
                </div>
                <ol>
                  {fields.map((field) => (
                    <li key={field.number}>
                      <span>{field.number}</span>
                      <strong>{field.heroName}</strong>
                    </li>
                  ))}
                </ol>
              </figcaption>
            </figure>
          </div>
        </section>

        <div className={styles.contentRegion}>
          <section className={styles.libraryStatement} aria-labelledby="statement-title">
            <div className={`${styles.sectionShell} ${styles.statementGrid}`}>
              <header className={styles.statementHeading}>
                <p className={styles.sectionLabel}>FUTURE STRATEGY LIBRARY</p>
                <h2 id="statement-title">
                  <span>過去問は、次の試験を<br />救ってくれる。</span>
                  <span>でも、卒業後までは<br />決めてくれない。</span>
                </h2>
              </header>
              <div className={styles.statementCopy}>
                <p>未来戦略ライブラリは、北里大学薬学部生のための資料ライブラリです。</p>
                <p>
                  試験対策、英語、AI、研究室、大学院、キャリア。<br />
                  一見ばらばらに見えるテーマをつなぎ、大学で学ぶ「今」を、これからの選択へ変えていきます。
                </p>
                <p>
                  まずは、次の試験のためでも構いません。<br />
                  登録した理由より、登録したあとに見える景色のほうが大切です。
                </p>
                <RegistrationAction className={styles.statementAction} />
                <p className={styles.statementMeta}>北里大学薬学部生限定　／　登録・利用無料　／　大学アカウント認証</p>
              </div>
            </div>
          </section>

          <LibraryStats />

          <section className={styles.fieldsSection} aria-labelledby="fields-title">
            <div className={styles.sectionShell}>
              <header className={styles.editorialHeader}>
                <p className={styles.sectionLabel}>WHAT YOU GET</p>
                <h2 id="fields-title">四つの領域。ひとつの未来。</h2>
                <div className={styles.editorialLead}>
                  <p>薬学部生活の悩みは、科目ごとには現れません。</p>
                  <p>
                    試験、英語、AI、研究、進路。<br />
                    気づけば、全部つながっています。
                  </p>
                  <p>
                    だから、このライブラリも分断しません。<br />
                    目の前の課題を解決しながら、その先の選択肢まで広げる資料を届けます。
                  </p>
                </div>
              </header>
              <div className={styles.fieldsGrid}>
                {fields.map((field) => (
                  <article key={field.number} className={`${styles.fieldCard} ${styles[field.accent]}`}>
                    <div className={styles.fieldMeta}>
                      <span>{field.number}</span>
                      <strong>{field.name}</strong>
                    </div>
                    <h3>{field.title}</h3>
                    <div className={styles.fieldCopy}>
                      {field.paragraphs.map((paragraph) => (
                        <p key={paragraph}>
                          {paragraph.split("\n").map((line) => <span key={line}>{line}</span>)}
                        </p>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className={styles.materialsSection} aria-labelledby="materials-title">
            <div className={styles.sectionShell}>
              <header className={styles.editorialHeader}>
                <p className={styles.sectionLabel}>FEATURED MATERIALS</p>
                <h2 id="materials-title">未来は、案外、一つの資料から動き出す。</h2>
                <div className={styles.editorialLead}>
                  <p>まずは、気になるテーマから。</p>
                  <p>
                    読み始める理由は、英語でも、AIでも、研究室選びでも構いません。<br />
                    読み終える頃に、少し先の自分まで見える資料を目指しています。
                  </p>
                </div>
              </header>
              <div className={styles.materialsGrid}>
                {materials.map((material) => (
                  <article key={material.title.join("")} className={styles.materialCard}>
                    <div className={styles.materialImage}>
                      <img src={material.image} alt={material.alt} width="600" height="800" loading="lazy" />
                    </div>
                    <div className={styles.materialCopy}>
                      <p className={styles.materialCategory}>{material.category}</p>
                      <h3>{material.title.map((line) => <span key={line}>{line}</span>)}</h3>
                      {material.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                      <MaterialAction />
                    </div>
                  </article>
                ))}
              </div>
              <div className={styles.materialsAccess}>
                <p>資料は登録後、目的に応じて利用できます。</p>
                <RegistrationAction />
              </div>
            </div>
          </section>

          <section className={styles.forYouSection} aria-labelledby="for-you-title">
            <div className={`${styles.sectionShell} ${styles.forYouGrid}`}>
              <header>
                <p className={styles.sectionLabel}>FOR YOU</p>
                <h2 id="for-you-title">こんな人には、かなり向いています。</h2>
              </header>
              <div className={styles.forYouContent}>
                <ul>
                  <li>次の試験を、少しでも賢く乗り切りたい</li>
                  <li>英語やAIを、将来使える強みに変えたい</li>
                  <li>研究室・大学院・就職で、あとから後悔したくない</li>
                  <li>将来はまだ決まっていないが、何も知らないまま決めたくない</li>
                </ul>
                <p>最後の一つに当てはまるなら、たぶん今が入口です。</p>
              </div>
            </div>
          </section>

          <section className={styles.trustSection} aria-labelledby="trust-title">
            <div className={`${styles.sectionShell} ${styles.trustGrid}`}>
              <div className={styles.trustCopy}>
                <p className={styles.sectionLabel}>ACCESS &amp; TRUST</p>
                <h2 id="trust-title">
                  <span>限定公開。</span>
                  <span>だから、実用に</span>
                  <span>踏み込める。</span>
                </h2>
                <p>未来戦略ライブラリは、北里大学薬学部生を対象とした登録制のライブラリです。</p>
                <p>対象者の確認と資料の安全な運用のため、北里大学の大学アカウントによる認証をお願いしています。</p>
                <p className={styles.officialNote}>
                  試験、履修、進級、研究室配属、進路などの重要事項については、必ず大学・学部の公式情報と照合してください。
                </p>
              </div>
              <dl className={styles.trustList}>
                {trustPoints.map(([term, description]) => (
                  <div key={term}>
                    <dt>{term}</dt>
                    <dd>{description}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        </div>

        <section className={styles.finalSection} aria-labelledby="final-title">
          <div className={styles.finalOrbit} aria-hidden="true" />
          <div className={styles.finalInner}>
            <p className={styles.sectionLabel}>START HERE</p>
            <h2 id="final-title">「もっと早く知りたかった」を、減らす。</h2>
            <div className={styles.finalCopy}>
              <p>知るのが早いほど、選べる未来は増えます。</p>
              <p>
                <span>次の試験のためでもいい。</span>
                <span>研究室選びに迷っているからでもいい。</span>
                <span>まだ言葉にできない不安があるからでもいい。</span>
              </p>
              <p>入口は、何でも構いません。</p>
              <p>ここから、今の学びを、これからの選択へ。</p>
            </div>
            <RegistrationAction className={styles.finalAction} />
            <small>登録・利用無料<br />Googleフォームが新しいタブで開きます。</small>
          </div>
        </section>
      </main>
      <SiteFooter routeContext="library" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(learningResourceSchema) }}
      />
    </>
  );
}
