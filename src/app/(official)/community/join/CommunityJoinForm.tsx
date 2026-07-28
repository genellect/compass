"use client";

import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  COMMUNITY_REGISTRATION_ENDPOINT,
  communityRegistrationFieldsSchema,
  FORM_ERROR_MESSAGE,
  getFieldErrors,
  INTEREST_OPTIONS,
  TURNSTILE_ACTION,
  YEAR_OPTIONS
} from "@/lib/community-registration-schema";
import styles from "./community-join.module.css";

type LocalFormState = {
  email: string;
  facultyDepartment: string;
  interests: string[];
  motivation: string;
  name: string;
  studentId: string;
  year: string;
};

type FieldName = keyof LocalFormState;
type FieldErrors = Partial<Record<FieldName, string>>;
type SubmissionState = "idle" | "submitting" | "success";

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
  email: "",
  facultyDepartment: "",
  studentId: "",
  year: "",
  interests: [],
  motivation: ""
};

// Turnstile site keys are public. Keep the production key as a safe default so
// Cloudflare's Git build and manual deployments render the same verification UI.
const productionTurnstileSiteKey = "0x4AAAAAAEAGRnQYAAj9svan";
const turnstileSiteKey =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || productionTurnstileSiteKey;

function FieldError({ id, visible }: { id: string; visible: boolean }) {
  if (!visible) return null;
  return <p className={styles.fieldError} id={id} role="alert">{FORM_ERROR_MESSAGE}</p>;
}

function RequiredBadge({ optional = false }: { optional?: boolean }) {
  return <span className={optional ? styles.optional : styles.required}>{optional ? "任意" : "必須"}</span>;
}

export function CommunityJoinForm() {
  const [form, setForm] = useState<LocalFormState>(initialForm);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<SubmissionState>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetRef = useRef<string | null>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef("");

  const validation = useMemo(() => communityRegistrationFieldsSchema.safeParse(form), [form]);
  const clientErrors = validation.success ? {} : getFieldErrors(validation.error);
  const visibleErrors = { ...clientErrors, ...serverErrors };
  const canSubmit = validation.success && Boolean(turnstileToken) && status === "idle";

  useEffect(() => {
    if (!turnstileReady || !turnstileSiteKey || !turnstileContainerRef.current || !window.turnstile) return;

    const widgetId = window.turnstile.render(turnstileContainerRef.current, {
      sitekey: turnstileSiteKey,
      action: TURNSTILE_ACTION,
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

  const updateField = (field: FieldName, value: string | string[]) => {
    if (status !== "idle") return;
    setForm((current) => ({ ...current, [field]: value }));
    setServerErrors((current) => ({ ...current, [field]: undefined }));
    setStatusMessage("");
    requestIdRef.current = "";
  };

  const markTouched = (field: FieldName) => setTouched((current) => ({ ...current, [field]: true }));
  const hasError = (field: FieldName) => {
    const value = form[field];
    const hasValue = Array.isArray(value) ? value.length > 0 : value.length > 0;
    return Boolean(visibleErrors[field] && (touched[field] || hasValue));
  };
  const describedBy = (field: FieldName, helperId?: string) =>
    [helperId, hasError(field) ? `${field}-error` : undefined].filter(Boolean).join(" ") || undefined;

  const toggleInterest = (interest: string) => {
    const interests = form.interests.includes(interest)
      ? form.interests.filter((item) => item !== interest)
      : [...form.interests, interest];
    updateField("interests", interests);
    markTouched("interests");
  };

  const resetTurnstile = () => {
    setTurnstileToken("");
    if (window.turnstile && turnstileWidgetRef.current) window.turnstile.reset(turnstileWidgetRef.current);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = communityRegistrationFieldsSchema.safeParse(form);

    if (!parsed.success || !turnstileToken) {
      setTouched({
        name: true,
        email: true,
        facultyDepartment: true,
        studentId: true,
        year: true,
        interests: true,
        motivation: true
      });
      setStatusMessage(turnstileToken ? FORM_ERROR_MESSAGE : "「私はロボットではありません」を確認してください。");
      return;
    }

    const stableRequestId = requestIdRef.current || crypto.randomUUID();
    requestIdRef.current = stableRequestId;
    setStatus("submitting");
    setStatusMessage("");
    setServerErrors({});

    try {
      const response = await fetch(COMMUNITY_REGISTRATION_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...parsed.data,
          requestId: stableRequestId,
          turnstileToken,
          website: honeypotRef.current?.value ?? ""
        })
      });
      const result = await response.json() as {
        fieldErrors?: FieldErrors;
        message?: string;
        ok?: boolean;
        requestId?: string;
      };

      if (!response.ok || !result.ok) {
        setServerErrors(result.fieldErrors ?? {});
        setTouched((current) => ({ ...current, ...Object.fromEntries(Object.keys(result.fieldErrors ?? {}).map((key) => [key, true])) }));
        throw new Error(result.message || "送信を完了できませんでした。時間をおいて再度お試しください。");
      }

      setStatus("success");
    } catch (error) {
      setStatus("idle");
      setStatusMessage(error instanceof Error ? error.message : "送信を完了できませんでした。時間をおいて再度お試しください。");
      resetTurnstile();
    }
  };

  if (status === "success") {
    return (
      <section className={`${styles.formCard} ${styles.successCard}`} aria-labelledby="success-title">
        <div className={styles.successIcon} aria-hidden="true">✓</div>
        <h2 id="success-title">参加登録を受け付けました</h2>
        <p>
          <strong>{form.name.trim()} さん</strong><br />
          受付メールを <span>{form.email.trim().toLowerCase()}</span> に送信しました。
        </p>
        <p className={styles.successNote}>内容を確認後、代表よりご連絡します。メールが見当たらない場合は迷惑メールフォルダもご確認ください。</p>
        <a className={styles.homeButton} href="/">COMPASS公式サイトへ戻る</a>
      </section>
    );
  }

  return (
    <section className={styles.formCard} aria-labelledby="form-title">
      <div className={styles.formHeading}>
        <h1 id="form-title">COMPASS Communityに参加する</h1>
        <p>必要事項をご入力ください。登録後、学生メールアドレスにご案内をお送りします。</p>
      </div>

      <form id="registration-form" noValidate aria-busy={status === "submitting"} onSubmit={handleSubmit}>
        <div className={styles.fieldGroup}>
          <label htmlFor="name">氏名 <RequiredBadge /></label>
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
            placeholder="例：北里花子"
          />
          <FieldError id="name-error" visible={hasError("name")} />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="email">学生メールアドレス <RequiredBadge /></label>
          <p className={styles.helper} id="email-helper">北里大学の学生メールアドレスのみ入力可能です。</p>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            required
            value={form.email}
            aria-invalid={hasError("email")}
            aria-describedby={describedBy("email", "email-helper")}
            onBlur={() => markTouched("email")}
            onChange={(event) => updateField("email", event.target.value)}
          />
          <FieldError id="email-error" visible={hasError("email")} />
        </div>

        <div className={styles.twoColumns}>
          <div className={styles.fieldGroup}>
            <label htmlFor="facultyDepartment">学部・学科 <RequiredBadge /></label>
            <input
              id="facultyDepartment"
              name="facultyDepartment"
              type="text"
              autoComplete="organization"
              minLength={5}
              maxLength={30}
              required
              value={form.facultyDepartment}
              aria-invalid={hasError("facultyDepartment")}
              aria-describedby={describedBy("facultyDepartment")}
              onBlur={() => markTouched("facultyDepartment")}
              onChange={(event) => updateField("facultyDepartment", event.target.value)}
              placeholder="例：薬学部 薬学科"
            />
            <FieldError id="facultyDepartment-error" visible={hasError("facultyDepartment")} />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="studentId">学籍番号 <RequiredBadge /></label>
            <input
              id="studentId"
              name="studentId"
              type="text"
              autoCapitalize="characters"
              inputMode="text"
              maxLength={8}
              pattern="[A-Za-z]{2}[0-9]{5,6}"
              required
              value={form.studentId}
              aria-invalid={hasError("studentId")}
              aria-describedby={describedBy("studentId")}
              onBlur={() => markTouched("studentId")}
              onChange={(event) => updateField("studentId", event.target.value)}
              placeholder="例：PP00000"
            />
            <FieldError id="studentId-error" visible={hasError("studentId")} />
          </div>
        </div>

        <fieldset className={styles.fieldset} aria-describedby={hasError("year") ? "year-error" : undefined}>
          <legend>学年 <RequiredBadge /></legend>
          <div className={styles.choiceGrid}>
            {YEAR_OPTIONS.map((year) => (
              <label className={styles.choice} key={year}>
                <input
                  type="radio"
                  name="year"
                  value={year}
                  checked={form.year === year}
                  onChange={() => {
                    updateField("year", year);
                    markTouched("year");
                  }}
                />
                <span>{year}</span>
              </label>
            ))}
          </div>
          <FieldError id="year-error" visible={hasError("year")} />
        </fieldset>

        <fieldset className={styles.fieldset} aria-describedby={describedBy("interests", "interests-helper")}>
          <legend>やってみたい活動 <RequiredBadge /></legend>
          <p className={styles.helper} id="interests-helper">複数選択できます。</p>
          <div className={`${styles.choiceGrid} ${styles.interestGrid}`}>
            {INTEREST_OPTIONS.map((interest) => (
              <label className={styles.choice} key={interest}>
                <input
                  type="checkbox"
                  name="interests"
                  value={interest}
                  checked={form.interests.includes(interest)}
                  onChange={() => toggleInterest(interest)}
                />
                <span>{interest}</span>
              </label>
            ))}
          </div>
          <FieldError id="interests-error" visible={hasError("interests")} />
        </fieldset>

        <div className={styles.fieldGroup}>
          <label htmlFor="motivation">興味を持った理由や、やってみたいことがあればご記入ください <RequiredBadge optional /></label>
          <textarea
            id="motivation"
            name="motivation"
            rows={2}
            maxLength={1000}
            value={form.motivation}
            aria-invalid={hasError("motivation")}
            aria-describedby={describedBy("motivation")}
            onBlur={() => markTouched("motivation")}
            onChange={(event) => updateField("motivation", event.target.value)}
          />
          <FieldError id="motivation-error" visible={hasError("motivation")} />
        </div>

        <div className={styles.honeypot} aria-hidden="true">
          <label htmlFor="website">ウェブサイト</label>
          <input ref={honeypotRef} id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div className={styles.securityBox}>
          {turnstileSiteKey ? (
            <div ref={turnstileContainerRef} className={styles.turnstile} />
          ) : (
            <p className={styles.configurationError} role="alert">現在送信できません。時間をおいて再度お試しください。</p>
          )}
        </div>

        <Script
          id="cloudflare-turnstile"
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setTurnstileReady(true)}
          onReady={() => setTurnstileReady(true)}
        />

        {statusMessage && <p className={styles.statusError} role="alert">{statusMessage}</p>}

        <button className={styles.submitButton} type="submit" disabled={!canSubmit}>
          <span>{status === "submitting" ? "送信しています…" : "参加を申し込む"}</span>
          <span aria-hidden="true">→</span>
        </button>
      </form>
    </section>
  );
}
