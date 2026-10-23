// Posts a single pull-request comment that lists the Cloudflare Pages
// Preview URLs and the public routes affected by the pull request.
//
// Runs from .github/workflows/preview-links.yml. It has no dependencies,
// executes no pull-request content, and only reads file *names* through the
// GitHub REST API. URLs are taken verbatim from the "Cloudflare Pages" check
// run output; nothing is derived from the branch name.
//
// Why the branch alias is not constructed: Cloudflare documents that branch
// aliases are lowercased with non-alphanumeric characters replaced by a
// hyphen (https://developers.cloudflare.com/pages/configuration/preview-deployments/#preview-aliases),
// but the alias observed for `claude/compass-repo-dev-ux-oern47` was
// `claude-compass-repo-dev-ux-o`, i.e. also truncated by a rule that page does
// not describe. The check run output carries both URLs, so it is the only
// source used here.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const COMMENT_MARKER = "<!-- compass-preview-links -->";
export const COMMENT_AUTHOR = "github-actions[bot]";
export const CLOUDFLARE_APP_SLUG = "cloudflare-workers-and-pages";
export const CLOUDFLARE_CHECK_NAME = "Cloudflare Pages";

// Route ↔ surface mapping follows docs/WEBSITE_BOUNDARIES.md.
export const PREVIEW_ROUTES = Object.freeze([
  { id: "official", label: "親サイト", path: "/", surface: "COMPASS official", independent: false },
  { id: "library", label: "未来戦略ライブラリ", path: "/future-strategy-library/", surface: "COMPASS official", independent: false },
  { id: "messages", label: "Messages", path: "/messages/", surface: "COMPASS official", independent: false },
  { id: "community", label: "Community参加", path: "/community/join/", surface: "COMPASS official", independent: false },
  { id: "contact", label: "Contact", path: "/contact/", surface: "COMPASS official", independent: false },
  { id: "interactive", label: "Interactive紹介", path: "/INTRO_Interactive/", surface: "Interactive introduction", independent: true },
  { id: "developers", label: "開発者紹介", path: "/INTRO_Interactive/developers/", surface: "Developer introduction", independent: true },
  { id: "founder", label: "Founder JP", path: "/founder/", surface: "yuto-matsui.com Japanese", independent: true },
  { id: "founder-en", label: "Founder EN", path: "/en/", surface: "yuto-matsui.com English", independent: true }
]);

const ALL = PREVIEW_ROUTES.map((route) => route.id);
const OFFICIAL_CHROME = ["official", "library", "messages", "community", "contact"];
const FOUNDER_SHARED_WITH_EN = "(FounderProducts|CytellectSculpture|ProductSculpture|product-sculpture-engine|platform-glyphs|products-cinematic|products-equal|FragmentFilm|fragment-film|MobileFragmentFilm|mobile-fragment-film)";

// Each changed path is tested against every rule; the matching route ids are
// unioned. Build, routing and global-style inputs reach every route.
export const ROUTE_RULES = Object.freeze([
  {
    routes: ALL,
    pattern: /^(next\.config\.ts|package(-lock)?\.json|tsconfig\.json|wrangler\.jsonc|_headers|_redirects|public\/_routes\.json|functions\/_middleware\.ts|src\/analytics\.ts|src\/styles\/|scripts\/(assemble-next-export|run-next-build|cloudflare-git-build-environment|finalize-cloudflare-git-build|assert-library-build-target|verify-next-build)\.mjs$)/
  },
  // The (official) layout is shared by the official routes and Founder JP.
  { routes: [...OFFICIAL_CHROME, "founder"], pattern: /^src\/app\/\(official\)\/layout\.tsx$/ },
  {
    routes: OFFICIAL_CHROME,
    pattern: /^(src\/components\/(SiteHeader|SiteFooter|NightBackdrop|siteRouteContext|site-header|site-footer|night-backdrop|mobile-chrome|parent-brand)[^/]*$|public\/images\/compass-mark\.svg$)/
  },
  {
    routes: ["official"],
    pattern: /^(src\/app\/\(official\)\/page\.tsx$|src\/App\.tsx$|src\/LegacyPageBody\.tsx$|src\/legacy-interactions\.ts$|src\/sections\/|src\/hooks\/|src\/components\/(Hero|Habitat|Explorer|BrandSignalGraphics|Disclosure)([./]|$)|src\/app\/\(spatial\)\/|public\/habitat\/|public\/media\/explorer\/|public\/images\/(Image[^/]*|hero\.[^/]*|technology\/|experience\/)|scripts\/(habitat|explorer)\/)/
  },
  { routes: ["official", "founder"], pattern: /^(src\/components\/LegacyInteractions[^/]*$|functions\/index\.ts$)/ },
  {
    routes: ["library"],
    pattern: /^(src\/app\/\(official\)\/future-strategy-library\/|src\/app\/\(library\)\/|src\/library-registration\/|src\/lib\/futureStrategyLibrary|public\/images\/future-strategy-library\/|functions\/library-registration\/|google-apps-script\/library-registration-notifications\/)/
  },
  { routes: ["messages"], pattern: /^src\/app\/\(official\)\/messages\// },
  {
    routes: ["community"],
    pattern: /^(src\/app\/\(official\)\/community\/|src\/lib\/community-registration-schema|functions\/api\/community-registration\.ts$|google-apps-script\/Code\.gs$)/
  },
  {
    routes: ["contact"],
    pattern: /^(src\/app\/\(official\)\/contact\/|src\/lib\/contact-schema|functions\/api\/contact\.ts$|google-apps-script\/contact\/|public\/media\/contact-entry\/|scripts\/contact-entry\/)/
  },
  { routes: ["interactive", "developers"], pattern: /^(src\/app\/\(interactive\)\/layout\.tsx$|src\/interactive\/(?!DeveloperApp\.tsx$|developer\/)|public\/interactive\/|public\/images\/interactive\/|scripts\/interactive\/)/ },
  { routes: ["interactive"], pattern: /^src\/app\/\(interactive\)\/INTRO_Interactive\/(?!developers\/)/ },
  {
    routes: ["developers"],
    pattern: /^(src\/app\/\(interactive\)\/INTRO_Interactive\/developers\/|src\/interactive\/DeveloperApp\.tsx$|src\/interactive\/developer\/|src\/components\/GitHubProfileLink[^/]*$)/
  },
  { routes: ["founder"], pattern: /^(src\/app\/\(official\)\/founder\/|public\/founder-(robots\.txt|sitemap\.xml)$)/ },
  {
    routes: ["founder", "founder-en"],
    pattern: new RegExp(`^(src\\/app\\/\\(official\\)\\/founder\\/${FOUNDER_SHARED_WITH_EN}|src\\/components\\/(FounderJapaneseLink|portfolio)([./]|$)|public\\/images\\/founder[^/]*\\/)`)
  },
  { routes: ["founder-en"], pattern: /^(src\/app\/\(founder-en\)\/|functions\/en\/)/ }
]);

export function routesForChangedFiles(files) {
  const matched = new Set();
  for (const file of files) {
    for (const rule of ROUTE_RULES) {
      if (rule.pattern.test(file)) for (const id of rule.routes) matched.add(id);
    }
  }
  return PREVIEW_ROUTES.filter((route) => matched.has(route.id)).map((route) => route.id);
}

const PAGES_DEV_URL = /^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.pages\.dev\/?$/;

function linkAfterLabel(summary, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = summary.match(new RegExp(`<strong>${escaped}:</strong>\\s*</td>\\s*<td>\\s*<a href=['"]([^'"]+)['"]`, "i"));
  if (!match) return null;
  const url = match[1].trim();
  return PAGES_DEV_URL.test(url) ? url.replace(/\/$/, "") : null;
}

// Reads the Preview URLs that Cloudflare writes into its check run summary.
// Returns null for a URL that is absent or is not an https *.pages.dev origin.
export function parseCloudflareSummary(summary) {
  const text = typeof summary === "string" ? summary : "";
  return {
    previewUrl: linkAfterLabel(text, "Preview URL"),
    branchUrl: linkAfterLabel(text, "Branch Preview URL")
  };
}

export function selectCloudflareCheck(checkRuns) {
  const candidates = (checkRuns ?? []).filter(
    (run) => run?.app?.slug === CLOUDFLARE_APP_SLUG && run?.name === CLOUDFLARE_CHECK_NAME
  );
  const timestamp = (run) => Date.parse(run.completed_at ?? run.started_at ?? "") || 0;
  return candidates.sort((left, right) => timestamp(right) - timestamp(left) || right.id - left.id)[0] ?? null;
}

const DASHBOARD_URL = /^https:\/\/dash\.cloudflare\.com\/[^\s<>"'`]*$/;

function deploymentState(check) {
  if (!check) return { kind: "missing" };
  const { previewUrl, branchUrl } = parseCloudflareSummary(check.output?.summary);
  const logsUrl = typeof check.details_url === "string" && DASHBOARD_URL.test(check.details_url) ? check.details_url : null;
  if (check.status !== "completed") return { kind: "pending", logsUrl };
  if (check.conclusion === "success" && previewUrl) return { kind: "ready", previewUrl, branchUrl, logsUrl };
  return { kind: "failed", conclusion: check.conclusion ?? "unknown", logsUrl };
}

function routeLink(base, route) {
  return `${base}${route.path}`;
}

function routeLine(route, base) {
  const tag = route.independent ? `（独立surface: ${route.surface}）` : "";
  const target = base ? `[${route.path}](${routeLink(base, route)})` : `\`${route.path}\``;
  return `- **${route.label}** ${target}${tag}`;
}

export function renderComment({ headSha, check, changedFiles, totalChangedFiles, waitedMinutes = null }) {
  const state = deploymentState(check);
  const base = state.kind === "ready" ? state.previewUrl : null;
  const highlighted = new Set(routesForChangedFiles(changedFiles));
  // Cloudflare already posts its own deployment comment; this one adds the
  // per-route links, so the deployment facts are kept to a single line.
  const lines = [COMMENT_MARKER, "### Preview対象route", ""];
  const commit = `\`${String(headSha).slice(0, 7)}\``;
  if (state.kind === "ready") {
    const branch = state.branchUrl ? `（Branch Preview: ${state.branchUrl}）` : "";
    lines.push(`commit ${commit} のPreview ${state.previewUrl} を基底にしています${branch}。`);
  } else if (state.kind === "pending") {
    lines.push(`commit ${commit} のCloudflare Pages deploy待ちです。check run完了後にURLを追記します。`);
  } else if (state.kind === "failed") {
    lines.push(`commit ${commit} のCloudflare Pages deployが成功していません（conclusion: \`${state.conclusion}\`）。URLは表示しません。`);
  } else {
    const waited = waitedMinutes === null ? "" : `${waitedMinutes}分待機しましたが、`;
    lines.push(`${waited}commit ${commit} の「${CLOUDFLARE_CHECK_NAME}」check runが見つかりません。`);
  }
  if (state.logsUrl && state.kind !== "ready") lines.push(`Cloudflareのlog: [dashboard](${state.logsUrl})`);
  lines.push("");

  lines.push("#### 変更pathに対応するroute", "");
  if (highlighted.size === 0) {
    lines.push("変更pathに対応する公開routeはありません（文書・CI・テスト等のみ）。");
  } else {
    for (const route of PREVIEW_ROUTES) if (highlighted.has(route.id)) lines.push(routeLine(route, base));
    if (PREVIEW_ROUTES.some((route) => highlighted.has(route.id) && route.independent)) {
      lines.push("", "> 独立surface（Interactive紹介・開発者紹介・yuto-matsui.com）に影響する変更を含みます。`docs/WEBSITE_BOUNDARIES.md`の境界を確認してください。");
    }
  }
  lines.push("");

  lines.push(`<details><summary>全route（${PREVIEW_ROUTES.length}件）</summary>`, "");
  lines.push("| Route | Surface | 対象 | Preview |", "| --- | --- | --- | --- |");
  for (const route of PREVIEW_ROUTES) {
    const link = base ? `[開く](${routeLink(base, route)})` : "-";
    lines.push(`| ${route.label} \`${route.path}\` | ${route.surface}${route.independent ? "（独立）" : ""} | ${highlighted.has(route.id) ? "変更あり" : ""} | ${link} |`);
  }
  lines.push("", "</details>", "");

  const counted = totalChangedFiles > changedFiles.length
    ? `変更file ${totalChangedFiles}件のうちAPIで取得できた${changedFiles.length}件から判定しています。`
    : `変更file ${changedFiles.length}件から判定しています。`;
  lines.push(
    `<sub>URLは「${CLOUDFLARE_CHECK_NAME}」check runの出力から転記しています。${counted}route対応は\`docs/WEBSITE_BOUNDARIES.md\`と\`.github/scripts/preview-links.mjs\`に従います。PR更新とcheck run完了のたびに、このcommentを更新します。</sub>`
  );
  return `${lines.join("\n")}\n`;
}

// --- GitHub REST access -----------------------------------------------------

export function createGitHubClient({ token, apiUrl = "https://api.github.com", fetchImpl = fetch }) {
  if (!token) throw new Error("GITHUB_TOKEN is required.");
  async function request(method, route, body) {
    const response = await fetchImpl(`${apiUrl}${route}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) throw new Error(`GitHub API ${method} ${route.split("?")[0]} failed with HTTP ${response.status}.`);
    return response.status === 204 ? null : response.json();
  }
  async function paginate(route, pick = (data) => data, maxPages = 30) {
    const items = [];
    for (let page = 1; page <= maxPages; page++) {
      const separator = route.includes("?") ? "&" : "?";
      const data = pick(await request("GET", `${route}${separator}per_page=100&page=${page}`));
      items.push(...data);
      if (data.length < 100) break;
    }
    return items;
  }
  return { request, paginate };
}

async function changedFilesFor(client, repo, number) {
  const files = await client.paginate(`/repos/${repo}/pulls/${number}/files`);
  return files.flatMap((file) => [file.filename, file.previous_filename].filter(Boolean));
}

async function cloudflareCheckFor(client, repo, sha) {
  const name = encodeURIComponent(CLOUDFLARE_CHECK_NAME);
  const runs = await client.paginate(`/repos/${repo}/commits/${sha}/check-runs?check_name=${name}`, (data) => data.check_runs ?? []);
  return selectCloudflareCheck(runs);
}

export async function upsertComment(client, repo, number, body) {
  const comments = await client.paginate(`/repos/${repo}/issues/${number}/comments`);
  const ours = comments
    .filter((comment) => comment.user?.login === COMMENT_AUTHOR && comment.body?.includes(COMMENT_MARKER))
    .sort((left, right) => left.id - right.id);
  if (ours.length === 0) {
    await client.request("POST", `/repos/${repo}/issues/${number}/comments`, { body });
    // Two runs can race to create the first comment; keep only the oldest.
    const after = (await client.paginate(`/repos/${repo}/issues/${number}/comments`))
      .filter((comment) => comment.user?.login === COMMENT_AUTHOR && comment.body?.includes(COMMENT_MARKER))
      .sort((left, right) => left.id - right.id);
    for (const extra of after.slice(1)) await client.request("DELETE", `/repos/${repo}/issues/comments/${extra.id}`);
    if (after.length > 1 && after[0].body !== body) {
      await client.request("PATCH", `/repos/${repo}/issues/comments/${after[0].id}`, { body });
    }
    return after.length > 1 ? "deduplicated" : "created";
  }
  for (const extra of ours.slice(1)) await client.request("DELETE", `/repos/${repo}/issues/comments/${extra.id}`);
  if (ours[0].body === body) return "unchanged";
  await client.request("PATCH", `/repos/${repo}/issues/comments/${ours[0].id}`, { body });
  return "updated";
}

async function updatePullRequest(client, repo, number, expectedSha, options) {
  const pull = await client.request("GET", `/repos/${repo}/pulls/${number}`);
  if (pull.state !== "open") return { number, result: "skipped: pull request is not open" };
  if (pull.head.sha !== expectedSha) return { number, result: "skipped: a newer commit was pushed" };
  const changedFiles = await changedFilesFor(client, repo, number);
  const check = options.check ?? (await cloudflareCheckFor(client, repo, expectedSha));
  const body = renderComment({
    headSha: expectedSha,
    check,
    changedFiles,
    totalChangedFiles: pull.changed_files ?? changedFiles.length,
    waitedMinutes: options.waitedMinutes ?? null
  });
  return { number, result: await upsertComment(client, repo, number, body), check };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function run({ env = process.env, client, now = Date.now, wait = sleep, log = console.log } = {}) {
  const repo = env.GITHUB_REPOSITORY;
  const eventName = env.GITHUB_EVENT_NAME;
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
  const github = client ?? createGitHubClient({ token: env.GITHUB_TOKEN, apiUrl: env.GITHUB_API_URL });

  if (eventName === "check_run") {
    const check = event.check_run;
    if (check?.app?.slug !== CLOUDFLARE_APP_SLUG || check?.name !== CLOUDFLARE_CHECK_NAME) {
      log("Not a Cloudflare Pages check run; nothing to do.");
      return [];
    }
    const results = [];
    for (const pull of check.pull_requests ?? []) {
      results.push(await updatePullRequest(github, repo, pull.number, check.head_sha, { check }));
    }
    for (const { number, result } of results) log(`#${number}: ${result}`);
    return results;
  }

  if (eventName === "pull_request") {
    const number = event.pull_request.number;
    const sha = event.pull_request.head.sha;
    const waitSeconds = Number(env.PREVIEW_WAIT_SECONDS ?? "900");
    const pollSeconds = Number(env.PREVIEW_POLL_SECONDS ?? "20");
    const started = now();
    let outcome = await updatePullRequest(github, repo, number, sha, {});
    log(`#${number}: ${outcome.result}`);
    while (outcome.result.startsWith("skipped") === false && outcome.check?.status !== "completed") {
      if (now() - started >= waitSeconds * 1000) {
        const waitedMinutes = outcome.check ? null : Math.round(waitSeconds / 60);
        outcome = await updatePullRequest(github, repo, number, sha, { waitedMinutes });
        log(`#${number}: ${outcome.result} (stopped waiting after ${waitSeconds}s)`);
        break;
      }
      await wait(pollSeconds * 1000);
      outcome = await updatePullRequest(github, repo, number, sha, {});
      log(`#${number}: ${outcome.result}`);
    }
    return [outcome];
  }

  log(`Unsupported event ${eventName}; nothing to do.`);
  return [];
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  await run();
}
