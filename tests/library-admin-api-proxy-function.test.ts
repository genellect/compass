import { afterEach, describe, expect, it, vi } from "vitest";
import {
  onRequest,
  type AdminApiProxyEnv
} from "../functions/library-registration/admin/api/[[path]]";


const siteOrigin = "https://site.example.invalid";
const apiOrigin = "https://api.example.invalid";
const edgeSecret = "reserved-test-edge-secret-at-least-32-characters";
const requestId = "11111111-1111-4111-8111-111111111111";
const resourceId = "22222222-2222-4222-8222-222222222222";
const env: AdminApiProxyEnv = {
  LIBRARY_ADMIN_CANONICAL_ORIGIN: siteOrigin,
  LIBRARY_ADMIN_API_ORIGIN: apiOrigin,
  LIBRARY_ADMIN_EDGE_SHARED_SECRET: edgeSecret
};

function proxyRequest(
  path: string,
  {
    method = "GET",
    body,
    headers = {},
    origin = siteOrigin
  }: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    origin?: string;
  } = {}
): Request {
  return new Request(`${origin}/library-registration/admin/api${path}`, {
    method,
    headers: {
      Authorization: "Bearer reserved.test.google.credential",
      "X-Request-ID": requestId,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers
    },
    body
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Library administrator same-origin API proxy", () => {
  it("forwards a session request with only approved identity headers", async () => {
    const upstream = new Response(JSON.stringify({ authorized: true, role: "admin" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": "private=must-not-escape",
        Server: "private-upstream",
        "Access-Control-Allow-Origin": "*",
        "X-Request-ID": requestId
      }
    });
    const fetchMock = vi.fn().mockResolvedValue(upstream);
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({
      env,
      request: proxyRequest("/session", {
        headers: {
          "CF-Access-Jwt-Assertion": "untrusted.edge.assertion",
          Cookie: "browser-cookie=must-not-forward",
          "X-Forwarded-For": "192.0.2.1",
          "X-Unapproved": "must-not-forward"
        }
      })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authorized: true, role: "admin" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${apiOrigin}/admin/v1/session`);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const forwarded = new Headers(init.headers);
    expect(forwarded.get("Authorization")).toBe("Bearer reserved.test.google.credential");
    expect(forwarded.get("X-Request-ID")).toBe(requestId);
    expect(forwarded.get("CF-Access-Jwt-Assertion")).toBeNull();
    expect(forwarded.get("X-Library-Admin-Edge-Secret")).toBe(edgeSecret);
    expect([...forwarded.keys()].sort()).toEqual([
      "authorization",
      "x-library-admin-edge-secret",
      "x-request-id"
    ]);

    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(response.headers.get("Server")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("X-Library-Admin-Edge-Secret")).toBeNull();
  });

  it("preserves mutation body, request ID and idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ status: "approved" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ));
    vi.stubGlobal("fetch", fetchMock);
    const body = JSON.stringify({
      decision: "approve",
      reason: "Reserved test decision.",
      expectedRecordVersion: 1
    });

    const response = await onRequest({
      env,
      request: proxyRequest(`/applications/${resourceId}/decision`, {
        method: "POST",
        body,
        headers: { "Idempotency-Key": "reserved-idempotency-0001" }
      })
    });

    expect(response.status).toBe(200);
    const [target, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(target)).toBe(`${apiOrigin}/admin/v1/applications/${resourceId}/decision`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(body);
    const forwarded = new Headers(init.headers);
    expect(forwarded.get("Idempotency-Key")).toBe("reserved-idempotency-0001");
    expect(forwarded.get("Content-Type")).toBe("application/json");
  });

  it("forwards only the bounded audit pagination query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ items: [], offset: 0, limit: 50, hasMore: false }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({
      env,
      request: proxyRequest("/audit-events?offset=0&limit=50")
    });

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `${apiOrigin}/admin/v1/audit-events?offset=0&limit=50`
    );
  });

  it("retries one transient cold-start failure for idempotent GET requests", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ authorized: true, role: "viewer" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({ env, request: proxyRequest("/session") });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authorized: true, role: "viewer" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never retries non-idempotent POST requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({
      env,
      request: proxyRequest("/applications/search", {
        method: "POST",
        body: JSON.stringify({ offset: 0, limit: 25 })
      })
    });

    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["GET", "/applications/search"],
    ["POST", "/session"],
    ["GET", "/applications"],
    ["GET", "/applications/not-a-uuid"],
    ["GET", "/session?debug=true"],
    ["GET", "/audit-events?offset=0&offset=1"],
    ["GET", "/audit-events?email=reserved%40example.invalid"],
    ["GET", "/%73ession"]
  ])("rejects paths, methods and queries outside the contract", async (method, path) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({ env, request: proxyRequest(path, { method }) });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ detail: "not_found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...env, LIBRARY_ADMIN_CANONICAL_ORIGIN: "http://site.example.invalid" }],
    [{ ...env, LIBRARY_ADMIN_CANONICAL_ORIGIN: `${siteOrigin}/admin` }],
    [{ ...env, LIBRARY_ADMIN_API_ORIGIN: "http://api.example.invalid" }],
    [{ ...env, LIBRARY_ADMIN_API_ORIGIN: `${apiOrigin}/v1` }],
    [{ ...env, LIBRARY_ADMIN_EDGE_SHARED_SECRET: "short" }],
    [{ LIBRARY_ADMIN_CANONICAL_ORIGIN: siteOrigin, LIBRARY_ADMIN_API_ORIGIN: apiOrigin }]
  ])("fails closed before fetch when private configuration is invalid", async (invalidEnv) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({ env: invalidEnv, request: proxyRequest("/session") });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ detail: "admin_proxy_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects preview aliases and every non-canonical request origin", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({
      env,
      request: proxyRequest("/session", {
        origin: "https://preview.site.example.invalid"
      })
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ detail: "not_found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ Authorization: "Basic reserved" }, "/session", "GET"],
    [{ "X-Request-ID": "not-a-uuid" }, "/session", "GET"],
    [{ "X-Library-Admin-Edge-Secret": "client-spoof" }, "/session", "GET"],
    [{ "Idempotency-Key": "short" }, `/members/${resourceId}/deactivate`, "POST"]
  ])("rejects malformed or spoofed protected headers", async (headers, path, method) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const body = method === "POST" ? JSON.stringify({ expectedRecordVersion: 1 }) : undefined;

    const response = await onRequest({
      env,
      request: proxyRequest(path, { method, body, headers })
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ detail: "admin_request_rejected" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized or non-JSON request bodies", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const oversized = await onRequest({
      env,
      request: proxyRequest("/applications/search", {
        method: "POST",
        body: JSON.stringify({ q: "x".repeat(70 * 1024) })
      })
    });
    const nonJson = await onRequest({
      env,
      request: proxyRequest("/applications/search", {
        method: "POST",
        body: "plain text",
        headers: { "Content-Type": "text/plain" }
      })
    });

    expect(oversized.status).toBe(400);
    expect(nonJson.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes an export body and only the approved download headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      new Uint8Array([80, 75, 3, 4]),
      {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": "attachment; filename=reserved-roster.xlsx",
          "X-Export-Run-ID": resourceId,
          "X-Export-Row-Count": "2",
          "X-Content-SHA256": "a".repeat(64),
          "X-Export-Delete-After": "2030-01-01T00:00:00Z",
          "X-Private-Upstream": "must-not-escape"
        }
      }
    ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({
      env,
      request: proxyRequest("/exports", {
        method: "POST",
        body: JSON.stringify({ format: "xlsx", confirmed: true }),
        headers: { "Idempotency-Key": "reserved-export-0001" }
      })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("reserved-roster.xlsx");
    expect(response.headers.get("X-Export-Row-Count")).toBe("2");
    expect(response.headers.get("X-Private-Upstream")).toBeNull();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("returns one generic no-store failure for redirects and network errors", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { Location: "https://private.example.invalid/sign-in" }
      }))
      .mockRejectedValueOnce(new Error("reserved network failure"));
    vi.stubGlobal("fetch", fetchMock);

    const redirect = await onRequest({ env, request: proxyRequest("/session") });
    const network = await onRequest({ env, request: proxyRequest("/session") });

    for (const response of [redirect, network]) {
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ detail: "admin_proxy_unavailable" });
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      expect(response.headers.get("Location")).toBeNull();
      expect(response.headers.get("X-Library-Admin-Edge-Secret")).toBeNull();
    }
  });
});
