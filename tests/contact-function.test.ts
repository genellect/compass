import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest, type ContactEnv } from "../functions/api/contact";
import { CONTACT_TURNSTILE_ACTION } from "../src/lib/contact-schema";

const origin = "https://compass-official.pages.dev";
const issueRequestId = "1f386090-84e0-4c2f-a4d7-6f8f4f8ad141";
const submitRequestId = "8ab3959a-7184-40ca-8208-b4cb481ede35";
const verifyRequestId = "4cf7ccfe-6142-4541-b6fe-2e8cb996db63";
const env: ContactEnv = {
  CONTACT_GOOGLE_APPS_SCRIPT_URL: "https://script.google.com/macros/s/contact-deployment-id_123/exec",
  CONTACT_GOOGLE_APPS_SCRIPT_SECRET: "contact-shared-secret-that-is-long-enough",
  CONTACT_RATE_LIMIT_SECRET: "contact-rate-secret-that-is-long-enough",
  CONTACT_TURNSTILE_SECRET_KEY: "contact-turnstile-secret"
};
const identity = {
  name: "松井優人",
  affiliation: "北里大学薬学部",
  email: "contact@example.com"
};
const issuePayload = {
  action: "request_code",
  ...identity,
  requestId: issueRequestId,
  turnstileToken: "verified-token",
  website: ""
};
const submitPayload = {
  action: "submit",
  ...identity,
  details: "教育活動に関する共同企画について相談を希望します。",
  challengeId: issueRequestId,
  requestId: submitRequestId,
  verificationProof: "a".repeat(43),
  website: ""
};
const verifyPayload = {
  action: "verify_code",
  ...identity,
  challengeId: issueRequestId,
  requestId: verifyRequestId,
  verificationCode: "123456",
  website: ""
};

function contactRequest(body: unknown, requestOrigin = origin) {
  return new Request(`${origin}/api/contact`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: requestOrigin,
      "CF-Connecting-IP": "192.0.2.10"
    },
    body: JSON.stringify(body)
  });
}

function acceptedTurnstile() {
  return new Response(JSON.stringify({
    success: true,
    hostname: "compass-official.pages.dev",
    action: CONTACT_TURNSTILE_ACTION
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("contact Pages Function", () => {
  it("issues a code only after identity and Turnstile validation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(acceptedTurnstile())
      .mockImplementationOnce(async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({
          ok: true,
          requestId: body.requestId,
          challengeId: body.challengeId
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      });
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({ env, request: contactRequest(issuePayload) });
    const result = await response.json() as { challengeId: string; ok: boolean; requestId: string };

    expect(response.status).toBe(200);
    expect(result).toEqual({ ok: true, requestId: issueRequestId, challengeId: issueRequestId });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const turnstileBody = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(turnstileBody.get("response")).toBe("verified-token");
    expect(turnstileBody.get("remoteip")).toBe("192.0.2.10");

    const gasBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as Record<string, unknown>;
    expect(gasBody).toMatchObject({
      action: "request_code",
      challengeId: issueRequestId,
      email: identity.email,
      name: identity.name,
      affiliation: identity.affiliation,
      requestId: issueRequestId,
      sharedSecret: env.CONTACT_GOOGLE_APPS_SCRIPT_SECRET
    });
    expect(gasBody.verificationCode).toMatch(/^\d{6}$/);
    expect(gasBody.clientFingerprint).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(gasBody.clientFingerprint).not.toBe("192.0.2.10");
    expect(result).not.toHaveProperty("verificationCode");
  });

  it.each([
    { name: "松" },
    { affiliation: "学" },
    { email: "invalid" },
    { email: "a".repeat(39) + "@example.com" }
  ])("does not call Turnstile or GAS when code identity fields are invalid", async (override) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({
      env,
      request: contactRequest({ ...issuePayload, ...override })
    });

    expect(response.status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops before GAS when Turnstile evidence is invalid", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({ env, request: contactRequest(issuePayload) });

    expect(response.status).toBe(422);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("verifies the code and returns only a server-generated ownership proof", async () => {
    const fetchMock = vi.fn().mockImplementationOnce(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        ok: true,
        requestId: body.requestId,
        challengeId: body.challengeId
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({ env, request: contactRequest(verifyPayload) });
    const result = await response.json() as {
      challengeId: string;
      ok: boolean;
      requestId: string;
      verificationProof: string;
    };

    expect(response.status).toBe(200);
    expect(result).toMatchObject({ ok: true, requestId: verifyRequestId, challengeId: issueRequestId });
    expect(result.verificationProof).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const gasBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(gasBody).toMatchObject({
      action: "verify_code",
      challengeId: issueRequestId,
      verificationCode: "123456",
      verificationProof: result.verificationProof
    });
  });

  it("relays a final submission without exposing it to another external service", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, requestId: submitRequestId }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({ env, request: contactRequest(submitPayload) });
    const result = await response.json() as { ok: boolean; requestId: string };

    expect(response.status).toBe(200);
    expect(result).toEqual({ ok: true, requestId: submitRequestId });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const gasBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(gasBody).toMatchObject({
      action: "submit",
      challengeId: issueRequestId,
      details: submitPayload.details,
      verificationProof: submitPayload.verificationProof
    });
    expect(gasBody).not.toHaveProperty("turnstileToken");
    expect(gasBody).not.toHaveProperty("website");
  });

  it("rejects cross-origin and honeypot submissions before external requests", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const crossOrigin = await onRequest({ env, request: contactRequest(issuePayload, "https://attacker.example") });
    const honeypot = await onRequest({
      env,
      request: contactRequest({ ...submitPayload, website: "spam" })
    });

    expect(crossOrigin.status).toBe(403);
    expect(honeypot.status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps GAS throttling to a safe 429 response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(acceptedTurnstile())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: false,
        code: "rate_limited",
        retryAfter: 57
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({ env, request: contactRequest(issuePayload) });
    const result = await response.json() as { code: string; retryAfter: number };

    expect(response.status).toBe(429);
    expect(result).toMatchObject({ code: "rate_limited", retryAfter: 57 });
  });

  it("rejects incomplete or unsafe GAS configuration", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const unsafeUrl = await onRequest({
      env: { ...env, CONTACT_GOOGLE_APPS_SCRIPT_URL: "https://attacker.example/exec" },
      request: contactRequest(issuePayload)
    });
    const shortRateSecret = await onRequest({
      env: { ...env, CONTACT_RATE_LIMIT_SECRET: "short" },
      request: contactRequest(issuePayload)
    });

    expect(unsafeUrl.status).toBe(503);
    expect(shortRateSecret.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
