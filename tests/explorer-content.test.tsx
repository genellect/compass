import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NewHero } from '../src/components/Hero/NewHero';
import { VisionExperienceSection, CompassExperienceSection, TechnologyCoreSection, ResourcesExperienceSection, CommunityExperienceSection, FounderPortfolioSection } from '../src/sections/OfficialCoreSections';
import { ManifestoSection } from '../src/sections/ManifestoSection';
import { ContactSection } from '../src/sections/ContactSection';
import { exhibits } from '../src/components/Explorer/exhibit-content';

// Some production components use the classic JSX transform under Vitest.
Object.assign(globalThis, { React });
const normalize = (text: string) => text.replace(/<[^>]+>/g, '').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s/g, '');
const sources = { top: NewHero, vision: VisionExperienceSection, experience: CompassExperienceSection, technology: TechnologyCoreSection, resources: ResourcesExperienceSection, manifesto: ManifestoSection, community: CommunityExperienceSection, founder: FounderPortfolioSection, contact: ContactSection };

describe('the 3D exhibits select existing production copy', () => {
  for (const [id, Component] of Object.entries(sources)) it(id, () => {
    const source = renderToStaticMarkup(React.createElement(Component));
    const copy = exhibits[id as keyof typeof exhibits];
    expect(normalize(source)).toContain(normalize(copy.title));
    expect(normalize(source)).toContain(normalize(copy.body));
    if (!['top', 'vision', 'experience'].includes(id)) {
      expect(source).toContain(`href="${copy.href}"`);
      expect(normalize(source)).toContain(normalize(copy.cta));
    }
  });
});
