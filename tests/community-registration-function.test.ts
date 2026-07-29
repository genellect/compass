import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest, type RegistrationEnv } from "../functions/api/community-registration";
import { INTEREST_OPTIONS, TURNSTILE_ACTION } from "../src/lib/community-registration-schema";

const origin = "https://compass-official.pages.dev";
const requestId = "1f386090-84e0-4c2f-a4d7-6f8f4f8ad141";
const env: RegistrationEnv = {
  GOOGLE_APPS_SCRIPT_URL: "https://script.google.com/macros/s/test-deployment-id_123/exec",
  GOOGLE_APPS_SCRIPT_SECRET: "test-shared-secret-that-is-long-enough",
  TURNSTILE_SECRET_KEY: "test-turnstile-secret"
};
const payload = {
  name: "松井 優人",
  email: "sample@st.kitasato-u.ac.jp",
  facultyDepartment: "薬学部 薬学科",
  studentId: "PP00000",
  year: "1年",
  interests: [INTEREST_OPTIONS[0], INTEREST_OPTIONS[1]],
  motivation: "英語学習イベントを企画してみたいです。",
  requestId,
  turnstileToken: "verified-token",
  website: ""
};

function registrationRequest(body: unknown = payload, requestOrigin = origin) {
  return new Request(`${origin}/api/community-registration`, {
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
  return new Response(JSON.stringify({ success: true, hostname: "compass-official.pages.dev", action: TURNSTILE_ACTION }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("community registration Pages Function", () => {
  it("verifies Turnstile and relays only validated fields to Google Apps Script", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(acceptedTurnstile())
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, requestId }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({ env, request: registrationRequest() });
    const result = await response.json() as { ok: boolean; requestId: string };

    expect(response.status).toBe(200);
    expect(result).toEqual({ ok: true, requestId });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const turnstileCall = fetchMock.mock.calls[0];
    expect(turnstileCall[0]).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const turnstileBody = turnstileCall[1]?.body as FormData;
    expect(turnstileBody.get("response")).toBe("verified-token");
    expect(turnstileBody.get("remoteip")).toBe("192.0.2.10");

    const gasCall = fetchMock.mock.calls[1];
    expect(gasCall[0]).toBe(env.GOOGLE_APPS_SCRIPT_URL);
    const gasBody = JSON.parse(String(gasCall[1]?.body)) as Record<string, unknown>;
    expect(gasBody).toMatchObject({
      sharedSecret: env.GOOGLE_APPS_SCRIPT_SECRET,
      requestId,
      name: payload.name,
      email: payload.email,
      facultyDepartment: payload.facultyDepartment,
      studentId: payload.studentId,
      year: payload.year,
      interests: payload.interests,
      motivation: payload.motivation
    });
    expect(gasBody.receivedAt).toEqual(expect.any(String));
    expect(gasBody).not.toHaveProperty("turnstileToken");
    expect(gasBody).not.toHaveProperty("website");
  });

  it("rejects malformed fields before any external request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({ env, request: registrationRequest({ ...payload, email: "student@example.com" }) });
    const result = await response.json() as { code: string; fieldErrors: { email: string } };

    expect(response.status).toBe(422);
    expect(result.code).toBe("validation");
    expect(result.fieldErrors.email).toBe("正しい形式で入力してください");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects cross-origin and honeypot submissions", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const crossOrigin = await onRequest({ env, request: registrationRequest(payload, "https://attacker.example") });
    const honeypot = await onRequest({ env, request: registrationRequest({ ...payload, website: "spam" }) });

    expect(crossOrigin.status).toBe(403);
    expect(honeypot.status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops before GAS delivery when Turnstile evidence is invalid", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({ env, request: registrationRequest() });
    const result = await response.json() as { code: string };

    expect(response.status).toBe(422);
    expect(result.code).toBe("turnstile");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects non-Google or test deployment URLs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const nonGoogle = await onRequest({
      env: { ...env, GOOGLE_APPS_SCRIPT_URL: "https://attacker.example/exec" },
      request: registrationRequest()
    });
    const developmentUrl = await onRequest({
      env: { ...env, GOOGLE_APPS_SCRIPT_URL: "https://script.google.com/macros/s/test/development/dev" },
      request: registrationRequest()
    });

    expect(nonGoogle.status).toBe(503);
    expect(developmentUrl.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an email error when GAS does not confirm the same request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(acceptedTurnstile())
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, code: "email" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({ env, request: registrationRequest() });
    const result = await response.json() as { code: string };

    expect(response.status).toBe(502);
    expect(result.code).toBe("email");
  });
});
