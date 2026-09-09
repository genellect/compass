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

type ContactTarget = "representative" | "compass";

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

type AudienceEntry = {
  audience: string;
  description: string;
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

const MESSAGE_MAX_LENGTH = 980;

const targetContent: Record<ContactTarget, {
  cardDescription: string;
  cardTitle: string;
  entries: AudienceEntry[];
  messagePrefix: string;
  submitLabel: string;
  successLabel: string;
}> = {
  representative: {
    cardTitle: "代表へのご連絡",
    cardDescription: "Yuto Matsui",
    messagePrefix: "【送信先：代表】",
    submitLabel: "代表へ送信",
    successLabel: "代表",
    entries: [
      { audience: "学生の方", description: "進路や挑戦に関する相談、意見交換、コミュニティへの参加" },
      { audience: "企業の方", description: "共同開発、受託開発、プロジェクトのご依頼、講演" },
      { audience: "教職員の方", description: "講演、教育連携、授業・教育活動に関するご相談" },
      { audience: "研究者の方", description: "共同研究のご相談、学会参加" }
    ]
  },
  compass: {
    cardTitle: "COMPASSへのお問い合わせ",
    cardDescription: "活動・サービスに関する公式窓口",
    messagePrefix: "【送信先：COMPASS】",
    submitLabel: "COMPASSへ送信",
    successLabel: "COMPASS",
    entries: [
      { audience: "教職員・教育機関の方", description: "授業での活用、教育連携、導入に関するお問い合わせ" },
      { audience: "企業・団体の方", description: "連携・協力、取材に関するお問い合わせ" },
      { audience: "学生の方", description: "活動・サービスに関する質問、不具合のご報告、ご意見" }
    ]
  }
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

function TargetCard({
  checked,
  description,
  onChange,
  title,
  value
}: {
  checked: boolean;
  description: string;
  onChange: (target: ContactTarget) => void;
  title: string;
  value: ContactTarget;
}) {
  return (
    <label className={`${styles.targetCard} ${checked ? styles.targetCardSelected : ""}`}>
      <input
        checked={checked}
        name="contactTarget"
        onChange={() => onChange(value)}
        required
        type="radio"
        value={value}
      />
      <span className={styles.targetCardCopy}>
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <span className={styles.targetIndicator} aria-hidden="true"><span /></span>
    </label>
  );
}

function AudiencePanel({ target }: { target: ContactTarget }) {
  const content = targetContent[target];
  return (
    <section className={styles.audiencePanel} aria-labelledby="audience-title">
      <div className={styles.sectionHeading}>
        <p>WHO THIS IS FOR</p>
        <h2 id="audience-title">{content.cardTitle}</h2>
      </div>
      <div className={`${styles.audienceGrid} ${target === "compass" ? styles.audienceGridCompact : ""}`}>
        {content.entries.map((entry) => (
          <article className={styles.audienceCard} key={entry.audience}>
            <h3>{entry.audience}</h3>
            <p>{entry.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function identityKey(form: LocalFormState) {
  const parsed = contactIdentityFieldsSchema.safeParse(form);
  return parsed.success ? JSON.stringify(parsed.data) : "";
}

export function ContactForm() {
  const [contactTarget, setContactTarget] = useState<ContactTarget | "">("");
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
  const canRequestCode = Boolean(contactTarget) && identityValidation.success && Boolean(turnstileToken) && status === "idle";
  const canVerifyCode = (
    /^\d{6}$/.test(verificationCode) &&
    Boolean(challengeId) &&
    challengeIdentity === identityKey(form) &&
    !verificationProof &&
    status === "idle"
  );
  const canSubmit = (
    Boolean(contactTarget) &&
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

  const invalidateChallenge = (message = "入力内容を変更したため、確認コードを再送してください。") => {
    if (!challengeId && !verificationProof) return;
    setChallengeId("");
    setChallengeIdentity("");
    setChallengeExpiresAt(0);
    setVerificationCode("");
    setVerificationProof("");
    verificationRequestIdRef.current = "";
    submissionRequestIdRef.current = "";
    setNoticeMessage(message);
  };

  const updateTarget = (target: ContactTarget) => {
    if (status !== "idle" || contactTarget === target) return;
    invalidateChallenge("宛先を変更したため、確認コードを再送してください。");
    setContactTarget(target);
    setStatusMessage("");
    codeRequestIdRef.current = "";
    submissionRequestIdRef.current = "";
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
    if (!identity.success || !turnstileToken || !contactTarget) {
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

    if (!parsed.success || !challengeId || !verificationProof || !contactTarget) {
      setTouched({ name: true, affiliation: true, email: true, details: true, verificationCode: true });
      setStatusMessage(!verificationProof ? "メールアドレスの確認を完了してください。" : CONTACT_FORM_ERROR_MESSAGE);
      return;
    }

    if (challengeIdentity !== identityKey(form)) {
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
          details: `${targetContent[contactTarget].messagePrefix}\n${parsed.data.details}`,
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

  if (status === "success" && contactTarget) {
    return (
      <section className={`${styles.contactSurface} ${styles.successCard}`} aria-labelledby="success-title">
        <div className={styles.successIcon} aria-hidden="true">✓</div>
        <p className={styles.formKicker}>MESSAGE RECEIVED</p>
        <h1 id="success-title">ご連絡を受け付けました</h1>
        <p className={styles.successDestination}>送信先：{targetContent[contactTarget].successLabel}</p>
        <p>受付メールを <span>{form.email.trim().toLowerCase()}</span> に送信しました。</p>
        <a className={styles.homeButton} href="/">トップページへ</a>
      </section>
    );
  }

  return (
    <section className={styles.contactSurface} aria-labelledby="form-title">
      <form id="contact-form" noValidate aria-busy={status !== "idle"} onSubmit={handleSubmit}>
        <div className={styles.introStage}>
          <div className={styles.formHeading}>
            <p className={styles.formKicker}>CONTACT</p>
            <h1 id="form-title">お問い合わせ</h1>
            <p className={styles.formIntro}>COMPASSへの公式お問い合わせと、代表へのご連絡を受け付けています。</p>
            <p>学生・教職員・研究者の方、団体・企業の方など、さまざまな方とのご縁を歓迎しています。</p>
          </div>

          <section className={styles.targetSection} aria-labelledby="target-title">
            <div className={styles.sectionHeading}>
              <p>DESTINATION</p>
              <h2 id="target-title">どちらへのご連絡ですか？</h2>
            </div>
            <fieldset>
              <legend className={styles.srOnly}>ご連絡先を選択してください</legend>
              <div className={styles.targetGrid}>
                <TargetCard checked={contactTarget === "representative"} description="Yuto Matsui" onChange={updateTarget} title="代表へのご連絡" value="representative" />
                <TargetCard checked={contactTarget === "compass"} description="活動・サービスに関する公式窓口" onChange={updateTarget} title="COMPASSへのお問い合わせ" value="compass" />
              </div>
            </fieldset>
          </section>
        </div>

        {contactTarget ? (
          <div className={styles.revealedFlow} id="contact-flow">
            <AudiencePanel target={contactTarget} />

            <div className={styles.formColumns}>
              <section className={styles.formStage} aria-labelledby="identity-title">
                <div className={styles.sectionHeading}>
                  <p>ABOUT YOU</p>
                  <h2 id="identity-title">お名前と返信先</h2>
                </div>
                <div className={styles.identityFields}>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="name">お名前 <RequiredBadge /></label>
                    <div className={styles.inputWrap}>
                      <input id="name" name="name" type="text" autoComplete="name" minLength={2} maxLength={20} required value={form.name} aria-invalid={hasError("name")} aria-describedby={describedBy("name")} onBlur={() => markTouched("name")} onChange={(event) => updateField("name", event.target.value)} />
                      <FieldValid visible={hasValidValue("name")} />
                    </div>
                    <FieldError id="name-error" visible={hasError("name")} />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label htmlFor="affiliation">所属 <RequiredBadge /></label>
                    <div className={styles.inputWrap}>
                      <input id="affiliation" name="affiliation" type="text" autoComplete="organization" minLength={2} maxLength={20} required value={form.affiliation} aria-invalid={hasError("affiliation")} aria-describedby={describedBy("affiliation", "affiliation-helper")} onBlur={() => markTouched("affiliation")} onChange={(event) => updateField("affiliation", event.target.value)} />
                      <FieldValid visible={hasValidValue("affiliation")} />
                    </div>
                    <p className={styles.helper} id="affiliation-helper">学生：学校名・学部・学年／企業・団体：名称・役職／教職員・研究者：所属機関・役職をご記入ください。</p>
                    <FieldError id="affiliation-error" visible={hasError("affiliation")} />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label htmlFor="email">メールアドレス <RequiredBadge /></label>
                    <div className={styles.inputWrap}>
                      <input id="email" name="email" type="email" autoComplete="email" inputMode="email" minLength={5} maxLength={50} required value={form.email} aria-invalid={hasError("email")} aria-describedby={describedBy("email")} onBlur={() => markTouched("email")} onChange={(event) => updateField("email", event.target.value)} />
                      <FieldValid visible={hasValidValue("email")} />
                    </div>
                    <FieldError id="email-error" visible={hasError("email")} />
                  </div>
                </div>
              </section>

              <section className={`${styles.formStage} ${styles.messageStage}`} aria-labelledby="message-title">
                <div className={styles.sectionHeading}>
                  <p>YOUR MESSAGE</p>
                  <h2 id="message-title">メッセージ</h2>
                </div>
                <p className={styles.helper} id="details-helper">ご質問、ご相談、ご依頼、ご提案など、内容を自由にご記入ください。</p>
                <label className={styles.srOnly} htmlFor="details">メッセージ 必須</label>
                <div className={`${styles.inputWrap} ${styles.textareaWrap}`}>
                  <textarea
                    id="details"
                    name="details"
                    rows={10}
                    minLength={10}
                    maxLength={MESSAGE_MAX_LENGTH}
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
                  <span>{form.details.length} / {MESSAGE_MAX_LENGTH}</span>
                </div>
              </section>
            </div>

            <section className={`${styles.formStage} ${styles.verificationPanel}`} aria-labelledby="verification-title">
              <div className={styles.verificationIntro}>
                <div className={styles.sectionHeading}>
                  <p>EMAIL CHECK</p>
                  <h2 id="verification-title">メールアドレスの確認</h2>
                </div>
                <p>お問い合わせの送信には、メールアドレスの確認が必要です。</p>
                <p>入力したメールアドレスへ、6桁の確認コードを送信します。</p>
              </div>

              <div className={styles.verificationAction}>
                {noticeMessage ? <p className={styles.statusNotice} role="status">{noticeMessage}</p> : null}
                {!verificationProof ? (
                  <>
                    <div className={styles.securityBox}>
                      {turnstileSiteKey ? <div ref={turnstileContainerRef} className={styles.turnstile} /> : <p className={styles.configurationError} role="alert">現在送信できません。時間をおいて再度お試しください。</p>}
                    </div>
                    <button className={styles.secondaryButton} type="button" disabled={!canRequestCode} onClick={requestCode}>
                      {status === "requesting_code" ? "送信しています…" : challengeId ? "確認コードを再送" : "確認コードを受け取る"}
                    </button>
                    {challengeId ? (
                      <div className={styles.codeField}>
                        <label htmlFor="verificationCode">確認コード</label>
                        <p className={styles.codeHelper} id="verification-code-helper">メールに記載された6桁のコードを入力してください。</p>
                        <div className={styles.codeControls}>
                          <input id="verificationCode" name="verificationCode" type="text" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={verificationCode} aria-invalid={hasError("verificationCode")} aria-describedby={describedBy("verificationCode", "verification-code-helper")} onBlur={() => markTouched("verificationCode")} onChange={(event) => { setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setVerificationProof(""); setServerErrors((current) => ({ ...current, verificationCode: undefined })); setStatusMessage(""); verificationRequestIdRef.current = ""; submissionRequestIdRef.current = ""; }} />
                          <button className={styles.verifyButton} type="button" disabled={!canVerifyCode} onClick={verifyCode}>{status === "verifying_code" ? "確認しています…" : "メールアドレスを確認"}</button>
                        </div>
                        <FieldError id="verificationCode-error" visible={hasError("verificationCode")} />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className={styles.verifiedStatus} role="status"><span aria-hidden="true">✓</span>メールアドレス確認済み</p>
                )}
              </div>
            </section>

            <div className={styles.honeypot} aria-hidden="true">
              <label htmlFor="website">ウェブサイト</label>
              <input ref={honeypotRef} id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
            </div>

            <Script id="cloudflare-turnstile-contact" src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={() => setTurnstileReady(true)} onReady={() => setTurnstileReady(true)} />

            <section className={styles.submitStage} aria-label="送信">
              <p className={styles.handlingNote}>メッセージは代表が直接確認します。</p>
              {statusMessage ? <p className={styles.statusError} role="alert">{statusMessage}</p> : null}
              <button className={styles.submitButton} type="submit" disabled={!canSubmit}>
                <span>{status === "submitting" ? "送信しています…" : targetContent[contactTarget].submitLabel}</span>
                <span aria-hidden="true">→</span>
              </button>
            </section>
          </div>
        ) : null}
      </form>
    </section>
  );
}
