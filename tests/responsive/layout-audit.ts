import { expect, type Page, type TestInfo } from "@playwright/test";

import type { ResponsiveViewport, RouteContract } from "./route-contracts";

type LayoutAuditReport = {
  route: string;
  viewport: ResponsiveViewport;
  document: {
    clientWidth: number;
    clientHeight: number;
    scrollWidth: number;
    scrollHeight: number;
    devicePixelRatio: number;
    visualViewportScale: number | null;
  };
  h1Lines: string[];
  violations: string[];
};

export async function settleRenderedPage(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.addStyleTag({
    content: `
      html { scroll-behavior: auto !important; }
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });
  await page.evaluate(async () => {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => window.setTimeout(resolve, 1_500)),
    ]);
    const visibleImages = [...document.images].filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.bottom >= 0 && rect.top <= innerHeight && rect.right >= 0 && rect.left <= innerWidth;
    });
    await Promise.race([
      Promise.all(visibleImages.map((image) => {
        if (image.complete) return image.decode().catch(() => undefined);
        return new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      })),
      new Promise((resolve) => window.setTimeout(resolve, 1_000)),
    ]);
  });
  await page.waitForTimeout(120);
}

export function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    let pageOrigin: string | undefined;
    try {
      pageOrigin = new URL(page.url()).origin;
    } catch {
      pageOrigin = undefined;
    }
    const target = pageOrigin === url.origin ? url.pathname : `${url.origin}${url.pathname}`;
    errors.push(`requestfailed: ${request.method()} ${target}`);
  });

  return errors;
}

export async function auditRenderedPage(
  page: Page,
  contract: RouteContract,
  viewport: ResponsiveViewport,
) {
  for (const selector of contract.requiredSelectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      await locator.scrollIntoViewIfNeeded();
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(60);

  const report = await page.evaluate(
    ({ route, viewport, expectedH1Lines, requiredSelectors, criticalSelectors }) => {
      const violations: string[] = [];
      const root = document.documentElement;
      const punctuationAtLineStart = /^[、。，．・：；？！）」』】〕〉》]/u;
      const punctuationAtLineEnd = /[（「『【〔〈《]$/u;

      const isAuditVisible = (element: Element) => {
        if (element.closest('[aria-hidden="true"], [inert], [class*="honeypot"]')) return false;
        if (element.closest('[class*="srOnly"], [class*="sr-only"], [class*="visuallyHidden"], [class*="visually-hidden"]')) return false;
        if (element.closest(".skip-link") && !element.closest(".skip-link:focus")) return false;
        const initialStyle = getComputedStyle(element);
        const initialRect = element.getBoundingClientRect();
        if (
          initialRect.width <= 1.5 &&
          initialRect.height <= 1.5 &&
          (initialStyle.overflow === "hidden" || initialStyle.overflow === "clip") &&
          (initialStyle.position === "absolute" || initialStyle.position === "fixed")
        ) return false;
        if ("checkVisibility" in element) {
          const visible = (element as HTMLElement).checkVisibility({
            checkOpacity: true,
            checkVisibilityCSS: true,
          });
          if (!visible) return false;
        }
        const style = getComputedStyle(element);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number.parseFloat(style.opacity || "1") > 0.01
        );
      };

      const isRendered = (element: Element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number.parseFloat(style.opacity || "1") > 0.01 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };

      const findHorizontalScrollerBoundary = (element: Element) => {
        let ancestor: Element | null = element;
        while (ancestor) {
          const style = getComputedStyle(ancestor);
          if (
            (style.overflowX === "auto" || style.overflowX === "scroll") &&
            ancestor.scrollWidth > ancestor.clientWidth + 1
          ) {
            return ancestor;
          }
          ancestor = ancestor.parentElement;
        }
        return null;
      };

      const getRenderedLines = (element: Element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const rows: Array<{ top: number; bottom: number; left: number; right: number; text: string }> = [];
        let textNode = walker.nextNode();

        while (textNode) {
          const value = textNode.textContent ?? "";
          for (let index = 0; index < value.length; index += 1) {
            const range = document.createRange();
            range.setStart(textNode, index);
            range.setEnd(textNode, index + 1);
            const rect = [...range.getClientRects()].at(-1);
            if (!rect || rect.width === 0 || rect.height === 0) continue;
            const existing = rows.find((row) => Math.abs(row.top - rect.top) <= 2);
            if (existing) {
              existing.text += value[index];
              existing.left = Math.min(existing.left, rect.left);
              existing.right = Math.max(existing.right, rect.right);
              existing.bottom = Math.max(existing.bottom, rect.bottom);
            } else {
              rows.push({
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                right: rect.right,
                text: value[index],
              });
            }
          }
          textNode = walker.nextNode();
        }

        return rows
          .sort((a, b) => a.top - b.top)
          .map((row) => row.text.replace(/\s+/gu, " ").trim())
          .filter(Boolean);
      };

      const h1Elements = [...document.querySelectorAll("h1")].filter(isAuditVisible);
      if (h1Elements.length !== 1) {
        violations.push(`visible H1 count is ${h1Elements.length}; expected 1`);
      }

      const h1 = h1Elements[0];
      const h1Lines = h1 ? getRenderedLines(h1) : [];
      if (h1Lines.length < expectedH1Lines.min || h1Lines.length > expectedH1Lines.max) {
        violations.push(
          `H1 renders in ${h1Lines.length} lines (${JSON.stringify(h1Lines)}); expected ${expectedH1Lines.min}-${expectedH1Lines.max}`,
        );
      }

      if (root.scrollWidth > root.clientWidth + 1) {
        violations.push(`horizontal overflow: ${root.scrollWidth}px > ${root.clientWidth}px`);
      }

      for (const selector of requiredSelectors) {
        const elements = [...document.querySelectorAll(selector)];
        if (elements.length === 0) {
          violations.push(`required responsive surface is missing: ${selector}`);
          continue;
        }
        if (!elements.some(isAuditVisible)) {
          violations.push(`required responsive surface is hidden: ${selector}`);
        }
      }

      for (const selector of criticalSelectors) {
        const elements = [...document.querySelectorAll(selector)];
        if (elements.length === 0) {
          violations.push(`critical content is missing: ${selector}`);
          continue;
        }
        const visible = elements.filter(isAuditVisible);
        if (visible.length === 0) {
          violations.push(`critical content is hidden: ${selector}`);
          continue;
        }
        if (!visible.some((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 1 && rect.height > 1;
        })) {
          violations.push(`critical content has no visible area: ${selector}`);
        }
      }

      const contentSelector = "h1,h2,h3,p,li,a,button,label,input,textarea,select,summary,span,strong,small,dt,dd,svg text";
      const contentElements = [...document.querySelectorAll(contentSelector)].filter(isAuditVisible);
      for (const element of contentElements) {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;

        const horizontalScrollerBoundary = findHorizontalScrollerBoundary(element);
        let ancestor = element.parentElement;
        while (ancestor) {
          if (ancestor === horizontalScrollerBoundary) break;
          const style = getComputedStyle(ancestor);
          if (["hidden", "clip"].includes(style.overflowX)) {
            const clip = ancestor.getBoundingClientRect();
            if (rect.left < clip.left - 1 || rect.right > clip.right + 1) {
              const label =
                element.getAttribute("aria-label") ??
                element.textContent?.replace(/\s+/gu, " ").trim().slice(0, 48) ??
                element.tagName;
              violations.push(
                `clipped ${element.tagName.toLowerCase()} ${JSON.stringify(label)}: ${rect.left.toFixed(1)}-${rect.right.toFixed(1)} outside ${clip.left.toFixed(1)}-${clip.right.toFixed(1)}`,
              );
              break;
            }
          }
          ancestor = ancestor.parentElement;
        }
      }

      const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let textNode = textWalker.nextNode();
      while (textNode) {
        const parent = textNode.parentElement;
        const value = textNode.textContent?.replace(/\s+/gu, " ").trim() ?? "";
        if (parent && value && isAuditVisible(parent)) {
          const range = document.createRange();
          range.selectNodeContents(textNode);
          const textRects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
          const horizontalScrollerBoundary = findHorizontalScrollerBoundary(parent);
          for (const textRect of textRects) {
            const label = value.slice(0, 48);
            if (!horizontalScrollerBoundary && (textRect.left < -1 || textRect.right > root.clientWidth + 1)) {
              violations.push(
                `text outside horizontal viewport ${JSON.stringify(label)}: ${textRect.left.toFixed(1)}-${textRect.right.toFixed(1)} / ${root.clientWidth}`,
              );
              break;
            }

            let clippingElement: Element | null = parent;
            let auditHorizontalClipping = true;
            while (clippingElement) {
              if (clippingElement === horizontalScrollerBoundary) {
                auditHorizontalClipping = false;
              }
              const style = getComputedStyle(clippingElement);
              const clip = clippingElement.getBoundingClientRect();
              const clipsX = style.overflowX === "hidden" || style.overflowX === "clip";
              const clipsY = style.overflowY === "hidden" || style.overflowY === "clip";
              const clippedX =
                auditHorizontalClipping &&
                clipsX &&
                (textRect.left < clip.left - 1 || textRect.right > clip.right + 1);
              const clippedY = clipsY && (textRect.top < clip.top - 1 || textRect.bottom > clip.bottom + 1);
              if (clippedX || clippedY) {
                violations.push(
                  `clipped text ${JSON.stringify(label)} (${clippedX ? "x" : ""}${clippedY ? "y" : ""}): ` +
                    `${textRect.left.toFixed(1)},${textRect.top.toFixed(1)}-${textRect.right.toFixed(1)},${textRect.bottom.toFixed(1)} ` +
                    `outside ${clip.left.toFixed(1)},${clip.top.toFixed(1)}-${clip.right.toFixed(1)},${clip.bottom.toFixed(1)}`,
                );
                break;
              }
              clippingElement = clippingElement.parentElement;
            }
          }
        }
        textNode = textWalker.nextNode();
      }

      for (const heading of [...document.querySelectorAll("h1,h2")].filter(isAuditVisible)) {
        const lines = getRenderedLines(heading);
        for (const line of lines) {
          if (punctuationAtLineStart.test(line)) {
            violations.push(`heading line begins with closing punctuation: ${JSON.stringify(line)}`);
          }
          if (punctuationAtLineEnd.test(line)) {
            violations.push(`heading line ends with opening punctuation: ${JSON.stringify(line)}`);
          }
          if (lines.length > 1 && [...line.replace(/\s/gu, "")].length === 1) {
            violations.push(`heading has a one-character orphan line: ${JSON.stringify(line)}`);
          }
        }
      }

      if (route === "/future-strategy-library/") {
        const selectors = [
          "h1",
          '[class*="heroSubhead"]',
          '[class*="heroDescription"]',
          '[class*="heroActionGroup"] a',
        ];
        if (viewport.width >= 901) {
          selectors.push('[class*="knowledgeGraphic"]', '[class*="heroHorizonRule"]');
        }
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (!element || !isRendered(element)) {
            violations.push(`FSL first-fold element missing: ${selector}`);
            continue;
          }
          const rect = element.getBoundingClientRect();
          if (rect.top < -1 || rect.bottom > root.clientHeight + 1) {
            violations.push(
              `FSL first-fold element outside viewport (${selector}): ${rect.top.toFixed(1)}-${rect.bottom.toFixed(1)} / ${root.clientHeight}`,
            );
          }
        }

        if (viewport.width >= 901) {
          const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
          const titleRect = h1?.getBoundingClientRect();
          const titleSize = h1 ? Number.parseFloat(getComputedStyle(h1).fontSize) : 0;
          const graphicRect = document
            .querySelector('[class*="knowledgeGraphic"]')
            ?.getBoundingClientRect();
          if (titleRect && titleRect.top < headerBottom + 18) {
            violations.push(
              `FSL short-desktop title top ${titleRect.top.toFixed(1)} is too close to header ${headerBottom.toFixed(1)}`,
            );
          }
          const minimumTitleSize = viewport.width >= 1180 ? 76 : 58;
          if (viewport.height <= 760 && titleSize < minimumTitleSize) {
            violations.push(`FSL short-desktop title is too small: ${titleSize.toFixed(1)}px`);
          }
          const minimumGraphicWidth = viewport.width >= 1180
            ? Math.min(620, viewport.height * 0.92)
            : Math.min(500, viewport.height * 0.8, viewport.width * 0.52);
          if (viewport.height <= 760 && graphicRect && graphicRect.width < minimumGraphicWidth) {
            violations.push(`FSL short-desktop graphic is too small: ${graphicRect.width.toFixed(1)}px`);
          }

          const heroRect = document
            .querySelector('[data-library-section="hero"]')
            ?.getBoundingClientRect();
          const svgLabels = [...document.querySelectorAll('[class*="knowledgeDesktop"] text')]
            .filter(isRendered)
            .map((element) => ({
              text: element.textContent?.trim() ?? "",
              rect: element.getBoundingClientRect(),
            }));
          const coordinateGroups = [...document.querySelectorAll<SVGGElement>('[class*="futureCoordinates"] > g')];
          if (coordinateGroups.length !== 4) {
            violations.push(`FSL future coordinate count is ${coordinateGroups.length}; expected 4`);
          } else {
            const coordinatePoints = coordinateGroups.map((group) => {
              const circle = group.querySelector("circle");
              const rect = circle?.getBoundingClientRect();
              return {
                transform: getComputedStyle(group).transform,
                x: rect ? rect.left + rect.width / 2 : Number.NaN,
                y: rect ? rect.top + rect.height / 2 : Number.NaN,
              };
            });
            if (coordinatePoints.some((point) => point.transform === "none" || !Number.isFinite(point.x + point.y))) {
              violations.push("FSL future coordinate transforms are not rendered");
            }
            for (let index = 1; index < coordinatePoints.length; index += 1) {
              const previous = coordinatePoints[index - 1];
              const current = coordinatePoints[index];
              if (current.x <= previous.x + 6 || current.y >= previous.y - 6) {
                violations.push("FSL future coordinates no longer form the intended ascending path");
                break;
              }
            }
          }
          const titleGlyphRects: DOMRect[] = [];
          if (h1) {
            const titleWalker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
            let titleNode = titleWalker.nextNode();
            while (titleNode) {
              const value = titleNode.textContent ?? "";
              for (let index = 0; index < value.length; index += 1) {
                if (/\s/u.test(value[index])) continue;
                const range = document.createRange();
                range.setStart(titleNode, index);
                range.setEnd(titleNode, index + 1);
                titleGlyphRects.push(...range.getClientRects());
              }
              titleNode = titleWalker.nextNode();
            }
          }
          for (const label of svgLabels) {
            if (label.rect.height < 8) {
              violations.push(`FSL graphic label is too small (${JSON.stringify(label.text)}): ${label.rect.height.toFixed(1)}px`);
            }
            if (
              heroRect &&
              (label.rect.left < heroRect.left - 1 ||
                label.rect.right > heroRect.right + 1 ||
                label.rect.top < heroRect.top - 1 ||
                label.rect.bottom > heroRect.bottom + 1)
            ) {
              violations.push(
                `FSL graphic label is clipped by Hero (${JSON.stringify(label.text)}): ` +
                  `${label.rect.left.toFixed(1)},${label.rect.top.toFixed(1)}-${label.rect.right.toFixed(1)},${label.rect.bottom.toFixed(1)}`,
              );
            }
            if (titleGlyphRects.some((titleLine) => (
              label.rect.left < titleLine.right - 2 &&
              label.rect.right > titleLine.left + 2 &&
              label.rect.top < titleLine.bottom - 2 &&
              label.rect.bottom > titleLine.top + 2
            ))) {
              violations.push(`FSL graphic label overlaps the Hero title: ${JSON.stringify(label.text)}`);
            }
          }
        }
      }

      return {
        route,
        viewport,
        document: {
          clientWidth: root.clientWidth,
          clientHeight: root.clientHeight,
          scrollWidth: root.scrollWidth,
          scrollHeight: root.scrollHeight,
          devicePixelRatio,
          visualViewportScale: visualViewport?.scale ?? null,
        },
        h1Lines,
        violations: [...new Set(violations)],
      } satisfies LayoutAuditReport;
    },
    {
      route: contract.path,
      viewport,
      expectedH1Lines: contract.h1Lines,
      requiredSelectors: contract.requiredSelectors,
      criticalSelectors: contract.criticalSelectors,
    },
  );

  return report;
}

export async function assertResponsiveContract(
  report: LayoutAuditReport,
  runtimeErrors: string[],
  testInfo: TestInfo,
) {
  const violations = [...report.violations, ...runtimeErrors];
  if (violations.length > 0) {
    await testInfo.attach("responsive-layout-audit.json", {
      body: Buffer.from(JSON.stringify({ ...report, runtimeErrors }, null, 2)),
      contentType: "application/json",
    });
  }
  expect(violations, JSON.stringify(report, null, 2)).toEqual([]);
}
