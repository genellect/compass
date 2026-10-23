import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMENT_AUTHOR,
  COMMENT_MARKER,
  PREVIEW_ROUTES,
  parseCloudflareSummary,
  renderComment,
  routesForChangedFiles,
  run,
  selectCloudflareCheck,
  upsertComment
} from "../.github/scripts/preview-links.mjs";

// Summary shape copied from the "Cloudflare Pages" check run on PR #159.
const SUMMARY = `<table><tr><td><strong>Latest commit:</strong> </td><td>
<code>1e9991b</code>
</td></tr>
<tr><td><strong>Status:</strong></td><td>&nbsp;✅&nbsp; Deploy successful!</td></tr>
<tr><td><strong>Preview URL:</strong></td><td>
<a href='https://4426d7b3.compass-official.pages.dev'>https://4426d7b3.compass-official.pages.dev</a>
</td></tr>
<tr><td><strong>Branch Preview URL:</strong></td><td>
<a href='https://claude-compass-repo-dev-ux-o.compass-official.pages.dev'>https://claude-compass-repo-dev-ux-o.compass-official.pages.dev</a>
</td></tr>
</table>

[View logs](https://dash.cloudflare.com/?to=/account/pages/view/compass-official/4426d7b3)
`;

const SHA = "1e9991bcc05cad263816c99ef791b1ccce940cbc";

function cloudflareCheck(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Cloudflare Pages",
    app: { slug: "cloudflare-workers-and-pages" },
    head_sha: SHA,
    status: "completed",
    conclusion: "success",
    completed_at: "2026-10-23T14:39:51Z",
    details_url: "https://dash.cloudflare.com/?to=/account/pages/view/compass-official/4426d7b3",
    output: { summary: SUMMARY },
    pull_requests: [{ number: 159 }],
    ...overrides
  };
}

describe("Cloudflare check run parsing", () => {
  it("reads the commit and branch Preview URLs verbatim", () => {
    expect(parseCloudflareSummary(SUMMARY)).toEqual({
      previewUrl: "https://4426d7b3.compass-official.pages.dev",
      branchUrl: "https://claude-compass-repo-dev-ux-o.compass-official.pages.dev"
    });
  });

  it("rejects URLs that are not https pages.dev origins", () => {
    const hostile = SUMMARY.replace("https://4426d7b3.compass-official.pages.dev'", "https://evil.example/x'")
      .replace("https://claude-compass-repo-dev-ux-o.compass-official.pages.dev'", "javascript:alert(1)'");
    expect(parseCloudflareSummary(hostile)).toEqual({ previewUrl: null, branchUrl: null });
    expect(parseCloudflareSummary(undefined)).toEqual({ previewUrl: null, branchUrl: null });
  });

  it("selects the newest Cloudflare Pages run and ignores other apps", () => {
    const older = cloudflareCheck({ id: 1, completed_at: "2026-10-23T10:00:00Z" });
    const newer = cloudflareCheck({ id: 2, completed_at: "2026-10-23T11:00:00Z" });
    const impostor = cloudflareCheck({ id: 3, app: { slug: "someone-else" }, completed_at: "2026-10-23T12:00:00Z" });
    expect(selectCloudflareCheck([older, impostor, newer])?.id).toBe(2);
    expect(selectCloudflareCheck([impostor])).toBeNull();
  });
});

describe("route selection from changed paths", () => {
  it("maps each surface to its documented routes", () => {
    expect(routesForChangedFiles(["src/app/(official)/messages/message.md"])).toEqual(["messages"]);
    expect(routesForChangedFiles(["functions/api/contact.ts"])).toEqual(["contact"]);
    expect(routesForChangedFiles(["google-apps-script/Code.gs"])).toEqual(["community"]);
    expect(routesForChangedFiles(["src/library-registration/RegistrationMvp.tsx"])).toEqual(["library"]);
    expect(routesForChangedFiles(["src/app/(interactive)/INTRO_Interactive/page.tsx"])).toEqual(["interactive"]);
    expect(routesForChangedFiles(["src/interactive/DeveloperApp.tsx"])).toEqual(["developers"]);
    expect(routesForChangedFiles(["src/interactive/App.tsx"])).toEqual(["interactive", "developers"]);
    expect(routesForChangedFiles(["src/app/(founder-en)/en/content.ts"])).toEqual(["founder-en"]);
    expect(routesForChangedFiles(["src/app/(official)/founder/page.tsx"])).toEqual(["founder"]);
    expect(routesForChangedFiles(["src/app/(official)/founder/FounderProducts.tsx"])).toEqual(["founder", "founder-en"]);
    expect(routesForChangedFiles(["src/LegacyPageBody.tsx"])).toEqual(["official"]);
  });

  it("treats the shared (official) layout as crossing into Founder JP", () => {
    expect(routesForChangedFiles(["src/app/(official)/layout.tsx"])).toEqual([
      "official", "library", "messages", "community", "contact", "founder"
    ]);
  });

  it("treats build, routing and global styles as affecting every route", () => {
    for (const file of ["next.config.ts", "_redirects", "functions/_middleware.ts", "src/styles/legacy.css"]) {
      expect(routesForChangedFiles([file])).toEqual(PREVIEW_ROUTES.map((route) => route.id));
    }
  });

  it("highlights nothing for documentation and CI changes", () => {
    expect(routesForChangedFiles(["docs/development-workflows.md", ".github/workflows/ci.yml", "AGENTS.md"])).toEqual([]);
  });
});

describe("comment rendering", () => {
  it("links highlighted and all routes to the commit Preview URL", () => {
    const body = renderComment({
      headSha: SHA,
      check: cloudflareCheck(),
      changedFiles: ["src/app/(official)/contact/page.tsx", "src/app/(founder-en)/en/page.tsx"],
      totalChangedFiles: 2
    });
    expect(body.startsWith(COMMENT_MARKER)).toBe(true);
    expect(body).toContain("`1e9991b`");
    expect(body).toContain("https://claude-compass-repo-dev-ux-o.compass-official.pages.dev");
    expect(body).toContain("[/contact/](https://4426d7b3.compass-official.pages.dev/contact/)");
    expect(body).toContain("[/en/](https://4426d7b3.compass-official.pages.dev/en/)（独立surface: yuto-matsui.com English）");
    expect(body).toContain("<details><summary>全route（9件）</summary>");
    for (const route of PREVIEW_ROUTES) {
      expect(body).toContain(`[開く](https://4426d7b3.compass-official.pages.dev${route.path})`);
    }
    expect(body).toContain("WEBSITE_BOUNDARIES.md`の境界を確認");
  });

  it("never prints a Preview URL for a pending or failed deployment", () => {
    for (const check of [
      cloudflareCheck({ status: "in_progress", conclusion: null }),
      cloudflareCheck({ conclusion: "failure" }),
      null
    ]) {
      const body = renderComment({ headSha: SHA, check, changedFiles: ["src/App.tsx"], totalChangedFiles: 1 });
      expect(body).not.toContain("pages.dev");
      expect(body).toContain("`/`");
    }
  });
});

type Comment = { id: number; body: string; user: { login: string } };

function fakeGitHub(initial: Comment[] = []) {
  const comments = [...initial];
  let nextId = 100;
  const calls: string[] = [];
  const pull = { state: "open", head: { sha: SHA }, changed_files: 1 };
  const client = {
    async request(method: string, route: string, body?: { body: string }) {
      calls.push(`${method} ${route}`);
      if (method === "GET" && /\/pulls\/\d+$/.test(route)) return pull;
      if (method === "POST") {
        comments.push({ id: nextId++, body: body!.body, user: { login: COMMENT_AUTHOR } });
        return {};
      }
      const id = Number(route.split("/").pop());
      const index = comments.findIndex((comment) => comment.id === id);
      if (method === "PATCH") comments[index].body = body!.body;
      if (method === "DELETE") comments.splice(index, 1);
      return null;
    },
    async paginate(route: string) {
      if (route.includes("/files")) return [{ filename: "src/app/(official)/messages/page.tsx" }];
      if (route.includes("/check-runs")) return [cloudflareCheck()];
      return comments.map((comment) => ({ ...comment }));
    }
  };
  return { client, comments, calls, pull };
}

describe("single comment upsert", () => {
  it("creates once, then updates the same comment", async () => {
    const github = fakeGitHub();
    expect(await upsertComment(github.client, "o/r", 1, `${COMMENT_MARKER}\nfirst`)).toBe("created");
    expect(await upsertComment(github.client, "o/r", 1, `${COMMENT_MARKER}\nsecond`)).toBe("updated");
    expect(await upsertComment(github.client, "o/r", 1, `${COMMENT_MARKER}\nsecond`)).toBe("unchanged");
    expect(github.comments).toHaveLength(1);
    expect(github.comments[0].body).toContain("second");
  });

  it("ignores marker comments from other authors and removes duplicates of its own", async () => {
    const github = fakeGitHub([
      { id: 1, body: `${COMMENT_MARKER} spoof`, user: { login: "someone" } },
      { id: 2, body: `${COMMENT_MARKER}\nold`, user: { login: COMMENT_AUTHOR } },
      { id: 3, body: `${COMMENT_MARKER}\nduplicate`, user: { login: COMMENT_AUTHOR } }
    ]);
    expect(await upsertComment(github.client, "o/r", 1, `${COMMENT_MARKER}\nnew`)).toBe("updated");
    expect(github.comments.map((comment) => comment.id)).toEqual([1, 2]);
    expect(github.comments[1].body).toContain("new");
    expect(github.comments[0].body).toContain("spoof");
  });
});

describe("workflow events", () => {
  async function eventFile(payload: unknown) {
    const directory = await mkdtemp(path.join(tmpdir(), "preview-links-"));
    const file = path.join(directory, "event.json");
    await writeFile(file, JSON.stringify(payload));
    return file;
  }

  it("updates the pull requests listed on a completed Cloudflare check run", async () => {
    const github = fakeGitHub();
    const results = await run({
      env: { GITHUB_REPOSITORY: "o/r", GITHUB_EVENT_NAME: "check_run", GITHUB_EVENT_PATH: await eventFile({ check_run: cloudflareCheck() }) },
      client: github.client,
      log: () => {}
    });
    expect(results.map((result: { result: string }) => result.result)).toEqual(["created"]);
    expect(github.comments[0].body).toContain("[/messages/](https://4426d7b3.compass-official.pages.dev/messages/)");
  });

  it("skips a check run for a commit that is no longer the pull request head", async () => {
    const github = fakeGitHub();
    github.pull.head.sha = "f".repeat(40);
    const results = await run({
      env: { GITHUB_REPOSITORY: "o/r", GITHUB_EVENT_NAME: "check_run", GITHUB_EVENT_PATH: await eventFile({ check_run: cloudflareCheck() }) },
      client: github.client,
      log: () => {}
    });
    expect(results[0].result).toMatch(/^skipped/);
    expect(github.comments).toHaveLength(0);
  });

  it("finishes a pull_request run once the check run is complete", async () => {
    const github = fakeGitHub();
    const results = await run({
      env: {
        GITHUB_REPOSITORY: "o/r",
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_EVENT_PATH: await eventFile({ pull_request: { number: 7, head: { sha: SHA } } })
      },
      client: github.client,
      wait: async () => {},
      log: () => {}
    });
    expect(results[0].result).toBe("created");
    expect(github.comments).toHaveLength(1);
  });
});

describe("workflow contracts", () => {
  it("keeps write permission on the job, pins actions and never checks out on pull_request_target", async () => {
    for (const name of ["preview-links.yml", "labeler.yml"]) {
      const workflow = await readFile(path.join(".github", "workflows", name), "utf8");
      expect(workflow).toMatch(/^permissions:\r?\n\s+contents: read$/m);
      expect(workflow).not.toMatch(/\$\{\{\s*secrets\./);
      for (const line of workflow.split("\n").filter((entry) => /^\s*(-\s*)?uses:/.test(entry))) {
        expect(line).toMatch(/@[0-9a-f]{40}\s+#/);
      }
      if (/pull_request_target/.test(workflow.replace(/#.*$/gm, ""))) {
        expect(workflow).not.toMatch(/actions\/checkout@/);
      }
    }
  });

  it("runs the write-token script only from the trusted base commit", async () => {
    const workflow = await readFile(path.join(".github", "workflows", "preview-links.yml"), "utf8");
    expect(workflow).toMatch(
      /ref: \$\{\{ github\.event_name == 'pull_request' && github\.event\.pull_request\.base\.sha \|\| github\.sha \}\}/
    );
    expect(workflow).toMatch(/if: hashFiles\('\.github\/scripts\/preview-links\.mjs'\) != ''/);
  });
});
