import { expect, test as base } from "@playwright/test";

const analyticsHosts = [
  "googletagmanager.com",
  "google-analytics.com",
  "static.cloudflareinsights.com",
] as const;

const externalFormHosts = [
  "docs.google.com",
  "forms.gle",
  "forms.google.com",
  "script.google.com",
  "script.googleusercontent.com",
] as const;

const protectedFormEndpoints = new Set([
  "/api/community-registration",
  "/api/contact",
]);

const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const turnstileStub = String.raw`
(() => {
  let nextWidgetId = 0;

  window.turnstile = Object.freeze({
    render(container) {
      const widgetId = "responsive-turnstile-" + (++nextWidgetId);
      if (container instanceof HTMLElement) {
        container.dataset.responsiveTurnstileStub = widgetId;
      }
      return widgetId;
    },
    remove() {},
    reset() {},
  });
})();
`;

function matchesHost(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isHostedBy(hostname: string, domains: readonly string[]) {
  return domains.some((domain) => matchesHost(hostname, domain));
}

function safeOrigin(value: unknown) {
  if (typeof value !== "string" || value.length === 0) return undefined;

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/**
 * Responsive-test fixture with a fail-closed network boundary.
 *
 * The context route is installed before Playwright creates the test's `page`,
 * so it also covers popups and any additional pages a spec creates later.
 */
export const test = base.extend({
  context: async ({ context }, use, testInfo) => {
    const applicationOrigin = safeOrigin(testInfo.project.use.baseURL);

    await context.route("**/*", async (route) => {
      const request = route.request();
      const requestUrl = new URL(request.url());
      const { hostname, pathname, origin } = requestUrl;
      const method = request.method().toUpperCase();

      if (isHostedBy(hostname, analyticsHosts)) {
        if (request.resourceType() === "script") {
          await route.fulfill({
            status: 200,
            contentType: "application/javascript; charset=utf-8",
            body: "",
          });
        } else {
          await route.fulfill({ status: 204, body: "" });
        }
        return;
      }

      if (matchesHost(hostname, "challenges.cloudflare.com")) {
        if (pathname.includes("/turnstile/") && request.resourceType() === "script") {
          await route.fulfill({
            status: 200,
            contentType: "application/javascript; charset=utf-8",
            body: turnstileStub,
          });
        } else {
          await route.fulfill({ status: 204, body: "" });
        }
        return;
      }

      if (mutatingMethods.has(method) && protectedFormEndpoints.has(pathname)) {
        await route.fulfill({
          status: 503,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({ error: "Form submission is disabled during responsive tests." }),
        });
        return;
      }

      if (isHostedBy(hostname, externalFormHosts)) {
        await route.fulfill({
          status: mutatingMethods.has(method) ? 503 : 200,
          contentType: request.resourceType() === "document"
            ? "text/html; charset=utf-8"
            : "text/plain; charset=utf-8",
          body: request.resourceType() === "document"
            ? "<!doctype html><title>External form disabled in responsive tests</title>"
            : "",
        });
        return;
      }

      if (mutatingMethods.has(method) && applicationOrigin && origin !== applicationOrigin) {
        await route.fulfill({
          status: 503,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({ error: "Cross-origin mutation is disabled during responsive tests." }),
        });
        return;
      }

      await route.continue();
    });

    await use(context);
  },
});

export { expect };
