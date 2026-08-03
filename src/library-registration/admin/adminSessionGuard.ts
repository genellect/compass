export const ADMIN_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

export type AdminLockReason =
  | "credential_invalid"
  | "credential_expired"
  | "inactive"
  | "page_hidden"
  | "unauthorized";

const MAX_JWT_PAYLOAD_LENGTH = 8_192;

// This unverified claim is used only to shorten the local display lifetime.
// The API remains authoritative and verifies the credential before returning data.
export function readGoogleCredentialExpiryMs(credential: string): number | null {
  const segments = credential.split(".");
  if (segments.length !== 3) return null;

  const encodedPayload = segments[1];
  if (
    !encodedPayload
    || encodedPayload.length > MAX_JWT_PAYLOAD_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(encodedPayload)
  ) return null;

  try {
    const base64 = encodedPayload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(encodedPayload.length / 4) * 4, "=");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!isRecord(payload)) return null;

    const expirationSeconds = payload.exp;
    if (
      typeof expirationSeconds !== "number"
      || !Number.isSafeInteger(expirationSeconds)
      || expirationSeconds <= 0
      || expirationSeconds > Number.MAX_SAFE_INTEGER / 1000
    ) return null;

    return expirationSeconds * 1000;
  } catch {
    return null;
  }
}

export function adminLockMessage(reason: AdminLockReason): string {
  if (reason === "inactive") {
    return "一定時間操作がなかったため、再度認証してください。";
  }
  if (reason === "page_hidden") {
    return "画面を離れたため、再度認証してください。";
  }
  if (reason === "credential_invalid") {
    return "認証情報を確認できませんでした。再度認証してください。";
  }
  if (reason === "unauthorized") {
    return "認証が無効になりました。再度認証してください。";
  }
  return "認証の有効期限が切れました。再度認証してください。";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
