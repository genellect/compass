"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { SiteHeader } from "../components/SiteHeader";
import { GoogleSignInButton } from "./GoogleSignInButton";
import {
  createSubmissionKey,
  evaluateEligibility,
  isStudentNumberValid,
  isStudentRole,
  reasonMessages,
  statusLabels
} from "./eligibility";
import type {
  AcademicRole,
  AccountFacts,
  EligibilityResult,
  FacultyCode,
  RegistrationInput
} from "./eligibility";
import {
  Phase6ApiError,
  getPhase7RegistrationStatus,
  isTrustedRegistrationPreviewLocation,
  readPhase6RuntimeConfig,
  submitPhase6Registration,
  verifyGoogleCredential
} from "./phase6Client";

const PUBLIC_PHASE6_ENVIRONMENT = {
  NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE:
    process.env.NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE,
  NEXT_PUBLIC_LIBRARY_API_BASE_URL:
    process.env.NEXT_PUBLIC_LIBRARY_API_BASE_URL,
  NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID:
    process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID,
  NEXT_PUBLIC_LIBRARY_GOOGLE_HOSTED_DOMAIN:
    process.env.NEXT_PUBLIC_LIBRARY_GOOGLE_HOSTED_DOMAIN
};
const REGISTRATION_PREVIEW_BUILD =
  process.env.NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE !== "google"
  && process.env.NEXT_PUBLIC_LIBRARY_UI_REVIEW !== "true";
import type {
  DriveAccessStatus,
  DriveNotificationStatus,
  Phase6Authentication,
  Phase6RegistrationResult
} from "./phase6Client";

type MockAccountKey = "student" | "university";

const MOCK_ACCOUNTS: Record<MockAccountKey, AccountFacts & { label: string; note: string }> = {
  student: {
    label: "大学アカウント（学生）",
    note: "学生として続けます",
    verified: true,
    tokenValid: true,
    emailVerified: true,
    email: "student@st.kitasato-u.ac.jp",
    hostedDomain: "kitasato-u.ac.jp",
    allowedHostedDomains: ["kitasato-u.ac.jp"]
  },
  university: {
    label: "大学アカウント（教職員等）",
    note: "教職員等として続けます",
    verified: true,
    tokenValid: true,
    emailVerified: true,
    email: "teacher@pharm.kitasato-u.ac.jp",
    hostedDomain: "kitasato-u.ac.jp",
    allowedHostedDomains: ["kitasato-u.ac.jp"]
  }
};

const initialForm: RegistrationInput = {
  fullName: "",
  academicRole: "",
  faculty: "",
  grade: "",
  studentNumber: "",
  termsAccepted: false,
  privacyAccepted: false,
  question: ""
};

const undergraduateGrades = ["1", "2", "3", "4", "5", "6"].map((grade) => ({
  value: grade,
  label: `${grade}年`
}));
const masterGrades = [
  { value: "1", label: "修士1年" },
  { value: "2", label: "修士2年" }
];

export function RegistrationMvp() {
  const runtimeConfig = useMemo(
    () => readPhase6RuntimeConfig(PUBLIC_PHASE6_ENVIRONMENT),
    []
  );
  const usesGoogleAuthentication = runtimeConfig.mode === "google";
  const [previewHostAllowed, setPreviewHostAllowed] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<MockAccountKey>("student");
  const [isMockAuthenticated, setIsMockAuthenticated] = useState(false);
  const [googleAuthentication, setGoogleAuthentication] = useState<Phase6Authentication | null>(null);
  const [authenticationError, setAuthenticationError] = useState<string | null>(null);
  const [isCheckingAuthentication, setIsCheckingAuthentication] = useState(false);
  const [form, setForm] = useState<RegistrationInput>(initialForm);
  const [submittedResult, setSubmittedResult] = useState<
    EligibilityResult | Phase6RegistrationResult | null
  >(null);
  const [submittedKeys, setSubmittedKeys] = useState<Set<string>>(() => new Set());
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshingDriveStatus, setIsRefreshingDriveStatus] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [termsReviewed, setTermsReviewed] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [privacyReviewed, setPrivacyReviewed] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const previewEnabled = REGISTRATION_PREVIEW_BUILD && previewHostAllowed;

  useEffect(() => {
    setPreviewHostAllowed(
      REGISTRATION_PREVIEW_BUILD
      && isTrustedRegistrationPreviewLocation(window.location)
    );
  }, []);

  const isAuthenticated = usesGoogleAuthentication
    ? googleAuthentication !== null
    : previewEnabled && isMockAuthenticated;
  const account = useMemo<AccountFacts>(() => ({
    ...(usesGoogleAuthentication && googleAuthentication
      ? {
          verified: true,
          tokenValid: true,
          emailVerified: true,
          email: googleAuthentication.email,
          hostedDomain: googleAuthentication.hostedDomain,
          allowedHostedDomains: [runtimeConfig.expectedHostedDomain]
        }
      : MOCK_ACCOUNTS[selectedAccount]),
    verified: isAuthenticated
  }), [
    googleAuthentication,
    isAuthenticated,
    runtimeConfig.expectedHostedDomain,
    selectedAccount,
    usesGoogleAuthentication
  ]);
  const hasAllowedWorkspaceAccount = Boolean(
    isAuthenticated &&
    account.tokenValid &&
    account.emailVerified &&
    account.allowedHostedDomains.includes(account.hostedDomain)
  );
  const requiresStudentDetails = isStudentRole(form.academicRole);
  const gradeOptions = form.academicRole === "master" ? masterGrades : undergraduateGrades;
  const preview = useMemo(
    () => evaluateEligibility(account, form),
    [account, form]
  );
  const studentNumberHasError =
    requiresStudentDetails &&
    form.studentNumber.length > 0 &&
    !isStudentNumberValid(form.studentNumber);
  const canSubmit = hasAllowedWorkspaceAccount && preview.status !== "not_ready" && !isSubmitting;

  function resetSubmissionResult() {
    setSubmittedResult(null);
    setSubmissionError(null);
    idempotencyKeyRef.current = null;
  }

  function updateForm<K extends keyof RegistrationInput>(key: K, value: RegistrationInput[K]) {
    resetSubmissionResult();
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateRole(role: AcademicRole) {
    resetSubmissionResult();
    setForm((current) => ({
      ...current,
      academicRole: role,
      grade: isStudentRole(role) ? current.grade : "",
      studentNumber: isStudentRole(role) ? current.studentNumber : "",
      termsAccepted: isStudentRole(role) ? current.termsAccepted : false
    }));
  }

  function authenticateMockAccount() {
    if (!previewEnabled) return;
    resetSubmissionResult();
    setIsMockAuthenticated(true);
  }

  function clearAccount() {
    resetSubmissionResult();
    setIsCheckingAuthentication(false);
    setIsMockAuthenticated(false);
    setGoogleAuthentication(null);
    setAuthenticationError(null);
  }

  const handleGoogleCredential = useCallback(async (credential: string) => {
    setAuthenticationError(null);
    setIsCheckingAuthentication(true);
    try {
      const authentication = await verifyGoogleCredential(
        runtimeConfig,
        credential
      );
      setGoogleAuthentication(authentication);
      setSubmittedResult(null);
      setSubmissionError(null);
      idempotencyKeyRef.current = null;
    } catch (error) {
      setGoogleAuthentication(null);
      setAuthenticationError(authenticationErrorMessage(error));
    } finally {
      setIsCheckingAuthentication(false);
    }
  }, [runtimeConfig]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    if (usesGoogleAuthentication) {
      if (!googleAuthentication) return;
      setSubmissionError(null);
      setIsSubmitting(true);
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID();
      }
      try {
        const result = await submitPhase6Registration(
          runtimeConfig,
          googleAuthentication,
          form,
          idempotencyKeyRef.current
        );
        setSubmittedResult(result);
        window.requestAnimationFrame(() => resultRef.current?.focus());
      } catch (error) {
        setSubmissionError(submissionErrorMessage(error));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!previewEnabled) return;
    const submissionKey = createSubmissionKey(account, form);
    const existingRegistration = submittedKeys.has(submissionKey) ? "matching" : "none";
    const result = evaluateEligibility(account, form, { existingRegistration });

    if (result.status === "approved" || result.status === "manual_review") {
      setSubmittedKeys((current) => new Set(current).add(submissionKey));
    }
    setSubmittedResult(result);
    window.requestAnimationFrame(() => resultRef.current?.focus());
  }

  async function handleRefreshDriveStatus() {
    if (
      !usesGoogleAuthentication
      || !googleAuthentication
      || !submittedResult
      || !("applicationId" in submittedResult)
      || !submittedResult.applicationId
    ) return;
    setSubmissionError(null);
    setIsRefreshingDriveStatus(true);
    try {
      const status = await getPhase7RegistrationStatus(
        runtimeConfig,
        googleAuthentication,
        submittedResult.applicationId
      );
      setSubmittedResult((current) => current && "applicationId" in current
        ? { ...current, ...status }
        : current);
    } catch (error) {
      setSubmissionError(submissionErrorMessage(error));
    } finally {
      setIsRefreshingDriveStatus(false);
    }
  }

  return (
    <>
      <SiteHeader routeContext="library" hideLibraryRegistrationAction />
      <main className="registration-app" id="main">
        <span
          className="sr-only"
          aria-hidden="true"
          data-registration-runtime={usesGoogleAuthentication
            ? "GOOGLE API"
            : previewEnabled
              ? "LOCAL MOCK"
              : "REGISTRATION DISABLED"}
        />

        <section className="registration-page-heading" aria-labelledby="registration-title">
          <p>FUTURE STRATEGY LIBRARY</p>
          <h1 id="registration-title">ようこそ、<br />未来戦略ライブラリへ。</h1>
          <p>必要事項を入力してください。現在は北里大学薬学部生の方を対象としており、登録は3分ほどで完了します。</p>
        </section>

        <div className="registration-grid">
        <form
          id="registration-form"
          className="registration-form"
          onSubmit={handleSubmit}
          noValidate
          tabIndex={-1}
          aria-busy={isSubmitting}
        >
          <section className="form-section" aria-labelledby="account-heading">
            <SectionHeading number="01" eyebrow="UNIVERSITY ACCOUNT" id="account-heading">
              大学アカウント認証
            </SectionHeading>

            {!isAuthenticated ? (
              <div className="account-panel account-panel-stacked">
                {usesGoogleAuthentication ? (
                  <>
                    <div className="account-copy">
                      <strong>北里大学のアカウントで続ける</strong>
                      <p>北里大学のGoogle Workspaceアカウントを選択してください。</p>
                    </div>
                    {runtimeConfig.ready ? (
                      <GoogleSignInButton
                        clientId={runtimeConfig.googleClientId}
                        hostedDomain={runtimeConfig.expectedHostedDomain}
                        onCredential={handleGoogleCredential}
                        onError={() => setAuthenticationError("Google認証画面を読み込めませんでした。時間を置いて再試行してください。")}
                      />
                    ) : (
                      <p className="integration-message is-error" role="alert">
                        現在、大学アカウント確認を利用できません。時間を置いて再試行してください。
                      </p>
                    )}
                    {isCheckingAuthentication && (
                      <p className="integration-message" role="status">大学アカウントを確認しています。</p>
                    )}
                    {authenticationError && (
                      <p className="integration-message is-error" role="alert">{authenticationError}</p>
                    )}
                    <small className="security-note">
                      認証情報はGoogle側で照合され、パスワードなどは保存されません。
                    </small>
                  </>
                ) : previewEnabled ? (
                  <>
                    <div className="account-copy">
                      <strong>北里大学のアカウントで続ける</strong>
                      <p>登録に使用するアカウントを選択してください。</p>
                    </div>
                    <label className="mock-account-select">
                      <span>使用するアカウント</span>
                      <select
                        value={selectedAccount}
                        onChange={(event) => setSelectedAccount(event.target.value as MockAccountKey)}
                        aria-label="使用するアカウント"
                      >
                        {Object.entries(MOCK_ACCOUNTS).map(([key, mockAccount]) => (
                          <option value={key} key={key}>{mockAccount.label}</option>
                        ))}
                      </select>
                      <small>{MOCK_ACCOUNTS[selectedAccount].note}</small>
                    </label>
                    <button className="button button-primary" type="button" onClick={authenticateMockAccount}>
                      このアカウントで続ける
                    </button>
                  </>
                ) : (
                  <p className="integration-message is-error" role="alert">
                    現在、利用登録を受け付けていません。時間をおいて再度お試しください。
                  </p>
                )}
              </div>
            ) : (
              <div className="verified-account" role="status">
                <span className="verified-icon" aria-hidden="true">
                  ✓
                </span>
                <div>
                  <strong>成功しました！</strong>
                  <small>{account.email}</small>
                </div>
                <button className="text-button" type="button" onClick={clearAccount}>解除</button>
              </div>
            )}
          </section>

          <section className="form-section" aria-labelledby="profile-heading">
            <SectionHeading number="02" eyebrow="ACADEMIC PROFILE" id="profile-heading">
              登録情報
            </SectionHeading>

            <div className="field-grid">
              <label className="field field-wide">
                <span>氏名 <em>必須</em></span>
                <input
                  autoComplete="name"
                  value={form.fullName}
                  onChange={(event) => updateForm("fullName", event.target.value)}
                  placeholder="例：北里 花子"
                  maxLength={200}
                  required
                />
              </label>

              <label className="field field-wide">
                <span>所属 <em>必須</em></span>
                <select
                  value={form.faculty}
                  onChange={(event) => updateForm("faculty", event.target.value as FacultyCode)}
                  required
                >
                  <option value="">選択してください</option>
                  <option value="pharmacy">薬学部</option>
                  <option value="other">その他（個別確認）</option>
                </select>
              </label>

              <label className="field">
                <span>在籍区分 <em>必須</em></span>
                <select
                  value={form.academicRole}
                  onChange={(event) => updateRole(event.target.value as AcademicRole)}
                  required
                >
                  <option value="">選択してください</option>
                  <option value="undergraduate">学部生</option>
                  <option value="master">修士課程</option>
                  <option value="doctoral">博士課程（個別確認）</option>
                  <option value="staff">教員・職員・大学担当者（個別確認）</option>
                </select>
              </label>

              {requiresStudentDetails ? (
                <>
                  <label className="field">
                    <span>学年 <em>必須</em></span>
                    <select value={form.grade} onChange={(event) => updateForm("grade", event.target.value)} required>
                      <option value="">選択してください</option>
                      {gradeOptions.map((grade) => (
                        <option value={grade.value} key={grade.value}>{grade.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>学籍番号 <em>必須</em></span>
                    <input
                      autoCapitalize="characters"
                      value={form.studentNumber}
                      onChange={(event) => updateForm("studentNumber", event.target.value)}
                      placeholder="例：PP23000"
                      aria-describedby="student-number-help"
                      aria-invalid={studentNumberHasError}
                      maxLength={32}
                      required
                    />
                    <small id="student-number-help" className={studentNumberHasError ? "field-error" : "field-help"}>
                      {studentNumberHasError
                        ? "PP・PL・MPのいずれか＋数字5桁で入力してください。"
                        : "学籍の確認に使用します。半角・全角、小文字は送信前に正規化されます。"}
                    </small>
                  </label>
                </>
              ) : form.academicRole ? (
                <div className="conditional-note field-wide" role="note">
                  <strong>学籍番号の入力は不要です</strong>
                  <p>この在籍区分はライブラリ共有フォルダへ自動追加せず、運営者が内容を確認します。</p>
                </div>
              ) : null}

            </div>
          </section>

          <section className="form-section" aria-labelledby="agreement-heading">
            <SectionHeading number="03" eyebrow="AGREEMENT" id="agreement-heading">
              利用条件の確認
            </SectionHeading>

            <div className="agreement-disclosure">
              <button
                className="agreement-trigger"
                type="button"
                aria-expanded={termsOpen}
                aria-controls="terms-content"
                onClick={() => {
                  const nextOpen = !termsOpen;
                  setTermsOpen(nextOpen);
                  if (nextOpen) setTermsReviewed(true);
                }}
              >
                <span><strong>利用規約</strong><small>全5項目</small></span>
                <span aria-hidden="true">{termsOpen ? "−" : "+"}</span>
              </button>
              {termsOpen && (
                <div id="terms-content" className="agreement-copy agreement-content">
                  <p>
                    本ライブラリは、北里大学薬学部生の学習・研究・進路形成を支援することを目的として運営されています。
                  </p>
                  <p>
                    試験対策資料、英語学習資料、研究・進路に関する資料などを、利用者の皆様に安心して活用していただくため、
                    利用ルールを設けています。本ライブラリが今後も後輩たちへ受け継がれていくよう、以下の内容をご確認のうえ、
                    ご協力をお願いいたします。
                  </p>
                  <ol>
                    <li>本ライブラリ内の資料を学習・研究目的以外で利用しません。</li>
                    <li>本ライブラリ内の資料を第三者へ無断共有・再配布しません。</li>
                    <li>本ライブラリ内の資料の転載・改変・商用利用を行いません。</li>
                    <li>本ライブラリ内の資料を、外部の資料共有プラットフォーム、SNS、Webサイト等へ掲載しません。</li>
                    <li>利用規約に違反した場合、アクセス権の停止等の措置が行われる場合があることを理解しています。</li>
                  </ol>
                </div>
              )}
            </div>

            <label className={`check-row${termsReviewed ? "" : " is-locked"}`}>
              <input
                type="checkbox"
                checked={form.termsAccepted}
                onChange={(event) => updateForm("termsAccepted", event.target.checked)}
                disabled={!termsReviewed}
                required={requiresStudentDetails}
                aria-required={requiresStudentDetails}
                aria-describedby="terms-review-help"
              />
              <span>
                <strong>上記の利用規約を確認し、同意します。 {requiresStudentDetails && <em>必須</em>}</strong>
                <small id="terms-review-help">
                  {termsReviewed
                    ? requiresStudentDetails ? "利用規約を確認済みです。" : "利用規約を確認済みです。個別確認の場合は任意です。"
                    : "先に利用規約を開いて内容を確認してください。"}
                </small>
              </span>
            </label>

            <div className="agreement-disclosure privacy-disclosure">
              <button
                className="agreement-trigger"
                type="button"
                aria-expanded={privacyOpen}
                aria-controls="privacy-content"
                onClick={() => {
                  const nextOpen = !privacyOpen;
                  setPrivacyOpen(nextOpen);
                  if (nextOpen) setPrivacyReviewed(true);
                }}
              >
                <span><strong>個人情報の取り扱い</strong><small>取得目的・管理方針</small></span>
                <span aria-hidden="true">{privacyOpen ? "−" : "+"}</span>
              </button>
              {privacyOpen && (
                <div id="privacy-content" className="agreement-copy agreement-content">
                  <p>
                    大学生のための未来戦略ライブラリでは、利用者管理および安全な運営のため、
                    氏名・学籍番号・大学メールアドレス等の情報を取得しています。
                  </p>
                  <p>取得した情報は以下の目的でのみ利用します。</p>
                  <ul>
                    <li>利用資格の確認</li>
                    <li>Google Drive上のライブラリ共有フォルダへの招待・案内</li>
                    <li>利用者への連絡</li>
                    <li>利用規約違反への対応</li>
                    <li>ライブラリ運営に必要な管理業務</li>
                  </ul>
                  <p>
                    取得した個人情報を、本人の同意なく第三者へ提供することはありません。
                    ただし、大学から正当な照会を受けた場合を除きます。
                  </p>
                  <p>
                    登録情報の一部は、クラウドデータベース事業者NeonのAWSシンガポールリージョンを
                    主な保存地域として保管します。サービス提供、保守または再委託に必要な範囲で、
                    Neonまたはその委託先が米国その他の国から情報へアクセスし、処理する場合があります。
                  </p>
                  <p>
                    運営者は、保存情報の最小化、通信・保存時の暗号化、アクセス制御、保存期限後の削除、
                    委託先の安全管理措置と再委託先一覧の定期確認を行います。
                  </p>
                  <p>
                    不承認・未完了の申請情報は最終判定後90日、利用終了後の登録情報と同意証跡は1年を
                    基準に削除または個人を特定しにくい監査情報へ縮退します。必要最小限の管理者監査は
                    3年を上限とし、期限後に削除します。
                  </p>
                  <p>
                    登録情報は運営代表者が適切に管理し、利用目的の達成後は必要に応じて削除します。
                    開示・訂正・削除のご相談は、COMPASS公式サイトのお問い合わせ窓口から受け付けます。
                  </p>
                </div>
              )}
            </div>

            <label className={`check-row${privacyReviewed ? "" : " is-locked"}`}>
              <input
                type="checkbox"
                checked={form.privacyAccepted}
                onChange={(event) => updateForm("privacyAccepted", event.target.checked)}
                disabled={!privacyReviewed}
                required
                aria-required="true"
                aria-describedby="privacy-review-help"
              />
              <span>
                <strong>個人情報の取り扱いを確認し、同意します。 <em>必須</em></strong>
                <small id="privacy-review-help">
                  {privacyReviewed
                    ? "個人情報の取り扱いを確認済みです。"
                    : "先に個人情報の取り扱いを開いて内容を確認してください。"}
                </small>
              </span>
            </label>

            <div className="optional-message">
              <div className="optional-message-heading">
                <p>OPTIONAL MESSAGE</p>
                <h3>ご意見・ご質問 <span>任意</span></h3>
                <small>運営への連絡事項がある場合のみ入力してください。</small>
              </div>
              <label className="field">
                <span className="sr-only">ご意見・ご質問（任意）</span>
                <textarea
                  value={form.question}
                  onChange={(event) => updateForm("question", event.target.value)}
                  placeholder="運営への連絡事項があれば入力してください。"
                  rows={4}
                  maxLength={1000}
                />
                <small className="character-count">{form.question.length} / 1000</small>
              </label>
            </div>
          </section>

          <div className="submit-panel">
            <button
              className="button button-submit"
              type="submit"
              disabled={!canSubmit}
            >
              {isSubmitting ? "確認しています…" : "登録内容を確認する"}
            </button>
          </div>

          {submissionError && (
            <p className="submission-error" role="alert">{submissionError}</p>
          )}

          {submittedResult && (
            <ResultPanel
              result={submittedResult}
              resultRef={resultRef}
              authenticatedApi={usesGoogleAuthentication}
              onRefreshDriveStatus={handleRefreshDriveStatus}
              refreshingDriveStatus={isRefreshingDriveStatus}
            />
          )}
        </form>

        </div>

        <footer className="registration-footer">
          <p>未来戦略ライブラリ 利用登録</p>
          <p>Operated by COMPASS</p>
        </footer>
      </main>
    </>
  );
}

function SectionHeading({
  number,
  eyebrow,
  id,
  children
}: {
  number: string;
  eyebrow: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <span>{number}</span>
      <div>
        <p>{eyebrow}</p>
        <h2 id={id}>{children}</h2>
      </div>
    </div>
  );
}

function ResultPanel({
  result,
  resultRef,
  authenticatedApi,
  onRefreshDriveStatus,
  refreshingDriveStatus
}: {
  result: EligibilityResult | Phase6RegistrationResult;
  resultRef: React.RefObject<HTMLDivElement | null>;
  authenticatedApi: boolean;
  onRefreshDriveStatus: () => void;
  refreshingDriveStatus: boolean;
}) {
  const driveAccessStatus: DriveAccessStatus | null = (
    "driveAccessStatus" in result ? result.driveAccessStatus : null
  );
  const driveNotificationStatus: DriveNotificationStatus | null = (
    "driveNotificationStatus" in result
      ? result.driveNotificationStatus
      : null
  );

  if (result.status === "approved") {
    return (
      <div
        className="mock-result result-approved"
        role="status"
        aria-live="polite"
        tabIndex={-1}
        ref={resultRef}
      >
        <p>受付完了</p>
        <h2>お申し込みを受け付けました。</h2>
        <div className="result-guidance">
          <p>
            通常は数分から15分程度で処理が完了しますが、システム上の不具合等により正常に送信されない場合があります。
            24時間以上経過しても招待メールが届かない場合は、お手数ですが
            <a href="/contact/">問い合わせフォーム</a>よりご連絡ください。
          </p>
          <p>今後とも、未来戦略ライブラリをよろしくお願いいたします。</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`mock-result result-${result.status}`}
      role="status"
      aria-live="polite"
      tabIndex={-1}
      ref={resultRef}
    >
      <p>受付結果</p>
      <h2>{statusLabels[result.status]}</h2>
      <ul>
        {result.reasons.map((reason) => <li key={reason}>{reasonMessages[reason]}</li>)}
      </ul>
      {result.normalizedStudentNumber && (
        <small>確認した学籍番号: <strong>{result.normalizedStudentNumber}</strong></small>
      )}
      <span>
        {authenticatedApi && driveAccessStatus
          ? driveStatusMessage(driveAccessStatus, driveNotificationStatus)
          : authenticatedApi
          ? "登録内容を確認しました。共有フォルダの案内状況は、処理結果を確認した後に表示します。"
          : "入力内容を確認しました。"}
      </span>
      {authenticatedApi && driveAccessStatus && driveAccessStatus !== "not_enqueued" && (
        <button
          className="text-button"
          type="button"
          onClick={onRefreshDriveStatus}
          disabled={refreshingDriveStatus}
        >
          {refreshingDriveStatus ? "確認しています…" : "共有フォルダの案内状況を確認"}
        </button>
      )}
    </div>
  );
}

function driveStatusMessage(
  status: DriveAccessStatus,
  notificationStatus: DriveNotificationStatus | null
) {
  if (status === "pending") {
    return "登録を受け付けました。Google Drive共有フォルダのご案内を準備しています。";
  }
  if (status === "granted") {
    return notificationStatus === "sent_by_drive"
      ? "Google Drive共有フォルダの閲覧権限を付与し、招待通知を送信しました。"
      : "Google Drive共有フォルダの閲覧権限を確認しました。";
  }
  if (status === "already_granted") {
    return "Google Drive共有フォルダの閲覧権限はすでに設定されています。";
  }
  if (status === "failed") {
    return "登録は保存されていますが、共有フォルダのご案内を完了できませんでした。運営者が確認します。";
  }
  if (status === "revoked") {
    return "Google Drive共有フォルダの閲覧権限は停止されています。";
  }
  return "この登録は運営者による確認の対象です。";
}

function authenticationErrorMessage(error: unknown) {
  if (error instanceof Phase6ApiError) {
    if (error.code === "workspace_membership_required") {
      return "許可された大学Workspace組織のアカウントを確認できませんでした。大学アカウントを選び直してください。";
    }
    if (error.code === "unverified_google_email") {
      return "Googleで確認済みの大学メールアドレスが必要です。";
    }
    if (error.status === 503) {
      return "認証機能の設定が完了していません。運営者へお知らせください。";
    }
  }
  return "大学アカウントを確認できませんでした。Googleアカウントを選び直してください。";
}

function submissionErrorMessage(error: unknown) {
  if (error instanceof Phase6ApiError) {
    if (error.status === 401) {
      return "認証の有効期限が切れました。大学アカウントをいったん解除し、再度確認してください。";
    }
    if (error.status === 409) {
      return "同じ送信識別子で異なる登録を確認しました。画面を再読み込みして再試行してください。";
    }
    if (error.status === 503) {
      return "登録受付は現在一時停止中です。入力内容を保持したまま、時間を置いて再試行してください。";
    }
  }
  return "登録受付へ接続できませんでした。入力内容を保持したまま再試行できます。";
}
