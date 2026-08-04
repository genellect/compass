import type { EligibilityResult, RegistrationInput } from "./eligibility";

export type RegistrationRuntimeMode = "mock" | "google";

export type Phase6RuntimeConfig = {
  mode: RegistrationRuntimeMode;
  apiBaseUrl: string;
  googleClientId: string;
  expectedHostedDomain: string;
  ready: boolean;
};

export type Phase6Authentication = {
  credential: string;
  email: string;
  hostedDomain: string;
};

export type DriveAccessStatus =
  | "not_enqueued"
  | "pending"
  | "granted"
  | "already_granted"
  | "failed"
  | "revoked";

export type DriveNotificationStatus =
  | "pending"
  | "sent_by_drive"
  | "not_applicable"
  | "failed";

export type Phase6RegistrationResult = EligibilityResult & {
  persisted: boolean;
  replayed: boolean;
  applicationId: string | null;
  identityLinked: boolean;
  driveAccessStatus: DriveAccessStatus;
  driveNotificationStatus: DriveNotificationStatus;
};

export type Phase7RegistrationStatus = {
  applicationId: string;
  driveAccessStatus: DriveAccessStatus;
  driveNotificationStatus: DriveNotificationStatus;
};

type PublicEnvironment = Record<string, string | undefined>;
type Fetcher = typeof fetch;

export type RegistrationPreviewLocation = {
  protocol: string;
  hostname: string;
};

export class Phase6ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string
  ) {
    super(code);
    this.name = "Phase6ApiError";
  }
}

export function readPhase6RuntimeConfig(
  environment: PublicEnvironment = process.env
): Phase6RuntimeConfig {
  const mode = environment.NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE === "google"
    ? "google"
    : "mock";
  const apiBaseUrl = (environment.NEXT_PUBLIC_LIBRARY_API_BASE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  const googleClientId = (
    environment.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ?? ""
  ).trim();
  const expectedHostedDomain = (
    environment.NEXT_PUBLIC_LIBRARY_GOOGLE_HOSTED_DOMAIN
    ?? "st.kitasato-u.ac.jp"
  ).trim().toLowerCase();

  return {
    mode,
    apiBaseUrl,
    googleClientId,
    expectedHostedDomain,
    ready: mode === "mock" || Boolean(
      apiBaseUrl
      && googleClientId
      && expectedHostedDomain
    )
  };
}

export function isTrustedRegistrationPreviewLocation(
  location: RegistrationPreviewLocation
): boolean {
  const hostname = location.hostname.trim().toLowerCase();
  return location.protocol === "http:"
    && (
      hostname === "127.0.0.1"
      || hostname === "localhost"
      || hostname === "::1"
      || hostname === "[::1]"
    );
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function apiError(response: Response, payload: Record<string, unknown>) {
  const detail = typeof payload.detail === "string"
    ? payload.detail
    : "phase6_request_failed";
  return new Phase6ApiError(response.status, detail);
}

export async function verifyGoogleCredential(
  config: Phase6RuntimeConfig,
  credential: string,
  fetcher: Fetcher = fetch
): Promise<Phase6Authentication> {
  if (config.mode !== "google" || !config.ready || !credential) {
    throw new Phase6ApiError(0, "phase6_not_configured");
  }

  const response = await fetcher(`${config.apiBaseUrl}/phase6/auth/verify`, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${credential}`,
      "X-Request-ID": crypto.randomUUID()
    }
  });
  const payload = await responseJson(response);
  if (!response.ok) throw apiError(response, payload);
  if (
    typeof payload.email !== "string"
    || typeof payload.hostedDomain !== "string"
  ) {
    throw new Phase6ApiError(502, "phase6_invalid_response");
  }

  return {
    credential,
    email: payload.email,
    hostedDomain: payload.hostedDomain
  };
}

export async function submitPhase6Registration(
  config: Phase6RuntimeConfig,
  authentication: Phase6Authentication,
  registration: RegistrationInput,
  idempotencyKey: string,
  fetcher: Fetcher = fetch
): Promise<Phase6RegistrationResult> {
  if (config.mode !== "google" || !config.ready) {
    throw new Phase6ApiError(0, "phase6_not_configured");
  }

  const response = await fetcher(`${config.apiBaseUrl}/phase6/registrations`, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${authentication.credential}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      "X-Request-ID": crypto.randomUUID()
    },
    body: JSON.stringify({ registration })
  });
  const payload = await responseJson(response);
  if (!response.ok) throw apiError(response, payload);

  return payload as unknown as Phase6RegistrationResult;
}

export async function getPhase7RegistrationStatus(
  config: Phase6RuntimeConfig,
  authentication: Phase6Authentication,
  applicationId: string,
  fetcher: Fetcher = fetch
): Promise<Phase7RegistrationStatus> {
  if (config.mode !== "google" || !config.ready || !applicationId) {
    throw new Phase6ApiError(0, "phase7_not_configured");
  }

  const response = await fetcher(
    `${config.apiBaseUrl}/phase7/registrations/${encodeURIComponent(applicationId)}/status`,
    {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${authentication.credential}`,
        "X-Request-ID": crypto.randomUUID()
      }
    }
  );
  const payload = await responseJson(response);
  if (!response.ok) throw apiError(response, payload);
  if (
    typeof payload.applicationId !== "string"
    || typeof payload.driveAccessStatus !== "string"
    || typeof payload.driveNotificationStatus !== "string"
  ) {
    throw new Phase6ApiError(502, "phase7_invalid_response");
  }
  return payload as unknown as Phase7RegistrationStatus;
}
