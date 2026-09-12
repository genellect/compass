import type { Metadata } from "next";
import Image from "next/image";
import { FounderJapaneseLink } from "../../../components/FounderJapaneseLink";
import { FounderProducts } from "../../(official)/founder/FounderProducts";
import {
  compassOrigin,
  credentials,
  experience,
  expertise,
  founderOrigin,
  offHours,
  products
} from "./content";
import { EnglishFragments } from "./EnglishFragments";
import { EnglishHeroGallery } from "./EnglishHeroGallery";
import { EnglishMobileMenu } from "./EnglishMobileMenu";
import { GitHubIcon, InstagramIcon } from "./EnglishSocialIcons";
import { EnglishStatement } from "./EnglishStatement";
import { DepthCard, DepthVisual, ExpertiseModel } from "../../../components/portfolio/DepthCard";
import { OffHoursGallery } from "../../../components/portfolio/OffHoursGallery";
import styles from "./english-founder.module.css";

const canonicalUrl = `${founderOrigin}/en/`;

export const metadata: Metadata = {
  title: "Yuto Matsui | Life Science Research & AI-Native Engineering",
  description:
    "The English portfolio of Yuto Matsui, a researcher and engineer working across life science, AI-native engineering, and higher education.",
  authors: [{ name: "Yuto Matsui" }],
  alternates: {
    canonical: canonicalUrl,
    languages: {
      ja: `${founderOrigin}/`,
      en: canonicalUrl,
      "x-default": `${founderOrigin}/`
    }
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" }
  },
  openGraph: {
    locale: "en_US",
    alternateLocale: ["ja_JP"],
    type: "profile",
    siteName: "Yuto Matsui",
    title: "Yuto Matsui | Researcher & Engineer",
    description: "Life Science Research · AI-Native Engineering · Higher Education",
    url: canonicalUrl,
    images: [
      {
        url: `${founderOrigin}/images/founder-portfolio/yuto-matsui-profile-hero.webp`,
        width: 1600,
        height: 2400,
        alt: "Yuto Matsui"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Yuto Matsui | Researcher & Engineer",
    description: "Life Science Research · AI-Native Engineering · Higher Education",
    images: [`${founderOrigin}/images/founder-portfolio/yuto-matsui-profile-hero.webp`]
  }
};

const personSchema = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Yuto Matsui",
  alternateName: "松井優知",
  url: canonicalUrl,
  image: `${founderOrigin}/images/founder-portfolio/yuto-matsui-profile-hero.webp`,
  jobTitle: "Researcher & Engineer",
  knowsAbout: [
    "Life science research",
    "Molecular biology",
    "AI-native engineering",
    "Higher education"
  ],
  founder: {
    "@type": "Organization",
    name: "COMPASS",
    url: `${compassOrigin}/`
  },
  sameAs: ["https://github.com/genellect", "https://www.instagram.com/n.m.w.314/"]
};

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

function ConvergenceField() {
  return (
    <svg className={styles.convergenceField} viewBox="0 0 1440 900" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="en-field-biotic" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b6ef7a" stopOpacity="0" />
          <stop offset="1" stopColor="#b6ef7a" stopOpacity="0.76" />
        </linearGradient>
        <linearGradient id="en-field-signal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8b78f0" stopOpacity="0" />
          <stop offset="1" stopColor="#8b78f0" stopOpacity="0.82" />
        </linearGradient>
      </defs>
      <path className={styles.fieldGuide} d="M-80 160C214 150 392 268 612 450" />
      <path className={styles.fieldGuide} d="M-80 450C188 450 410 450 612 450" />
      <path className={styles.fieldGuide} d="M-80 770C220 764 404 632 612 450" />
      <path className={styles.fieldBoundary} d="M612 -40C560 178 658 322 612 450C566 578 654 728 606 940" />
      <path className={styles.fieldOrbit} d="M316 450A296 296 0 0 1 612 154" />
      <path className={styles.fieldOrbit} d="M316 450A296 296 0 0 0 612 746" />
      <path className={styles.fieldBiotic} d="M-80 160C214 150 392 268 612 450" />
      <path className={styles.fieldSignal} d="M-80 450C188 450 410 450 612 450" />
      <path className={styles.fieldBiotic} d="M-80 770C220 764 404 632 612 450" />
      <g className={styles.fieldNodes}>
        <circle cx="152" cy="178" r="3" />
        <circle cx="212" cy="450" r="4" />
        <circle cx="168" cy="742" r="3" />
        <circle cx="382" cy="316" r="2.5" />
        <circle cx="420" cy="612" r="2.5" />
        <circle cx="612" cy="450" r="7" />
      </g>
      <circle className={styles.fieldPulseOne} cx="152" cy="178" r="3" />
      <circle className={styles.fieldPulseTwo} cx="212" cy="450" r="3" />
      <circle className={styles.fieldPulseThree} cx="168" cy="742" r="3" />
      <g className={styles.fieldDispersion}>
        <circle cx="612" cy="450" r="2" />
        <circle cx="612" cy="450" r="2" />
        <circle cx="612" cy="450" r="2" />
      </g>
    </svg>
  );
}

export default function EnglishFounderPage() {
  return (
    <div className={styles.page} data-english-founder-page>
      <a className={styles.skipLink} href="#main">Skip to content</a>

      <header className={styles.siteHeader}>
        <a className={styles.wordmark} href="#top" aria-label="Yuto Matsui portfolio home">
          <strong>YUTO MATSUI</strong>
          <span>Researcher &amp; Engineer</span>
        </a>
        <nav className={styles.desktopNav} aria-label="Portfolio navigation">
          <a href="#expertise">Expertise</a>
          <a href="#experience">Experience</a>
          <a href="#fragments">Fragments</a>
          <a href="#statement">Statement</a>
          <a href="#work">Work</a>
          <a href="#contact">Contact</a>
          <span className={styles.languageSwitch} aria-label="Language">
            <FounderJapaneseLink>JP</FounderJapaneseLink><span>/</span><a href={canonicalUrl} aria-current="page">EN</a>
          </span>
        </nav>
        <EnglishMobileMenu />
      </header>

      <main id="main">
        <section id="top" className={styles.hero} aria-labelledby="english-founder-title" data-hero-interface data-hero-cycle="0">
          <ConvergenceField />
          <div className={styles.heroCopy}>
            <p className={styles.heroRole}>Researcher &amp; Engineer</p>
            <h1 id="english-founder-title">Yuto Matsui</h1>
            <p className={styles.heroThesis}>Advancing Science,<br />Transforming Education.</p>
            <p className={styles.heroDomains}>Life Science Research · AI-Native Engineering · Higher Education</p>
            <nav className={styles.heroSocialLinks} aria-label="Yuto Matsui social profiles">
              <a href="https://www.instagram.com/n.m.w.314/?__pwa=1#" target="_blank" rel="noopener noreferrer" aria-label="Instagram" title="Instagram">
                <InstagramIcon />
              </a>
              <a href="https://github.com/genellect" target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="GitHub">
                <GitHubIcon />
              </a>
            </nav>
          </div>
          <EnglishHeroGallery />
        </section>

        <section id="expertise" className={styles.expertise} aria-labelledby="expertise-title">
          <div className={styles.sectionShell}>
            <header className={styles.sectionHeading}>
              <p className={styles.sectionIndex}>02 / Expertise</p>
              <h2 id="expertise-title">Three disciplines.<br />One direction.</h2>
            </header>
            <div className={styles.expertiseGrid}>
              {expertise.map((item, index) => (
                <DepthCard key={item.number} depth="expertise" editorial className={styles.expertisePlate} data-accent={item.accent} data-order={index + 1}>
                  <ExpertiseModel kind={index === 0 ? "bio" : index === 1 ? "ai" : "education"} language="en" />
                  <div className={styles.expertiseCopy} data-depth-layer="copy">
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                  <DepthVisual className={styles.expertiseImage} data-depth-layer="image">
                    <Image decoding="sync" loading="eager" src={item.image} alt={item.alt} fill sizes="(min-width: 901px) 38vw, 92vw" />
                    <div className={styles.expertiseNumber} data-depth-layer="detail">{item.number}</div>
                  </DepthVisual>
                </DepthCard>
              ))}
            </div>
          </div>
        </section>

        <section id="experience" className={styles.evidence} aria-labelledby="experience-title">
          <div className={styles.sectionShell}>
            <header className={styles.evidenceHeading}>
              <div><p className={styles.sectionIndex}>03 / Experience &amp; Credentials</p><h2 id="experience-title">EXPERIENCE</h2></div>
              <p>As of August 2026</p>
            </header>
            <div className={styles.experienceGrid}>
              {experience.map((item) => (
                <DepthCard key={item.area} depth="experience" editorial className={styles.experienceItem}>
                  <DepthVisual className={styles.experienceImage} data-depth-layer="image">
                    <Image decoding="sync" loading="eager" src={item.image} alt={item.alt} fill sizes="(min-width: 901px) 31vw, 92vw" />
                  </DepthVisual>
                  <div className={styles.experienceMeta} data-depth-layer="copy"><span>{item.area}</span><strong>{item.years}</strong></div>
                  <p>{item.focus.map((focus) => <span key={focus}>{focus}</span>)}</p>
                </DepthCard>
              ))}
            </div>
            <div className={styles.credentialsGrid} aria-label="English language credentials">
              {credentials.map((credential) => (
                <article key={credential.name} className={styles.credentialItem}>
                  <span>{credential.mark}</span>
                  <div><p>{credential.name}</p><strong>{credential.score}</strong><small>{credential.cefr}</small></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <EnglishFragments />

        <section id="statement" className={styles.statement} aria-labelledby="statement-title">
          <div className={styles.statementShell}>
            <aside className={styles.statementIdentity}>
              <p className={styles.sectionIndex}>05 / Personal Statement</p>
              <h2 id="statement-title">Between Life Science and Engineering</h2>
              <div className={styles.statementPortrait}>
                <Image
                  src="/images/founder-portfolio/yuto-matsui-front.webp"
                  alt="Yuto Matsui facing the camera"
                  fill
                  sizes="(min-width: 901px) 35vw, 92vw"
                />
              </div>
            </aside>
            <EnglishStatement />
          </div>
        </section>

        <section id="work" className={styles.work} aria-labelledby="work-title">
          <div className={styles.sectionShell}>
            <header className={styles.workHeading}>
              <div><p className={styles.sectionIndex}>06 / Selected Work</p><h2 id="work-title">Selected Work</h2></div>
            </header>

            <FounderProducts products={products} language="en" />
          </div>
        </section>

        <section id="off-hours" className={styles.offHours} aria-labelledby="off-hours-title">
          <div className={styles.sectionShell}>
            <header className={styles.offHoursHeading}>
              <p className={styles.sectionIndex}>07 / Away from the desk</p>
              <h2 id="off-hours-title">OFF HOURS</h2>
            </header>
            <OffHoursGallery language="en"
              photos={offHours.map(item => ({ ...item, copy: [item.copy] }))}
              classes={{ grid: styles.offHoursGrid, card: styles.offHoursCard, visual: styles.offHoursImage }} />
          </div>
        </section>

        <section id="contact" className={styles.contact} aria-labelledby="contact-title">
          <div className={styles.contactField} aria-hidden="true"><span /><span /><span /></div>
          <div className={styles.contactShell}>
            <div>
              <p className={styles.sectionIndex}>08 / Contact</p>
              <h2 id="contact-title">Get in touch.</h2>
            </div>
            <div className={styles.contactCopy}>
              <div className={styles.contactIntroduction}>
                <p>I’m always open to thoughtful conversations, collaborations, and new opportunities.</p>
                <p>Feel free to reach out anytime. I’m happy to connect in English and available for Zoom or Google Meet conversations.</p>
                <p>Please include your name, affiliation, and a brief introduction when contacting me.</p>
              </div>
              <div className={styles.contactEmail} aria-label="Email contact details">
                <p><strong>Yuto Matsui</strong><span>Researcher &amp; Engineer</span></p>
                <p><span>Personal</span><span>contact@yuto-matsui.com</span></p>
                <p><span>Univ.</span><span>matsui.yuto@st.kitasato-u.ac.jp</span></p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerPrimary}>
          <div><strong>Yuto Matsui</strong><span>Life Science Research · AI-Native Engineering · Higher Education</span></div>
          <nav aria-label="Personal links">
            <a href="https://www.instagram.com/n.m.w.314/?__pwa=1#" target="_blank" rel="noopener noreferrer">Instagram <Arrow /></a>
            <a href="https://github.com/genellect" target="_blank" rel="noopener noreferrer">GitHub <Arrow /></a>
            <a href={`${compassOrigin}/`} target="_blank" rel="noopener noreferrer">COMPASS <Arrow /></a>
            <a href="#top">Back to top ↑</a>
          </nav>
        </div>
        <div className={styles.footerLanguageSwitch} aria-label="Language">
          <span>Language</span>
          <div><FounderJapaneseLink>JP</FounderJapaneseLink><a href={canonicalUrl} aria-current="page">EN</a></div>
        </div>
        <details className={styles.credits}>
          <summary>Image credits</summary>
          <p>
            Life science: <a href="https://unsplash.com/photos/white-and-black-microscope-5HbxyB0_DBg" target="_blank" rel="noopener noreferrer">Jaron Nix / Unsplash</a> ·
            Software development: <a href="https://unsplash.com/photos/code-appears-on-a-computer-screen-XG5q_aosoPo" target="_blank" rel="noopener noreferrer">Rob Wingate / Unsplash</a> ·
            Education portrait: Yuto Matsui / personal archive ·
            Experience — Life science: Yuto Matsui / personal archive ·
            Experience — Development: <a href="https://www.pexels.com/photo/monitor-displaying-lines-of-code-6424583/" target="_blank" rel="noopener noreferrer">Nemuel Sereti / Pexels</a> ·
            Experience — Education: <a href="https://unsplash.com/photos/empty-lecture-hall-with-tiered-seating-and-projector-screen-L5GTAFIeKNA" target="_blank" rel="noopener noreferrer">Fabio Sasso / Unsplash</a> ·
            Manifesto visual: COMPASS visual archive ·
            Drive: <a href="https://unsplash.com/photos/a-car-drives-along-a-scenic-mountain-road-e6XJTEz5SfA" target="_blank" rel="noopener noreferrer">Zixplore / Unsplash</a> ·
            Shogi: <a href="https://commons.wikimedia.org/wiki/File:Hulic_Shogi-kaikan_Sendagaya_Building_entrance_2024-09-12.jpg" target="_blank" rel="noopener noreferrer">Asanagi / Wikimedia Commons (CC0)</a> ·
            FRAGMENTS — DNA automation: <a href="https://unsplash.com/photos/gray-laboratory-machine-to8o0bqOA6Q" target="_blank" rel="noopener noreferrer">National Cancer Institute / Unsplash</a> ·
            Pipetting: <a href="https://unsplash.com/photos/person-using-pipette-in-laboratory-wDxFn_dBEC0" target="_blank" rel="noopener noreferrer">CDC / Unsplash</a> ·
            Code and terminal: <a href="https://unsplash.com/photos/computer-screen-displaying-code-and-terminal-prompts-N4pwMINNNL8" target="_blank" rel="noopener noreferrer">Bernd Dittrich / Unsplash</a> ·
            Development analysis: <a href="https://unsplash.com/photos/laptop-screen-displaying-code-and-data-charts-GQOylIn892U" target="_blank" rel="noopener noreferrer">Daniil Komov / Unsplash</a> ·
            Servers: <a href="https://unsplash.com/photos/a-rack-of-servers-in-a-server-room-2JJ3wBHu4_0" target="_blank" rel="noopener noreferrer">Kevin Ache / Unsplash</a> ·
            Microfluidic devices: <a href="https://www.oist.jp/image/photograph-microfluidic-devices-microbionanofluidics-unit" target="_blank" rel="noopener noreferrer">OIST / CC BY 4.0</a> ·
            Silicon wafer: <a href="https://www.oist.jp/image/silicon-wafer-deposition-chamber-oist-engineering-section" target="_blank" rel="noopener noreferrer">OIST / CC BY 4.0</a> ·
            Personal portraits, FRAGMENTS &amp; climbing: Yuto Matsui / personal archive
          </p>
        </details>
        <p className={styles.copyright}>© 2026 Yuto Matsui. Designed and developed by Yuto Matsui. All rights reserved.</p>
      </footer>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }} />
    </div>
  );
}
