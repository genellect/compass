import { describe, expect, it, vi } from "vitest";
import {
  FOUNDER_DOMAIN,
  onRequest,
  type FounderDomainEnv
} from "../functions/index";

function createContext(url: string, method = "GET") {
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
      request: new Request(url, { method }),
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
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
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
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(assetsFetch).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
