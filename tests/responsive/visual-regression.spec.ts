import type { Page } from "@playwright/test";

import { expect, test } from "./responsive-fixture";

import { settleRenderedPage } from "./layout-audit";

type VisualViewport = {
  name: string;
  width: number;
  height: number;
};

type HeroVisualContract = {
  name: string;
  path: string;
  heroSelector: string;
  viewports: VisualViewport[];
};

const viewports = {
  iphone: { name: "iphone", width: 390, height: 844 },
  laptop: { name: "laptop", width: 1024, height: 768 },
  windowsChrome: { name: "windows-chrome", width: 1275, height: 553 },
  desktop: { name: "desktop", width: 1440, height: 900 },
  raw4k: { name: "raw-4k", width: 3840, height: 2160 },
} satisfies Record<string, VisualViewport>;

const heroContracts: HeroVisualContract[] = [
  {
    name: "parent",
    path: "/",
    heroSelector: "section#top.hero--living-intelligence",
    viewports: [viewports.iphone, viewports.laptop, viewports.desktop],
  },
  {
    name: "future-strategy-library",
    path: "/future-strategy-library/",
    heroSelector: 'section[data-library-section="hero"]',
    viewports: [
      viewports.iphone,
      viewports.laptop,
      viewports.windowsChrome,
      viewports.desktop,
      viewports.raw4k,
    ],
  },
  {
    name: "manifesto",
    path: "/messages/",
    heroSelector: 'section[aria-labelledby="message-title"]',
    viewports: [viewports.iphone, viewports.desktop],
  },
  {
    name: "interactive",
    path: "/INTRO_Interactive/",
    heroSelector: "section#top.hero-section",
    viewports: [
      viewports.iphone,
      viewports.laptop,
      viewports.windowsChrome,
      viewports.desktop,
      viewports.raw4k,
    ],
  },
  {
    name: "developer",
    path: "/INTRO_Interactive/developers/",
    heroSelector: "section#developer-top.developer-reframe-hero",
    viewports: [viewports.iphone, viewports.windowsChrome, viewports.desktop],
  },
];

const stableRenderingCss = `
  html {
    scroll-behavior: auto !important;
  }

  *,
  *::before,
  *::after {
    animation-delay: 0s !important;
    animation-duration: 0s !important;
    animation-iteration-count: 1 !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
    transition-delay: 0s !important;
    transition-duration: 0s !important;
  }
`;

async function prepareStableHero(page: Page, path: string) {
  await page.addInitScript(() => {
    let randomState = 0x434f4d50;
    Math.random = () => {
      randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
      return randomState / 0x1_0000_0000;
    };
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `${path} did not return HTTP 200`).toBe(200);
  await settleRenderedPage(page);
  await page.addStyleTag({ content: stableRenderingCss });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    for (const video of document.querySelectorAll("video")) {
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        // Metadata-free videos can reject seeking; pausing is sufficient for this gate.
      }
    }
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

for (const contract of heroContracts) {
  test.describe(`${contract.name} Hero visual contract`, () => {
    for (const viewport of contract.viewports) {
      test(`${viewport.name} ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await prepareStableHero(page, contract.path);

        const hero = page.locator(contract.heroSelector);
        await expect(hero).toHaveCount(1);
        await expect(hero).toBeVisible();
        const maxDiffPixelRatio = contract.name === "manifesto" && viewport.name === "iphone"
          ? 0.004
          : 0.003;
        await expect(page).toHaveScreenshot(`${contract.name}-${viewport.name}.png`, {
          animations: "disabled",
          caret: "hide",
          fullPage: false,
          maxDiffPixelRatio,
          scale: "css",
          threshold: 0.15,
          timeout: viewport.name === "raw-4k" ? 30_000 : 7_500,
        });
      });
    }
  });
}
