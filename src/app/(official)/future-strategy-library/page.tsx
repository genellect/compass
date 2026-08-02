import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "../../../components/SiteHeader";
import styles from "./future-strategy-library.module.css";
import { KnowledgeHorizonGraphic } from "./components/KnowledgeHorizonGraphic";
import { RegistrationCTA } from "./components/RegistrationCTA.client";
import { fields, footerLinks, libraryMetrics, materials, trustFacts } from "./content";

export const metadata: Metadata = {
  title: "未来戦略ライブラリ｜北里大学薬学部生のための無料資料｜COMPASS",
  description:
    "試験対策、英語、AI活用、研究室選び、大学院進学まで。北里大学薬学部生の「次に知りたい」を一つにまとめた、無料登録制の資料ライブラリです。",
  alternates: { canonical: "/future-strategy-library/" },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "COMPASS",
    title: "BEYOND THE SYLLABUS.｜未来戦略ライブラリ",
    description:
      "未来は、知っている人から動き出す。北里大学薬学部生のための、学生目線の資料ライブラリ。",
    url: "/future-strategy-library/",
    images: [{
      url: "/images/future-strategy-library/knowledge-horizon-og.png",
      width: 1200,
      height: 630,
      alt: "BEYOND THE SYLLABUS. — COMPASS未来戦略ライブラリ"
    }]
  },
  twitter: {
    card: "summary_large_image",
    title: "BEYOND THE SYLLABUS.｜未来戦略ライブラリ",
    description:
      "未来は、知っている人から動き出す。北里大学薬学部生のための、学生目線の資料ライブラリ。",
    images: ["/images/future-strategy-library/knowledge-horizon-og.png"]
  }
};

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className={styles.sectionLabel}>{children}</p>;
}

function FslFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <strong>COMPASS</strong>
          <span>Don’t Just Learn. Build What’s Next.</span>
        </div>
        <nav className={styles.footerLinks} aria-label="フッターナビゲーション">
          {footerLinks.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
        </nav>
        <div className={styles.footerDisclaimer}>
          <p>
            COMPASSは学生有志による任意の学生支援活動であり、大学の公式組織ではありません。本サイトおよび関連資料は、大学・学部・研究室・所属機関の公式見解を示すものではありません。<br />
            試験、履修、進級、研究室配属、進路などの重要事項は、必ず大学・学部の公式情報と照合してください。
          </p>
        </div>
        <p className={styles.copyright}>© 2026 COMPASS. All rights reserved.</p>
      </div>
    </footer>
  );
}

export default function FutureStrategyLibraryPage() {
  const learningResourceSchema = {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: "未来戦略ライブラリ",
    alternateName: "BEYOND THE SYLLABUS.",
    description:
      "試験対策、英語、AI活用、研究室選び、大学院進学まで。北里大学薬学部生の「次に知りたい」を一つにまとめた、無料登録制の資料ライブラリです。",
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
    <div className={styles.fslPage}>
      <SiteHeader routeContext="library" />

      <main id="main" className={styles.page} data-library-page="true">
        <section className={styles.hero} aria-labelledby="library-title" data-library-section="hero">
          <div className={styles.heroGrid} aria-hidden="true" />
          <div className={styles.heroAtmosphere} aria-hidden="true" />
          <div className={styles.heroInner}>
            <h1 id="library-title" className={`${styles.heroTitle} ${styles.heroEnter}`}>
              <span>BEYOND THE </span><span>SYLLABUS.</span>
            </h1>

            <div className={styles.heroLower}>
              <div className={styles.heroCopy}>
                <p className={`${styles.heroSubhead} ${styles.heroEnter}`}>
                  <span>未来は、知っている人から</span><span>動き出す。</span>
                </p>
                <p className={`${styles.heroDescription} ${styles.heroEnter}`}>
                  北里大学薬学部生のための、<br />
                  学生目線の資料ライブラリ。
                </p>
                <div className={`${styles.heroActionGroup} ${styles.heroEnter}`}>
                  <RegistrationCTA placement="hero" />
                  <p className={styles.actionMicrocopy}>
                    <span>北里大学薬学部生限定 ·</span>{" "}
                    <span>登録・利用無料 ·</span>{" "}
                    <span>大学アカウント認証</span>
                  </p>
                </div>
              </div>

              <KnowledgeHorizonGraphic />
            </div>

            <div className={styles.heroHorizonRule} aria-hidden="true">
              <span>SYLLABUS / CURRENT</span>
              <span>BEYOND / VISIBLE CHOICES</span>
            </div>
          </div>
        </section>

        <section className={styles.thesisSection} aria-labelledby="thesis-title" data-library-section="thesis">
          <div className={styles.sectionShell}>
            <div className={styles.thesisComposition}>
              <SectionLabel>WHY THIS LIBRARY</SectionLabel>
              <h2 id="thesis-title" className={styles.thesisTitle}>
                <span>未来戦略ライブラリは、</span>
                <span className={`${styles.mobileSemanticContinuation} ${styles.desktopSemanticContinuation}`}><span>北里大学薬学部生のための</span><span>資料ライブラリです。</span></span>
              </h2>
              <div className={styles.thesisStatements}>
                <p>
                  試験対策、英語、AI、研究室、大学院、キャリア。<br />
                  一見ばらばらに見えるテーマをつなぎ、大学で学ぶ「今」を、これからの選択へ変えていきます。
                </p>
                <p>
                  まずは、次の試験のためでも構いません。<br />
                  登録した理由より、登録したあとに見える景色のほうが大切です。
                </p>
              </div>
            </div>

            <dl className={styles.proofRail} aria-label="未来戦略ライブラリの実績">
              <div className={styles.proofDate}>
                <dt>{libraryMetrics.startedAt}</dt>
                <dd>活動開始</dd>
              </div>
              <div>
                <dt>{libraryMetrics.registeredUsers}<span>+</span></dt>
                <dd>利用登録者 <small>{libraryMetrics.registeredUsersAsOf}</small></dd>
              </div>
              <div>
                <dt>{libraryMetrics.materialCount}<span>+</span></dt>
                <dd>掲載資料</dd>
              </div>
            </dl>
          </div>
        </section>

        <section id="materials" className={styles.materialsSection} aria-labelledby="materials-title" data-library-section="materials">
          <div className={styles.sectionShell}>
            <header className={styles.sectionHeader}>
              <SectionLabel>FEATURED MATERIALS</SectionLabel>
              <h2 id="materials-title">
                <span>未来は、案外、</span>
                <span className={styles.mobileSemanticContinuation}><span>一つの資料から</span><span>動き出す。</span></span>
              </h2>
              <div className={styles.sectionLead}>
                <p>まずは、気になるテーマから。</p>
                <p>
                  読み始める理由は、英語でも、AIでも、研究室選びでも構いません。<br />
                  読み終える頃に、少し先の自分まで見える資料を目指しています。
                </p>
              </div>
            </header>

            <div className={styles.materialsGrid}>
              {materials.map((material, index) => (
                <article key={material.title} className={styles.materialCard}>
                  <div className={styles.materialFrame}>
                    <span className={styles.materialIndex} aria-hidden="true">0{index + 1}</span>
                    <img
                      src={material.image}
                      alt={material.alt}
                      width="600"
                      height="800"
                      sizes="(max-width: 720px) 100px, (max-width: 900px) 38vw, 28vw"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <div className={styles.materialCopy}>
                    <span className={styles.materialStatus} data-library-material>登録後に閲覧できます</span>
                    <p className={styles.materialCategory}>{material.category}</p>
                    <h3>{material.titleLines.map((line) => <span key={line}>{line}</span>)}</h3>
                    {material.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  </div>
                </article>
              ))}
            </div>

            <div className={styles.materialsConversion}>
              <p>掲載資料は{libraryMetrics.materialCount}点以上。試験対策、TOEIC・英検、英会話、大学院進学なども扱っています。</p>
              <RegistrationCTA placement="materials" />
              <small>登録・利用無料 · 北里大学の大学アカウントが必要です</small>
            </div>
          </div>
        </section>

        <section id="fields" className={styles.fieldsSection} aria-labelledby="fields-title" data-library-section="fields">
          <div className={styles.sectionShell}>
            <header className={styles.sectionHeader}>
              <SectionLabel>WHAT YOU GET</SectionLabel>
              <h2 id="fields-title">
                <span>目の前の試験も、</span>
                <span>その先の未来も。</span>
              </h2>
              <div className={styles.sectionLead}>
                <p>
                  必要なのは、全部を知ることではありません。<br />
                  今の自分に必要な知識から、選択肢を増やしていくことです。
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
                  <h3>{field.title.map((line) => <span key={line}>{line}</span>)}</h3>
                  <div className={styles.fieldCopy}>
                    {field.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  </div>
                  <span className={styles.fieldCoordinate} aria-hidden="true">DOMAIN / {field.number}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="access" className={styles.trustSection} aria-labelledby="trust-title" data-library-section="trust">
          <div className={styles.trustGridBackdrop} aria-hidden="true" />
          <div className={`${styles.sectionShell} ${styles.trustLayout}`}>
            <div className={styles.trustCopy}>
              <SectionLabel>FOR KITASATO PHARMACY STUDENTS</SectionLabel>
              <h2 id="trust-title">
                <span>北里薬学生のためだけに、</span>
                <span>つくりました。</span>
              </h2>
              <div className={styles.trustBody}>
                <p>
                  このライブラリは、北里大学薬学部生だけが利用できる限定公開です。<br />
                  登録・利用は無料。大学アカウントによる認証で、資料と利用者の信頼を守ります。
                </p>
                <p>
                  COMPASSは、学生有志による独立した活動です。<br />
                  大学・学部が運営する公式サービスではありません。
                </p>
              </div>
            </div>

            <dl className={styles.trustFacts}>
              {trustFacts.map((fact) => (
                <div key={fact.term}>
                  <dt>{fact.term}</dt>
                  <dd>{fact.lines.map((line) => <span key={line}>{line}</span>)}</dd>
                </div>
              ))}
            </dl>

            <aside className={styles.importantNote} aria-label="重要事項">
              <span>IMPORTANT NOTE</span>
              <p>
                試験、履修、進級、研究室配属、進路などの重要事項は、<br />
                必ず大学・学部が発信する最新の公式情報と照合してください。
              </p>
            </aside>
          </div>
        </section>

        <section className={styles.finalSection} aria-labelledby="final-title" data-library-section="final">
          <div className={styles.finalGrid} aria-hidden="true" />
          <div className={styles.finalHorizon} aria-hidden="true">
            <i /><i /><i /><i />
          </div>
          <div className={styles.finalInner}>
            <SectionLabel>YOUR NEXT MOVE</SectionLabel>
            <h2 id="final-title">
              <span>まだ知らない未来は、</span>
              <span className={styles.mobileSemanticContinuation}><span>ここから</span><span>選択肢になる。</span></span>
            </h2>
            <div className={styles.finalBody}>
              <p>入口は、次の試験でも、英語でも、研究室選びでも構いません。<br />
                今の自分に必要な一つを知ることから、未来は少しずつ動き始めます。</p>
            </div>
            <RegistrationCTA placement="final" />
            <p className={styles.finalMicrocopy}>北里大学薬学部生限定 · 登録・利用無料 · 大学アカウント認証</p>
          </div>
        </section>
      </main>

      <FslFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(learningResourceSchema) }}
      />
    </div>
  );
}
