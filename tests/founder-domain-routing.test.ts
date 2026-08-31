import { describe, expect, it, vi } from "vitest";
import {
  COMPASS_PAGES_DOMAIN,
  FOUNDER_DOMAIN,
  onRequest,
  type FounderDomainEnv
} from "../functions/index";
import { onRequest as onRobotsRequest } from "../functions/robots.txt";
import { onRequest as onSitemapRequest } from "../functions/sitemap.xml";
import { onRequest as onEnglishRequest } from "../functions/en/[[path]]";

function createContext(url: string, method = "GET", host?: string) {
  const assetsFetch = vi.fn(async (
    _input: RequestInfo | URL,
    _init?: RequestInit
  ) => new Response("founder page", {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Asset-Header": "preserved"
    }
  }));
  const next = vi.fn(async () => new Response("next route", { status: 200 }));
  const env: FounderDomainEnv = { ASSETS: { fetch: assetsFetch } };

  return {
    context: {
      env,
      request: new Request(url, { method, headers: host ? { Host: host } : undefined }),
      next
    },
    assetsFetch,
    next
  };
}

describe("Founder custom-domain Pages Function", () => {
  it("serves the existing Founder export at the custom-domain root", async () => {
    const { context, assetsFetch, next } = createContext(
      `https://${FOUNDER_DOMAIN}/?utm_source=portfolio`
    );

    const response = await onRequest(context);
    const assetRequest = assetsFetch.mock.calls[0]?.[0] as Request;

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("founder page");
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("X-Asset-Header")).toBe("preserved");
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
    expect(assetRequest.url).toBe(
      `https://${FOUNDER_DOMAIN}/founder/?utm_source=portfolio`
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("passes the Pages host and preview hosts through unchanged", async () => {
    for (const url of [
      "https://compass-official.pages.dev/",
      "https://preview-branch.compass-official.pages.dev/"
    ]) {
      const { context, assetsFetch, next } = createContext(url);
      const response = await onRequest(context);

      expect(await response.text()).toBe("next route");
      expect(next).toHaveBeenCalledOnce();
      expect(assetsFetch).not.toHaveBeenCalled();
    }
  });

  it.each([
    "/founder",
    "/founder/",
    "/founder/index.html"
  ])("redirects the legacy Founder path %s in one permanent hop", async (path) => {
    const { context, assetsFetch, next } = createContext(
      `https://${COMPASS_PAGES_DOMAIN}${path}?utm_source=legacy`
    );

    const response = await onRequest(context);

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(
      `https://${FOUNDER_DOMAIN}/?utm_source=legacy`
    );
    expect(assetsFetch).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("uses the original Host header when Pages normalizes the request URL", async () => {
    const { context, assetsFetch, next } = createContext(
      "https://compass-official.pages.dev/?source=custom-domain",
      "GET",
      FOUNDER_DOMAIN
    );

    const response = await onRequest(context);
    const assetRequest = assetsFetch.mock.calls[0]?.[0] as Request;

    expect(response.status).toBe(200);
    expect(new URL(assetRequest.url).pathname).toBe("/founder/");
    expect(new URL(assetRequest.url).search).toBe("?source=custom-domain");
    expect(next).not.toHaveBeenCalled();
  });

  it("supports HEAD without changing the asset route", async () => {
    const { context, assetsFetch } = createContext(
      `https://${FOUNDER_DOMAIN}/`,
      "HEAD"
    );

    const response = await onRequest(context);
    const assetRequest = assetsFetch.mock.calls[0]?.[0] as Request;

    expect(response.status).toBe(200);
    expect(assetRequest.method).toBe("HEAD");
    expect(new URL(assetRequest.url).pathname).toBe("/founder/");
  });

  it("rejects state-changing methods at the custom-domain root", async () => {
    const { context, assetsFetch, next } = createContext(
      `https://${FOUNDER_DOMAIN}/`,
      "POST"
    );

    const response = await onRequest(context);

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, HEAD");
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
    expect(assetsFetch).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("serves a one-URL robots and sitemap contract on the Founder domain only", async () => {
    const next = vi.fn(async () => new Response("legacy control file"));

    const robots = await onRobotsRequest({
      request: new Request(`https://${FOUNDER_DOMAIN}/robots.txt`),
      next
    });
    const sitemap = await onSitemapRequest({
      request: new Request(`https://${FOUNDER_DOMAIN}/sitemap.xml`),
      next
    });

    expect(robots.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await robots.text()).toContain("Sitemap: https://yuto-matsui.com/sitemap.xml");
    expect(sitemap.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    const sitemapText = await sitemap.text();
    expect(sitemapText).toContain("<loc>https://yuto-matsui.com/</loc>");
    expect(sitemapText).toContain("<loc>https://yuto-matsui.com/en/</loc>");
    expect(sitemapText).toContain('hreflang="ja"');
    expect(sitemapText).toContain('hreflang="en"');
    expect(sitemapText).toContain('hreflang="x-default"');
    expect(next).not.toHaveBeenCalled();

    const legacy = await onSitemapRequest({
      request: new Request("https://compass-official.pages.dev/sitemap.xml"),
      next
    });
    expect(await legacy.text()).toBe("legacy control file");
    expect(next).toHaveBeenCalledOnce();
  });

  it.each(["/en", "/en/", "/en/index.html"])(
    "redirects the Pages-host English entry %s to the custom domain",
    async (path) => {
      const next = vi.fn(async () => new Response("next route"));
      const response = await onEnglishRequest({
        request: new Request(`https://${COMPASS_PAGES_DOMAIN}${path}?utm_source=preview`),
        next
      });

      expect(response.status).toBe(301);
      expect(response.headers.get("Location")).toBe(
        `https://${FOUNDER_DOMAIN}/en/?utm_source=preview`
      );
      expect(next).not.toHaveBeenCalled();
    }
  );

  it.each(["/en", "/en/index.html"])(
    "normalizes the custom-domain English path %s in one permanent hop",
    async (path) => {
      const next = vi.fn(async () => new Response("next route"));
      const response = await onEnglishRequest({
        request: new Request(`https://${FOUNDER_DOMAIN}${path}?source=language-switch`),
        next
      });

      expect(response.status).toBe(301);
      expect(response.headers.get("Location")).toBe(
        `https://${FOUNDER_DOMAIN}/en/?source=language-switch`
      );
      expect(next).not.toHaveBeenCalled();
    }
  );

  it("serves the English static export on the canonical custom-domain path and preview hosts", async () => {
    for (const url of [
      `https://${FOUNDER_DOMAIN}/en/`,
      "https://feature.compass-official.pages.dev/en/"
    ]) {
      const next = vi.fn(async () => new Response("english page"));
      const response = await onEnglishRequest({ request: new Request(url), next });
      expect(await response.text()).toBe("english page");
      expect(next).toHaveBeenCalledOnce();
    }
  });
});
