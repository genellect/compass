import { SiteHeader } from "./components/SiteHeader";
import { Hero } from "./components/Hero";
import { SiteFooter } from "./components/SiteFooter";
import { ManifestoSection } from "./sections/ManifestoSection";
import { ContactSection } from "./sections/ContactSection";
import {
  CommunityExperienceSection,
  CompassExperienceSection,
  FounderPortfolioSection,
  ResourcesExperienceSection,
  TechnologyCoreSection,
  VisionExperienceSection
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
        <ResourcesExperienceSection />
        <div className="v4-closing v4-closing--manifesto v4-closing--resource-manifesto">
          <ManifestoSection />
        </div>
        <CommunityExperienceSection />
        <FounderPortfolioSection />
        <div className="v4-closing v4-closing--contact">
          <ContactSection />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
