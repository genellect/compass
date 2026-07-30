"use client";

import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CONTACT_ENDPOINT,
  CONTACT_FORM_ERROR_MESSAGE,
  CONTACT_TURNSTILE_ACTION,
  contactFieldSchemas,
  contactFieldsSchema,
  contactIdentityFieldsSchema,
  getContactFieldErrors
} from "@/lib/contact-schema";
import styles from "./contact.module.css";

type LocalFormState = {
  affiliation: string;
  details: string;
  email: string;
  name: string;
};

type FieldName = keyof LocalFormState;
type FieldErrors = Partial<Record<FieldName | "verificationCode", string>>;
type SubmissionState = "idle" | "requesting_code" | "verifying_code" | "submitting" | "success";

type TurnstileApi = {
  remove: (widgetId: string) => void;
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const initialForm: LocalFormState = {
  name: "",
  affiliation: "",
  email: "",
  details: ""
};

const turnstileSiteKey =
  process.env.NEXT_PUBLIC_CONTACT_TURNSTILE_SITE_KEY?.trim() || "0x4AAAAAAEA-AFeNsvkfbtgD";

function RequiredBadge() {
  return <span className={styles.required}>必須</span>;
}

function FieldError({ id, visible }: { id: string; visible: boolean }) {
  if (!visible) return null;
  return <p className={styles.fieldError} id={id} role="alert">{CONTACT_FORM_ERROR_MESSAGE}</p>;
}

function FieldValid({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span className={styles.fieldValid} aria-label="入力内容は有効です">
      <span aria-hidden="true">✓</span>
    </span>
  );
}

function identityKey(form: LocalFormState) {
  const parsed = contactIdentityFieldsSchema.safeParse(form);
  return parsed.success ? JSON.stringify(parsed.data) : "";
}

export function ContactForm() {
  const [form, setForm] = useState<LocalFormState>(initialForm);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationProof, setVerificationProof] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [challengeIdentity, setChallengeIdentity] = useState("");
  const [challengeExpiresAt, setChallengeExpiresAt] = useState(0);
  const [touched, setTouched] = useState<Partial<Record<FieldName | "verificationCode", boolean>>>({});
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<SubmissionState>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetRef = useRef<string | null>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const codeRequestIdRef = useRef("");
  const verificationRequestIdRef = useRef("");
  const submissionRequestIdRef = useRef("");

  const identityValidation = useMemo(() => contactIdentityFieldsSchema.safeParse(form), [form]);
  const formValidation = useMemo(() => contactFieldsSchema.safeParse(form), [form]);
  const fieldValidity = useMemo(() => ({
    name: contactFieldSchemas.name.safeParse(form.name).success,
    affiliation: contactFieldSchemas.affiliation.safeParse(form.affiliation).success,
    email: contactFieldSchemas.email.safeParse(form.email).success,
    details: contactFieldSchemas.details.safeParse(form.details).success
  }), [form]);
  const clientErrors = formValidation.success ? {} : getContactFieldErrors(formValidation.error);
  const visibleErrors = { ...clientErrors, ...serverErrors };
  const canRequestCode = identityValidation.success && Boolean(turnstileToken) && status === "idle";
  const canVerifyCode = (
    /^\d{6}$/.test(verificationCode) &&
    Boolean(challengeId) &&
    challengeIdentity === identityKey(form) &&
    !verificationProof &&
    status === "idle"
  );
  const canSubmit = (
    formValidation.success &&
    Boolean(challengeId) &&
    Boolean(verificationProof) &&
    challengeIdentity === identityKey(form) &&
    status === "idle"
  );

  useEffect(() => {
    if (!turnstileReady || !turnstileSiteKey || !turnstileContainerRef.current || !window.turnstile) return;

    const widgetId = window.turnstile.render(turnstileContainerRef.current, {
      sitekey: turnstileSiteKey,
      action: CONTACT_TURNSTILE_ACTION,
      appearance: "always",
      language: "ja",
      size: "flexible",
      theme: "light",
      callback: (token: string) => setTurnstileToken(token),
      "error-callback": () => {
        setTurnstileToken("");
        setStatusMessage("確認を完了できませんでした。もう一度お試しください。");
      },
      "expired-callback": () => setTurnstileToken("")
    });
    turnstileWidgetRef.current = widgetId;

    return () => {
      if (window.turnstile && turnstileWidgetRef.current) window.turnstile.remove(turnstileWidgetRef.current);
      turnstileWidgetRef.current = null;
    };
  }, [turnstileReady]);

  const resetTurnstile = () => {
    setTurnstileToken("");
    if (window.turnstile && turnstileWidgetRef.current) window.turnstile.reset(turnstileWidgetRef.current);
  };

  const invalidateChallenge = () => {
    if (!challengeId) return;
    setChallengeId("");
    setChallengeIdentity("");
    setChallengeExpiresAt(0);
    setVerificationCode("");
    setVerificationProof("");
    verificationRequestIdRef.current = "";
    submissionRequestIdRef.current = "";
    setNoticeMessage("入力内容を変更したため、確認コードを再送してください。");
  };

  const updateField = (field: FieldName, value: string) => {
    if (status !== "idle") return;
    if (field === "name" || field === "affiliation" || field === "email") invalidateChallenge();
    setForm((current) => ({ ...current, [field]: value }));
    setServerErrors((current) => ({ ...current, [field]: undefined }));
    setStatusMessage("");
    if (field !== "details") codeRequestIdRef.current = "";
    submissionRequestIdRef.current = "";
  };

  const markTouched = (field: FieldName | "verificationCode") => {
    setTouched((current) => ({ ...current, [field]: true }));
  };

  const hasError = (field: FieldName | "verificationCode") => {
    const value = field === "verificationCode" ? verificationCode : form[field];
    return Boolean(visibleErrors[field] && (touched[field] || value.length > 0));
  };

  const hasValidValue = (field: FieldName) => (
    form[field].trim().length > 0 && fieldValidity[field] && !visibleErrors[field]
  );

  const describedBy = (field: FieldName | "verificationCode", helperId?: string) => (
    [helperId, hasError(field) ? `${field}-error` : undefined].filter(Boolean).join(" ") || undefined
  );

  const requestCode = async () => {
    const identity = contactIdentityFieldsSchema.safeParse(form);
    if (!identity.success || !turnstileToken) {
      setTouched((current) => ({ ...current, name: true, affiliation: true, email: true }));
      setStatusMessage(turnstileToken ? CONTACT_FORM_ERROR_MESSAGE : "「私はロボットではありません」を確認してください。");
      return;
    }

    const stableRequestId = codeRequestIdRef.current || crypto.randomUUID();
    codeRequestIdRef.current = stableRequestId;
    setStatus("requesting_code");
    setStatusMessage("");
    setNoticeMessage("");
    setServerErrors({});

    try {
      const response = await fetch(CONTACT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_code",
          ...identity.data,
          requestId: stableRequestId,
          turnstileToken,
          website: honeypotRef.current?.value ?? ""
        })
      });
      const result = await response.json() as {
        challengeId?: string;
        fieldErrors?: FieldErrors;
        message?: string;
        ok?: boolean;
      };

      if (!response.ok || !result.ok || !result.challengeId) {
        setServerErrors(result.fieldErrors ?? {});
        throw new Error(result.message || "確認コードを送信できませんでした。時間をおいて再度お試しください。");
      }

      setChallengeId(result.challengeId);
      setChallengeIdentity(JSON.stringify(identity.data));
      setChallengeExpiresAt(Date.now() + 10 * 60 * 1000);
      setVerificationCode("");
      setVerificationProof("");
      setNoticeMessage(`${identity.data.email} に確認コードを送信しました。`);
      codeRequestIdRef.current = "";
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "確認コードを送信できませんでした。時間をおいて再度お試しください。");
    } finally {
      setStatus("idle");
      resetTurnstile();
    }
  };

  const verifyCode = async () => {
    const identity = contactIdentityFieldsSchema.safeParse(form);
    if (!identity.success || !challengeId || !/^\d{6}$/.test(verificationCode)) {
      setTouched((current) => ({ ...current, verificationCode: true }));
      setStatusMessage(CONTACT_FORM_ERROR_MESSAGE);
      return;
    }

    if (Date.now() > challengeExpiresAt) {
      invalidateChallenge();
      setStatusMessage("確認コードの有効期限が切れました。新しいコードを送信してください。");
      return;
    }

    const stableRequestId = verificationRequestIdRef.current || crypto.randomUUID();
    verificationRequestIdRef.current = stableRequestId;
    setStatus("verifying_code");
    setStatusMessage("");
    setNoticeMessage("");
    setServerErrors({});

    try {
      const response = await fetch(CONTACT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_code",
          ...identity.data,
          challengeId,
          verificationCode,
          requestId: stableRequestId,
          website: honeypotRef.current?.value ?? ""
        })
      });
      const result = await response.json() as {
        fieldErrors?: FieldErrors;
        message?: string;
        ok?: boolean;
        verificationProof?: string;
      };

      if (!response.ok || !result.ok || !result.verificationProof) {
        setServerErrors(result.fieldErrors ?? {});
        throw new Error(result.message || "メールアドレスを確認できませんでした。もう一度お試しください。");
      }

      setVerificationProof(result.verificationProof);
      setVerificationCode("");
      setNoticeMessage("");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "メールアドレスを確認できませんでした。もう一度お試しください。");
    } finally {
      setStatus("idle");
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = contactFieldsSchema.safeParse(form);

    if (!parsed.success || !challengeId || !verificationProof) {
      setTouched({ name: true, affiliation: true, email: true, details: true, verificationCode: true });
      setStatusMessage(!verificationProof ? "メールアドレスの確認を完了してください。" : CONTACT_FORM_ERROR_MESSAGE);
      return;
    }

    if (challengeIdentity !== JSON.stringify({
      name: parsed.data.name,
      affiliation: parsed.data.affiliation,
      email: parsed.data.email
    })) {
      invalidateChallenge();
      return;
    }

    if (Date.now() > challengeExpiresAt) {
      invalidateChallenge();
      setStatusMessage("確認コードの有効期限が切れました。新しいコードを送信してください。");
      return;
    }

    const stableRequestId = submissionRequestIdRef.current || crypto.randomUUID();
    submissionRequestIdRef.current = stableRequestId;
    setStatus("submitting");
    setStatusMessage("");
    setServerErrors({});

    try {
      const response = await fetch(CONTACT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          ...parsed.data,
          challengeId,
          verificationProof,
          requestId: stableRequestId,
          website: honeypotRef.current?.value ?? ""
        })
      });
      const result = await response.json() as {
        fieldErrors?: FieldErrors;
        message?: string;
        ok?: boolean;
      };

      if (!response.ok || !result.ok) {
        setServerErrors(result.fieldErrors ?? {});
        throw new Error(result.message || "お問い合わせを送信できませんでした。時間をおいて再度お試しください。");
      }

      setStatus("success");
    } catch (error) {
      setStatus("idle");
      setStatusMessage(error instanceof Error ? error.message : "お問い合わせを送信できませんでした。時間をおいて再度お試しください。");
    }
  };

  if (status === "success") {
    return (
      <section className={`${styles.formCard} ${styles.successCard}`} aria-labelledby="success-title">
        <div className={styles.successIcon} aria-hidden="true">✓</div>
        <h1 id="success-title">お問い合わせを受け付けました</h1>
        <p>
          <strong>{form.name.trim()} さん</strong><br />
          受付メールを <span>{form.email.trim().toLowerCase()}</span> に送信しました。
        </p>
        <p className={styles.successNote}>内容を確認のうえ、COMPASSよりご連絡します。</p>
        <a className={styles.homeButton} href="/">COMPASS公式サイトへ戻る</a>
      </section>
    );
  }

  return (
    <section className={styles.formCard} aria-labelledby="form-title">
      <div className={styles.formHeading}>
        <p className={styles.formKicker}>CONTACT</p>
        <h1 id="form-title">COMPASS お問い合わせフォーム</h1>
        <p>Webサイト、イベント、講演、共同企画、取材、共同開発など、COMPASSに関するお問い合わせを受け付けています。</p>
        <p>学生・教職員・団体・企業の方など、どなたでもお気軽にお問い合わせください。</p>
      </div>

      <form id="contact-form" noValidate aria-busy={status !== "idle"} onSubmit={handleSubmit}>
        <div className={styles.fieldGroup}>
          <label htmlFor="name">お名前 <RequiredBadge /></label>
          <div className={styles.inputWrap}>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              minLength={2}
              maxLength={20}
              required
              value={form.name}
              aria-invalid={hasError("name")}
              aria-describedby={describedBy("name")}
              onBlur={() => markTouched("name")}
              onChange={(event) => updateField("name", event.target.value)}
            />
            <FieldValid visible={hasValidValue("name")} />
          </div>
          <FieldError id="name-error" visible={hasError("name")} />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="affiliation">学部・学科 / 所属 <RequiredBadge /></label>
          <div className={styles.inputWrap}>
            <input
              id="affiliation"
              name="affiliation"
              type="text"
              autoComplete="organization"
              minLength={2}
              maxLength={20}
              required
              value={form.affiliation}
              aria-invalid={hasError("affiliation")}
              aria-describedby={describedBy("affiliation")}
              onBlur={() => markTouched("affiliation")}
              onChange={(event) => updateField("affiliation", event.target.value)}
            />
            <FieldValid visible={hasValidValue("affiliation")} />
          </div>
          <FieldError id="affiliation-error" visible={hasError("affiliation")} />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="email">メールアドレス <RequiredBadge /></label>
          <div className={styles.inputWrap}>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              minLength={5}
              maxLength={50}
              required
              value={form.email}
              aria-invalid={hasError("email")}
              aria-describedby={describedBy("email")}
              onBlur={() => markTouched("email")}
              onChange={(event) => updateField("email", event.target.value)}
            />
            <FieldValid visible={hasValidValue("email")} />
          </div>
          <FieldError id="email-error" visible={hasError("email")} />
        </div>

        <div className={styles.verificationPanel}>
          <div>
            <h2>メールアドレスの確認</h2>
            <p>お問い合わせの送信には、メールアドレスの確認が必要です。</p>
            <p>入力したメールアドレスへ、6桁の確認コードを送信します。</p>
          </div>

          {noticeMessage && <p className={styles.statusNotice} role="status">{noticeMessage}</p>}

          {!verificationProof ? (
            <>
              <div className={styles.securityBox}>
                {turnstileSiteKey ? (
                  <div ref={turnstileContainerRef} className={styles.turnstile} />
                ) : (
                  <p className={styles.configurationError} role="alert">現在送信できません。時間をおいて再度お試しください。</p>
                )}
              </div>

              <button
                className={styles.secondaryButton}
                type="button"
                disabled={!canRequestCode}
                onClick={requestCode}
              >
                {status === "requesting_code" ? "送信しています…" : challengeId ? "確認コードを再送" : "確認コードを送信"}
              </button>

              {challengeId && (
                <div className={styles.codeField}>
                  <label htmlFor="verificationCode">確認コード</label>
                  <p className={styles.codeHelper} id="verification-code-helper">メールに記載された6桁のコードを入力してください。</p>
                  <input
                    id="verificationCode"
                    name="verificationCode"
                    type="text"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    required
                    value={verificationCode}
                    aria-invalid={hasError("verificationCode")}
                    aria-describedby={describedBy("verificationCode", "verification-code-helper")}
                    onBlur={() => markTouched("verificationCode")}
                    onChange={(event) => {
                      setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                      setVerificationProof("");
                      setServerErrors((current) => ({ ...current, verificationCode: undefined }));
                      setStatusMessage("");
                      verificationRequestIdRef.current = "";
                      submissionRequestIdRef.current = "";
                    }}
                  />
                  <FieldError id="verificationCode-error" visible={hasError("verificationCode")} />
                  <button
                    className={styles.verifyButton}
                    type="button"
                    disabled={!canVerifyCode}
                    onClick={verifyCode}
                  >
                    {status === "verifying_code" ? "確認しています…" : "メールアドレスを確認"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className={styles.verifiedStatus} role="status">
              <span aria-hidden="true">✓</span>
              メールアドレスの確認が完了しました。
            </p>
          )}
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="details">お問い合わせ内容 <RequiredBadge /></label>
          <div className={styles.helper} id="details-helper">
            <p>ご質問、ご相談、参加希望、企画のご提案などをご記入ください。</p>
            <p>時期や対象、実施したい内容などが決まっている場合は、あわせてご記入ください。</p>
          </div>
          <div className={`${styles.inputWrap} ${styles.textareaWrap}`}>
            <textarea
              id="details"
              name="details"
              rows={7}
              minLength={10}
              maxLength={1000}
              required
              value={form.details}
              aria-invalid={hasError("details")}
              aria-describedby={describedBy("details", "details-helper")}
              onBlur={() => markTouched("details")}
              onChange={(event) => updateField("details", event.target.value)}
            />
            <FieldValid visible={hasValidValue("details")} />
          </div>
          <div className={styles.textareaMeta}>
            <FieldError id="details-error" visible={hasError("details")} />
            <span>{form.details.length} / 1000</span>
          </div>
        </div>

        <div className={styles.honeypot} aria-hidden="true">
          <label htmlFor="website">ウェブサイト</label>
          <input ref={honeypotRef} id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <Script
          id="cloudflare-turnstile-contact"
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setTurnstileReady(true)}
          onReady={() => setTurnstileReady(true)}
        />

        {statusMessage && <p className={styles.statusError} role="alert">{statusMessage}</p>}

        <button className={styles.submitButton} type="submit" disabled={!canSubmit}>
          <span>{status === "submitting" ? "送信しています…" : "お問い合わせを送信"}</span>
          <span aria-hidden="true">→</span>
        </button>
      </form>
    </section>
  );
}
