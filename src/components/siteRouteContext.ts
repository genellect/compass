export type SiteRouteContext = "root" | "messages";

export function resolveSiteHref(href: string, routeContext: SiteRouteContext) {
  if (routeContext === "root") return href;
  if (href === "#top") return "/";
  if (href.startsWith("#")) return `/${href}`;
  if (href === "INTRO_Interactive/") return "/INTRO_Interactive/";
  if (href === "messages/index.html") return "/messages/";
  return href;
}
