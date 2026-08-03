import { AdminApiError } from "./adminClient";
import type {
  AdminMemberFilters,
  AdminMemberSummary,
  AdminRole
} from "./adminClient";
import type {
  MockAdminAction,
  MockAdminState
} from "./adminMock";

export function createMockAdminState(): MockAdminState {
  return { applications: [], auditEvents: [] };
}

export function listMockAdminMembers(
  _state: MockAdminState,
  _filters: AdminMemberFilters
): AdminMemberSummary[] {
  return [];
}

export function applyMockAdminAction(
  _state: MockAdminState,
  _role: AdminRole,
  _action: MockAdminAction
): never {
  throw new AdminApiError(503, "admin_preview_unavailable");
}

export async function applyMockAdminExport(): Promise<never> {
  throw new AdminApiError(503, "admin_preview_unavailable");
}
