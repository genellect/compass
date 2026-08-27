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

function noindex(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);

  if (url.hostname !== FOUNDER_DOMAIN) {
    return context.next();
  }

  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return noindex(new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" }
    }));
  }

  const founderAssetUrl = new URL(context.request.url);
  founderAssetUrl.pathname = "/founder/";

  const response = await context.env.ASSETS.fetch(
    new Request(founderAssetUrl, context.request)
  );

  return noindex(response);
}
