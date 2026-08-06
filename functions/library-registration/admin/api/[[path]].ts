const ADMIN_PROXY_PREFIX = "/library-registration/admin/api";
const UPSTREAM_ADMIN_PREFIX = "/admin/v1";
const MAX_REQUEST_BODY_BYTES = 64 * 1024;
const MAX_RESPONSE_BODY_BYTES = 12 * 1024 * 1024;
const MAX_GOOGLE_CREDENTIAL_CHARS = 8192;
const UPSTREAM_TIMEOUT_MS = 20_000;
const COLD_START_RETRY_DELAY_MS = 250;
const RETRYABLE_GET_STATUSES = new Set([500, 502, 503, 504]);
const UUID_SEGMENT =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-" +
  "[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}";

export type AdminApiProxyEnv = {
  LIBRARY_ADMIN_CANONICAL_ORIGIN?: string;
  LIBRARY_ADMIN_API_ORIGIN?: string;
  LIBRARY_ADMIN_EDGE_SHARED_SECRET?: string;
};

type PagesContext = {
  env: AdminApiProxyEnv;
  request: Request;
};

type RouteContract = {
  method: "GET" | "POST";
  pattern: RegExp;
  query: "none" | "pagination";
  requireIdempotency: boolean;
};

const ROUTES: readonly RouteContract[] = Object.freeze([
  {
    method: "GET",
    pattern: /^\/session$/,
    query: "none",
    requireIdempotency: false
  },
  {
    method: "POST",
    pattern: /^\/applications\/search$/,
    query: "none",
    requireIdempotency: false
  },
  {
    method: "POST",
    pattern: /^\/members\/search$/,
    query: "none",
    requireIdempotency: false
  },
  {
    method: "GET",
    pattern: new RegExp(`^/applications/${UUID_SEGMENT}$`),
    query: "none",
    requireIdempotency: false
  },
  {
    method: "POST",
    pattern: new RegExp(`^/applications/${UUID_SEGMENT}/decision$`),
    query: "none",
    requireIdempotency: true
  },
  {
    method: "POST",
    pattern: new RegExp(`^/operations/${UUID_SEGMENT}/retry$`),
    query: "none",
    requireIdempotency: true
  },
  {
    method: "POST",
    pattern: new RegExp(`^/members/${UUID_SEGMENT}/revoke$`),
    query: "none",
    requireIdempotency: true
  },
  {
    method: "POST",
    pattern: new RegExp(`^/members/${UUID_SEGMENT}/deactivate$`),
    query: "none",
    requireIdempotency: true
  },
  {
    method: "GET",
    pattern: /^\/audit-events$/,
    query: "pagination",
    requireIdempotency: false
  },
  {
    method: "POST",
    pattern: /^\/exports$/,
    query: "none",
    requireIdempotency: true
  }
]);

const RESPONSE_HEADERS = Object.freeze([
  "Content-Disposition",
  "Content-Type",
  "Retry-After",
  "WWW-Authenticate",
  "X-Content-SHA256",
  "X-Export-Delete-After",
  "X-Export-Row-Count",
  "X-Export-Run-ID",
  "X-Request-ID"
]);

const BASE_RESPONSE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff"
});

function jsonResponse(detail: string, status: number): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: {
      ...BASE_RESPONSE_HEADERS,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function exactHttpsOrigin(value: string | undefined): string | null {
  const candidate = String(value ?? "").trim();
  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || parsed.pathname !== "/"
      || parsed.search
      || parsed.hash
      || candidate !== parsed.origin
      || ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function requiredConfiguration(
  env: AdminApiProxyEnv
): { siteOrigin: string; apiOrigin: string; edgeSecret: string } | null {
  const siteOrigin = exactHttpsOrigin(env.LIBRARY_ADMIN_CANONICAL_ORIGIN);
  const apiOrigin = exactHttpsOrigin(env.LIBRARY_ADMIN_API_ORIGIN);
  const edgeSecret = String(env.LIBRARY_ADMIN_EDGE_SHARED_SECRET ?? "");
  if (
    !siteOrigin
    || !apiOrigin
    || siteOrigin === apiOrigin
    || edgeSecret.length < 32
    || edgeSecret.length > 512
  ) {
    return null;
  }
  return { siteOrigin, apiOrigin, edgeSecret };
}

function routePath(requestUrl: URL): string | null {
  if (!requestUrl.pathname.startsWith(`${ADMIN_PROXY_PREFIX}/`)) return null;
  const path = requestUrl.pathname.slice(ADMIN_PROXY_PREFIX.length);
  if (!path || path.includes("//") || path.includes("%")) return null;
  return path;
}

function validPaginationQuery(searchParams: URLSearchParams): boolean {
  const entries = [...searchParams.entries()];
  if (entries.length > 2) return false;
  const seen = new Set<string>();
  for (const [key, value] of entries) {
    if (!['offset', 'limit'].includes(key) || seen.has(key) || !/^\d{1,6}$/.test(value)) {
      return false;
    }
    seen.add(key);
  }
  return true;
}

function findRoute(request: Request, requestUrl: URL, path: string): RouteContract | null {
  const route = ROUTES.find(
    (candidate) => candidate.method === request.method && candidate.pattern.test(path)
  );
  if (!route) return null;
  if (route.query === "none" && requestUrl.search) return null;
  if (route.query === "pagination" && !validPaginationQuery(requestUrl.searchParams)) {
    return null;
  }
  return route;
}

function validBearer(value: string | null): value is string {
  return Boolean(
    value
    && value.startsWith("Bearer ")
    && value.length <= MAX_GOOGLE_CREDENTIAL_CHARS + 7
    && !/[\r\n]/.test(value)
  );
}

function validRequestId(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value);
}

function validIdempotencyKey(value: string): boolean {
  return value.length >= 8 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}

async function requestBody(request: Request, route: RouteContract): Promise<string | null> {
  if (route.method === "GET") return "";
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    return null;
  }
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    return null;
  }
  try {
    const body = await request.text();
    if (!body || new TextEncoder().encode(body).byteLength > MAX_REQUEST_BODY_BYTES) {
      return null;
    }
    return body;
  } catch {
    return null;
  }
}

function upstreamHeaders(
  request: Request,
  route: RouteContract,
  edgeSecret: string
): Headers | null {
  if (request.headers.has("X-Library-Admin-Edge-Secret")) return null;
  const authorization = request.headers.get("Authorization");
  if (!validBearer(authorization)) return null;

  const requestId = request.headers.get("X-Request-ID") ?? crypto.randomUUID();
  if (!validRequestId(requestId)) return null;

  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (route.requireIdempotency && (!idempotencyKey || !validIdempotencyKey(idempotencyKey))) {
    return null;
  }
  if (idempotencyKey && !validIdempotencyKey(idempotencyKey)) return null;

  const headers = new Headers({
    Authorization: authorization,
    "X-Library-Admin-Edge-Secret": edgeSecret,
    "X-Request-ID": requestId
  });
  if (route.method === "POST") headers.set("Content-Type", "application/json");
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  return headers;
}

function safeResponseHeaders(upstream: Response): Headers {
  const headers = new Headers(BASE_RESPONSE_HEADERS);
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value && !/[\r\n]/.test(value)) headers.set(name, value);
  }
  return headers;
}

async function fetchUpstream(
  target: URL,
  route: RouteContract,
  headers: Headers,
  body: string
): Promise<Response> {
  const request = () => fetch(target, {
    method: route.method,
    headers,
    body: route.method === "POST" ? body : undefined,
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  });
  const first = await request();
  if (route.method !== "GET" || !RETRYABLE_GET_STATUSES.has(first.status)) {
    return first;
  }
  await new Promise((resolve) => setTimeout(resolve, COLD_START_RETRY_DELAY_MS));
  return request();
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { env, request } = context;
  const requestUrl = new URL(request.url);
  const path = routePath(requestUrl);
  if (!path) return jsonResponse("not_found", 404);

  const route = findRoute(request, requestUrl, path);
  if (!route) return jsonResponse("not_found", 404);

  const configuration = requiredConfiguration(env);
  if (!configuration) return jsonResponse("admin_proxy_unavailable", 503);
  if (requestUrl.origin !== configuration.siteOrigin) {
    return jsonResponse("not_found", 404);
  }

  const headers = upstreamHeaders(request, route, configuration.edgeSecret);
  if (!headers) return jsonResponse("admin_request_rejected", 403);

  const body = await requestBody(request, route);
  if (body === null) return jsonResponse("admin_request_rejected", 400);

  const target = new URL(`${UPSTREAM_ADMIN_PREFIX}${path}`, configuration.apiOrigin);
  if (route.query === "pagination") target.search = requestUrl.search;

  let upstream: Response;
  try {
    upstream = await fetchUpstream(target, route, headers, body);
  } catch {
    return jsonResponse("admin_proxy_unavailable", 502);
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    return jsonResponse("admin_proxy_unavailable", 502);
  }
  const declaredLength = Number(upstream.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BODY_BYTES) {
    return jsonResponse("admin_proxy_unavailable", 502);
  }

  let responseBody: ArrayBuffer;
  try {
    responseBody = await upstream.arrayBuffer();
  } catch {
    return jsonResponse("admin_proxy_unavailable", 502);
  }
  if (responseBody.byteLength > MAX_RESPONSE_BODY_BYTES) {
    return jsonResponse("admin_proxy_unavailable", 502);
  }

  return new Response(responseBody, {
    status: upstream.status,
    headers: safeResponseHeaders(upstream)
  });
}
