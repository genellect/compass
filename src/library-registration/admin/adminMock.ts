import {
  AdminApiError,
  canRetry,
  canReview,
  canRevoke,
  isAdminExportPurposeCode
} from "./adminClient";
import type {
  AdminApplicationDetail,
  AdminAuditEvent,
  AdminMemberFilters,
  AdminMemberSummary,
  AdminExportRequest,
  AdminExportResult,
  AdminRole
} from "./adminClient";

export type MockAdminState = {
  applications: AdminApplicationDetail[];
  auditEvents: AdminAuditEvent[];
};

export type MockAdminAction =
  | {
      type: "decision";
      applicationId: string;
      decision: "approve" | "reject";
      reason: string;
      expectedRecordVersion: number;
    }
  | {
      type: "retry";
      applicationId: string;
      reason: string;
      expectedRecordVersion: number;
    }
  | {
      type: "deactivate";
      applicationId: string;
      confirmedMemberId: string;
      reason: string;
      expectedRecordVersion: number;
    }
  | {
      type: "revoke";
      applicationId: string;
      confirmedMemberId: string;
      reason: string;
      expectedRecordVersion: number;
    };

const SYNTHETIC_APPLICATIONS: AdminApplicationDetail[] = [
  {
    applicationId: "app-synthetic-001",
    memberId: "member-synthetic-001",
    memberRecordVersion: 1,
    operationId: null,
    operationRecordVersion: null,
    operationErrorCode: null,
    drivePermissionManaged: false,
    fullName: "北里 花子",
    email: "h***@st.kitasato-u.ac.jp",
    studentNumber: null,
    academicRole: "staff",
    facultyCode: "pharmacy",
    grade: null,
    eligibilityStatus: "manual_review",
    adminDecision: "pending",
    memberStatus: "pending_review",
    driveAccessStatus: "not_enqueued",
    operationStatus: null,
    recordVersion: 1,
    createdAt: "2026-08-01T01:10:00Z",
    question: "教職員として利用を希望します。",
    reasonCodes: ["role_requires_manual_review"]
  },
  {
    applicationId: "app-synthetic-002",
    memberId: "member-synthetic-002",
    memberRecordVersion: 2,
    operationId: "operation-synthetic-002",
    operationRecordVersion: 2,
    operationErrorCode: "drive_transient_failure",
    drivePermissionManaged: false,
    fullName: "山田 太郎",
    email: "t***@st.kitasato-u.ac.jp",
    studentNumber: "PP23000",
    academicRole: "undergraduate",
    facultyCode: "pharmacy",
    grade: "3",
    eligibilityStatus: "approved",
    adminDecision: "not_required",
    memberStatus: "active",
    driveAccessStatus: "failed",
    operationStatus: "dead",
    recordVersion: 3,
    createdAt: "2026-08-01T01:04:00Z",
    question: "",
    reasonCodes: ["eligible"]
  },
  {
    applicationId: "app-synthetic-003",
    memberId: "member-synthetic-003",
    memberRecordVersion: 2,
    operationId: "operation-synthetic-003",
    operationRecordVersion: 1,
    operationErrorCode: null,
    drivePermissionManaged: true,
    fullName: "佐藤 次郎",
    email: "j***@st.kitasato-u.ac.jp",
    studentNumber: "PL24001",
    academicRole: "undergraduate",
    facultyCode: "pharmacy",
    grade: "2",
    eligibilityStatus: "approved",
    adminDecision: "not_required",
    memberStatus: "active",
    driveAccessStatus: "granted",
    operationStatus: "succeeded",
    recordVersion: 2,
    createdAt: "2026-07-31T23:40:00Z",
    question: "試験対策資料を探しています。",
    reasonCodes: ["eligible"]
  }
];

export function createMockAdminState(): MockAdminState {
  return {
    applications: SYNTHETIC_APPLICATIONS.map((application) => ({
      ...application,
      reasonCodes: [...application.reasonCodes]
    })),
    auditEvents: []
  };
}

export function listMockAdminMembers(
  state: MockAdminState,
  filters: AdminMemberFilters
): AdminMemberSummary[] {
  const members = new Map<string, AdminMemberSummary>();
  for (const application of state.applications) {
    if (!application.memberId || members.has(application.memberId)) continue;
    members.set(application.memberId, {
      memberId: application.memberId,
      fullName: application.fullName,
      grade: rosterGrade(application.academicRole, application.grade),
      studentNumber: application.studentNumber,
      registeredAt: application.createdAt,
      memberStatus: application.memberStatus ?? "pending_review",
      recordVersion: application.memberRecordVersion ?? 1
    });
  }
  const query = filters.query?.trim().toLowerCase() ?? "";
  const direction = filters.sortDirection === "desc" ? -1 : 1;
  const gradeOrder = ["1年", "2年", "3年", "4年", "5年", "6年", "M1", "M2", "その他"];
  const value = (member: AdminMemberSummary): string | number | null => {
    if (filters.sortBy === "student_number") return member.studentNumber;
    if (filters.sortBy === "registered_at") return member.registeredAt;
    return gradeOrder.indexOf(member.grade);
  };
  return [...members.values()]
    .filter((member) => (
      (filters.memberStatus === "all" || !filters.memberStatus
        || member.memberStatus === filters.memberStatus)
      && (!filters.grade || member.grade === filters.grade)
      && (!query || [member.fullName, member.studentNumber ?? ""]
        .some((candidate) => candidate.toLowerCase().includes(query)))
    ))
    .sort((left, right) => {
      const leftValue = value(left);
      const rightValue = value(right);
      if (leftValue === null && rightValue !== null) return 1;
      if (rightValue === null && leftValue !== null) return -1;
      if (leftValue !== rightValue) {
        return String(leftValue).localeCompare(String(rightValue), "ja", {
          numeric: true
        }) * direction;
      }
      return (left.studentNumber ?? "￿").localeCompare(
        right.studentNumber ?? "￿",
        "ja",
        { numeric: true }
      );
    });
}

function rosterGrade(academicRole: string, grade: string | null): AdminMemberSummary["grade"] {
  if (academicRole === "undergraduate" && /^[1-6]$/.test(grade ?? "")) {
    return `${grade}年` as AdminMemberSummary["grade"];
  }
  if (academicRole === "master" && /^[12]$/.test(grade ?? "")) {
    return `M${grade}` as AdminMemberSummary["grade"];
  }
  return "その他";
}

export function applyMockAdminAction(
  state: MockAdminState,
  role: AdminRole,
  action: MockAdminAction
): { state: MockAdminState; application: AdminApplicationDetail } {
  if (action.type === "decision" && !canReview(role)) {
    throw new AdminApiError(403, "admin_role_forbidden");
  }
  if (action.type === "retry" && !canRetry(role)) {
    throw new AdminApiError(403, "admin_role_forbidden");
  }
  if ((action.type === "deactivate" || action.type === "revoke") && !canRevoke(role)) {
    throw new AdminApiError(403, "admin_role_forbidden");
  }
  if (action.reason.trim().length < 8) {
    throw new AdminApiError(422, "admin_reason_too_short");
  }

  const application = state.applications.find(
    (candidate) => candidate.applicationId === action.applicationId
  );
  if (!application) throw new AdminApiError(404, "application_not_found");
  const currentVersion = action.type === "retry"
    ? application.operationRecordVersion
    : action.type === "deactivate" || action.type === "revoke"
      ? application.memberRecordVersion
      : application.recordVersion;
  if (currentVersion !== action.expectedRecordVersion) {
    throw new AdminApiError(409, "record_version_conflict");
  }

  if (action.type === "decision" && application.adminDecision !== "pending") {
    throw new AdminApiError(409, "application_already_decided");
  }
  if (
    action.type === "retry"
    && application.operationStatus !== "failed"
    && application.operationStatus !== "dead"
  ) {
    throw new AdminApiError(409, "operation_not_retryable");
  }
  if (action.type === "deactivate" || action.type === "revoke") {
    if (application.memberId !== action.confirmedMemberId) {
      throw new AdminApiError(409, "member_confirmation_mismatch");
    }
    if (application.memberStatus !== "active") {
      throw new AdminApiError(409, "member_not_active");
    }
    if (action.type === "revoke" && !application.drivePermissionManaged) {
      throw new AdminApiError(409, "permission_not_managed");
    }
  }

  const nextApplication: AdminApplicationDetail = {
    ...application,
    recordVersion: action.type === "retry"
      ? application.recordVersion
      : application.recordVersion + 1
  };
  let auditAction = "";
  if (action.type === "decision") {
    nextApplication.adminDecision = action.decision === "approve" ? "approved" : "rejected";
    nextApplication.memberStatus = action.decision === "approve" ? "active" : "inactive";
    nextApplication.driveAccessStatus = action.decision === "approve" ? "pending" : "not_enqueued";
    nextApplication.operationStatus = action.decision === "approve" ? "pending" : null;
    auditAction = `application_${action.decision}`;
  } else if (action.type === "retry") {
    nextApplication.driveAccessStatus = "pending";
    nextApplication.operationStatus = "pending";
    nextApplication.operationRecordVersion = (application.operationRecordVersion ?? 0) + 1;
    nextApplication.operationErrorCode = null;
    auditAction = "operation_retry";
  } else if (action.type === "revoke") {
    nextApplication.memberStatus = "inactive";
    nextApplication.memberRecordVersion = (application.memberRecordVersion ?? 0) + 1;
    nextApplication.driveAccessStatus = "pending";
    nextApplication.operationStatus = "pending";
    auditAction = "member_revoke";
  } else {
    nextApplication.memberStatus = "inactive";
    nextApplication.memberRecordVersion = (application.memberRecordVersion ?? 0) + 1;
    auditAction = "member_deactivate";
  }

  const now = new Date().toISOString();
  const nextAudit: AdminAuditEvent = {
    auditId: `audit-synthetic-${state.auditEvents.length + 1}`,
    action: auditAction,
    actorRole: role,
    result: "accepted",
    memberId: application.memberId,
    applicationId: application.applicationId,
    operationId: action.type === "revoke" || action.type === "retry"
      ? application.operationId
      : null,
    reason: action.reason.trim(),
    createdAt: now,
    requestId: `request-synthetic-${state.auditEvents.length + 1}`
  };

  return {
    state: {
      applications: state.applications.map((candidate) =>
        candidate.applicationId === application.applicationId
          ? nextApplication
          : candidate
      ),
      auditEvents: [nextAudit, ...state.auditEvents]
    },
    application: nextApplication
  };
}

export async function applyMockAdminExport(
  state: MockAdminState,
  role: AdminRole,
  request: AdminExportRequest
): Promise<{ state: MockAdminState; result: AdminExportResult }> {
  if (role !== "admin") {
    throw new AdminApiError(403, "admin_role_forbidden");
  }
  if (!isAdminExportPurposeCode(request.purposeCode) || request.confirmed !== true) {
    throw new AdminApiError(422, "admin_export_confirmation_required");
  }
  if (request.format !== "csv") {
    throw new AdminApiError(422, "mock_xlsx_unavailable");
  }

  const seenMemberIds = new Set<string>();
  const rows = state.applications.filter((application) => {
    if (!application.memberId || seenMemberIds.has(application.memberId)) return false;
    if (request.memberStatus !== "all" && application.memberStatus !== request.memberStatus) {
      return false;
    }
    if (
      request.academicRole
      && application.academicRole !== request.academicRole
    ) return false;
    seenMemberIds.add(application.memberId);
    return true;
  });
  const columns = [
    "member_id",
    "full_name",
    "university_email",
    "student_number",
    "academic_role",
    "faculty",
    "grade",
    "member_status",
    "drive_access_status",
    "registered_at"
  ];
  const lines = [
    columns,
    ...rows.map((application) => [
      application.memberId ?? "",
      application.fullName,
      application.email,
      application.studentNumber ?? "",
      application.academicRole,
      application.facultyCode,
      application.grade ?? "",
      application.memberStatus ?? "",
      application.driveAccessStatus,
      application.createdAt
    ])
  ].map((row) => row.map(csvCell).join(","));
  const bytes = new TextEncoder().encode(`\ufeff${lines.join("\r\n")}\r\n`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const contentSha256 = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const sequence = state.auditEvents.length + 1;
  const runId = `export-synthetic-${sequence}`;
  const now = new Date();
  const deleteAfter = new Date(
    now.getTime() + 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  const nextAudit: AdminAuditEvent = {
    auditId: `audit-synthetic-${sequence}`,
    action: "member_export_csv",
    actorRole: role,
    result: "downloaded_synthetic",
    memberId: null,
    applicationId: null,
    operationId: null,
    reason: `export_purpose:${request.purposeCode}`,
    createdAt: now.toISOString(),
    requestId: `request-synthetic-${sequence}`
  };

  return {
    state: {
      applications: state.applications,
      auditEvents: [nextAudit, ...state.auditEvents]
    },
    result: {
      blob: new Blob([bytes], { type: "text/csv;charset=utf-8" }),
      filename: "future-strategy-library-members-synthetic.csv",
      runId,
      rowCount: rows.length,
      contentSha256,
      deleteAfter
    }
  };
}

function csvCell(value: string): string {
  const normalized = /^[\u0000-\u0020]*[=+\-@]/.test(value)
    || /^[\t\r\n]/.test(value)
    ? `'${value}`
    : value;
  return `"${normalized.replaceAll('"', '""')}"`;
}
