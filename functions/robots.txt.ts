type PagesContext = {
  request: Request;
  next(): Promise<Response>;
};

const FOUNDER_DOMAIN = "yuto-matsui.com";

function requestHostname(request: Request) {
  const hostHeader = request.headers.get("host")?.split(":", 1)[0]?.trim().toLowerCase();
  return hostHeader || new URL(request.url).hostname.toLowerCase();
}

export async function onRequest(context: PagesContext): Promise<Response> {
  if (requestHostname(context.request) !== FOUNDER_DOMAIN) {
    return context.next();
  }

  return new Response(
    "User-agent: *\nAllow: /\n\nSitemap: https://yuto-matsui.com/sitemap.xml\n",
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600"
      }
    }
  );
}
