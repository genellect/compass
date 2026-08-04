import { resolveLibraryReleaseConfig } from "./library-release-config.mjs";

// Fail before image optimization or Next.js compilation when Cloudflare's
// Git-connected builder has no reviewed Library release classification.
resolveLibraryReleaseConfig(process.env);
