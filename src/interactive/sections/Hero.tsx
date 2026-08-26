import { hero, links } from "../content/interactiveContent";
import { CTAButton } from "../components/ui/CTAButton";
import { FeatureChip } from "../components/ui/FeatureChip";
import { HeroIntelligenceField } from "../components/hero/HeroIntelligenceField";
import { LectureSignalMatrix } from "../components/hero/LectureSignalMatrix";
import { ProductExperienceMock } from "../components/ui/ProductExperienceMock";

export function Hero() {
  return (
    <section id="top" className="hero-section hero-section--signal" aria-labelledby="hero-title">
      <div className="hero-visual" aria-hidden="true" />
      <div className="hero-shade" aria-hidden="true" />
      <HeroIntelligenceField />
      <div className="hero-grid section__inner">
        <div className="hero-copy">
          <p className="eyebrow">{hero.eyebrow}</p>
          <div className="mobile-hero-brand-card" aria-label="COMPASS Interactive Live Lecture Experience">
            <span className="mobile-hero-brand-card__status" aria-hidden="true" />
            <strong>COMPASS Interactive</strong>
            <small>NEXT LECTURE</small>
          </div>
          <h1 id="hero-title" className="hero-title" aria-label={hero.title}>
            <span className="hero-title__phrase hero-title__quiet">LET EVERYTHING</span>{" "}
            <span className="hero-title__phrase hero-title__active">
              MOVE<span className="hero-title__core" data-signal-origin aria-hidden="true">.</span>
            </span>
          </h1>
          <p className="hero-lead">
            <span className="hero-lead__desktop">リアルタイム×AIが、講義を次の次元へ。</span>
            <span className="hero-lead__mobile">
              リアルタイム×AIが、
              <br />
              講義を次の次元へ。
            </span>
          </p>
          <div className="hero-mobile-product-proof" aria-label="COMPASS Interactiveのライブ講義体験">
            <div className="hero-mobile-product-proof__status">
              <strong><i aria-hidden="true" /> LIVE LECTURE</strong>
              <small>221人参加</small>
            </div>
            <div className="hero-mobile-product-proof__flow">
              <p className="hero-mobile-product-proof__caption">
                <small>LIVE CAPTION</small>
                <strong>AIが講義の言葉を、理解へつないでいます。</strong>
              </p>
              <span aria-hidden="true">→</span>
              <p className="hero-mobile-product-proof__recap">
                <small>5 MINUTE AI RECAP</small>
                <strong>いま生まれた気づきが、次の問いにつながる。</strong>
              </p>
            </div>
          </div>
          <div className="hero-chips" aria-label="主要機能">
            {hero.chips.map((chip) => (
              <FeatureChip key={chip}>{chip}</FeatureChip>
            ))}
          </div>
          <div className="hero-ai-badge hero-trust-line">
            <span aria-hidden="true" />
            <strong>OpenAI Frontier Intelligence 搭載</strong>
            <small>OpenAI API × Realtime API</small>
          </div>
          <div className="hero-actions">
            <CTAButton id="hero-primary-cta" className="hero-cta" href={links.demo}>
              3分で講義を体験 <span aria-hidden="true">→</span>
            </CTAButton>
            <a className="hero-secondary-cta" data-cta-location="hero-code-join" href={links.join}>講義コードで参加する</a>
          </div>
          <p className="hero-cta-note">登録不要・デモデータ・約3分</p>
        </div>

        <div className="hero-mock">
          <div className="hero-mock-stage hero-signal-stage">
            <LectureSignalMatrix />
            <ProductExperienceMock className="hero-product-experience" />
          </div>
        </div>
      </div>
    </section>
  );
}
