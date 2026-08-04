import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  ADMIN_INACTIVITY_TIMEOUT_MS,
  adminLockMessage,
  readGoogleCredentialExpiryMs
} from "./adminSessionGuard";

function unsignedCredential(payload: unknown): string {
  return [
    Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature"
  ].join(".");
}

describe("administrator session privacy guard", () => {
  it("reads only the absolute expiration deadline needed for local auto-lock", () => {
    const expirationSeconds = 1_800_000_000;
    const credential = unsignedCredential({
      exp: expirationSeconds,
      name: "利用者",
      email: "not-used@example.invalid",
      role: "not-trusted"
    });

    expect(readGoogleCredentialExpiryMs(credential)).toBe(
      expirationSeconds * 1000
    );
  });

  it.each([
    "",
    "missing.segments",
    "header.!.signature",
    unsignedCredential(null),
    unsignedCredential({}),
    unsignedCredential({ exp: "1800000000" }),
    unsignedCredential({ exp: 1.5 }),
    unsignedCredential({ exp: 0 })
  ])("fails closed for malformed credential payload: %s", (credential) => {
    expect(readGoogleCredentialExpiryMs(credential)).toBeNull();
  });

  it("uses a fifteen-minute inactivity boundary and concise reauthentication messages", () => {
    expect(ADMIN_INACTIVITY_TIMEOUT_MS).toBe(15 * 60 * 1000);
    expect(adminLockMessage("inactive")).toContain("一定時間操作がなかったため");
    expect(adminLockMessage("page_hidden")).toContain("画面を離れたため");
    expect(adminLockMessage("credential_invalid")).toContain("認証情報を確認できませんでした");
    expect(adminLockMessage("credential_expired")).toContain("再度認証してください");
    expect(adminLockMessage("unauthorized")).toContain("再度認証してください");
  });

  it("wires production-only locking to expiry, inactivity, page hiding, and every API 401", async () => {
    const source = await readFile(
      new URL("./AdminDashboard.tsx", import.meta.url),
      "utf8"
    );

    expect(source).toContain('runtimeConfig.mode !== "google"');
    expect(source).toContain("ADMIN_INACTIVITY_TIMEOUT_MS");
    expect(source).toContain('document.visibilityState === "hidden"');
    expect(source).toContain('window.addEventListener("pagehide"');
    expect(source).toContain('clearAdminSession("credential_expired")');
    expect(source).toContain('clearAdminSession("inactive")');
    expect(source).toContain('clearAdminSession("page_hidden")');
    expect(source).toMatch(/caught instanceof AdminApiError[\s\S]*?caught\.status === 401[\s\S]*?clearAdminSession\("unauthorized"\)/);

    for (const reset of [
      "setCredential(null)",
      "setSession(null)",
      "setApplications([])",
      "setMembers([])",
      "setSelected(null)",
      "setAuditEvents([])",
      'setQuery("")',
      'setMemberQuery("")',
      'setActionReason("")',
      "setLastExport(null)"
    ]) {
      expect(source).toContain(reset);
    }
  });
});
