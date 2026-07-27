import { SiteHeader } from "./components/SiteHeader";
import { Hero } from "./components/Hero";
import { SiteFooter } from "./components/SiteFooter";
import { MessageSection } from "./sections/MessageSection";
import { ContactSection } from "./sections/ContactSection";
import {
  CommunityExperienceSection,
  CompassExperienceSection,
  FounderPortfolioSection,
  ProductsValidationSection,
  ResourcesExperienceSection,
  TechnologyCoreSection,
  VisionExperienceSection,
  WorkshopsSection
} from "./sections/OfficialCoreSections";

export function LegacyPageBody() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="compass-v4-page">
        <Hero />
        <VisionExperienceSection />
        <CompassExperienceSection />
        <TechnologyCoreSection />
        <ProductsValidationSection />
        <ResourcesExperienceSection />
        <WorkshopsSection />
        <CommunityExperienceSection />
        <div className="v4-closing v4-closing--contact">
          <ContactSection />
        </div>
        <FounderPortfolioSection />
        <div className="v4-closing v4-closing--message">
          <MessageSection />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
