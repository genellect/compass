export const TERMS_VERSION = "phase3-draft-2026-07-16";
export const PRIVACY_VERSION = "phase3-draft-2026-07-16";

export type AcademicRole = "" | "undergraduate" | "master" | "doctoral" | "staff";
export type FacultyCode = "" | "pharmacy" | "other";
export type ExistingRegistration = "none" | "matching" | "conflict";
export type EligibilityStatus =
  | "not_ready"
  | "approved"
  | "manual_review"
  | "ineligible"
  | "already_registered";

export type ReasonCode =
  | "account_not_verified"
  | "token_invalid"
  | "email_not_verified"
  | "hosted_domain_not_allowed"
  | "email_domain_not_allowed"
  | "full_name_required"
  | "academic_role_required"
  | "faculty_required"
  | "grade_required"
  | "grade_invalid"
  | "student_number_required"
  | "student_number_invalid"
  | "terms_required"
  | "privacy_required"
  | "existing_registration_found"
  | "existing_registration_conflict"
  | "role_requires_manual_review"
  | "faculty_requires_manual_review"
  | "non_student_email_requires_manual_review"
  | "eligible";

export type AccountFacts = {
  verified: boolean;
  tokenValid: boolean;
  emailVerified: boolean;
  email: string;
  hostedDomain: string;
  allowedHostedDomains: readonly string[];
};

export type RegistrationInput = {
  fullName: string;
  academicRole: AcademicRole;
  faculty: FacultyCode;
  grade: string;
  studentNumber: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  question: string;
};

export type EligibilityContext = {
  existingRegistration?: ExistingRegistration;
};

export type EligibilityResult = {
  status: EligibilityStatus;
  reasons: ReasonCode[];
  normalizedEmail: string;
  normalizedStudentNumber: string;
  requiresStudentDetails: boolean;
};

export const reasonMessages: Record<ReasonCode, string> = {
  account_not_verified: "大学アカウントの確認が必要です。",
  token_invalid: "認証情報を確認できませんでした。",
  email_not_verified: "確認済みメールアドレスが必要です。",
  hosted_domain_not_allowed: "許可された大学Workspace組織ではありません。",
  email_domain_not_allowed: "北里大学のメールアドレスを確認できません。",
  full_name_required: "氏名を入力してください。",
  academic_role_required: "在籍区分を選択してください。",
  faculty_required: "所属学部・部門を選択してください。",
  grade_required: "学年を選択してください。",
  grade_invalid: "所属区分に対応する学年を選択してください。",
  student_number_required: "学籍番号を入力してください。",
  student_number_invalid: "学籍番号はPP・PL・MPのいずれか＋数字5桁で入力してください。",
  terms_required: "学生利用には利用条件への同意が必要です。",
  privacy_required: "個人情報の取り扱いへの同意が必要です。",
  existing_registration_found: "同じ内容の登録が既に確認されています。",
  existing_registration_conflict: "既存登録と異なる情報があるため個別に確認します。",
  role_requires_manual_review: "選択した在籍区分は運営者による個別確認の対象です。",
  faculty_requires_manual_review: "薬学部以外の申請は運営者による個別確認の対象です。",
  non_student_email_requires_manual_review: "学生用メール以外の大学メールは個別確認の対象です。",
  eligible: "自動承認条件を満たしています。"
};

export const statusLabels: Record<EligibilityStatus, string> = {
  not_ready: "入力を続けてください",
  approved: "自動承認条件を満たしています",
  manual_review: "運営者による個別確認となります",
  ineligible: "入力・利用条件を確認してください",
  already_registered: "登録済みです"
};

export function normalizeStudentNumber(value: string) {
  return value.normalize("NFKC").trim().toUpperCase();
}

export function normalizeEmail(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function isStudentNumberValid(value: string) {
  const normalized = normalizeStudentNumber(value);
  return /^(PP|PL|MP)[0-9]{5}$/.test(normalized) && normalized !== "PP00000";
}

export function isStudentRole(role: AcademicRole) {
  return role === "undergraduate" || role === "master";
}

export function isStudentEmail(email: string) {
  return normalizeEmail(email).endsWith("@st.kitasato-u.ac.jp");
}

export function isUniversityEmail(email: string) {
  return /@([a-z0-9-]+\.)*kitasato-u\.ac\.jp$/i.test(normalizeEmail(email));
}

export function evaluateEligibility(
  account: AccountFacts,
  registration: RegistrationInput,
  context: EligibilityContext = {}
): EligibilityResult {
  const normalizedEmail = normalizeEmail(account.email);
  const normalizedStudentNumber = normalizeStudentNumber(registration.studentNumber);
  const requiresStudentDetails = isStudentRole(registration.academicRole);
  const result = (status: EligibilityStatus, reasons: ReasonCode[]): EligibilityResult => ({
    status,
    reasons,
    normalizedEmail,
    normalizedStudentNumber,
    requiresStudentDetails
  });

  if (!account.verified) return result("not_ready", ["account_not_verified"]);

  const authenticationFailures: ReasonCode[] = [];
  if (!account.tokenValid) authenticationFailures.push("token_invalid");
  if (!account.emailVerified) authenticationFailures.push("email_not_verified");
  if (!account.allowedHostedDomains.map(normalizeEmail).includes(normalizeEmail(account.hostedDomain))) {
    authenticationFailures.push("hosted_domain_not_allowed");
  }
  if (!isUniversityEmail(normalizedEmail)) authenticationFailures.push("email_domain_not_allowed");
  if (authenticationFailures.length > 0) return result("ineligible", authenticationFailures);

  const missingFields: ReasonCode[] = [];
  if (!registration.fullName.trim()) missingFields.push("full_name_required");
  if (!registration.academicRole) missingFields.push("academic_role_required");
  if (!registration.faculty) missingFields.push("faculty_required");
  if (!registration.privacyAccepted) missingFields.push("privacy_required");
  if (requiresStudentDetails) {
    if (!registration.grade) missingFields.push("grade_required");
    if (!normalizedStudentNumber) missingFields.push("student_number_required");
    if (!registration.termsAccepted) missingFields.push("terms_required");
  }
  if (missingFields.length > 0) return result("not_ready", missingFields);

  const validGrades = registration.academicRole === "master"
    ? ["1", "2"]
    : ["1", "2", "3", "4", "5", "6"];
  if (requiresStudentDetails && !validGrades.includes(registration.grade)) {
    return result("ineligible", ["grade_invalid"]);
  }

  if (requiresStudentDetails && !isStudentNumberValid(normalizedStudentNumber)) {
    return result("ineligible", ["student_number_invalid"]);
  }

  if (context.existingRegistration === "matching") {
    return result("already_registered", ["existing_registration_found"]);
  }
  if (context.existingRegistration === "conflict") {
    return result("manual_review", ["existing_registration_conflict"]);
  }

  const manualReviewReasons: ReasonCode[] = [];
  if (registration.academicRole === "doctoral" || registration.academicRole === "staff") {
    manualReviewReasons.push("role_requires_manual_review");
  }
  if (registration.faculty !== "pharmacy") {
    manualReviewReasons.push("faculty_requires_manual_review");
  }
  if (!isStudentEmail(normalizedEmail)) {
    manualReviewReasons.push("non_student_email_requires_manual_review");
  }
  if (manualReviewReasons.length > 0) return result("manual_review", manualReviewReasons);

  return result("approved", ["eligible"]);
}

export function createSubmissionKey(account: AccountFacts, registration: RegistrationInput) {
  return [
    normalizeEmail(account.email),
    registration.academicRole,
    registration.faculty,
    normalizeStudentNumber(registration.studentNumber)
  ].join("|");
}
