export type AdminRole = "viewer" | "operator" | "admin";
export type AdminRuntimeMode = "mock" | "google";
export type AdminActionKind = "approve" | "reject" | "retry" | "deactivate" | "revoke";
export type AdminExportFormat = "csv" | "xlsx";
export type AdminExportMemberStatus = "active" | "pending_review" | "inactive" | "all";
export type AdminExportAcademicRole = "undergraduate" | "master" | "doctoral" | "staff";
export const ADMIN_EXPORT_PURPOSE_CODES = [
  "periodic_roster_review",
  "drive_access_reconciliation",
  "incident_response"
] as const;
export type AdminExportPurposeCode = typeof ADMIN_EXPORT_PURPOSE_CODES[number];

export type AdminRuntimeConfig = {
  mode: AdminRuntimeMode;
  apiBaseUrl: string;
  googleClientId: string;
  ready: boolean;
};

export type AdminSession = {
  authorized?: true;
  role: AdminRole;
};

export type AdminApplicationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "not_required";

export type AdminApplicationSummary = {
  applicationId: string;
  memberId: string | null;
  memberRecordVersion: number | null;
  operationId: string | null;
  operationRecordVersion: number | null;
  operationErrorCode: string | null;
  drivePermissionManaged: boolean;
  fullName: string;
  email: string;
  studentNumber: string | null;
  academicRole: string;
  facultyCode: string;
  grade: string | null;
  eligibilityStatus: string;
  adminDecision: AdminApplicationStatus;
  memberStatus: string | null;
  driveAccessStatus: string;
  operationStatus: string | null;
  recordVersion: number;
  createdAt: string;
};

export type AdminApplicationDetail = AdminApplicationSummary & {
  question?: string;
  reasonCodes: string[];
};

export type AdminAuditEvent = {
  auditId: string;
  action: string;
  actorRole: AdminRole;
  result: string;
  memberId: string | null;
  applicationId: string | null;
  operationId: string | null;
  reason: string | null;
  createdAt: string;
  requestId: string;
};

export type AdminApplicationFilters = {
  query?: string;
  reviewStatus?: string;
  driveStatus?: string;
  page?: number;
  pageSize?: number;
};

export type RosterGrade =
  | "1年"
  | "2年"
  | "3年"
  | "4年"
  | "5年"
  | "6年"
  | "M1"
  | "M2"
  | "その他";

export type AdminMemberSort = "grade" | "student_number" | "registered_at";
export type AdminSortDirection = "asc" | "desc";

export type AdminMemberSummary = {
  memberId: string;
  fullName: string;
  grade: RosterGrade;
  studentNumber: string | null;
  registeredAt: string | null;
  memberStatus: string;
  recordVersion: number;
};

export type AdminMemberFilters = {
  query?: string;
  grade?: RosterGrade | "";
  memberStatus?: AdminExportMemberStatus;
  sortBy?: AdminMemberSort;
  sortDirection?: AdminSortDirection;
  page?: number;
  pageSize?: number;
};

export type AdminPage<T> = {
  items: T[];
  offset: number;
  limit: number;
  hasMore: boolean;
};

export type AdminMutationResult = {
  status: string;
  applicationId: string | null;
  memberId: string | null;
  operationId: string | null;
  recordVersion: number | null;
};

export type AdminExportRequest = {
  format: AdminExportFormat;
  memberStatus: AdminExportMemberStatus;
  academicRole: AdminExportAcademicRole | null;
  purposeCode: AdminExportPurposeCode;
  confirmed: true;
};

export type AdminExportResult = {
  blob: Blob;
  filename: string;
  runId: string;
  rowCount: number;
  contentSha256: string;
  deleteAfter: string;
};

type PublicEnvironment = Record<string, string | undefined>;
type Fetcher = typeof fetch;

export type AdminPreviewLocation = {
  protocol: string;
  hostname: string;
};

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string
  ) {
    super(code);
    this.name = "AdminApiError";
  }
}

export function readAdminRuntimeConfig(
  environment: PublicEnvironment = process.env
): AdminRuntimeConfig {
  const mode = environment.NEXT_PUBLIC_LIBRARY_ADMIN_MODE === "google"
    ? "google"
    : "mock";
  const apiBaseUrl = (
    environment.NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL ?? ""
  )
    .trim()
    .replace(/\/$/, "");
  const googleClientId = (
    environment.NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID ?? ""
  ).trim();

  return {
    mode,
    apiBaseUrl,
    googleClientId,
    ready: mode === "mock" || Boolean(apiBaseUrl && googleClientId)
  };
}

export function requireAdminProductionRuntimeConfig(
  environment: PublicEnvironment
): AdminRuntimeConfig & { mode: "google"; ready: true } {
  const config = readAdminRuntimeConfig(environment);
  const hasSyntheticMarker = (value: string) => (
    /(?:mock|synthetic|example\.invalid|placeholder|change[-_]?me)/i.test(value)
  );
  const validApiBase = config.apiBaseUrl === "/library-registration/admin/api";
  const validGoogleClientId = /^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i
    .test(config.googleClientId)
    && !hasSyntheticMarker(config.googleClientId);
  if (
    environment.NEXT_PUBLIC_LIBRARY_ADMIN_MODE !== "google"
    || config.mode !== "google"
    || !config.ready
    || !validApiBase
    || !validGoogleClientId
  ) {
    throw new AdminApiError(0, "admin_production_config_invalid");
  }
  return { ...config, mode: "google", ready: true };
}

export function canReview(role: AdminRole): boolean {
  return role === "operator" || role === "admin";
}

export function canRetry(role: AdminRole): boolean {
  return role === "operator" || role === "admin";
}

export function canRevoke(role: AdminRole): boolean {
  return role === "admin";
}

export function canExport(role: AdminRole): boolean {
  return role === "admin";
}

export function availableAdminActions(
  application: AdminApplicationSummary,
  role: AdminRole
): AdminActionKind[] {
  const actions: AdminActionKind[] = [];
  if (application.adminDecision === "pending" && canReview(role)) {
    actions.push("approve", "reject");
  }
  if (
    application.operationId
    && (application.operationStatus === "failed" || application.operationStatus === "dead")
    && canRetry(role)
  ) actions.push("retry");
  if (
    application.memberId
    && application.memberStatus === "active"
    && canRevoke(role)
  ) {
    actions.push("deactivate");
    if (application.drivePermissionManaged) actions.push("revoke");
  }
  return actions;
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? "00000000-0000-4000-8000-000000000000";
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toError(response: Response, payload: Record<string, unknown>): AdminApiError {
  const detail = typeof payload.detail === "string"
    ? payload.detail
    : "admin_request_failed";
  return new AdminApiError(response.status, detail);
}

async function blobSha256(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new AdminApiError(502, "export_integrity_verifier_unavailable");
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer()
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function safeExportFilename(
  contentDisposition: string,
  format: AdminExportFormat
): string | null {
  const parts = contentDisposition.split(";").map((part) => part.trim());
  if (parts.shift()?.toLowerCase() !== "attachment") return null;
  if (parts.some((part) => /^filename\s*\*/i.test(part))) return null;
  const parameters = parts.filter((part) => /^filename\s*=/i.test(part));
  if (parameters.length !== 1) return null;
  const encoded = parameters[0].replace(/^filename\s*=\s*/i, "");
  const filename = encoded.startsWith('"')
    ? /^"([^"\\]*)"$/.exec(encoded)?.[1]
    : /^[!#$%&'+.^_`|~0-9A-Za-z-]+$/.test(encoded)
      ? encoded
      : undefined;
  if (!filename) return null;

  const match = new RegExp(
    `^library-members-(\\d{4})(\\d{2})(\\d{2})T(\\d{2})(\\d{2})(\\d{2})Z\\.${format}$`
  ).exec(filename);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const timestamp = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`) {
    return null;
  }
  return filename;
}

function validUtcDeletionDeadline(value: string, now = Date.now()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|\+00:00)$/.exec(value);
  if (!match) return false;
  const timestamp = Date.parse(value);
  const date = new Date(timestamp);
  const [, year, month, day, hour, minute, second] = match;
  if (
    !Number.isFinite(timestamp)
    || date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() + 1 !== Number(month)
    || date.getUTCDate() !== Number(day)
    || date.getUTCHours() !== Number(hour)
    || date.getUTCMinutes() !== Number(minute)
    || date.getUTCSeconds() !== Number(second)
  ) return false;
  const maximumWindowMs = 91 * 24 * 60 * 60 * 1000;
  return timestamp > now
    && timestamp <= now + maximumWindowMs;
}

async function adminRequest<T>(
  config: AdminRuntimeConfig,
  credential: string,
  path: string,
  init: RequestInit,
  fetcher: Fetcher
): Promise<T> {
  if (config.mode !== "google" || !config.ready || !credential) {
    throw new AdminApiError(0, "admin_not_configured");
  }

  const response = await fetcher(adminProxyUrl(config, path), {
    ...init,
    mode: "same-origin",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${credential}`,
      "X-Request-ID": requestId(),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers
    }
  });
  const payload = await parseJson(response);
  if (!response.ok) throw toError(response, payload);
  return payload as T;
}

export function isTrustedAdminPreviewLocation(
  location: AdminPreviewLocation
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

function adminProxyUrl(config: AdminRuntimeConfig, backendPath: string): string {
  const prefix = "/admin/v1";
  if (!backendPath.startsWith(`${prefix}/`)) {
    throw new AdminApiError(0, "admin_request_path_invalid");
  }
  return `${config.apiBaseUrl}${backendPath.slice(prefix.length)}`;
}

export async function getAdminSession(
  config: AdminRuntimeConfig,
  credential: string,
  fetcher: Fetcher = fetch
): Promise<AdminSession> {
  return adminRequest(config, credential, "/admin/v1/session", {
    method: "GET"
  }, fetcher);
}

export async function listAdminApplications(
  config: AdminRuntimeConfig,
  credential: string,
  filters: AdminApplicationFilters,
  fetcher: Fetcher = fetch
): Promise<AdminPage<AdminApplicationSummary>> {
  const pageSize = filters.pageSize ?? 25;
  return adminRequest(config, credential, "/admin/v1/applications/search", {
    method: "POST",
    body: JSON.stringify({
      q: filters.query?.trim() || null,
      decision: filters.reviewStatus || null,
      driveStatus: filters.driveStatus || null,
      offset: ((filters.page ?? 1) - 1) * pageSize,
      limit: pageSize
    })
  }, fetcher);
}

export async function getAdminApplication(
  config: AdminRuntimeConfig,
  credential: string,
  applicationId: string,
  fetcher: Fetcher = fetch
): Promise<AdminApplicationDetail> {
  return adminRequest(
    config,
    credential,
    `/admin/v1/applications/${encodeURIComponent(applicationId)}`,
    { method: "GET" },
    fetcher
  );
}

export async function listAdminMembers(
  config: AdminRuntimeConfig,
  credential: string,
  filters: AdminMemberFilters,
  fetcher: Fetcher = fetch
): Promise<AdminPage<AdminMemberSummary>> {
  const pageSize = filters.pageSize ?? 25;
  return adminRequest(config, credential, "/admin/v1/members/search", {
    method: "POST",
    body: JSON.stringify({
      q: filters.query?.trim() || null,
      grade: filters.grade || null,
      memberStatus: filters.memberStatus ?? "active",
      sortBy: filters.sortBy ?? "grade",
      sortDirection: filters.sortDirection ?? "asc",
      offset: ((filters.page ?? 1) - 1) * pageSize,
      limit: pageSize
    })
  }, fetcher);
}

export async function listAdminAuditEvents(
  config: AdminRuntimeConfig,
  credential: string,
  page = 1,
  fetcher: Fetcher = fetch
): Promise<AdminPage<AdminAuditEvent>> {
  return adminRequest(
    config,
    credential,
    `/admin/v1/audit-events?offset=${(page - 1) * 50}&limit=50`,
    { method: "GET" },
    fetcher
  );
}

export async function decideAdminApplication(
  config: AdminRuntimeConfig,
  credential: string,
  applicationId: string,
  decision: "approve" | "reject",
  reason: string,
  expectedVersion: number,
  fetcher: Fetcher = fetch
): Promise<AdminMutationResult> {
  return adminRequest(
    config,
    credential,
    `/admin/v1/applications/${encodeURIComponent(applicationId)}/decision`,
    {
      method: "POST",
      headers: { "Idempotency-Key": requestId() },
      body: JSON.stringify({
        decision,
        reason,
        expectedRecordVersion: expectedVersion
      })
    },
    fetcher
  );
}

export async function retryAdminOperation(
  config: AdminRuntimeConfig,
  credential: string,
  operationId: string,
  reason: string,
  expectedVersion: number,
  fetcher: Fetcher = fetch
): Promise<AdminMutationResult> {
  return adminRequest(
    config,
    credential,
    `/admin/v1/operations/${encodeURIComponent(operationId)}/retry`,
    {
      method: "POST",
      headers: { "Idempotency-Key": requestId() },
      body: JSON.stringify({
        reason,
        expectedRecordVersion: expectedVersion
      })
    },
    fetcher
  );
}

export async function revokeAdminMember(
  config: AdminRuntimeConfig,
  credential: string,
  memberId: string,
  reason: string,
  expectedVersion: number,
  fetcher: Fetcher = fetch
): Promise<AdminMutationResult> {
  return adminRequest(
    config,
    credential,
    `/admin/v1/members/${encodeURIComponent(memberId)}/revoke`,
    {
      method: "POST",
      headers: { "Idempotency-Key": requestId() },
      body: JSON.stringify({
        reason,
        expectedRecordVersion: expectedVersion,
        confirmedMemberId: memberId
      })
    },
    fetcher
  );
}

export async function deactivateAdminMember(
  config: AdminRuntimeConfig,
  credential: string,
  memberId: string,
  reason: string,
  expectedVersion: number,
  fetcher: Fetcher = fetch
): Promise<AdminMutationResult> {
  return adminRequest(
    config,
    credential,
    `/admin/v1/members/${encodeURIComponent(memberId)}/deactivate`,
    {
      method: "POST",
      headers: { "Idempotency-Key": requestId() },
      body: JSON.stringify({
        reason,
        expectedRecordVersion: expectedVersion,
        confirmedMemberId: memberId
      })
    },
    fetcher
  );
}

export async function exportAdminMembers(
  config: AdminRuntimeConfig,
  credential: string,
  request: AdminExportRequest,
  fetcher: Fetcher = fetch
): Promise<AdminExportResult> {
  if (config.mode !== "google" || !config.ready || !credential) {
    throw new AdminApiError(0, "admin_not_configured");
  }
  if (!isAdminExportPurposeCode(request.purposeCode) || request.confirmed !== true) {
    throw new AdminApiError(422, "admin_export_confirmation_required");
  }

  const response = await fetcher(
    adminProxyUrl(config, "/admin/v1/exports"),
    {
      method: "POST",
      mode: "same-origin",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
        "X-Request-ID": requestId(),
        "Idempotency-Key": requestId()
      },
      body: JSON.stringify({
        format: request.format,
        memberStatus: request.memberStatus,
        academicRole: request.academicRole,
        purposeCode: request.purposeCode,
        confirmed: true
      })
    }
  );

  if (!response.ok) {
    throw toError(response, await parseJson(response));
  }

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const contentType = (response.headers.get("Content-Type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const runId = (response.headers.get("X-Export-Run-ID") ?? "").trim();
  const rowCountHeader = response.headers.get("X-Export-Row-Count") ?? "";
  const contentSha256 = (response.headers.get("X-Content-SHA256") ?? "")
    .trim()
    .toLowerCase();
  const deleteAfter = (response.headers.get("X-Export-Delete-After") ?? "").trim();
  const filename = safeExportFilename(disposition, request.format);
  const rowCount = Number(rowCountHeader);
  const expectedContentType = request.format === "csv"
    ? "text/csv"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (
    !/^attachment(?:;|$)/i.test(disposition)
    || !filename
    || contentType !== expectedContentType
    || !/^[a-zA-Z0-9._:-]{1,128}$/.test(runId)
    || !/^(0|[1-9][0-9]*)$/.test(rowCountHeader)
    || !Number.isSafeInteger(rowCount)
    || rowCount < 0
    || !/^[a-f0-9]{64}$/.test(contentSha256)
    || !validUtcDeletionDeadline(deleteAfter)
  ) {
    throw new AdminApiError(502, "invalid_export_response");
  }

  const blob = await response.blob();
  if (await blobSha256(blob) !== contentSha256) {
    throw new AdminApiError(502, "export_content_hash_mismatch");
  }

  return {
    blob,
    filename,
    runId,
    rowCount,
    contentSha256,
    deleteAfter
  };
}

export function isAdminExportPurposeCode(value: unknown): value is AdminExportPurposeCode {
  return typeof value === "string"
    && ADMIN_EXPORT_PURPOSE_CODES.some((code) => code === value);
}

export function downloadAdminExport(
  result: AdminExportResult,
  documentObject: Document = document,
  objectUrlApi: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL
): void {
  const objectUrl = objectUrlApi.createObjectURL(result.blob);
  const anchor = documentObject.createElement("a");
  const cleanup = () => {
    anchor.remove();
    objectUrlApi.revokeObjectURL(objectUrl);
  };
  try {
    anchor.href = objectUrl;
    anchor.download = result.filename;
    anchor.rel = "noopener";
    anchor.hidden = true;
    documentObject.body.appendChild(anchor);
    anchor.click();
    globalThis.setTimeout(cleanup, 0);
  } catch (error) {
    cleanup();
    throw error;
  }
}
