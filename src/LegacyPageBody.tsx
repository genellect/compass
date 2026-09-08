import { SiteHeader } from "./components/SiteHeader";
import { Habitat } from "./components/Habitat/Habitat";
import habitatStyles from "./components/Habitat/habitat.module.css";
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
    <div className={habitatStyles.root} data-habitat>
      <Habitat />
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
    </div>
  );
}
