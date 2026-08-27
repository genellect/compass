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

function requestHostname(request: Request) {
  const hostHeader = request.headers.get("host")?.split(":", 1)[0]?.trim().toLowerCase();
  return hostHeader || new URL(request.url).hostname.toLowerCase();
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);

  if (requestHostname(context.request) !== FOUNDER_DOMAIN) {
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
