export const FUTURE_STRATEGY_LIBRARY_REGISTRATION_HREF =
  process.env.NEXT_PUBLIC_FSL_REGISTRATION_URL ??
  "https://docs.google.com/forms/d/e/1FAIpQLSf8gLujuK-giYnkCnv-Cxp7qon1kY8mhnGvfkA62hOlrJgAHA/viewform";

const COMPASS_CANONICAL_ORIGIN = "https://compass-official.pages.dev";

export function isExternalCompassHref(href: string) {
  try {
    return new URL(href, COMPASS_CANONICAL_ORIGIN).origin !== COMPASS_CANONICAL_ORIGIN;
  } catch {
    return true;
  }
}
