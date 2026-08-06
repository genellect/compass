"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";
import { GoogleSignInButton } from "../GoogleSignInButton";
import {
  AdminApiError,
  availableAdminActions,
  canExport,
  deactivateAdminMember,
  decideAdminApplication,
  downloadAdminExport,
  exportAdminMembers,
  getAdminApplication,
  getAdminSession,
  isTrustedAdminPreviewLocation,
  listAdminApplications,
  listAdminAuditEvents,
  listAdminMembers,
  readAdminRuntimeConfig,
  retryAdminOperation,
  revokeAdminMember
} from "./adminClient";
import type {
  AdminApplicationDetail,
  AdminApplicationSummary,
  AdminActionKind,
  AdminAuditEvent,
  AdminExportAcademicRole,
  AdminExportFormat,
  AdminExportMemberStatus,
  AdminExportPurposeCode,
  AdminExportResult,
  AdminMemberSort,
  AdminMemberSummary,
  AdminRole,
  AdminSession,
  AdminSortDirection,
  RosterGrade
} from "./adminClient";
import type { MockAdminAction, MockAdminState } from "./adminMock";
import {
  ADMIN_INACTIVITY_TIMEOUT_MS,
  adminLockMessage,
  readGoogleCredentialExpiryMs
} from "./adminSessionGuard";
import type { AdminLockReason } from "./adminSessionGuard";

const PUBLIC_ADMIN_ENVIRONMENT = {
  NEXT_PUBLIC_LIBRARY_ADMIN_MODE:
    process.env.NEXT_PUBLIC_LIBRARY_ADMIN_MODE,
  NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL:
    process.env.NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL,
  NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID:
    process.env.NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID
};

const ADMIN_PREVIEW_BUILD =
  process.env.NEXT_PUBLIC_LIBRARY_ADMIN_MODE !== "google"
  && process.env.NEXT_PUBLIC_LIBRARY_UI_REVIEW !== "true";
const loadAdminPreviewModule = ADMIN_PREVIEW_BUILD
  ? () => import("./adminMock")
  : null;
type AdminPreviewModule = typeof import("./adminMock");

type DashboardTab = "applications" | "members" | "export" | "audit";
type ExportReceipt = Omit<AdminExportResult, "blob">;

const TAB_LABELS: Record<DashboardTab, string> = {
  members: "登録者名簿",
  applications: "申請",
  export: "名簿出力",
  audit: "操作履歴"
};
const ROLE_LABELS: Record<AdminRole, string> = {
  viewer: "閲覧担当",
  operator: "運用担当",
  admin: "管理責任者"
};

const REVIEW_LABELS: Record<string, string> = {
  pending: "個別確認待ち",
  approved: "承認済み",
  rejected: "却下済み",
  not_required: "自動判定"
};

const DRIVE_LABELS: Record<string, string> = {
  not_enqueued: "未処理",
  pending: "処理待ち",
  granted: "閲覧可",
  already_granted: "付与済み",
  failed: "失敗",
  revoked: "取消済み"
};

const ACTION_LABELS: Record<AdminActionKind, string> = {
  approve: "申請を承認",
  reject: "申請を却下",
  retry: "共有フォルダ処理を再実行",
  deactivate: "利用停止のみ（閲覧権限は変更しない）",
  revoke: "利用停止＋管理対象の閲覧権限を取消"
};

const EXPORT_PURPOSE_LABELS: Record<AdminExportPurposeCode, string> = {
  periodic_roster_review: "定期的な利用者名簿の確認",
  drive_access_reconciliation: "登録状態と共有フォルダ閲覧権限の照合",
  incident_response: "承認済みの情報セキュリティ事故対応"
};

const ELIGIBILITY_LABELS: Record<string, string> = {
  approved: "承認条件を満たす",
  manual_review: "個別確認が必要",
  ineligible: "利用条件の確認が必要",
  already_registered: "登録済み"
};

const MEMBER_STATUS_LABELS: Record<string, string> = {
  active: "利用中",
  pending_review: "確認待ち",
  inactive: "利用停止",
  not_created: "未登録"
};

const REASON_LABELS: Record<string, string> = {
  account_not_verified: "大学アカウントを確認できませんでした。",
  token_invalid: "認証情報を確認できませんでした。",
  email_not_verified: "メールアドレスの確認が必要です。",
  hosted_domain_not_allowed: "対象外の大学アカウントです。",
  email_domain_not_allowed: "北里大学のメールアドレスを確認できませんでした。",
  full_name_required: "氏名の確認が必要です。",
  academic_role_required: "在籍区分の確認が必要です。",
  faculty_required: "所属の確認が必要です。",
  grade_required: "学年の確認が必要です。",
  grade_invalid: "在籍区分と学年が一致していません。",
  student_number_required: "学籍番号の確認が必要です。",
  student_number_invalid: "学籍番号の形式を確認してください。",
  terms_required: "利用規約への同意を確認できませんでした。",
  privacy_required: "個人情報の取り扱いへの同意を確認できませんでした。",
  existing_registration_found: "同じ内容の登録があります。",
  existing_registration_conflict: "既存登録と異なる情報があります。",
  role_requires_manual_review: "在籍区分の個別確認が必要です。",
  faculty_requires_manual_review: "所属の個別確認が必要です。",
  non_student_email_requires_manual_review: "大学メールの個別確認が必要です。",
  eligible: "承認条件を満たしています。"
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  application_approve: "申請を承認",
  application_reject: "申請を却下",
  operation_retry: "共有フォルダ処理を再実行",
  member_deactivate: "利用を停止",
  member_revoke: "利用停止と閲覧権限の取消",
  member_export_csv: "名簿を出力",
  member_export_xlsx: "名簿を出力"
};

const AUDIT_RESULT_LABELS: Record<string, string> = {
  accepted: "受付済み",
  completed: "完了",
  succeeded: "完了",
  failed: "失敗",
  downloaded: "ダウンロード済み",
  downloaded_synthetic: "ダウンロード済み"
};

export function AdminDashboard() {
  const runtimeConfig = useMemo(
    () => readAdminRuntimeConfig(PUBLIC_ADMIN_ENVIRONMENT),
    []
  );
  const [session, setSession] = useState<AdminSession | null>(null);
  const [credential, setCredential] = useState<string | null>(null);
  const [previewHostAllowed, setPreviewHostAllowed] = useState(false);
  const [previewModule, setPreviewModule] = useState<AdminPreviewModule | null>(null);
  const [mockState, setMockState] = useState<MockAdminState | null>(null);
  const [applications, setApplications] = useState<AdminApplicationSummary[]>([]);
  const [members, setMembers] = useState<AdminMemberSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [memberPage, setMemberPage] = useState(1);
  const [membersHaveMore, setMembersHaveMore] = useState(false);
  const [selected, setSelected] = useState<AdminApplicationDetail | null>(null);
  const [auditEvents, setAuditEvents] = useState<AdminAuditEvent[]>([]);
  const [tab, setTab] = useState<DashboardTab>("members");
  const [query, setQuery] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [driveStatus, setDriveStatus] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [memberGrade, setMemberGrade] = useState<RosterGrade | "">("");
  const [memberStatus, setMemberStatus] = useState<AdminExportMemberStatus>("active");
  const [memberSort, setMemberSort] = useState<AdminMemberSort>("grade");
  const [memberSortDirection, setMemberSortDirection] = useState<AdminSortDirection>("asc");
  const [actionKind, setActionKind] = useState<AdminActionKind | "">("");
  const [actionReason, setActionReason] = useState("");
  const [actionConfirmed, setActionConfirmed] = useState(false);
  const [exportFormat, setExportFormat] = useState<AdminExportFormat>("csv");
  const [exportMemberStatus, setExportMemberStatus] = useState<AdminExportMemberStatus>("active");
  const [exportAcademicRole, setExportAcademicRole] = useState<AdminExportAcademicRole | "">("");
  const [exportPurposeCode, setExportPurposeCode] = useState<AdminExportPurposeCode | "">("");
  const [exportConfirmed, setExportConfirmed] = useState(false);
  const [lastExport, setLastExport] = useState<ExportReceipt | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const lastDetailTriggerRef = useRef<HTMLButtonElement>(null);
  const exportInFlightRef = useRef(false);
  const sessionEpochRef = useRef(0);
  const credentialExpiresAtRef = useRef<number | null>(null);
  const visibilityEpochRef = useRef(0);
  const previewEnabled = ADMIN_PREVIEW_BUILD && previewHostAllowed;

  const clearAdminSession = useCallback((reason: AdminLockReason | null) => {
    sessionEpochRef.current += 1;
    credentialExpiresAtRef.current = null;
    exportInFlightRef.current = false;
    setCredential(null);
    setSession(null);
    setApplications([]);
    setMembers([]);
    setPage(1);
    setHasMore(false);
    setMemberPage(1);
    setMembersHaveMore(false);
    setSelected(null);
    setAuditEvents([]);
    setTab("members");
    setQuery("");
    setReviewStatus("");
    setDriveStatus("");
    setMemberQuery("");
    setMemberGrade("");
    setMemberStatus("active");
    setMemberSort("grade");
    setMemberSortDirection("asc");
    setActionKind("");
    setActionReason("");
    setActionConfirmed(false);
    setExportFormat("csv");
    setExportMemberStatus("active");
    setExportAcademicRole("");
    setExportPurposeCode("");
    setExportConfirmed(false);
    setLastExport(null);
    setIsAuthenticating(false);
    setIsLoading(false);
    setIsMutating(false);
    setIsExporting(false);
    setMessage(null);
    setError(reason ? adminLockMessage(reason) : null);
  }, []);

  const handleAdminRequestError = useCallback((caught: unknown) => {
    if (
      !previewEnabled
      && caught instanceof AdminApiError
      && caught.status === 401
    ) {
      clearAdminSession("unauthorized");
      return;
    }
    setError(adminErrorMessage(caught));
  }, [clearAdminSession, previewEnabled]);

  useEffect(() => {
    setPreviewHostAllowed(
      ADMIN_PREVIEW_BUILD && isTrustedAdminPreviewLocation(window.location)
    );
  }, []);

  useEffect(() => {
    if (!previewEnabled || !loadAdminPreviewModule) return;
    let active = true;
    void loadAdminPreviewModule()
      .then((module) => {
        if (!active) return;
        setPreviewModule(module);
        setMockState(module.createMockAdminState());
      })
      .catch(() => {
        if (active) setError("表示情報を準備できませんでした。再読み込みしてください。");
      });
    return () => {
      active = false;
    };
  }, [previewEnabled]);

  useEffect(() => {
    if (previewEnabled || runtimeConfig.mode !== "google") return;

    const noteHiddenPage = () => {
      if (document.visibilityState === "hidden") {
        visibilityEpochRef.current += 1;
      }
    };
    const notePageHide = () => {
      visibilityEpochRef.current += 1;
    };

    document.addEventListener("visibilitychange", noteHiddenPage);
    window.addEventListener("pagehide", notePageHide);
    return () => {
      document.removeEventListener("visibilitychange", noteHiddenPage);
      window.removeEventListener("pagehide", notePageHide);
    };
  }, [previewEnabled, runtimeConfig.mode]);

  useEffect(() => {
    if (selected) detailRef.current?.focus();
  }, [selected?.applicationId]);

  useEffect(() => {
    if (
      previewEnabled
      || runtimeConfig.mode !== "google"
      || !session
      || !credential
    ) return;

    const expiresAt = credentialExpiresAtRef.current
      ?? readGoogleCredentialExpiryMs(credential);
    if (expiresAt === null) {
      clearAdminSession("credential_invalid");
      return;
    }

    let lastActivityAt = Date.now();
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;

    const clearDeadlineTimer = () => {
      if (deadlineTimer !== null) clearTimeout(deadlineTimer);
      deadlineTimer = null;
    };

    const enforceDeadlines = () => {
      const now = Date.now();
      if (now >= expiresAt) {
        clearAdminSession("credential_expired");
        return;
      }
      if (now - lastActivityAt >= ADMIN_INACTIVITY_TIMEOUT_MS) {
        clearAdminSession("inactive");
        return;
      }

      clearDeadlineTimer();
      deadlineTimer = setTimeout(
        enforceDeadlines,
        Math.max(1, Math.min(
          expiresAt - now,
          ADMIN_INACTIVITY_TIMEOUT_MS - (now - lastActivityAt)
        ))
      );
    };

    const markActivity = () => {
      const now = Date.now();
      if (now >= expiresAt) {
        clearAdminSession("credential_expired");
        return;
      }
      if (now - lastActivityAt >= ADMIN_INACTIVITY_TIMEOUT_MS) {
        clearAdminSession("inactive");
        return;
      }
      lastActivityAt = now;
      enforceDeadlines();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearAdminSession("page_hidden");
        return;
      }
      enforceDeadlines();
    };
    const handlePageHide = () => clearAdminSession("page_hidden");
    const activityOptions: AddEventListenerOptions = {
      capture: true,
      passive: true
    };

    window.addEventListener("pointerdown", markActivity, activityOptions);
    window.addEventListener("keydown", markActivity, activityOptions);
    window.addEventListener("scroll", markActivity, activityOptions);
    window.addEventListener("touchstart", markActivity, activityOptions);
    window.addEventListener("focus", enforceDeadlines);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    handleVisibilityChange();

    return () => {
      clearDeadlineTimer();
      window.removeEventListener("pointerdown", markActivity, activityOptions);
      window.removeEventListener("keydown", markActivity, activityOptions);
      window.removeEventListener("scroll", markActivity, activityOptions);
      window.removeEventListener("touchstart", markActivity, activityOptions);
      window.removeEventListener("focus", enforceDeadlines);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearAdminSession, credential, previewEnabled, runtimeConfig.mode, session]);

  const filteredMockApplications = useMemo(() => {
    if (!mockState) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return mockState.applications.filter((application) => {
      const matchesQuery = !normalizedQuery || [
        application.fullName,
        application.email,
        application.studentNumber ?? "",
        application.applicationId
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
      const matchesReview = !reviewStatus || application.adminDecision === reviewStatus;
      const matchesDrive = !driveStatus || application.driveAccessStatus === driveStatus;
      return matchesQuery && matchesReview && matchesDrive;
    });
  }, [driveStatus, mockState, query, reviewStatus]);

  const visibleApplications = previewEnabled
    ? filteredMockApplications
    : applications;

  const visibleMembers = useMemo(() => (
    previewEnabled
      ? previewModule && mockState
        ? previewModule.listMockAdminMembers(mockState, {
          query: memberQuery,
          grade: memberGrade,
          memberStatus,
          sortBy: memberSort,
          sortDirection: memberSortDirection
        })
        : []
      : members
  ), [
    memberGrade,
    memberQuery,
    memberSort,
    memberSortDirection,
    memberStatus,
    members,
    mockState,
    previewModule
  ]);

  const resetAction = useCallback(() => {
    setActionKind("");
    setActionReason("");
    setActionConfirmed(false);
  }, []);

  const resetExport = useCallback(() => {
    setExportPurposeCode("");
    setExportConfirmed(false);
    setLastExport(null);
  }, []);

  function enterMockDashboard() {
    if (!mockState) return;
    const nextSession: AdminSession = {
      authorized: true,
      role: "admin",
      mutationsEnabled: true,
      exportEnabled: true
    };
    setSession(nextSession);
    setCredential(null);
    setSelected(null);
    setTab("members");
    setAuditEvents(mockState.auditEvents);
    setError(null);
    setMessage("管理画面を開きました。この画面で確認した内容は保存されません。");
  }

  const handleGoogleCredential = useCallback(async (nextCredential: string) => {
    const expiresAt = readGoogleCredentialExpiryMs(nextCredential);
    if (expiresAt === null || expiresAt <= Date.now()) {
      clearAdminSession(
        expiresAt === null ? "credential_invalid" : "credential_expired"
      );
      return;
    }

    const authenticationEpoch = sessionEpochRef.current + 1;
    const authenticationVisibilityEpoch = visibilityEpochRef.current;
    sessionEpochRef.current = authenticationEpoch;
    credentialExpiresAtRef.current = expiresAt;
    setIsAuthenticating(true);
    setError(null);
    setMessage(null);
    try {
      const [nextSession, page, rosterPage] = await Promise.all([
        getAdminSession(runtimeConfig, nextCredential),
        listAdminApplications(
          runtimeConfig,
          nextCredential,
          { page: 1, pageSize: 25 }
        ),
        listAdminMembers(
          runtimeConfig,
          nextCredential,
          {
            page: 1,
            pageSize: 25,
            memberStatus: "active",
            sortBy: "grade",
            sortDirection: "asc"
          }
        )
      ]);
      if (authenticationEpoch !== sessionEpochRef.current) return;
      if (
        authenticationVisibilityEpoch !== visibilityEpochRef.current
        || document.visibilityState === "hidden"
      ) {
        clearAdminSession("page_hidden");
        return;
      }
      if (Date.now() >= expiresAt) {
        clearAdminSession("credential_expired");
        return;
      }
      setCredential(nextCredential);
      setSession(nextSession);
      setApplications(page.items);
      setMembers(rosterPage.items);
      setTab("members");
      setPage(1);
      setHasMore(page.hasMore);
      setMemberPage(1);
      setMembersHaveMore(rosterPage.hasMore);
    } catch (caught) {
      if (authenticationEpoch !== sessionEpochRef.current) return;
      if (caught instanceof AdminApiError && caught.status === 401) {
        clearAdminSession("unauthorized");
      } else {
        clearAdminSession(null);
        setError(adminErrorMessage(caught));
      }
    } finally {
      if (authenticationEpoch === sessionEpochRef.current) {
        setIsAuthenticating(false);
      }
    }
  }, [clearAdminSession, runtimeConfig]);

  function signOut() {
    clearAdminSession(null);
  }

  async function loadApplicationsPage(nextPage: number) {
    if (!session || previewEnabled) return;
    if (!credential) return;
    const requestEpoch = sessionEpochRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const page = await listAdminApplications(runtimeConfig, credential, {
        query,
        reviewStatus,
        driveStatus,
        page: nextPage,
        pageSize: 25
      });
      if (requestEpoch !== sessionEpochRef.current) return;
      setApplications(page.items);
      setPage(nextPage);
      setHasMore(page.hasMore);
      setSelected(null);
      resetAction();
    } catch (caught) {
      if (requestEpoch === sessionEpochRef.current) {
        handleAdminRequestError(caught);
      }
    } finally {
      if (requestEpoch === sessionEpochRef.current) setIsLoading(false);
    }
  }

  async function refreshApplications(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    await loadApplicationsPage(1);
  }

  async function loadMembersPage(nextPage: number) {
    if (!session || previewEnabled || !credential) return;
    const requestEpoch = sessionEpochRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const rosterPage = await listAdminMembers(runtimeConfig, credential, {
        query: memberQuery,
        grade: memberGrade,
        memberStatus,
        sortBy: memberSort,
        sortDirection: memberSortDirection,
        page: nextPage,
        pageSize: 25
      });
      if (requestEpoch !== sessionEpochRef.current) return;
      setMembers(rosterPage.items);
      setMemberPage(nextPage);
      setMembersHaveMore(rosterPage.hasMore);
    } catch (caught) {
      if (requestEpoch === sessionEpochRef.current) {
        handleAdminRequestError(caught);
      }
    } finally {
      if (requestEpoch === sessionEpochRef.current) setIsLoading(false);
    }
  }

  async function refreshMembers(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    await loadMembersPage(1);
  }

  function openMembers() {
    setTab("members");
    setSelected(null);
    resetAction();
    setError(null);
    setMessage(null);
  }

  async function openApplication(application: AdminApplicationSummary) {
    setError(null);
    setMessage(null);
    resetAction();
    if (previewEnabled) {
      if (!mockState) return;
      const detail = mockState.applications.find(
        (candidate) => candidate.applicationId === application.applicationId
      );
      setSelected(detail ?? null);
      return;
    }
    if (!credential) return;
    const requestEpoch = sessionEpochRef.current;
    setIsLoading(true);
    try {
      const detail = await getAdminApplication(
        runtimeConfig,
        credential,
        application.applicationId
      );
      if (requestEpoch !== sessionEpochRef.current) return;
      setSelected(detail);
    } catch (caught) {
      if (requestEpoch === sessionEpochRef.current) {
        handleAdminRequestError(caught);
      }
    } finally {
      if (requestEpoch === sessionEpochRef.current) setIsLoading(false);
    }
  }

  function closeApplication() {
    setSelected(null);
    resetAction();
    window.requestAnimationFrame(() => lastDetailTriggerRef.current?.focus());
  }

  async function openAudit() {
    setTab("audit");
    setSelected(null);
    resetAction();
    if (previewEnabled) {
      if (!mockState) return;
      setAuditEvents(mockState.auditEvents);
      return;
    }
    if (!credential) return;
    const requestEpoch = sessionEpochRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const page = await listAdminAuditEvents(runtimeConfig, credential);
      if (requestEpoch !== sessionEpochRef.current) return;
      setAuditEvents(page.items);
    } catch (caught) {
      if (requestEpoch === sessionEpochRef.current) {
        handleAdminRequestError(caught);
      }
    } finally {
      if (requestEpoch === sessionEpochRef.current) setIsLoading(false);
    }
  }

  function openExport() {
    if (!session || !session.exportEnabled || !canExport(session.role)) return;
    setTab("export");
    setSelected(null);
    resetAction();
    setError(null);
    setMessage(null);
  }

  async function executeExport() {
    if (
      !session
      || !session.exportEnabled
      || !canExport(session.role)
      || exportInFlightRef.current
      || !exportPurposeCode
      || !exportConfirmed
      || (previewEnabled && exportFormat === "xlsx")
    ) return;

    const requestEpoch = sessionEpochRef.current;
    exportInFlightRef.current = true;
    setIsExporting(true);
    setError(null);
    setMessage(null);
    try {
      const request = {
        format: exportFormat,
        memberStatus: exportMemberStatus,
        academicRole: exportAcademicRole || null,
        purposeCode: exportPurposeCode,
        confirmed: true as const
      };
      let result: AdminExportResult;
      if (previewEnabled) {
        if (!previewModule || !mockState) {
          throw new AdminApiError(503, "admin_preview_not_ready");
        }
        const mockExport = await previewModule.applyMockAdminExport(
          mockState,
          session.role,
          request
        );
        setMockState(mockExport.state);
        setAuditEvents(mockExport.state.auditEvents);
        result = mockExport.result;
      } else {
        if (!credential) throw new AdminApiError(401, "admin_credential_missing");
        result = await exportAdminMembers(runtimeConfig, credential, request);
      }
      if (requestEpoch !== sessionEpochRef.current) return;
      setLastExport({
        filename: result.filename,
        runId: result.runId,
        rowCount: result.rowCount,
        contentSha256: result.contentSha256,
        deleteAfter: result.deleteAfter
      });
      downloadAdminExport(result);
      setExportPurposeCode("");
      setExportConfirmed(false);
      setMessage(`${result.rowCount}件の名簿スナップショットをダウンロードしました。`);
    } catch (caught) {
      if (requestEpoch === sessionEpochRef.current) {
        handleAdminRequestError(caught);
      }
    } finally {
      if (requestEpoch === sessionEpochRef.current) {
        exportInFlightRef.current = false;
        setIsExporting(false);
      }
    }
  }

  async function executeAction() {
    if (
      !session
      || !session.mutationsEnabled
      || !selected
      || !actionKind
      || actionReason.trim().length < 8
      || !actionConfirmed
    ) return;

    const requestEpoch = sessionEpochRef.current;
    setIsMutating(true);
    setError(null);
    setMessage(null);
    try {
      let updated: AdminApplicationDetail;
      if (previewEnabled) {
        if (!previewModule || !mockState) {
          throw new AdminApiError(503, "admin_preview_not_ready");
        }
        const mockAction = toMockAction(
          selected,
          actionKind,
          actionReason
        );
        const result = previewModule.applyMockAdminAction(
          mockState,
          session.role,
          mockAction
        );
        setMockState(result.state);
        setAuditEvents(result.state.auditEvents);
        updated = result.application;
      } else {
        if (!credential) return;
        if (actionKind === "approve" || actionKind === "reject") {
          await decideAdminApplication(
            runtimeConfig,
            credential,
            selected.applicationId,
            actionKind,
            actionReason.trim(),
            selected.recordVersion
          );
        } else if (actionKind === "retry") {
          if (!selected.operationId) throw new AdminApiError(409, "operation_missing");
          await retryAdminOperation(
            runtimeConfig,
            credential,
            selected.operationId,
            actionReason.trim(),
            selected.operationRecordVersion ?? 0
          );
        } else if (actionKind === "revoke") {
          if (!selected.memberId) throw new AdminApiError(409, "member_missing");
          await revokeAdminMember(
            runtimeConfig,
            credential,
            selected.memberId,
            actionReason.trim(),
            selected.memberRecordVersion ?? selected.recordVersion
          );
        } else {
          if (!selected.memberId) throw new AdminApiError(409, "member_missing");
          await deactivateAdminMember(
            runtimeConfig,
            credential,
            selected.memberId,
            actionReason.trim(),
            selected.memberRecordVersion ?? selected.recordVersion
          );
        }
        if (requestEpoch !== sessionEpochRef.current) return;
        updated = await getAdminApplication(
          runtimeConfig,
          credential,
          selected.applicationId
        );
      }

      if (requestEpoch !== sessionEpochRef.current) return;
      setSelected(updated);
      setApplications((current) => current.map((application) =>
        application.applicationId === updated.applicationId
          ? updated
          : application
      ));
      setMessage(`${ACTION_LABELS[actionKind]}を受け付けました。操作履歴を確認してください。`);
      resetAction();
    } catch (caught) {
      if (requestEpoch === sessionEpochRef.current) {
        handleAdminRequestError(caught);
      }
    } finally {
      if (requestEpoch === sessionEpochRef.current) setIsMutating(false);
    }
  }

  return (
    <main className="admin-app" id="admin-main">
      <a className="admin-skip-link" href={session ? "#admin-content" : "#admin-title"}>管理内容へ移動</a>
      <header className="admin-header">
        <div className="admin-brand" aria-label="未来戦略ライブラリ 管理">
          <span>
            <strong>未来戦略ライブラリ</strong>
            <small>管理</small>
          </span>
        </div>
      </header>

      {!session ? (
        <section className="admin-login" aria-labelledby="admin-title">
          <div className="admin-login-card">
            <h1 id="admin-title">管理者ログイン</h1>
            {previewEnabled ? (
              <div className="admin-login-controls">
                <button
                  className="admin-button admin-button-primary"
                  type="button"
                  onClick={enterMockDashboard}
                  disabled={!mockState || !previewModule}
                >
                  {mockState && previewModule ? "管理画面を開く" : "画面を準備しています"}
                </button>
              </div>
            ) : runtimeConfig.mode === "google" && runtimeConfig.ready ? (
              <>
                <GoogleSignInButton
                  clientId={runtimeConfig.googleClientId}
                  onCredential={handleGoogleCredential}
                  onError={() => setError("Google認証画面を読み込めませんでした。")}
                />
                {isAuthenticating && <p className="admin-inline-status" role="status">確認中…</p>}
              </>
            ) : (
              <p className="admin-alert is-error" role="alert">
                管理画面の認証設定が完了していません。運営担当者にお問い合わせください。
              </p>
            )}
            {error && <p className="admin-alert is-error" role="alert">{error}</p>}
          </div>
        </section>
      ) : (
        <div className="admin-shell" id="admin-content">
          <aside className="admin-sidebar" aria-label="管理メニュー">
            <div className="admin-session-card">
              <span>現在の利用権限</span>
              <strong>{ROLE_LABELS[session.role]}</strong>
            </div>
            <nav>
              <button
                className={tab === "members" ? "is-active" : ""}
                type="button"
                aria-pressed={tab === "members"}
                onClick={openMembers}
              >
                登録者名簿
              </button>
              <button
                className={tab === "applications" ? "is-active" : ""}
                type="button"
                aria-pressed={tab === "applications"}
                onClick={() => { setTab("applications"); setSelected(null); resetAction(); }}
              >
                申請
              </button>
              {session.exportEnabled && canExport(session.role) && (
                <button
                  className={tab === "export" ? "is-active" : ""}
                  type="button"
                  aria-pressed={tab === "export"}
                  onClick={openExport}
                >
                  名簿出力
                </button>
              )}
              {session.role !== "viewer" && (
                <button
                  className={tab === "audit" ? "is-active" : ""}
                  type="button"
                  aria-pressed={tab === "audit"}
                  onClick={openAudit}
                >
                  操作履歴
                </button>
              )}
            </nav>
            <button className="admin-signout" type="button" onClick={signOut}>ログアウト</button>
          </aside>

          <section className="admin-workspace" aria-busy={isLoading || isMutating || isExporting}>
            <div className="admin-workspace-heading">
              <h1>{TAB_LABELS[tab]}</h1>
            </div>

            {message && <p className="admin-alert is-success" role="status">{message}</p>}
            {error && <p className="admin-alert is-error" role="alert">{error}</p>}
            {isLoading && <p className="admin-inline-status" role="status">読み込んでいます。</p>}

            {tab === "applications" ? (
              <>
                <form className="admin-filters" onSubmit={refreshApplications}>
                  <label>
                    <span>氏名・メール・学籍番号</span>
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="検索"
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    <span>個別確認</span>
                    <select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value)}>
                      <option value="">すべて</option>
                      <option value="pending">確認待ち</option>
                      <option value="approved">承認済み</option>
                      <option value="rejected">却下済み</option>
                      <option value="not_required">自動判定</option>
                    </select>
                  </label>
                  <label>
                    <span>共有フォルダ</span>
                    <select value={driveStatus} onChange={(event) => setDriveStatus(event.target.value)}>
                      <option value="">すべて</option>
                      <option value="pending">処理待ち</option>
                      <option value="granted">閲覧可</option>
                      <option value="failed">失敗</option>
                      <option value="revoked">取消済み</option>
                    </select>
                  </label>
                  <button className="admin-button" type="submit">絞り込む</button>
                </form>

                <div className="admin-summary-strip" aria-label="現在の表示件数">
                  <span>表示</span><strong>{visibleApplications.length}</strong><span>件</span>
                </div>

                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>申請者</th>
                        <th>区分</th>
                        <th>個別確認</th>
                        <th>共有フォルダ</th>
                        <th>登録日時</th>
                        <th><span className="sr-only">詳細</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleApplications.map((application) => (
                        <tr key={application.applicationId}>
                          <td data-label="申請者">
                            <strong>{application.fullName}</strong>
                            <small>{application.email}</small>
                            {application.studentNumber && <code>{application.studentNumber}</code>}
                          </td>
                          <td data-label="区分">{roleName(application.academicRole)}</td>
                          <td data-label="個別確認"><StatusPill value={application.adminDecision} labels={REVIEW_LABELS} /></td>
                          <td data-label="共有フォルダ"><StatusPill value={application.driveAccessStatus} labels={DRIVE_LABELS} /></td>
                          <td data-label="登録日時">{formatDate(application.createdAt)}</td>
                          <td>
                            <button
                              className="admin-detail-button"
                              type="button"
                              aria-label={`${application.fullName}の申請詳細を確認`}
                              onClick={(event) => {
                                lastDetailTriggerRef.current = event.currentTarget;
                                void openApplication(application);
                              }}
                            >
                              詳細を確認
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {visibleApplications.length === 0 && (
                    <p className="admin-empty">条件に一致する申請はありません。</p>
                  )}
                </div>

                {!previewEnabled && (
                  <nav className="admin-pagination" aria-label="申請一覧のページ">
                    <button
                      className="admin-button"
                      type="button"
                      disabled={page <= 1 || isLoading}
                      onClick={() => loadApplicationsPage(page - 1)}
                    >
                      前の25件
                    </button>
                    <span>{page}ページ</span>
                    <button
                      className="admin-button"
                      type="button"
                      disabled={!hasMore || isLoading}
                      onClick={() => loadApplicationsPage(page + 1)}
                    >
                      次の25件
                    </button>
                  </nav>
                )}

                {selected && (
                  <ApplicationDetail
                    detailRef={detailRef}
                    application={selected}
                    role={session.role}
                    mutationsEnabled={session.mutationsEnabled}
                    actionKind={actionKind}
                    actionReason={actionReason}
                    actionConfirmed={actionConfirmed}
                    isMutating={isMutating}
                    onClose={closeApplication}
                    onActionKind={setActionKind}
                    onActionReason={setActionReason}
                    onActionConfirmed={setActionConfirmed}
                    onExecute={executeAction}
                  />
                )}
              </>
            ) : tab === "members" ? (
              <MemberRoster
                members={visibleMembers}
                mode={previewEnabled ? "mock" : "google"}
                query={memberQuery}
                grade={memberGrade}
                memberStatus={memberStatus}
                sortBy={memberSort}
                sortDirection={memberSortDirection}
                page={memberPage}
                hasMore={membersHaveMore}
                isLoading={isLoading}
                onQuery={setMemberQuery}
                onGrade={setMemberGrade}
                onMemberStatus={setMemberStatus}
                onSort={setMemberSort}
                onSortDirection={setMemberSortDirection}
                onRefresh={refreshMembers}
                onPage={loadMembersPage}
              />
            ) : tab === "export" ? (
              <ExportPanel
                mode={previewEnabled ? "mock" : "google"}
                format={exportFormat}
                memberStatus={exportMemberStatus}
                academicRole={exportAcademicRole}
                purposeCode={exportPurposeCode}
                confirmed={exportConfirmed}
                isExporting={isExporting}
                lastExport={lastExport}
                onFormat={(value) => {
                  setExportFormat(value);
                  setExportConfirmed(false);
                }}
                onMemberStatus={(value) => {
                  setExportMemberStatus(value);
                  setExportConfirmed(false);
                }}
                onAcademicRole={(value) => {
                  setExportAcademicRole(value);
                  setExportConfirmed(false);
                }}
                onPurposeCode={(value) => {
                  setExportPurposeCode(value);
                  setExportConfirmed(false);
                }}
                onConfirmed={setExportConfirmed}
                onExecute={executeExport}
              />
            ) : (
              <AuditTable events={auditEvents} />
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function MemberRoster({
  members,
  mode,
  query,
  grade,
  memberStatus,
  sortBy,
  sortDirection,
  page,
  hasMore,
  isLoading,
  onQuery,
  onGrade,
  onMemberStatus,
  onSort,
  onSortDirection,
  onRefresh,
  onPage
}: {
  members: AdminMemberSummary[];
  mode: "mock" | "google";
  query: string;
  grade: RosterGrade | "";
  memberStatus: AdminExportMemberStatus;
  sortBy: AdminMemberSort;
  sortDirection: AdminSortDirection;
  page: number;
  hasMore: boolean;
  isLoading: boolean;
  onQuery: (value: string) => void;
  onGrade: (value: RosterGrade | "") => void;
  onMemberStatus: (value: AdminExportMemberStatus) => void;
  onSort: (value: AdminMemberSort) => void;
  onSortDirection: (value: AdminSortDirection) => void;
  onRefresh: (event?: FormEvent<HTMLFormElement>) => Promise<void>;
  onPage: (page: number) => Promise<void>;
}) {
  return (
    <section className="admin-roster" aria-labelledby="admin-roster-title">
      <h2 className="sr-only" id="admin-roster-title">登録者名簿の一覧</h2>

      <form className="admin-filters admin-roster-filters" onSubmit={onRefresh}>
        <label>
          <span>氏名・学籍番号</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="検索"
            autoComplete="off"
          />
        </label>
        <label>
          <span>学年</span>
          <select value={grade} onChange={(event) => onGrade(event.target.value as RosterGrade | "")}>
            <option value="">すべて</option>
            {(["1年", "2年", "3年", "4年", "5年", "6年", "M1", "M2", "その他"] as RosterGrade[])
              .map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>利用状態</span>
          <select
            value={memberStatus}
            onChange={(event) => onMemberStatus(event.target.value as AdminExportMemberStatus)}
          >
            <option value="active">利用中</option>
            <option value="pending_review">確認待ち</option>
            <option value="inactive">利用停止</option>
            <option value="all">すべて</option>
          </select>
        </label>
        <label>
          <span>並べ替え</span>
          <select value={sortBy} onChange={(event) => onSort(event.target.value as AdminMemberSort)}>
            <option value="grade">学年</option>
            <option value="student_number">学籍番号</option>
            <option value="registered_at">登録日時</option>
          </select>
        </label>
        <label>
          <span>順序</span>
          <select
            value={sortDirection}
            onChange={(event) => onSortDirection(event.target.value as AdminSortDirection)}
          >
            <option value="asc">昇順</option>
            <option value="desc">降順</option>
          </select>
        </label>
        <button className="admin-button" type="submit">表示を更新</button>
      </form>

      <div className="admin-summary-strip" aria-label="現在の名簿表示件数">
        <span>表示</span><strong>{members.length}</strong><span>件</span>
      </div>

      <div
        className="admin-table-wrap admin-roster-table-wrap"
        tabIndex={0}
        aria-label="登録者名簿。画面が狭い場合は横にスクロールできます。"
      >
        <table className="admin-table admin-roster-table">
          <caption className="sr-only">
            氏名、学年、学籍番号、登録日時を一覧で表示しています。
          </caption>
          <colgroup>
            <col className="admin-roster-col-number" />
            <col className="admin-roster-col-name" />
            <col className="admin-roster-col-grade" />
            <col className="admin-roster-col-student" />
            <col className="admin-roster-col-date" />
          </colgroup>
          <thead>
            <tr>
              <th className="admin-row-number" scope="col">行</th>
              <th scope="col">氏名</th>
              <th scope="col">学年</th>
              <th scope="col">学籍番号</th>
              <th scope="col">登録日時</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member, index) => (
              <tr key={member.memberId}>
                <th className="admin-row-number" scope="row">
                  {mode === "google" ? ((page - 1) * 25) + index + 1 : index + 1}
                </th>
                <td data-label="氏名"><strong>{member.fullName}</strong></td>
                <td data-label="学年">{member.grade}</td>
                <td data-label="学籍番号">{member.studentNumber ? <code>{member.studentNumber}</code> : "—"}</td>
                <td data-label="登録日時">
                  {member.registeredAt ? formatDate(member.registeredAt) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.length === 0 && <p className="admin-empty">条件に一致する登録者はいません。</p>}
      </div>

      {mode === "google" && (
        <nav className="admin-pagination" aria-label="登録者名簿のページ">
          <button
            className="admin-button"
            type="button"
            disabled={page <= 1 || isLoading}
            onClick={() => void onPage(page - 1)}
          >
            前の25件
          </button>
          <span>{page}ページ</span>
          <button
            className="admin-button"
            type="button"
            disabled={!hasMore || isLoading}
            onClick={() => void onPage(page + 1)}
          >
            次の25件
          </button>
        </nav>
      )}
    </section>
  );
}

function ExportPanel({
  mode,
  format,
  memberStatus,
  academicRole,
  purposeCode,
  confirmed,
  isExporting,
  lastExport,
  onFormat,
  onMemberStatus,
  onAcademicRole,
  onPurposeCode,
  onConfirmed,
  onExecute
}: {
  mode: "mock" | "google";
  format: AdminExportFormat;
  memberStatus: AdminExportMemberStatus;
  academicRole: AdminExportAcademicRole | "";
  purposeCode: AdminExportPurposeCode | "";
  confirmed: boolean;
  isExporting: boolean;
  lastExport: ExportReceipt | null;
  onFormat: (value: AdminExportFormat) => void;
  onMemberStatus: (value: AdminExportMemberStatus) => void;
  onAcademicRole: (value: AdminExportAcademicRole | "") => void;
  onPurposeCode: (value: AdminExportPurposeCode | "") => void;
  onConfirmed: (value: boolean) => void;
  onExecute: () => void;
}) {
  const mockXlsxUnavailable = mode === "mock" && format === "xlsx";
  const canExecute = Boolean(purposeCode)
    && confirmed
    && !isExporting
    && !mockXlsxUnavailable;

  return (
    <section className="admin-export" aria-labelledby="admin-export-title">
      <div className="admin-export-intro">
        <div>
          <p className="admin-eyebrow">名簿のダウンロード</p>
          <h2 id="admin-export-title">必要な範囲だけを出力</h2>
          <p>
            認証時点の名簿をファイルにまとめ、件数と内容確認情報を操作履歴へ残します。
            この操作から共有フォルダの権限変更、名簿の書き戻し、メール送信は行いません。
          </p>
        </div>
        <strong>管理責任者のみ</strong>
      </div>

      <form
        className="admin-export-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onExecute();
        }}
      >
        <fieldset className="admin-export-options">
          <legend>出力条件</legend>
          <div className="admin-export-fields">
            <label>
              <span>ファイル形式</span>
              <select
                value={format}
                onChange={(event) => onFormat(event.target.value as AdminExportFormat)}
              >
                <option value="csv">表計算用ファイル（.csv）</option>
                <option value="xlsx" disabled={mode === "mock"}>
                  Excelファイル（.xlsx）{mode === "mock" ? "（運用開始後に利用可）" : ""}
                </option>
              </select>
            </label>
            <label>
              <span>利用者状態</span>
              <select
                value={memberStatus}
                onChange={(event) => onMemberStatus(event.target.value as AdminExportMemberStatus)}
              >
                <option value="active">利用中のみ</option>
                <option value="pending_review">確認待ちのみ</option>
                <option value="inactive">利用停止のみ</option>
                <option value="all">すべて</option>
              </select>
            </label>
            <label>
              <span>区分</span>
              <select
                value={academicRole}
                onChange={(event) => onAcademicRole(event.target.value as AdminExportAcademicRole | "")}
              >
                <option value="">すべて</option>
                <option value="undergraduate">学部生</option>
                <option value="master">修士課程</option>
                <option value="doctoral">博士課程</option>
                <option value="staff">教職員・大学担当者</option>
              </select>
            </label>
          </div>
          <p className="admin-security-note">
            氏名・メール・学籍番号を条件欄やページのアドレスへ入力しない、
            固定の許可済み項目だけを使用します。
          </p>
        </fieldset>

        <fieldset className="admin-export-approval">
          <legend>目的と取扱確認</legend>
          <label>
            <span>利用目的（必須・許可済み項目から選択）</span>
            <select
              value={purposeCode}
              onChange={(event) => onPurposeCode(
                event.target.value as AdminExportPurposeCode | ""
              )}
              required
            >
              <option value="">利用目的を選択</option>
              {Object.entries(EXPORT_PURPOSE_LABELS).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </label>
          <p className="admin-security-note">
            操作履歴には選択した利用目的だけを保存します。自由記述や個人情報は追加しません。
          </p>
          <label className="admin-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => onConfirmed(event.target.checked)}
            />
            <span>
              出力条件と利用目的を確認しました。保存先・再共有の可否・削除期限を承認済みの個人情報管理ルールに従って扱います。
            </span>
          </label>
          {mode === "mock" && (
            <p className="admin-export-mock-note">
              この画面で確認した内容は保存されず、実際の名簿には反映されません。
              表計算用ファイルだけを確認できます。
            </p>
          )}
          <button
            className="admin-button admin-button-primary"
            type="submit"
            disabled={!canExecute}
          >
            {isExporting ? "スナップショットを生成しています" : "確認して名簿をダウンロード"}
          </button>
        </fieldset>
      </form>

      {lastExport && (
        <section className="admin-export-receipt" aria-labelledby="admin-export-receipt-title">
          <div>
            <span className="admin-step">直近のダウンロード</span>
            <h3 id="admin-export-receipt-title">ダウンロード記録</h3>
          </div>
          <dl>
            <div><dt>件数</dt><dd>{lastExport.rowCount}件</dd></div>
            <div><dt>ファイル</dt><dd><code>{displayDownloadFilename(lastExport.filename)}</code></dd></div>
            <div><dt>記録番号</dt><dd><code>{displayManagementId("出力", lastExport.runId)}</code></dd></div>
            <div>
              <dt>削除期限</dt>
              <dd>
                <time dateTime={lastExport.deleteAfter}>{formatDate(lastExport.deleteAfter)}（日本時間）</time>
                <code>{lastExport.deleteAfter}</code>
              </dd>
            </div>
            <div><dt>内容確認コード</dt><dd><code>{lastExport.contentSha256}</code></dd></div>
          </dl>
        </section>
      )}
    </section>
  );
}

function ApplicationDetail({
  detailRef,
  application,
  role,
  mutationsEnabled,
  actionKind,
  actionReason,
  actionConfirmed,
  isMutating,
  onClose,
  onActionKind,
  onActionReason,
  onActionConfirmed,
  onExecute
}: {
  detailRef: RefObject<HTMLElement | null>;
  application: AdminApplicationDetail;
  role: AdminRole;
  mutationsEnabled: boolean;
  actionKind: AdminActionKind | "";
  actionReason: string;
  actionConfirmed: boolean;
  isMutating: boolean;
  onClose: () => void;
  onActionKind: (kind: AdminActionKind | "") => void;
  onActionReason: (reason: string) => void;
  onActionConfirmed: (confirmed: boolean) => void;
  onExecute: () => void;
}) {
  const actions = availableAdminActions(application, role, mutationsEnabled);
  const canExecute = Boolean(
    actionKind
    && actionReason.trim().length >= 8
    && actionConfirmed
    && !isMutating
  );

  return (
    <section
      className="admin-detail"
      aria-labelledby="application-detail-title"
      ref={detailRef}
      tabIndex={-1}
    >
      <div className="admin-detail-heading">
        <div>
          <p className="admin-eyebrow">申請内容</p>
          <h2 id="application-detail-title">{application.fullName}</h2>
        </div>
        <button type="button" className="admin-detail-close" onClick={onClose}>閉じる</button>
      </div>
      <dl className="admin-detail-grid">
        <div><dt>大学メール</dt><dd>{application.email}</dd></div>
        <div><dt>学籍番号</dt><dd>{application.studentNumber ?? "該当なし"}</dd></div>
        <div><dt>所属</dt><dd>{facultyName(application.facultyCode)}</dd></div>
        <div>
          <dt>区分・学年</dt>
          <dd>{roleName(application.academicRole)} / {rosterGradeName(application.academicRole, application.grade)}</dd>
        </div>
        <div><dt>資格判定</dt><dd>{ELIGIBILITY_LABELS[application.eligibilityStatus] ?? "確認中"}</dd></div>
        <div><dt>個別確認</dt><dd>{REVIEW_LABELS[application.adminDecision] ?? application.adminDecision}</dd></div>
        <div><dt>利用者状態</dt><dd>{MEMBER_STATUS_LABELS[application.memberStatus ?? "not_created"] ?? "確認中"}</dd></div>
        <div><dt>共有フォルダ</dt><dd>{DRIVE_LABELS[application.driveAccessStatus] ?? "確認中"}</dd></div>
        <div><dt>閲覧権限の管理</dt><dd>{application.drivePermissionManaged ? "このシステムで管理" : "未管理または権限なし"}</dd></div>
        <div><dt>処理上の問題</dt><dd>{operationErrorName(application.operationErrorCode)}</dd></div>
        <div><dt>更新番号</dt><dd>{application.recordVersion}</dd></div>
        <div><dt>申請管理番号</dt><dd><code>{displayManagementId("申請", application.applicationId)}</code></dd></div>
      </dl>
      <div className="admin-detail-notes">
        <div>
          <h3>判定理由</h3>
          <p>{application.reasonCodes.map(reasonName).join(" / ") || "記録なし"}</p>
        </div>
        {typeof application.question === "string" && (
          <div><h3>任意記入</h3><p>{application.question || "記入なし"}</p></div>
        )}
      </div>

      <div className="admin-action-panel">
        <div>
          <span className="admin-step">重要な操作</span>
          <h3>重要操作</h3>
          <p>利用権限と最新の登録状態を再確認し、実行理由と結果を操作履歴へ残します。</p>
        </div>
        {actions.length > 0 ? (
          <>
            <label>
              <span>実行する操作</span>
              <select
                value={actionKind}
                onChange={(event) => {
                  onActionKind(event.target.value as AdminActionKind | "");
                  onActionConfirmed(false);
                }}
              >
                <option value="">選択してください</option>
                {actions.map((action) => <option value={action} key={action}>{ACTION_LABELS[action]}</option>)}
              </select>
            </label>
            <label>
              <span>操作理由（8文字以上・必須、氏名・メール等は繰り返さない）</span>
              <textarea
                value={actionReason}
                onChange={(event) => { onActionReason(event.target.value); onActionConfirmed(false); }}
                minLength={8}
                maxLength={500}
                rows={3}
                placeholder="確認した根拠と操作理由を記録"
              />
            </label>
            <label className="admin-confirmation">
              <input
                type="checkbox"
                checked={actionConfirmed}
                onChange={(event) => onActionConfirmed(event.target.checked)}
              />
              <span>
                対象者、操作内容、理由を再確認しました。
                {actionKind ? `「${ACTION_LABELS[actionKind]}」を実行します。` : ""}
              </span>
            </label>
            <button
              className="admin-button admin-button-danger"
              type="button"
              disabled={!canExecute}
              onClick={onExecute}
            >
              {isMutating ? "処理しています" : "確認して実行"}
            </button>
          </>
        ) : (
          <p className="admin-empty is-compact">
            現在の利用権限と登録状態では、実行できる重要操作はありません。
          </p>
        )}
      </div>
    </section>
  );
}

function AuditTable({ events }: { events: AdminAuditEvent[] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table admin-audit-table">
        <thead><tr><th>日時</th><th>操作</th><th>利用権限</th><th>対象</th><th>理由</th><th>記録番号</th></tr></thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.auditId}>
              <td data-label="日時">{formatDate(event.createdAt)}</td>
              <td data-label="操作">
                <strong>{AUDIT_ACTION_LABELS[event.action] ?? "管理操作"}</strong>
                <small>{AUDIT_RESULT_LABELS[event.result] ?? "記録済み"}</small>
              </td>
              <td data-label="利用権限">{ROLE_LABELS[event.actorRole]}</td>
              <td data-label="対象">
                <small>{auditTargetName(event)}</small>
                <code>{auditTargetId(event)}</code>
              </td>
              <td data-label="理由">{auditReasonName(event.reason)}</td>
              <td data-label="記録番号"><code>{displayManagementId("履歴", event.requestId)}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
      {events.length === 0 && <p className="admin-empty">表示できる監査記録はありません。</p>}
    </div>
  );
}

function StatusPill({ value, labels }: { value: string; labels: Record<string, string> }) {
  const tone = value === "failed" || value === "rejected"
    ? "danger"
    : value === "pending"
      ? "warning"
      : value === "granted" || value === "already_granted" || value === "approved"
        ? "success"
        : "neutral";
  return <span className={`admin-status is-${tone}`}>{labels[value] ?? value}</span>;
}

function reasonName(value: string): string {
  return REASON_LABELS[value] ?? "個別確認が必要です。";
}

function operationErrorName(value: string | null): string {
  if (!value) return "なし";
  if (value === "drive_transient_failure") return "一時的な通信エラー";
  return "処理状況を確認してください";
}

function displayDownloadFilename(value: string): string {
  return value.replace(/-synthetic(?=\.)/i, "");
}

function displayManagementId(label: string, value: string): string {
  const localSequence = value.match(/(?:synthetic|mock)[-_]?(\d+)$/i)?.[1];
  return localSequence ? `${label}-${localSequence.padStart(4, "0")}` : value;
}

function auditTargetName(event: AdminAuditEvent): string {
  if (event.operationId) return "共有フォルダ処理";
  if (event.memberId) return "登録者";
  if (event.applicationId) return "申請";
  return "名簿全体";
}

function auditTargetId(event: AdminAuditEvent): string {
  if (event.operationId) return displayManagementId("処理", event.operationId);
  if (event.memberId) return displayManagementId("利用者", event.memberId);
  if (event.applicationId) return displayManagementId("申請", event.applicationId);
  return "—";
}

function auditReasonName(value: string | null): string {
  if (!value) return "記録なし";
  if (value.startsWith("export_purpose:")) {
    const purpose = value.slice("export_purpose:".length) as AdminExportPurposeCode;
    return EXPORT_PURPOSE_LABELS[purpose] ?? "承認済みの名簿出力";
  }
  return /^[a-z0-9_:.-]+$/i.test(value) ? "システム記録" : value;
}

function toMockAction(
  application: AdminApplicationDetail,
  actionKind: AdminActionKind,
  reason: string
): MockAdminAction {
  if (actionKind === "approve" || actionKind === "reject") {
    return {
      type: "decision",
      applicationId: application.applicationId,
      decision: actionKind,
      reason,
      expectedRecordVersion: application.recordVersion
    };
  }
  if (actionKind === "retry") {
    return {
      type: "retry",
      applicationId: application.applicationId,
      reason,
      expectedRecordVersion: application.operationRecordVersion ?? 0
    };
  }
  return {
    type: actionKind === "revoke" ? "revoke" : "deactivate",
    applicationId: application.applicationId,
      confirmedMemberId: application.memberId ?? "",
      reason,
      expectedRecordVersion: application.memberRecordVersion ?? application.recordVersion
  };
}

function adminErrorMessage(error: unknown): string {
  if (!(error instanceof AdminApiError)) {
    return "管理画面に接続できませんでした。再試行してください。";
  }
  if (error.code === "admin_email_not_allowed") {
    return "このアカウントには管理権限がありません。";
  }
  if (error.status === 401) return "認証が失効しました。この画面から退出し、再認証してください。";
  if (error.status === 403) return "現在の利用権限では、この表示または操作を利用できません。";
  if (error.status === 409) return "別の処理で状態が更新されています。再読み込みして最新状態を確認してください。";
  if (error.status === 429) return "操作が集中しています。しばらく待ってから再試行してください。";
  if (error.status === 422) return "入力内容を確認してください。操作理由は8文字以上必要です。";
  return "読み込みに失敗しました。再試行してください。";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "記録なし";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo"
  }).format(date);
}

function roleName(value: string): string {
  return ({
    undergraduate: "学部生",
    master: "修士課程",
    doctoral: "博士課程",
    staff: "教職員"
  } as Record<string, string>)[value] ?? value;
}

function rosterGradeName(academicRole: string, grade: string | null): RosterGrade {
  if (academicRole === "undergraduate" && /^[1-6]$/.test(grade ?? "")) {
    return `${grade}年` as RosterGrade;
  }
  if (academicRole === "master" && /^[12]$/.test(grade ?? "")) {
    return `M${grade}` as RosterGrade;
  }
  return "その他";
}

function facultyName(value: string): string {
  return value === "pharmacy" ? "薬学部" : value;
}
