export type ResponsiveViewport = {
  name: string;
  width: number;
  height: number;
};

export type RouteContract = {
  name: string;
  path: string;
  h1Lines: { min: number; max: number };
  requiredSelectors: string[];
  criticalSelectors: string[];
  sharedMobileMenu?: boolean;
};

export const routeContracts: RouteContract[] = [
  {
    name: "parent",
    path: "/",
    h1Lines: { min: 2, max: 3 },
    requiredSelectors: [
      "#top",
      "#vision",
      "#experience",
      "#technology",
      "#resources",
      "#manifesto",
      "#community",
      "#founder",
      "#contact",
    ],
    criticalSelectors: [
      "h1#hero-title",
      ".li-hero-lead",
      "#vision-title",
      "#experience-title",
      "#technology-title",
      "#resources-title",
      "#resources .v4-button--primary",
      "#manifesto-title",
      "#manifesto .v4-manifesto__cta",
      "#community-title",
      "#community .v4-community__cta",
      "#founder-title",
      "#founder .v4-founder__github",
      "#contact-title",
      "#contact .button-primary",
    ],
  },
  {
    name: "interactive",
    path: "/INTRO_Interactive/",
    h1Lines: { min: 1, max: 2 },
    requiredSelectors: [
      "#top",
      "#experience",
      "#features",
      "#ai-support",
      "#teachers",
      "#use-cases",
      "#security",
      "#developers",
      "#start",
    ],
    criticalSelectors: [
      "h1#hero-title",
      ".hero-lead",
      "#hero-primary-cta",
      "#experience h2",
      "#features h2",
      "#ai-support h2",
      "#teachers h2",
      "#use-cases h2",
      "#security h2",
      "#developers h2",
      "#start h2",
      "#start a",
    ],
  },
  {
    name: "developer",
    path: "/INTRO_Interactive/developers/",
    h1Lines: { min: 2, max: 4 },
    requiredSelectors: [
      "#developer-top",
      "#stack",
      "#architecture",
      "#security",
      "#decisions",
      "#verification",
      "#classroom-validation",
      "#codebase",
      "#developer-profile",
      "#developer-final",
    ],
    criticalSelectors: [
      "h1#developer-title",
      ".developer-hero__lead p",
      "#stack h2",
      ".developer-stack__metrics",
      "#architecture h2",
      "#security h2",
      "#decisions h2",
      "#verification h2",
      "#classroom-validation h2",
      "#codebase h2",
      "#developer-profile h2",
      "#developer-final h2",
      ".developer-credit__github",
    ],
  },
  {
    name: "founder",
    path: "/founder/",
    h1Lines: { min: 1, max: 2 },
    requiredSelectors: ["#top", "#practice", "#work", "#story"],
    criticalSelectors: [
      "h1#founder-title",
      '[aria-label="専門領域"]',
      "#practice h2",
      "#practice article",
      "#work h2",
      "#story h2",
      "#story aside img",
      "#chapter-future",
    ],
    sharedMobileMenu: false,
  },
  {
    name: "future-strategy-library",
    path: "/future-strategy-library/",
    h1Lines: { min: 2, max: 2 },
    requiredSelectors: [
      '[data-library-section="hero"]',
      '[data-library-section="thesis"]',
      '[data-library-section="materials"]',
      '[data-library-section="fields"]',
      '[data-library-section="trust"]',
      '[data-library-section="final"]',
    ],
    criticalSelectors: [
      "h1#library-title",
      '[class*="heroSubhead"]',
      '[class*="heroDescription"]',
      '[class*="heroActionGroup"] a',
      "#thesis-title",
      "#materials-title",
      "#fields-title",
      "#trust-title",
      "#final-title",
      '[data-library-section="final"] a',
    ],
  },
  {
    name: "manifesto",
    path: "/messages/",
    h1Lines: { min: 2, max: 2 },
    requiredSelectors: ['section[aria-labelledby="message-title"]', '[class*="coverActions"]'],
    criticalSelectors: [
      "h1#message-title",
      '[class*="coverSubtitle"]',
      '[class*="coverActions"] button',
    ],
  },
  {
    name: "community",
    path: "/community/join/",
    h1Lines: { min: 1, max: 3 },
    requiredSelectors: ["#form-title", "#registration-form", "#name", "#email", "#motivation"],
    criticalSelectors: [
      "h1#form-title",
      '#registration-form label[for="name"]',
      '#registration-form label[for="email"]',
      '#registration-form label[for="motivation"]',
      "#name",
      "#email",
      "#motivation",
      '#registration-form button[type="submit"]',
    ],
  },
  {
    name: "contact",
    path: "/contact/",
    h1Lines: { min: 1, max: 3 },
    requiredSelectors: ["#form-title", "#contact-form", "#name", "#email", "#details"],
    criticalSelectors: [
      "h1#form-title",
      '#contact-form label[for="name"]',
      '#contact-form label[for="email"]',
      '#contact-form label[for="details"]',
      "#name",
      "#email",
      "#details",
      '#contact-form button[type="submit"]',
    ],
  },
];

export const smokeViewports: ResponsiveViewport[] = [
  { name: "iphone", width: 390, height: 844 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "windows-150pct", width: 1280, height: 720 },
  { name: "windows-browser-chrome", width: 1275, height: 553 },
  { name: "windows-125pct", width: 1536, height: 672 },
];

export const extendedViewports: ResponsiveViewport[] = [
  { name: "small-phone", width: 320, height: 568 },
  { name: "large-iphone", width: 430, height: 932 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "short-laptop", width: 1024, height: 600 },
  { name: "standard-laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "wide-short", width: 1920, height: 720 },
  { name: "large-desktop", width: 2560, height: 1440 },
  { name: "scaled-4k-browser", width: 2560, height: 1200 },
  { name: "raw-4k", width: 3840, height: 2160 },
];
