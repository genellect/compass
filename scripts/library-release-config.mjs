const LIBRARY_API_ORIGIN_MARKER =
  "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com";

export const LIBRARY_ADMIN_API_BASE_PATH =
  "/library-registration/admin/api";
export const LIBRARY_REGISTRATION_HOSTED_DOMAIN = "st.kitasato-u.ac.jp";
export const LIBRARY_REGISTRATION_PRODUCTION_SCOPE = "registration_only";
export const LIBRARY_REGISTRATION_PRODUCTION_CONFIRMATION =
  "I_APPROVED_LIBRARY_REGISTRATION_ONLY_PRODUCTION_V1";
export const LIBRARY_REGISTRATION_PRODUCTION_FRONTEND_ORIGIN =
  "https://compass-official.pages.dev";
export const LIBRARY_REGISTRATION_PRODUCTION_API_ORIGIN =
  "https://fsl-registration-public-eq64wn4f4a-as.a.run.app";

const SYNTHETIC_MARKER_PATTERN =
  /(?:mock|synthetic|example(?:\.(?:com|invalid|org|net))?|placeholder|change[-_]?me|dummy|fake)/i;

export const LIBRARY_ADMIN_PREVIEW_ARTIFACT_MARKERS = Object.freeze([
  "admin-mock-login",
  "mock-admin-role",
  "app-synthetic-",
  "member-synthetic-",
  "operation-synthetic-",
  "audit-synthetic-",
  "request-synthetic-",
  "export-synthetic-",
  "future-strategy-library-members-synthetic",
  "hanako@example.invalid",
  "taro@example.invalid",
  "jiro@example.invalid",
  "合成 花子",
  "合成 太郎",
  "合成 次郎"
]);

function environmentValue(environment, name) {
  return String(environment[name] ?? "").trim();
}

function readMode(environment, name) {
  const value = environmentValue(environment, name);
  if (value === "" || value === "mock") return "mock";
  if (value === "google") return "google";
  throw new Error(`${name} must be either mock or google.`);
}

export function requireExactHttpsApiOrigin(value, label = "library API origin") {
  const candidate = String(value ?? "").trim();
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`${label} must be an exact HTTPS origin.`);
  }

  const isExactOrigin = (
    parsed.protocol === "https:"
    && parsed.username === ""
    && parsed.password === ""
    && parsed.pathname === "/"
    && parsed.search === ""
    && parsed.hash === ""
    && candidate === parsed.origin
  );
  const isLoopback = (
    parsed.hostname === "localhost"
    || parsed.hostname === "127.0.0.1"
    || parsed.hostname === "[::1]"
  );
  if (
    !isExactOrigin
    || isLoopback
    || SYNTHETIC_MARKER_PATTERN.test(candidate)
  ) {
    throw new Error(`${label} must be an exact non-synthetic HTTPS origin.`);
  }
  return parsed.origin;
}

export function requireExactRegistrationPreviewOrigin(
  value,
  label = "library registration Preview origin"
) {
  const origin = requireExactHttpsApiOrigin(value, label);
  const parsed = new URL(origin);
  const previewHostnamePattern =
    /^library-registration-preview(?:-[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?)?\.compass-official\.pages\.dev$/;
  if (
    parsed.port !== ""
    || !previewHostnamePattern.test(parsed.hostname)
  ) {
    throw new Error(
      `${label} must be the exact branch alias for a compass-official library-registration Preview.`
    );
  }
  return origin;
}

export function requireGoogleOAuthClientId(
  value,
  label = "Google OAuth client ID"
) {
  const clientId = String(value ?? "").trim();
  const hasValidShape =
    /^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(clientId);
  if (!hasValidShape || SYNTHETIC_MARKER_PATTERN.test(clientId)) {
    throw new Error(`${label} is missing, synthetic, or malformed.`);
  }
  return clientId;
}

export function requireExactAdminApiBase(
  value,
  label = "library administrator API base"
) {
  const candidate = String(value ?? "").trim();
  if (candidate !== LIBRARY_ADMIN_API_BASE_PATH) {
    throw new Error(
      `${label} must be exactly ${LIBRARY_ADMIN_API_BASE_PATH}.`
    );
  }
  return candidate;
}

export function resolveLibraryBuildConfig(environment = process.env) {
  const registrationMode = readMode(
    environment,
    "NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE"
  );
  const adminMode = readMode(environment, "NEXT_PUBLIC_LIBRARY_ADMIN_MODE");
  const googleBuild = registrationMode === "google" || adminMode === "google";

  if (!googleBuild) {
    return {
      registrationMode,
      adminMode,
      googleBuild: false,
      apiOrigin: "",
      adminApiBaseUrl: "",
      googleClientId: "",
      adminGoogleClientId: ""
    };
  }

  const googleClientId = registrationMode === "google"
    ? requireGoogleOAuthClientId(
      environmentValue(environment, "NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID"),
      "Registration Google OAuth client ID"
    )
    : "";
  const adminGoogleClientId = adminMode === "google"
    ? requireGoogleOAuthClientId(
      environmentValue(
        environment,
        "NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID"
      ),
      "Administrator Google OAuth client ID"
    )
    : "";

  if (
    registrationMode === "google"
    && adminMode === "google"
    && googleClientId === adminGoogleClientId
  ) {
    throw new Error(
      "Registration and administrator Google OAuth client IDs must be different."
    );
  }

  return {
    registrationMode,
    adminMode,
    googleBuild: true,
    apiOrigin: registrationMode === "google"
      ? requireExactHttpsApiOrigin(
        environmentValue(environment, "NEXT_PUBLIC_LIBRARY_API_BASE_URL")
      )
      : "",
    adminApiBaseUrl: adminMode === "google"
      ? requireExactAdminApiBase(
        environmentValue(
          environment,
          "NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL"
        )
      )
      : "",
    googleClientId,
    adminGoogleClientId
  };
}

export function requireLibraryProductionReleaseConfig(environment = process.env) {
  if (environmentValue(environment, "LIBRARY_RELEASE_TARGET") !== "production") {
    throw new Error("LIBRARY_RELEASE_TARGET must explicitly be production.");
  }
  if (environmentValue(environment, "NEXT_PUBLIC_LIBRARY_UI_REVIEW") !== "") {
    throw new Error("Production must not enable the UI review build flag.");
  }

  const config = resolveLibraryBuildConfig(environment);
  if (config.registrationMode !== "google" || config.adminMode !== "google") {
    throw new Error(
      "Production requires both library registration and administrator modes to be google."
    );
  }
  if (
    !config.googleClientId
    || !config.adminGoogleClientId
    || config.googleClientId === config.adminGoogleClientId
  ) {
    throw new Error(
      "Production requires separate registration and administrator Google OAuth client IDs."
    );
  }

  const approvedApiOrigin = requireExactHttpsApiOrigin(
    environmentValue(environment, "LIBRARY_RELEASE_APPROVED_API_ORIGIN"),
    "approved library API origin"
  );
  if (approvedApiOrigin !== config.apiOrigin) {
    throw new Error(
      "NEXT_PUBLIC_LIBRARY_API_BASE_URL must exactly match LIBRARY_RELEASE_APPROVED_API_ORIGIN."
    );
  }

  return { ...config, approvedApiOrigin };
}

export function requireLibraryRegistrationProductionReleaseConfig(
  environment = process.env
) {
  if (environmentValue(environment, "LIBRARY_RELEASE_TARGET") !== "production") {
    throw new Error("LIBRARY_RELEASE_TARGET must explicitly be production.");
  }
  if (
    environmentValue(environment, "LIBRARY_RELEASE_SCOPE")
    !== LIBRARY_REGISTRATION_PRODUCTION_SCOPE
  ) {
    throw new Error(
      `LIBRARY_RELEASE_SCOPE must explicitly be ${LIBRARY_REGISTRATION_PRODUCTION_SCOPE}.`
    );
  }
  if (
    environmentValue(environment, "LIBRARY_RELEASE_CONFIRMATION")
    !== LIBRARY_REGISTRATION_PRODUCTION_CONFIRMATION
  ) {
    throw new Error(
      "LIBRARY_RELEASE_CONFIRMATION must contain the exact registration-only production approval."
    );
  }
  if (environmentValue(environment, "NEXT_PUBLIC_LIBRARY_UI_REVIEW") !== "") {
    throw new Error("Production must not enable the UI review build flag.");
  }
  if (environmentValue(environment, "NEXT_PUBLIC_FSL_REGISTRATION_URL") !== "") {
    throw new Error(
      "Registration-only production must not receive a legacy CTA override."
    );
  }

  const config = resolveLibraryBuildConfig(environment);
  if (config.registrationMode !== "google" || config.adminMode !== "mock") {
    throw new Error(
      "Registration-only production requires google registration and fail-closed mock administrator mode."
    );
  }

  const forbiddenAdminConfiguration = [
    "NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL",
    "NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID"
  ];
  const configuredAdminValues = forbiddenAdminConfiguration.filter(
    (name) => environmentValue(environment, name) !== ""
  );
  if (configuredAdminValues.length > 0) {
    throw new Error(
      `Registration-only production must not receive administrator frontend configuration: ${configuredAdminValues.join(", ")}.`
    );
  }

  const approvedApiOrigin = requireExactHttpsApiOrigin(
    environmentValue(environment, "LIBRARY_RELEASE_APPROVED_API_ORIGIN"),
    "approved library API origin"
  );
  if (
    approvedApiOrigin !== LIBRARY_REGISTRATION_PRODUCTION_API_ORIGIN
    || config.apiOrigin !== LIBRARY_REGISTRATION_PRODUCTION_API_ORIGIN
  ) {
    throw new Error(
      `Registration-only production API origin must be exactly ${LIBRARY_REGISTRATION_PRODUCTION_API_ORIGIN}.`
    );
  }

  const approvedFrontendOrigin = requireExactHttpsApiOrigin(
    environmentValue(environment, "LIBRARY_RELEASE_APPROVED_FRONTEND_ORIGIN"),
    "approved library frontend origin"
  );
  if (approvedFrontendOrigin !== LIBRARY_REGISTRATION_PRODUCTION_FRONTEND_ORIGIN) {
    throw new Error(
      `Registration-only production frontend origin must be exactly ${LIBRARY_REGISTRATION_PRODUCTION_FRONTEND_ORIGIN}.`
    );
  }

  const configuredHostedDomain = (
    environmentValue(
      environment,
      "NEXT_PUBLIC_LIBRARY_GOOGLE_HOSTED_DOMAIN"
    ) || LIBRARY_REGISTRATION_HOSTED_DOMAIN
  ).toLowerCase();
  if (configuredHostedDomain !== LIBRARY_REGISTRATION_HOSTED_DOMAIN) {
    throw new Error(
      `Registration-only production hosted domain must be exactly ${LIBRARY_REGISTRATION_HOSTED_DOMAIN}.`
    );
  }

  return {
    ...config,
    approvedApiOrigin,
    approvedFrontendOrigin,
    approvedHostedDomain: LIBRARY_REGISTRATION_HOSTED_DOMAIN,
    releaseScope: LIBRARY_REGISTRATION_PRODUCTION_SCOPE
  };
}

export function requireLibraryUiReviewReleaseConfig(environment = process.env) {
  if (environmentValue(environment, "LIBRARY_RELEASE_TARGET") !== "ui_review") {
    throw new Error("LIBRARY_RELEASE_TARGET must explicitly be ui_review.");
  }
  if (environmentValue(environment, "NEXT_PUBLIC_LIBRARY_UI_REVIEW") !== "true") {
    throw new Error("UI review requires NEXT_PUBLIC_LIBRARY_UI_REVIEW=true.");
  }

  const config = resolveLibraryBuildConfig(environment);
  if (config.registrationMode !== "mock" || config.adminMode !== "mock") {
    throw new Error(
      "UI review requires both library modes to remain fail-closed mock modes."
    );
  }

  const forbiddenPublicConfiguration = [
    "LIBRARY_RELEASE_APPROVED_API_ORIGIN",
    "LIBRARY_RELEASE_APPROVED_FRONTEND_ORIGIN",
    "NEXT_PUBLIC_LIBRARY_API_BASE_URL",
    "NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL",
    "NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID",
    "NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID"
  ];
  const configured = forbiddenPublicConfiguration.filter(
    (name) => environmentValue(environment, name) !== ""
  );
  if (configured.length > 0) {
    throw new Error(
      `UI review must not receive API or OAuth configuration: ${configured.join(", ")}.`
    );
  }

  return config;
}

export function requireLibraryRegistrationPreviewReleaseConfig(
  environment = process.env
) {
  if (
    environmentValue(environment, "LIBRARY_RELEASE_TARGET")
    !== "registration_preview"
  ) {
    throw new Error(
      "LIBRARY_RELEASE_TARGET must explicitly be registration_preview."
    );
  }
  if (environmentValue(environment, "NEXT_PUBLIC_LIBRARY_UI_REVIEW") !== "") {
    throw new Error(
      "Registration Preview must not enable the UI review build flag."
    );
  }

  const config = resolveLibraryBuildConfig(environment);
  if (config.registrationMode !== "google" || config.adminMode !== "mock") {
    throw new Error(
      "Registration Preview requires google registration and fail-closed mock administrator mode."
    );
  }

  const forbiddenAdminConfiguration = [
    "NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL",
    "NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID"
  ];
  const configuredAdminValues = forbiddenAdminConfiguration.filter(
    (name) => environmentValue(environment, name) !== ""
  );
  if (configuredAdminValues.length > 0) {
    throw new Error(
      `Registration Preview must not receive administrator frontend configuration: ${configuredAdminValues.join(", ")}.`
    );
  }

  const approvedApiOrigin = requireExactHttpsApiOrigin(
    environmentValue(environment, "LIBRARY_RELEASE_APPROVED_API_ORIGIN"),
    "approved library API origin"
  );
  if (approvedApiOrigin !== config.apiOrigin) {
    throw new Error(
      "NEXT_PUBLIC_LIBRARY_API_BASE_URL must exactly match LIBRARY_RELEASE_APPROVED_API_ORIGIN."
    );
  }
  const approvedFrontendOrigin = requireExactRegistrationPreviewOrigin(
    environmentValue(
      environment,
      "LIBRARY_RELEASE_APPROVED_FRONTEND_ORIGIN"
    )
  );
  const configuredHostedDomain = (
    environmentValue(
      environment,
      "NEXT_PUBLIC_LIBRARY_GOOGLE_HOSTED_DOMAIN"
    ) || LIBRARY_REGISTRATION_HOSTED_DOMAIN
  ).toLowerCase();
  if (configuredHostedDomain !== LIBRARY_REGISTRATION_HOSTED_DOMAIN) {
    throw new Error(
      `Registration Preview hosted domain must be exactly ${LIBRARY_REGISTRATION_HOSTED_DOMAIN}.`
    );
  }

  return {
    ...config,
    approvedApiOrigin,
    approvedFrontendOrigin,
    approvedHostedDomain: LIBRARY_REGISTRATION_HOSTED_DOMAIN
  };
}

export function isLibraryProductionRelease(environment = process.env) {
  const target = environmentValue(environment, "LIBRARY_RELEASE_TARGET");
  const cloudflarePages = environmentValue(environment, "CF_PAGES") === "1";
  const cloudflareBranch = environmentValue(environment, "CF_PAGES_BRANCH");
  if (cloudflarePages && target === "") {
    throw new Error(
      "Cloudflare Pages builds require an explicit LIBRARY_RELEASE_TARGET."
    );
  }
  if (
    cloudflarePages
    && cloudflareBranch.toLowerCase() === "main"
    && target !== "production"
  ) {
    throw new Error(
      "The Cloudflare Pages production branch requires LIBRARY_RELEASE_TARGET=production."
    );
  }
  if (
    target === ""
    || target === "local"
    || target === "ui_review"
    || target === "registration_preview"
  ) return false;
  if (target === "production") return true;
  throw new Error(
    "LIBRARY_RELEASE_TARGET must be local, ui_review, registration_preview, production, or unset."
  );
}

export function resolveLibraryReleaseConfig(environment = process.env) {
  const productionRelease = isLibraryProductionRelease(environment);
  const target = environmentValue(environment, "LIBRARY_RELEASE_TARGET");
  const uiReviewRelease = target === "ui_review";
  const registrationPreviewRelease = target === "registration_preview";
  const registrationOnlyProductionRelease = productionRelease
    && environmentValue(environment, "LIBRARY_RELEASE_SCOPE")
      === LIBRARY_REGISTRATION_PRODUCTION_SCOPE;
  const config = registrationOnlyProductionRelease
    ? requireLibraryRegistrationProductionReleaseConfig(environment)
    : productionRelease
      ? requireLibraryProductionReleaseConfig(environment)
    : uiReviewRelease
      ? requireLibraryUiReviewReleaseConfig(environment)
      : registrationPreviewRelease
        ? requireLibraryRegistrationPreviewReleaseConfig(environment)
        : resolveLibraryBuildConfig(environment);
  return {
    productionRelease,
    registrationOnlyProductionRelease,
    uiReviewRelease,
    registrationPreviewRelease,
    config
  };
}

export function renderLibraryDeploymentHeaders(template, config) {
  if (template.includes("https://*.run.app")) {
    throw new Error("Library CSP must not contain the broad https://*.run.app origin.");
  }

  const markerCount = template.split(LIBRARY_API_ORIGIN_MARKER).length - 1;
  if (markerCount !== 1) {
    throw new Error(
      `Library CSP connect-src marker must occur exactly once; found ${markerCount}.`
    );
  }

  const replacement = config.apiOrigin
    ? `${LIBRARY_API_ORIGIN_MARKER} ${config.apiOrigin}`
    : LIBRARY_API_ORIGIN_MARKER;
  const rendered = template.replace(LIBRARY_API_ORIGIN_MARKER, replacement);

  if (!config.googleBuild && /https:\/\/[^\s;]+\.run\.app/i.test(rendered)) {
    throw new Error("Mock build must not expose an API origin in the library CSP.");
  }
  return rendered;
}

export function libraryRegistrationHeaderBlock(headers) {
  const match = headers.match(
    /(?:^|\n)\/library-registration\/\*\r?\n([\s\S]*?)(?=\r?\n\/|$)/
  );
  if (!match) throw new Error("Library registration deployment header block is missing.");
  return match[1];
}

export function verifyLibraryHeaderBoundary(headers, config) {
  if (headers.includes("https://*.run.app")) {
    throw new Error("Generated headers contain the broad https://*.run.app origin.");
  }

  const block = libraryRegistrationHeaderBlock(headers);
  const connectSource = block.match(/connect-src\s+([^;]+);/)?.[1];
  if (!connectSource) {
    throw new Error("Library registration connect-src directive is missing.");
  }
  const allowed = [
    "'self'",
    "https://accounts.google.com",
    "https://oauth2.googleapis.com"
  ];
  if (config.apiOrigin) allowed.push(config.apiOrigin);

  const actual = connectSource.trim().split(/\s+/);
  if (
    actual.length !== allowed.length
    || actual.some((value, index) => value !== allowed[index])
  ) {
    throw new Error(
      `Library registration connect-src must be exact; found ${actual.join(" ")}.`
    );
  }
}

export function hasSyntheticMarker(value) {
  return SYNTHETIC_MARKER_PATTERN.test(String(value ?? ""));
}
