type PagesContext = {
  request: Request;
  next(): Promise<Response>;
};

const FOUNDER_DOMAIN = "yuto-matsui.com";
const COMPASS_PAGES_DOMAIN = "compass-official.pages.dev";
const ENGLISH_CANONICAL = `https://${FOUNDER_DOMAIN}/en/`;
const ENGLISH_ENTRY_PATHS = new Set(["/en", "/en/", "/en/index.html"]);

function requestHostname(request: Request) {
  const hostHeader = request.headers.get("host")?.split(":", 1)[0]?.trim().toLowerCase();
  return hostHeader || new URL(request.url).hostname.toLowerCase();
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);
  const hostname = requestHostname(context.request);

  if (hostname === COMPASS_PAGES_DOMAIN && ENGLISH_ENTRY_PATHS.has(url.pathname)) {
    const target = new URL(ENGLISH_CANONICAL);
    target.search = url.search;
    return Response.redirect(target, 301);
  }

  if (
    hostname === FOUNDER_DOMAIN
    && (url.pathname === "/en" || url.pathname === "/en/index.html")
  ) {
    const target = new URL(ENGLISH_CANONICAL);
    target.search = url.search;
    return Response.redirect(target, 301);
  }

  return context.next();
}

