export type FounderDomainEnv = {
  ASSETS: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
};

type PagesContext = {
  env: FounderDomainEnv;
  request: Request;
  next(): Promise<Response>;
};

export const FOUNDER_DOMAIN = "yuto-matsui.com";
export const COMPASS_PAGES_DOMAIN = "compass-official.pages.dev";

const LEGACY_FOUNDER_PATHS = new Set([
  "/founder",
  "/founder/",
  "/founder/index.html"
]);

function requestHostname(request: Request) {
  const hostHeader = request.headers.get("host")?.split(":", 1)[0]?.trim().toLowerCase();
  return hostHeader || new URL(request.url).hostname.toLowerCase();
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);
  const hostname = requestHostname(context.request);

  if (
    hostname === COMPASS_PAGES_DOMAIN
    && LEGACY_FOUNDER_PATHS.has(url.pathname)
  ) {
    const target = new URL(`https://${FOUNDER_DOMAIN}/`);
    target.search = url.search;
    return Response.redirect(target, 301);
  }

  if (hostname !== FOUNDER_DOMAIN) {
    return context.next();
  }

  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" }
    });
  }

  const founderAssetUrl = new URL(context.request.url);
  founderAssetUrl.pathname = "/founder/";

  const response = await context.env.ASSETS.fetch(
    new Request(founderAssetUrl, context.request)
  );

  return response;
}
