import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  canRetry,
  canReview,
  canRevoke,
  canExport,
  decideAdminApplication,
  downloadAdminExport,
  exportAdminMembers,
  getAdminSession,
  isTrustedAdminPreviewLocation,
  listAdminApplications,
  listAdminMembers,
  readAdminRuntimeConfig,
  requireAdminProductionRuntimeConfig,
  deactivateAdminMember,
  revokeAdminMember
} from "./adminClient";

const config = readAdminRuntimeConfig({
  NEXT_PUBLIC_LIBRARY_ADMIN_MODE: "google",
  NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL: "/library-registration/admin/api/",
  NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID: "public-client-id"
});

describe("Phase 8B admin client", () => {
  it("allows the mock administrator preview on loopback only", () => {
    for (const hostname of ["127.0.0.1", "localhost", "::1", "[::1]"]) {
      expect(isTrustedAdminPreviewLocation({ protocol: "http:", hostname }))
        .toBe(true);
    }
    for (const location of [
      { protocol: "https:", hostname: "localhost" },
      { protocol: "https:", hostname: "library.example.invalid" },
      { protocol: "http:", hostname: "127.0.0.1.example.invalid" },
      { protocol: "http:", hostname: "0.0.0.0" }
    ]) {
      expect(isTrustedAdminPreviewLocation(location)).toBe(false);
    }
  });

  it("defaults to synthetic mock mode without network configuration", () => {
    expect(readAdminRuntimeConfig({})).toEqual({
      mode: "mock",
      apiBaseUrl: "",
      googleClientId: "",
      ready: true
    });
  });

  it("keeps local mock preview available but makes the production config gate fail closed", () => {
    expect(readAdminRuntimeConfig({}).mode).toBe("mock");
    expect(() => requireAdminProductionRuntimeConfig({})).toThrowError(
      "admin_production_config_invalid"
    );
    expect(() => requireAdminProductionRuntimeConfig({
      NEXT_PUBLIC_LIBRARY_ADMIN_MODE: "google",
      NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL: "http://127.0.0.1:8000",
      NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID: "synthetic-client-id"
    })).toThrowError("admin_production_config_invalid");
    expect(() => requireAdminProductionRuntimeConfig({
      NEXT_PUBLIC_LIBRARY_ADMIN_MODE: "google",
      NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL: "/library-registration/admin/api/extra",
      NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID: "123-example.apps.googleusercontent.com"
    })).toThrowError("admin_production_config_invalid");

    expect(requireAdminProductionRuntimeConfig({
      NEXT_PUBLIC_LIBRARY_ADMIN_MODE: "google",
      NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL: "/library-registration/admin/api/",
      NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID: "123456789-abc_def.apps.googleusercontent.com"
    })).toMatchObject({
      mode: "google",
      apiBaseUrl: "/library-registration/admin/api",
      ready: true
    });
  });

  it("uses only the dedicated administrator OAuth audience", () => {
    const registrationClientId =
      "123456789-registration.apps.googleusercontent.com";
    const adminClientId = "987654321-admin.apps.googleusercontent.com";

    expect(readAdminRuntimeConfig({
      NEXT_PUBLIC_LIBRARY_ADMIN_MODE: "google",
      NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL: "/library-registration/admin/api",
      NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID: registrationClientId
    })).toMatchObject({
      googleClientId: "",
      ready: false
    });

    expect(readAdminRuntimeConfig({
      NEXT_PUBLIC_LIBRARY_ADMIN_MODE: "google",
      NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL: "/library-registration/admin/api",
      NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID: registrationClientId,
      NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID: adminClientId
    })).toMatchObject({
      googleClientId: adminClientId,
      ready: true
    });
  });

  it("keeps role affordances narrower than server authorization", () => {
    expect(canReview("viewer")).toBe(false);
    expect(canRetry("viewer")).toBe(false);
    expect(canRevoke("viewer")).toBe(false);
    expect(canReview("operator")).toBe(true);
    expect(canRetry("operator")).toBe(true);
    expect(canRevoke("operator")).toBe(false);
    expect(canRevoke("admin")).toBe(true);
    expect(canExport("viewer")).toBe(false);
    expect(canExport("operator")).toBe(false);
    expect(canExport("admin")).toBe(true);
  });

  it("downloads an audited member snapshot with allowlisted filters only in the POST body", async () => {
    const csvBody = "member_id\r\nsynthetic\r\n";
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(csvBody)
    );
    const contentSha256 = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    const deleteAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace("Z", "+00:00");
    const fetcher = vi.fn(async (url, init) => {
      expect(url).toBe("/library-registration/admin/api/exports");
      expect(String(url)).not.toContain("active");
      expect(init?.method).toBe("POST");
      expect(init?.credentials).toBe("same-origin");
      expect(init?.mode).toBe("same-origin");
      expect(init?.cache).toBe("no-store");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer synthetic-id-token",
        "Content-Type": "application/json",
        "Idempotency-Key": expect.any(String)
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        format: "csv",
        memberStatus: "active",
        academicRole: "undergraduate",
        purposeCode: "periodic_roster_review",
        confirmed: true
      });
      return new Response(new Blob([csvBody]), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="library-members-20260801T123456Z.csv"',
          "X-Export-Run-ID": "export-synthetic-001",
          "X-Export-Row-Count": "1",
          "X-Content-SHA256": contentSha256,
          "X-Export-Delete-After": deleteAfter
        }
      });
    });

    const result = await exportAdminMembers(config, "synthetic-id-token", {
      format: "csv",
      memberStatus: "active",
      academicRole: "undergraduate",
      purposeCode: "periodic_roster_review",
      confirmed: true
    }, fetcher as typeof fetch);

    expect(result).toMatchObject({
      filename: "library-members-20260801T123456Z.csv",
      runId: "export-synthetic-001",
      rowCount: 1,
      contentSha256,
      deleteAfter
    });
    expect(await result.blob.text()).toContain("synthetic");
  });

  it("rejects a download whose bytes do not match the server content hash", async () => {
    const deleteAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const fetcher = vi.fn(async () => new Response(new Blob(["tampered"]), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="library-members-20260801T123456Z.csv"',
        "X-Export-Run-ID": "export-synthetic-001",
        "X-Export-Row-Count": "1",
        "X-Content-SHA256": "a".repeat(64),
        "X-Export-Delete-After": deleteAfter
      }
    }));

    await expect(exportAdminMembers(config, "synthetic-id-token", {
      format: "csv",
      memberStatus: "active",
      academicRole: null,
      purposeCode: "periodic_roster_review",
      confirmed: true
    }, fetcher as typeof fetch)).rejects.toMatchObject({
      status: 502,
      code: "export_content_hash_mismatch"
    });
  });

  it("rejects a non-allowlisted export purpose before making a request", async () => {
    const fetcher = vi.fn();
    await expect(exportAdminMembers(config, "synthetic-id-token", {
      format: "csv",
      memberStatus: "active",
      academicRole: null,
      purposeCode: "person_specific_request" as never,
      confirmed: true
    }, fetcher as typeof fetch)).rejects.toMatchObject({
      status: 422,
      code: "admin_export_confirmation_required"
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects unsafe or missing server filenames and malformed deletion deadlines", async () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const tooFar = new Date(Date.now() + 92 * 24 * 60 * 60 * 1000).toISOString();
    const cases: Array<Record<string, string>> = [
      {
        "Content-Disposition": 'attachment; filename="../../members.csv"',
        "X-Export-Delete-After": future
      },
      {
        "Content-Disposition": "attachment",
        "X-Export-Delete-After": future
      },
      {
        "Content-Disposition": 'attachment; filename="library-members-20260801T123456Z.csv"'
      },
      {
        "Content-Disposition": 'attachment; filename="library-members-20260801T123456Z.csv"',
        "X-Export-Delete-After": "2026-09-01T12:00:00+09:00"
      },
      {
        "Content-Disposition": 'attachment; filename="library-members-20260801T123456Z.csv"',
        "X-Export-Delete-After": "2026-02-30T12:00:00+00:00"
      },
      {
        "Content-Disposition": 'attachment; filename="library-members-20260801T123456Z.csv"',
        "X-Export-Delete-After": tooFar
      }
    ];

    for (const variableHeaders of cases) {
      const fetcher = vi.fn(async () => new Response(new Blob(["unsafe"]), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "X-Export-Run-ID": "export-synthetic-001",
          "X-Export-Row-Count": "1",
          "X-Content-SHA256": "a".repeat(64),
          ...variableHeaders
        }
      }));
      await expect(exportAdminMembers(config, "synthetic-id-token", {
        format: "csv",
        memberStatus: "active",
        academicRole: null,
        purposeCode: "drive_access_reconciliation",
        confirmed: true
      }, fetcher as typeof fetch)).rejects.toMatchObject({
        status: 502,
        code: "invalid_export_response"
      });
    }
  });

  it("rejects a binary response without valid audit-integrity headers", async () => {
    const fetcher = vi.fn(async () => new Response(new Blob(["unsafe"]), {
      status: 200,
      headers: {
        "Content-Disposition": "inline",
        "X-Export-Run-ID": "export-synthetic-001",
        "X-Export-Row-Count": "not-a-number",
        "X-Content-SHA256": "short"
      }
    }));

    await expect(exportAdminMembers(config, "synthetic-id-token", {
      format: "xlsx",
      memberStatus: "all",
      academicRole: null,
      purposeCode: "incident_response",
      confirmed: true
    }, fetcher as typeof fetch)).rejects.toMatchObject({
      status: 502,
      code: "invalid_export_response"
    });
  });

  it("uses one transient object URL and always revokes it after the download click", () => {
    vi.useFakeTimers();
    const anchor = {
      href: "",
      download: "",
      rel: "",
      hidden: false,
      click: vi.fn(),
      remove: vi.fn()
    };
    const documentObject = {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn() }
    } as unknown as Document;
    const objectUrlApi = {
      createObjectURL: vi.fn(() => "blob:synthetic-object-url"),
      revokeObjectURL: vi.fn()
    } as unknown as Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;

    try {
      downloadAdminExport({
        blob: new Blob(["synthetic"]),
        filename: "future-strategy-library-members.csv",
        runId: "export-synthetic-001",
        rowCount: 1,
        contentSha256: "a".repeat(64),
        deleteAfter: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }, documentObject, objectUrlApi);

      expect(anchor).toMatchObject({
        href: "blob:synthetic-object-url",
        download: "future-strategy-library-members.csv",
        rel: "noopener",
        hidden: true
      });
      expect(anchor.click).toHaveBeenCalledOnce();
      expect(anchor.remove).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(anchor.remove).toHaveBeenCalledOnce();
      expect(objectUrlApi.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-object-url");
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a caller-held bearer token and permits only same-origin Access cookies", async () => {
    const fetcher = vi.fn(async (url, init) => {
      expect(url).toBe("/library-registration/admin/api/session");
      expect(init?.method).toBe("GET");
      expect(init?.credentials).toBe("same-origin");
      expect(init?.mode).toBe("same-origin");
      expect(init?.cache).toBe("no-store");
      expect(init?.body).toBeUndefined();
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer synthetic-id-token"
      });
      return new Response(JSON.stringify({
        role: "operator",
        subjectFingerprint: "synthetic-fingerprint"
      }), { status: 200 });
    });

    const session = await getAdminSession(
      config,
      "synthetic-id-token",
      fetcher as typeof fetch
    );
    expect(session.role).toBe("operator");
  });

  it("places PII search terms only in a POST JSON body", async () => {
    const fetcher = vi.fn(async (url, init) => {
      expect(url).toBe(
        "/library-registration/admin/api/applications/search"
      );
      expect(String(url)).not.toContain("合成%20花子");
      expect(init?.method).toBe("POST");
      expect(init?.headers).not.toMatchObject({
        "Idempotency-Key": expect.any(String)
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        q: "合成 花子",
        decision: "pending",
        driveStatus: "failed",
        offset: 25,
        limit: 25
      });
      return new Response(JSON.stringify({
        items: [],
        offset: 25,
        limit: 25,
        hasMore: false
      }), { status: 200 });
    });

    await listAdminApplications(config, "synthetic-id-token", {
      query: "合成 花子",
      reviewStatus: "pending",
      driveStatus: "failed",
      page: 2,
      pageSize: 25
    }, fetcher as typeof fetch);
  });

  it("requests the normalized roster with server-side sorting in a POST body", async () => {
    const fetcher = vi.fn(async (url, init) => {
      expect(url).toBe(
        "/library-registration/admin/api/members/search"
      );
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        q: "合成 太郎",
        grade: "M1",
        memberStatus: "active",
        sortBy: "registered_at",
        sortDirection: "desc",
        offset: 25,
        limit: 25
      });
      return new Response(JSON.stringify({
        items: [],
        offset: 25,
        limit: 25,
        hasMore: false
      }), { status: 200 });
    });

    await listAdminMembers(config, "synthetic-id-token", {
      query: "合成 太郎",
      grade: "M1",
      memberStatus: "active",
      sortBy: "registered_at",
      sortDirection: "desc",
      page: 2,
      pageSize: 25
    }, fetcher as typeof fetch);
  });

  it("sends decision reason and optimistic-lock version with camelCase fields", async () => {
    const fetcher = vi.fn(async (url, init) => {
      expect(url).toBe(
        "/library-registration/admin/api/applications/app-synthetic/decision"
      );
      expect(JSON.parse(String(init?.body))).toEqual({
        decision: "approve",
        reason: "合成確認により承認します",
        expectedRecordVersion: 3
      });
      return new Response(JSON.stringify({ applicationId: "app-synthetic" }), { status: 200 });
    });

    await decideAdminApplication(
      config,
      "synthetic-id-token",
      "app-synthetic",
      "approve",
      "合成確認により承認します",
      3,
      fetcher as typeof fetch
    );
  });

  it("requires the member id to be repeated for revoke confirmation", async () => {
    const fetcher = vi.fn(async (_url, init) => {
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer synthetic-id-token",
        "Idempotency-Key": expect.any(String)
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        reason: "合成利用停止の確認理由です",
        expectedRecordVersion: 4,
        confirmedMemberId: "member-synthetic"
      });
      return new Response(JSON.stringify({ applicationId: "app-synthetic" }), { status: 200 });
    });

    await revokeAdminMember(
      config,
      "synthetic-id-token",
      "member-synthetic",
      "合成利用停止の確認理由です",
      4,
      fetcher as typeof fetch
    );
  });

  it("supports member deactivation without requesting a Drive mutation", async () => {
    const fetcher = vi.fn(async (url, init) => {
      expect(url).toBe(
        "/library-registration/admin/api/members/member-synthetic/deactivate"
      );
      expect(init?.headers).toMatchObject({
        "Idempotency-Key": expect.any(String)
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        reason: "合成利用停止のみを実施します",
        expectedRecordVersion: 4,
        confirmedMemberId: "member-synthetic"
      });
      return new Response(JSON.stringify({ status: "inactive" }), { status: 200 });
    });

    await deactivateAdminMember(
      config,
      "synthetic-id-token",
      "member-synthetic",
      "合成利用停止のみを実施します",
      4,
      fetcher as typeof fetch
    );
  });

  it("does not write credentials to Web Storage or cookies", async () => {
    const dashboardSource = await readFile(
      new URL("./AdminDashboard.tsx", import.meta.url),
      "utf8"
    );
    const clientSource = await readFile(
      new URL("./adminClient.ts", import.meta.url),
      "utf8"
    );
    for (const source of [dashboardSource, clientSource]) {
      expect(source).not.toMatch(/localStorage\s*\./);
      expect(source).not.toMatch(/sessionStorage\s*\./);
      expect(source).not.toMatch(/document\s*\.\s*cookie/);
      expect(source).not.toMatch(/console\s*\./);
    }
    expect(dashboardSource).toContain(
      "process.env.NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID"
    );
    expect(dashboardSource).toContain(
      "process.env.NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL"
    );
    expect(dashboardSource).not.toContain(
      "process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID"
    );
    expect(clientSource).not.toContain("URLSearchParams");
    expect(clientSource).not.toContain("/admin/v1/applications?");
  });

  it("preserves keyboard focus across application detail open and close", async () => {
    const source = await readFile(
      new URL("./AdminDashboard.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toContain("detailRef.current?.focus()");
    expect(source).toContain("lastDetailTriggerRef.current?.focus()");
    expect(source).toContain("tabIndex={-1}");
    expect(source).toContain('aria-pressed={tab === "applications"}');
    expect(source).toContain("aria-busy={isLoading || isMutating || isExporting}");
    expect(source).toContain('href={session ? "#admin-content" : "#admin-title"}');
  });

  it("shows the export surface to admin only and requires purpose confirmation", async () => {
    const source = await readFile(
      new URL("./AdminDashboard.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toContain("canExport(session.role)");
    expect(source).toContain('aria-pressed={tab === "export"}');
    expect(source).toContain("|| !exportPurposeCode");
    expect(source).toContain("|| !exportConfirmed");
    expect(source).toContain("利用目的（必須・許可済み項目から選択）");
    expect(source).toContain("periodic_roster_review");
    expect(source).not.toContain("出力理由（8文字以上");
    expect(source).toContain("保存先・再共有の可否・削除期限");
    expect(source).toContain("<dt>削除期限</dt>");
    expect(source).toContain("lastExport.deleteAfter");
    expect(source).toContain("この画面で確認した内容は保存されず、実際の名簿には反映されません。");
  });

  it("requires a reason and an explicit confirmation for destructive actions", async () => {
    const source = await readFile(
      new URL("./AdminDashboard.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toContain("actionReason.trim().length < 8");
    expect(source).toContain("|| !actionConfirmed");
    expect(source).toContain('type="checkbox"');
    expect(source).toContain("対象者、操作内容、理由を再確認しました。");
    expect(source).toContain("利用停止のみ（閲覧権限は変更しない）");
    expect(source).toContain("利用停止＋管理対象の閲覧権限を取消");
  });

  it("uses the spreadsheet-like member roster as the professional initial view", async () => {
    const [source, styles] = await Promise.all([
      readFile(new URL("./AdminDashboard.tsx", import.meta.url), "utf8"),
      readFile(new URL("./admin.css", import.meta.url), "utf8")
    ]);

    expect(source).toContain('useState<DashboardTab>("members")');
    expect(source.indexOf('aria-pressed={tab === "members"}')).toBeLessThan(
      source.indexOf('aria-pressed={tab === "applications"}')
    );
    expect(source).toContain('className="admin-row-number"');
    expect(source).toContain('className="admin-table-wrap admin-roster-table-wrap"');
    expect(source).not.toContain('aria-live="polite"');
    expect(source).toContain('<h1 id="admin-title">管理者ログイン</h1>');
    expect(source).not.toContain("ここで行った操作は保存されず、");
    expect(source).not.toContain("閲覧モードで開きます。");
    expect(source).not.toContain('id="mock-admin-role"');
    expect(source).not.toContain("表示する管理範囲");
    expect(source).toMatch(/const nextSession: AdminSession = \{[\s\S]*?role: "admin"/);

    expect(styles).toMatch(/\.admin-roster-table thead th\s*\{[\s\S]*?position:\s*sticky/);
    expect(styles).toContain(".admin-roster-table thead { display: table-header-group; }");
    expect(styles).toContain(".admin-roster-table-wrap {");
    expect(styles).toContain("overflow: auto;");

    for (const developerLabel of [
      "PHASE 8B",
      "SYNTHETIC MOCK",
      "ADMIN API",
      "RESTRICTED OPERATIONS",
      "CURRENT MEMBER ROSTER",
      "CONTROLLED SNAPSHOT",
      "LAST DOWNLOAD RECEIPT",
      "APPLICATION DETAIL",
      "CONTROLLED ACTION",
      "合成データ",
      "画面確認用の閲覧環境"
    ]) {
      expect(source).not.toContain(developerLabel);
    }
  });

  it("uses a compact neutral interface without changing the roster-first layout", async () => {
    const [source, styles] = await Promise.all([
      readFile(new URL("./AdminDashboard.tsx", import.meta.url), "utf8"),
      readFile(new URL("./admin.css", import.meta.url), "utf8")
    ]);

    expect(styles).toContain("/* Compact production administrator interface. */");
    expect(styles).toMatch(/\.admin-login\s*\{[\s\S]*?width: min\(400px, calc\(100% - 32px\)\)/);
    expect(styles).toMatch(/\.admin-login::before,[\s\S]*?\.admin-login::after \{ display: none; \}/);
    expect(styles).toMatch(/\.admin-header\s*\{[\s\S]*?background: #fff/);
    expect(styles).toMatch(/\.admin-table-wrap,[\s\S]*?box-shadow: none/);
    expect(source).not.toContain('className="admin-brand-mark"');
    expect(source).toContain('useState<DashboardTab>("members")');
  });

  it("reports allowlist denial without implying an account-type branch", async () => {
    const source = await readFile(
      new URL("./AdminDashboard.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toContain('error.code === "admin_email_not_allowed"');
    expect(source).toContain("このアカウントには管理権限がありません。");
  });

  it("keeps the administrator route noindex and absent from public navigation", async () => {
    const [pageSource, headerSource, librarySource, registrationSource] = await Promise.all([
      readFile(new URL("../../app/(library)/library-registration/admin/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../components/SiteHeader.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../app/(official)/future-strategy-library/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../RegistrationMvp.tsx", import.meta.url), "utf8")
    ]);
    expect(pageSource).toContain("robots: { index: false, follow: false }");
    for (const publicSource of [headerSource, librarySource, registrationSource]) {
      expect(publicSource).not.toContain("/library-registration/admin/");
    }
  });
});
