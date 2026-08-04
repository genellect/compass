import { describe, expect, it } from "vitest";
import { AdminApiError, availableAdminActions } from "./adminClient";
import {
  applyMockAdminAction,
  applyMockAdminExport,
  createMockAdminState
} from "./adminMock";

describe("Phase 8B synthetic admin state", () => {
  it("keeps viewer role read-only", () => {
    const state = createMockAdminState();
    expect(() => applyMockAdminAction(state, "viewer", {
      type: "decision",
      applicationId: "app-synthetic-001",
      decision: "approve",
      reason: "合成データの確認理由です",
      expectedRecordVersion: 1
    })).toThrowError(AdminApiError);
  });

  it("lets operator decide once and appends a PII-minimized audit event", () => {
    const state = createMockAdminState();
    const result = applyMockAdminAction(state, "operator", {
      type: "decision",
      applicationId: "app-synthetic-001",
      decision: "approve",
      reason: "合成データの確認理由です",
      expectedRecordVersion: 1
    });

    expect(result.application.adminDecision).toBe("approved");
    expect(result.application.recordVersion).toBe(2);
    expect(result.state.auditEvents).toHaveLength(1);
    expect(result.state.auditEvents[0]).toMatchObject({
      action: "application_approve",
      actorRole: "operator",
      applicationId: "app-synthetic-001"
    });
    expect(JSON.stringify(result.state.auditEvents[0])).not.toContain("h***@st.kitasato-u.ac.jp");
  });

  it("rejects a stale application version", () => {
    const state = createMockAdminState();
    expect(() => applyMockAdminAction(state, "operator", {
      type: "decision",
      applicationId: "app-synthetic-001",
      decision: "reject",
      reason: "合成データの却下理由です",
      expectedRecordVersion: 99
    })).toThrowError("record_version_conflict");
  });

  it("uses the operation version for a finite retry", () => {
    const state = createMockAdminState();
    const result = applyMockAdminAction(state, "operator", {
      type: "retry",
      applicationId: "app-synthetic-002",
      reason: "合成失敗処理を再試行します",
      expectedRecordVersion: 2
    });
    expect(result.application.operationStatus).toBe("pending");
    expect(result.application.operationRecordVersion).toBe(3);
    expect(result.application.operationErrorCode).toBeNull();
  });

  it("retries both failed and dead operations", () => {
    const state = createMockAdminState();
    state.applications[1] = {
      ...state.applications[1],
      operationStatus: "failed"
    };
    const result = applyMockAdminAction(state, "operator", {
      type: "retry",
      applicationId: "app-synthetic-002",
      reason: "合成失敗処理を再試行します",
      expectedRecordVersion: 2
    });
    expect(result.application.operationStatus).toBe("pending");
  });

  it("deactivates an unmanaged member without changing Drive status", () => {
    const state = createMockAdminState();
    const result = applyMockAdminAction(state, "admin", {
      type: "deactivate",
      applicationId: "app-synthetic-002",
      confirmedMemberId: "member-synthetic-002",
      reason: "合成利用停止のみを実施します",
      expectedRecordVersion: 2
    });
    expect(result.application.memberStatus).toBe("inactive");
    expect(result.application.driveAccessStatus).toBe("failed");
    expect(result.state.auditEvents[0].action).toBe("member_deactivate");
  });

  it("shows deactivation for every active member and Drive revoke only when managed", () => {
    const state = createMockAdminState();
    expect(availableAdminActions(state.applications[1], "admin")).toContain("deactivate");
    expect(availableAdminActions(state.applications[1], "admin")).not.toContain("revoke");
    expect(availableAdminActions(state.applications[2], "admin")).toEqual([
      "deactivate",
      "revoke"
    ]);
    expect(availableAdminActions(state.applications[2], "operator")).toEqual([]);
  });

  it("keeps viewer read-only and operator limited to decisions and retries", () => {
    const state = createMockAdminState();
    expect(availableAdminActions(state.applications[0], "viewer")).toEqual([]);
    expect(availableAdminActions(state.applications[0], "operator")).toEqual([
      "approve",
      "reject"
    ]);
    expect(availableAdminActions(state.applications[1], "operator")).toEqual([
      "retry"
    ]);
    expect(availableAdminActions(state.applications[1], "admin")).toEqual([
      "retry",
      "deactivate"
    ]);
  });

  it("does not offer a synthetic Drive revoke for an unmanaged permission", () => {
    const state = createMockAdminState();
    expect(() => applyMockAdminAction(state, "admin", {
      type: "revoke",
      applicationId: "app-synthetic-002",
      confirmedMemberId: "member-synthetic-002",
      reason: "合成Drive取消を確認します",
      expectedRecordVersion: 2
    })).toThrowError("permission_not_managed");
  });

  it("requires admin role and matching member confirmation for revoke", () => {
    const state = createMockAdminState();
    expect(() => applyMockAdminAction(state, "operator", {
      type: "revoke",
      applicationId: "app-synthetic-003",
      confirmedMemberId: "member-synthetic-003",
      reason: "合成利用停止の確認理由です",
      expectedRecordVersion: 2
    })).toThrowError("admin_role_forbidden");

    expect(() => applyMockAdminAction(state, "admin", {
      type: "revoke",
      applicationId: "app-synthetic-003",
      confirmedMemberId: "different-member",
      reason: "合成利用停止の確認理由です",
      expectedRecordVersion: 2
    })).toThrowError("member_confirmation_mismatch");

    const result = applyMockAdminAction(state, "admin", {
      type: "revoke",
      applicationId: "app-synthetic-003",
      confirmedMemberId: "member-synthetic-003",
      reason: "合成利用停止の確認理由です",
      expectedRecordVersion: 2
    });
    expect(result.application.memberStatus).toBe("inactive");
    expect(result.state.auditEvents[0].action).toBe("member_revoke");
  });

  it("creates a real synthetic CSV snapshot and records its non-targeted audit event", async () => {
    const state = createMockAdminState();
    state.applications[1] = {
      ...state.applications[1],
      fullName: " =2+2"
    };
    const exported = await applyMockAdminExport(state, "admin", {
      format: "csv",
      memberStatus: "active",
      academicRole: "undergraduate",
      purposeCode: "periodic_roster_review",
      confirmed: true
    });

    expect(exported.result.rowCount).toBe(2);
    expect(exported.result.filename).toBe("future-strategy-library-members-synthetic.csv");
    expect(exported.result.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Date.parse(exported.result.deleteAfter)).toBeGreaterThan(Date.now());
    expect(Date.parse(exported.result.deleteAfter)).toBeLessThanOrEqual(
      Date.now() + 31 * 24 * 60 * 60 * 1000
    );
    const bytes = new Uint8Array(await exported.result.blob.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = await exported.result.blob.text();
    expect(csv).toContain('"\' =2+2"');
    expect(csv).toContain("\r\n");
    expect(exported.state.auditEvents[0]).toMatchObject({
      action: "member_export_csv",
      actorRole: "admin",
      result: "downloaded_synthetic",
      memberId: null,
      applicationId: null,
      operationId: null
    });
    expect(exported.state.auditEvents[0].reason).toBe(
      "export_purpose:periodic_roster_review"
    );
  });

  it("does not fabricate XLSX in mock mode and denies export to non-admin roles", async () => {
    const state = createMockAdminState();
    const request = {
      format: "xlsx" as const,
      memberStatus: "all" as const,
      academicRole: null,
      purposeCode: "incident_response" as const,
      confirmed: true as const
    };
    await expect(applyMockAdminExport(state, "admin", request))
      .rejects.toThrowError("mock_xlsx_unavailable");
    await expect(applyMockAdminExport(state, "operator", {
      ...request,
      format: "csv"
    })).rejects.toThrowError("admin_role_forbidden");
    await expect(applyMockAdminExport(state, "admin", {
      ...request,
      format: "csv",
      purposeCode: "person_specific_request" as never
    })).rejects.toThrowError("admin_export_confirmation_required");
  });
});
