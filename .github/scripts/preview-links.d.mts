// Types for preview-links.mjs, used by tests/preview-links.test.ts.

export interface PreviewRoute {
  id: string;
  label: string;
  path: string;
  surface: string;
  independent: boolean;
}

export interface CheckRun {
  id: number;
  name: string;
  app?: { slug?: string };
  head_sha?: string;
  status?: string;
  conclusion?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  details_url?: string | null;
  output?: { summary?: string | null };
  pull_requests?: { number: number }[];
}

export interface GitHubClient {
  request(method: string, route: string, body?: { body: string }): Promise<any>;
  paginate(route: string, pick?: (data: any) => any[], maxPages?: number): Promise<any[]>;
}

export interface UpdateResult {
  number: number;
  result: string;
  check?: CheckRun | null;
}

export const COMMENT_MARKER: string;
export const COMMENT_AUTHOR: string;
export const CLOUDFLARE_APP_SLUG: string;
export const CLOUDFLARE_CHECK_NAME: string;
export const PREVIEW_ROUTES: readonly PreviewRoute[];
export const ROUTE_RULES: readonly { routes: string[]; pattern: RegExp }[];

export function routesForChangedFiles(files: string[]): string[];
export function parseCloudflareSummary(summary: unknown): { previewUrl: string | null; branchUrl: string | null };
export function selectCloudflareCheck(checkRuns: CheckRun[] | null | undefined): CheckRun | null;
export function renderComment(input: {
  headSha: string;
  check: CheckRun | null;
  changedFiles: string[];
  totalChangedFiles: number;
  waitedMinutes?: number | null;
}): string;
export function createGitHubClient(options: { token?: string; apiUrl?: string; fetchImpl?: typeof fetch }): GitHubClient;
export function upsertComment(client: GitHubClient, repo: string, number: number, body: string): Promise<string>;
export function run(options?: {
  env?: Record<string, string | undefined>;
  client?: GitHubClient;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}): Promise<UpdateResult[]>;
