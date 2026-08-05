import { resolveLibraryReleaseConfig } from "./library-release-config.mjs";
import { resolveCloudflareGitBuildEnvironment } from
  "./cloudflare-git-build-environment.mjs";

// Cloudflare Git builds derive a code-owned profile from immutable build
// metadata. Other builds retain the existing explicit release gate.
const { environment } = resolveCloudflareGitBuildEnvironment(process.env);
resolveLibraryReleaseConfig(environment);
