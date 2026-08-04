import { describe, expect, it, vi } from "vitest";
import {
  Phase6ApiError,
  getPhase7RegistrationStatus,
  isTrustedRegistrationPreviewLocation,
  readPhase6RuntimeConfig,
  submitPhase6Registration,
  verifyGoogleCredential
} from "./phase6Client";
import type { RegistrationInput } from "./eligibility";


const config = readPhase6RuntimeConfig({
  NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE: "google",
  NEXT_PUBLIC_LIBRARY_API_BASE_URL: "http://127.0.0.1:58000/",
  NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID: "public-client-id",
  NEXT_PUBLIC_LIBRARY_GOOGLE_HOSTED_DOMAIN: "st.kitasato-u.ac.jp"
});

const registration: RegistrationInput = {
  fullName: "北里 花子",
  academicRole: "undergraduate",
  faculty: "pharmacy",
  grade: "3",
  studentNumber: "PP23000",
  termsAccepted: true,
  privacyAccepted: true,
  question: ""
};


describe("Phase 6 client boundary", () => {
  it("allows the synthetic registration preview on loopback HTTP only", () => {
    for (const hostname of ["127.0.0.1", "localhost", "::1", "[::1]"]) {
      expect(isTrustedRegistrationPreviewLocation({ protocol: "http:", hostname }))
        .toBe(true);
    }
    for (const location of [
      { protocol: "https:", hostname: "127.0.0.1" },
      { protocol: "http:", hostname: "preview.pages.dev" },
      { protocol: "https:", hostname: "compass-official.pages.dev" }
    ]) {
      expect(isTrustedRegistrationPreviewLocation(location)).toBe(false);
    }
  });

  it("defaults to the no-network mock mode", () => {
    expect(readPhase6RuntimeConfig({})).toMatchObject({
      mode: "mock",
      ready: true
    });
  });

  it("keeps the credential out of the verification body", async () => {
    const fetcher = vi.fn(async (_url, init) => {
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer synthetic-id-token"
      });
      expect(init?.body).toBeUndefined();
      expect(init?.credentials).toBe("omit");
      return new Response(JSON.stringify({
        status: "verified",
        email: "student@st.kitasato-u.ac.jp",
        hostedDomain: "st.kitasato-u.ac.jp"
      }), { status: 200 });
    });

    const result = await verifyGoogleCredential(
      config,
      "synthetic-id-token",
      fetcher as typeof fetch
    );

    expect(result.email).toBe("student@st.kitasato-u.ac.jp");
  });

  it("sends registration fields without client-authentication facts", async () => {
    const fetcher = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({ registration });
      expect(body.account).toBeUndefined();
      return new Response(JSON.stringify({
        status: "approved",
        reasons: ["eligible"],
        normalizedEmail: "student@st.kitasato-u.ac.jp",
        normalizedStudentNumber: "PP23000",
        requiresStudentDetails: true,
        persisted: true,
        replayed: false,
        applicationId: "synthetic-application-id",
        identityLinked: true,
        driveAccessStatus: "pending",
        driveNotificationStatus: "pending"
      }), { status: 200 });
    });

    const result = await submitPhase6Registration(
      config,
      {
        credential: "synthetic-id-token",
        email: "student@st.kitasato-u.ac.jp",
        hostedDomain: "st.kitasato-u.ac.jp"
      },
      registration,
      "synthetic-idempotency-key",
      fetcher as typeof fetch
    );

    expect(result.status).toBe("approved");
    expect(result.identityLinked).toBe(true);
    expect(result.driveAccessStatus).toBe("pending");
  });

  it("checks Drive status with the same in-memory credential", async () => {
    const fetcher = vi.fn(async (url, init) => {
      expect(String(url)).toContain(
        "/phase7/registrations/synthetic-application-id/status"
      );
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer synthetic-id-token"
      });
      expect(init?.body).toBeUndefined();
      return new Response(JSON.stringify({
        applicationId: "synthetic-application-id",
        driveAccessStatus: "granted",
        driveNotificationStatus: "sent_by_drive"
      }), { status: 200 });
    });

    const result = await getPhase7RegistrationStatus(
      config,
      {
        credential: "synthetic-id-token",
        email: "student@st.kitasato-u.ac.jp",
        hostedDomain: "st.kitasato-u.ac.jp"
      },
      "synthetic-application-id",
      fetcher as typeof fetch
    );

    expect(result.driveAccessStatus).toBe("granted");
    expect(result.driveNotificationStatus).toBe("sent_by_drive");
  });

  it("returns a generic error without copying the credential", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ detail: "invalid_google_credential" }),
      { status: 401 }
    ));

    await expect(verifyGoogleCredential(
      config,
      "secret-token-value",
      fetcher as typeof fetch
    )).rejects.toEqual(
      new Phase6ApiError(401, "invalid_google_credential")
    );
  });
});
