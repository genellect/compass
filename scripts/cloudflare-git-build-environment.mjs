import {
  LIBRARY_REGISTRATION_HOSTED_DOMAIN,
  LIBRARY_REGISTRATION_PRODUCTION_API_ORIGIN,
  LIBRARY_REGISTRATION_PRODUCTION_CONFIRMATION,
  LIBRARY_REGISTRATION_PRODUCTION_FRONTEND_ORIGIN,
  LIBRARY_REGISTRATION_PRODUCTION_SCOPE
} from "./library-release-config.mjs";

export const LIBRARY_REGISTRATION_PRODUCTION_GOOGLE_CLIENT_ID =
  "398501996286-d6r3sgh8vttjiucp6f7pp12ivhp6m5ta.apps.googleusercontent.com";
export const LEGACY_LIBRARY_REGISTRATION_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSf8gLujuK-giYnkCnv-Cxp7qon1kY8mhnGvfkA62hOlrJgAHA/viewform";

function value(environment, name) {
  return String(environment[name] ?? "").trim();
}

function requireCloudflareMetadata(environment) {
  const branch = value(environment, "CF_PAGES_BRANCH");
  const commit = value(environment, "CF_PAGES_COMMIT_SHA");
  const deploymentUrl = value(environment, "CF_PAGES_URL");
  let parsedUrl;
  try {
    parsedUrl = new URL(deploymentUrl);
  } catch {
    throw new Error("Cloudflare Git builds require an exact CF_PAGES_URL.");
  }
  if (!branch || !/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error(
      "Cloudflare Git builds require CF_PAGES_BRANCH and a 40-character CF_PAGES_COMMIT_SHA."
    );
  }
  if (
    parsedUrl.protocol !== "https:"
    || parsedUrl.username !== ""
    || parsedUrl.password !== ""
    || parsedUrl.pathname !== "/"
    || parsedUrl.search !== ""
    || parsedUrl.hash !== ""
    || (
      parsedUrl.hostname !== "compass-official.pages.dev"
      && !parsedUrl.hostname.endsWith(".compass-official.pages.dev")
    )
  ) {
    throw new Error(
      "CF_PAGES_URL must be an exact compass-official.pages.dev deployment origin."
    );
  }
  return { branch, commit: commit.toLowerCase(), deploymentUrl: parsedUrl.origin };
}

function setExact(environment, name, expected) {
  const configured = value(environment, name);
  if (configured && configured !== expected) {
    throw new Error(`${name} conflicts with the reviewed Cloudflare Git build profile.`);
  }
  environment[name] = expected;
}

function requireUnset(environment, names) {
  const configured = names.filter((name) => value(environment, name) !== "");
  if (configured.length > 0) {
    throw new Error(
      `Cloudflare Git build received forbidden configuration: ${configured.join(", ")}.`
    );
  }
  for (const name of names) environment[name] = "";
}

export function resolveCloudflareGitBuildEnvironment(environment = process.env) {
  const resolved = { ...environment };
  if (value(resolved, "CF_PAGES") !== "1") {
    return { environment: resolved, mode: "local", metadata: null };
  }

  const metadata = requireCloudflareMetadata(resolved);
  if (metadata.branch === "main") {
    setExact(resolved, "LIBRARY_RELEASE_TARGET", "production");
    setExact(
      resolved,
      "LIBRARY_RELEASE_SCOPE",
      LIBRARY_REGISTRATION_PRODUCTION_SCOPE
    );
    setExact(
      resolved,
      "LIBRARY_RELEASE_CONFIRMATION",
      LIBRARY_REGISTRATION_PRODUCTION_CONFIRMATION
    );
    setExact(
      resolved,
      "LIBRARY_RELEASE_APPROVED_FRONTEND_ORIGIN",
      LIBRARY_REGISTRATION_PRODUCTION_FRONTEND_ORIGIN
    );
    setExact(
      resolved,
      "LIBRARY_RELEASE_APPROVED_API_ORIGIN",
      LIBRARY_REGISTRATION_PRODUCTION_API_ORIGIN
    );
    setExact(
      resolved,
      "NEXT_PUBLIC_LIBRARY_API_BASE_URL",
      LIBRARY_REGISTRATION_PRODUCTION_API_ORIGIN
    );
    setExact(resolved, "NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE", "google");
    setExact(resolved, "NEXT_PUBLIC_LIBRARY_ADMIN_MODE", "mock");
    setExact(
      resolved,
      "NEXT_PUBLIC_LIBRARY_GOOGLE_HOSTED_DOMAIN",
      LIBRARY_REGISTRATION_HOSTED_DOMAIN
    );
    setExact(
      resolved,
      "NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID",
      LIBRARY_REGISTRATION_PRODUCTION_GOOGLE_CLIENT_ID
    );
    requireUnset(resolved, [
      "NEXT_PUBLIC_LIBRARY_UI_REVIEW",
      "NEXT_PUBLIC_FSL_REGISTRATION_URL",
      "NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL",
      "NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID"
    ]);
    return { environment: resolved, mode: "production", metadata };
  }

  setExact(resolved, "LIBRARY_RELEASE_TARGET", "ui_review");
  setExact(resolved, "NEXT_PUBLIC_LIBRARY_UI_REVIEW", "true");
  setExact(resolved, "NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE", "mock");
  setExact(resolved, "NEXT_PUBLIC_LIBRARY_ADMIN_MODE", "mock");
  setExact(
    resolved,
    "NEXT_PUBLIC_FSL_REGISTRATION_URL",
    LEGACY_LIBRARY_REGISTRATION_FORM_URL
  );
  requireUnset(resolved, [
    "LIBRARY_RELEASE_SCOPE",
    "LIBRARY_RELEASE_CONFIRMATION",
    "LIBRARY_RELEASE_APPROVED_FRONTEND_ORIGIN",
    "LIBRARY_RELEASE_APPROVED_API_ORIGIN",
    "NEXT_PUBLIC_LIBRARY_API_BASE_URL",
    "NEXT_PUBLIC_LIBRARY_ADMIN_API_BASE_URL",
    "NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID",
    "NEXT_PUBLIC_LIBRARY_ADMIN_GOOGLE_OAUTH_CLIENT_ID"
  ]);
  return { environment: resolved, mode: "preview", metadata };
}
