import { expect, test } from "./responsive-fixture";

import { collectRuntimeErrors, settleRenderedPage } from "./layout-audit";

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1363, height: 936 },
]) {
  test(`Manifesto all chapter headings: ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.removeItem("compass-message-reader-chapter"));
    const runtimeErrors = collectRuntimeErrors(page);
    const response = await page.goto("/messages/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await settleRenderedPage(page);

    const chapterIds = await page
      .locator('[data-message-manuscript="true"] > section[id]')
      .evaluateAll((sections) => sections.map((section) => section.id));
    expect(chapterIds).toHaveLength(12);

    const chapterReports: unknown[] = [];
    for (const chapterId of chapterIds) {
      await page.goto(`/messages/#${chapterId}`, { waitUntil: "domcontentloaded" });
      await settleRenderedPage(page);
      const section = page.locator(`#${chapterId}[data-active="true"]`);
      await expect(section).toBeVisible();
      const report = await section.evaluate((activeSection) => {
        const sheet = activeSection.querySelector('[class*="pageSheet"]')!;
        const sheetRect = sheet.getBoundingClientRect();
        const heading = activeSection.querySelector("h2")!;
        const intendedLines = [...heading.querySelectorAll('[class*="chapterTitleLine"]')].map((line) => ({
          text: line.textContent?.trim() ?? "",
          rect: line.getBoundingClientRect().toJSON(),
        }));
        const renderedRows: Array<{ top: number; text: string }> = [];
        const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode();
        while (textNode) {
          const value = textNode.textContent ?? "";
          for (let index = 0; index < value.length; index += 1) {
            const range = document.createRange();
            range.setStart(textNode, index);
            range.setEnd(textNode, index + 1);
            const rect = [...range.getClientRects()].at(-1);
            if (!rect || rect.width === 0 || rect.height === 0) continue;
            const row = renderedRows.find((candidate) => Math.abs(candidate.top - rect.top) <= 2);
            if (row) row.text += value[index];
            else renderedRows.push({ top: rect.top, text: value[index] });
          }
          textNode = walker.nextNode();
        }
        const renderedLines = renderedRows
          .sort((a, b) => a.top - b.top)
          .map((row) => row.text.replace(/\s+/gu, " ").trim())
          .filter(Boolean);
        const intendedText = intendedLines.map((line) => line.text);
        return {
          id: activeSection.id,
          ariaLabel: heading.getAttribute("aria-label"),
          intendedLines,
          renderedLines,
          sheet: sheetRect.toJSON(),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          violations: intendedLines
            .filter((line) => line.rect.left < sheetRect.left - 1 || line.rect.right > sheetRect.right + 1)
            .map((line) => `${activeSection.id}: ${JSON.stringify(line.text)} is clipped`)
            .concat(
              JSON.stringify(renderedLines) === JSON.stringify(intendedText)
                ? []
                : [`${activeSection.id}: rendered ${JSON.stringify(renderedLines)}; intended ${JSON.stringify(intendedText)}`],
            ),
        };
      });
      chapterReports.push(report);
      expect(report.ariaLabel).toBeTruthy();
      expect(report.renderedLines.length).toBeGreaterThanOrEqual(1);
      expect(report.renderedLines.length).toBeLessThanOrEqual(2);
      expect(report.overflow).toBeLessThanOrEqual(1);
      expect(report.violations).toEqual([]);
    }

    if (runtimeErrors.length > 0) {
      await testInfo.attach("manifesto-chapter-audit.json", {
        body: Buffer.from(JSON.stringify({ viewport, runtimeErrors, chapterReports }, null, 2)),
        contentType: "application/json",
      });
    }
    expect(runtimeErrors).toEqual([]);
  });
}
