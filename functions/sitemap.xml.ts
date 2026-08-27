type PagesContext = {
  request: Request;
  next(): Promise<Response>;
};

const FOUNDER_DOMAIN = "yuto-matsui.com";

function requestHostname(request: Request) {
  const hostHeader = request.headers.get("host")?.split(":", 1)[0]?.trim().toLowerCase();
  return hostHeader || new URL(request.url).hostname.toLowerCase();
}

const FOUNDER_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://yuto-matsui.com/</loc>
  </url>
</urlset>
`;

export async function onRequest(context: PagesContext): Promise<Response> {
  if (requestHostname(context.request) !== FOUNDER_DOMAIN) {
    return context.next();
  }

  return new Response(FOUNDER_SITEMAP, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    }
  });
}
