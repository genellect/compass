import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createGoogleInitializationOptions } from "./GoogleSignInButton";

describe("createGoogleInitializationOptions", () => {
  it("restricts the registration account chooser to the configured hosted domain", () => {
    const callback = vi.fn();

    const options = createGoogleInitializationOptions(
      "123-example.apps.googleusercontent.com",
      callback,
      "st.kitasato-u.ac.jp"
    );

    expect(options).toEqual({
      client_id: "123-example.apps.googleusercontent.com",
      callback,
      auto_select: false,
      cancel_on_tap_outside: true,
      hd: "st.kitasato-u.ac.jp"
    });
  });

  it("keeps hosted-domain filtering optional for other secured surfaces", () => {
    const callback = vi.fn();

    const options = createGoogleInitializationOptions(
      "123-example.apps.googleusercontent.com",
      callback
    );

    expect(options).not.toHaveProperty("hd");
  });

  it("reinitializes the Google button when the authentication UI is mounted again", () => {
    const source = readFileSync(
      new URL("./GoogleSignInButton.tsx", import.meta.url),
      "utf8"
    );

    expect(source).toContain('onReady={() => setScriptReady(true)}');
    expect(source).not.toContain('onLoad={() => setScriptReady(true)}');
  });

  it("keeps the registration authentication copy concise", () => {
    const source = readFileSync(
      new URL("./RegistrationMvp.tsx", import.meta.url),
      "utf8"
    );

    expect(source).toContain(
      "認証情報はGoogle側で照合され、パスワードなどは保存されません。"
    );
    expect(source).toContain("成功しました！");
    expect(source).toContain("個人情報の取り扱いを確認し、同意します。");
    expect(source).toContain("const [privacyReviewed, setPrivacyReviewed]");
    expect(source).toContain("disabled={!privacyReviewed}");
    expect(source).toContain("if (nextOpen) setPrivacyReviewed(true)");
    expect(source).not.toContain(
      "認証情報はこの画面内だけで安全に扱い、端末には保存しません。"
    );
    expect(source).not.toContain("大学アカウント確認済み:");
  });
});
