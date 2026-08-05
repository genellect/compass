import { expect, test } from "./responsive-fixture";
import { collectRuntimeErrors, settleRenderedPage } from "./layout-audit";
import type { ResponsiveViewport } from "./route-contracts";

type LineExpectation = {
  selector: string;
  lines: string[];
};

type SemanticScenario = {
  name: string;
  path: string;
  viewport: ResponsiveViewport;
  expectations: LineExpectation[];
};

const mobile = { name: "semantic-mobile", width: 390, height: 844 } satisfies ResponsiveViewport;
const desktop = { name: "semantic-desktop", width: 1440, height: 900 } satisfies ResponsiveViewport;

const scenarios: SemanticScenario[] = [
  {
    name: "parent Mobile copy hierarchy",
    path: "/",
    viewport: mobile,
    expectations: [
      { selector: "h1#hero-title", lines: ["Don’t Just Learn.", "Build What’s", "Next."] },
      { selector: ".li-hero-lead", lines: ["北里大学薬学部から、", "学び・研究・未来をつなぐ。"] },
      { selector: "#resources-title", lines: ["知らなかった未来に、", "出会う。"] },
      {
        selector: ".v4-resources__lead",
        lines: [
          "次の試験に役立つ情報を",
          "探しに来たはずが、",
          "気づけば、その先の未来まで",
          "見えてくる。",
        ],
      },
      { selector: "#manifesto-title", lines: ["観客席から", "見ているには、", "この時代は", "面白すぎる。"] },
      { selector: "#community-title", lines: ["面白い大学生活は、", "待っていても始まらない。"] },
    ],
  },
  {
    name: "parent Desktop copy hierarchy",
    path: "/",
    viewport: desktop,
    expectations: [
      { selector: "h1#hero-title", lines: ["Don’t Just Learn.", "Build What’s Next."] },
      { selector: ".li-hero-lead", lines: ["北里大学薬学部から、学び・研究・未来をつなぐ。"] },
      { selector: "#resources-title", lines: ["知らなかった未来に、出会う。"] },
      {
        selector: ".v4-resources__lead",
        lines: ["次の試験に役立つ情報を探しに来たはずが、", "気づけば、その先の未来まで見えてくる。"],
      },
      { selector: "#manifesto-title", lines: ["観客席から見ているには、", "この時代は面白すぎる。"] },
      { selector: "#community-title", lines: ["面白い大学生活は、", "待っていても始まらない。"] },
    ],
  },
  {
    name: "FSL Mobile copy hierarchy",
    path: "/future-strategy-library/",
    viewport: mobile,
    expectations: [
      { selector: "h1#library-title", lines: ["BEYOND THE", "SYLLABUS."] },
      { selector: '[class*="heroSubhead"]', lines: ["未来は、知っている人から", "動き出す。"] },
      { selector: '[class*="heroDescription"]', lines: ["北里大学薬学部生のための、", "学生目線の資料ライブラリ。"] },
      {
        selector: '[class*="actionMicrocopy"]',
        lines: ["北里大学薬学部生限定 · 登録・利用無料 ·", "大学アカウント認証"],
      },
    ],
  },
  {
    name: "FSL Desktop copy hierarchy",
    path: "/future-strategy-library/",
    viewport: desktop,
    expectations: [
      { selector: "h1#library-title", lines: ["BEYOND THE", "SYLLABUS."] },
      { selector: '[class*="heroSubhead"]', lines: ["未来は、知っている人から", "動き出す。"] },
      { selector: '[class*="heroDescription"]', lines: ["北里大学薬学部生のための、", "学生目線の資料ライブラリ。"] },
    ],
  },
  {
    name: "Manifesto Mobile Hero copy",
    path: "/messages/",
    viewport: mobile,
    expectations: [
      { selector: '[class*="coverCount"]', lines: ["12 CHAPTERS · A LETTER FOR THE", "AI ERA"] },
      { selector: "h1#message-title", lines: ["そのAI、", "まだ質問相手ですか？"] },
    ],
  },
  {
    name: "Manifesto Desktop Hero copy",
    path: "/messages/",
    viewport: desktop,
    expectations: [{ selector: "h1#message-title", lines: ["そのAI、", "まだ質問相手ですか？"] }],
  },
  {
    name: "Interactive Mobile Hero copy",
    path: "/INTRO_Interactive/",
    viewport: mobile,
    expectations: [
      { selector: "h1#hero-title", lines: ["LET EVERYTHING", "MOVE."] },
      { selector: ".hero-lead", lines: ["リアルタイム×AIが、", "講義を次の次元へ。"] },
    ],
  },
  {
    name: "Interactive Desktop Hero copy",
    path: "/INTRO_Interactive/",
    viewport: desktop,
    expectations: [
      { selector: "h1#hero-title", lines: ["LET EVERYTHING MOVE."] },
      { selector: ".hero-lead", lines: ["リアルタイム×AIが、講義を次の次元へ。"] },
    ],
  },
  {
    name: "Developer Mobile Hero copy",
    path: "/INTRO_Interactive/developers/",
    viewport: mobile,
    expectations: [
      { selector: "h1#developer-title", lines: ["学びの熱を、", "設計で、", "途切れさせない。"] },
    ],
  },
  {
    name: "Developer Desktop Hero copy",
    path: "/INTRO_Interactive/developers/",
    viewport: desktop,
    expectations: [{ selector: "h1#developer-title", lines: ["学びの熱を、", "実装する。"] }],
  },
];

for (const scenario of scenarios) {
  test(scenario.name, async ({ page }) => {
    await page.setViewportSize(scenario.viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const runtimeErrors = collectRuntimeErrors(page);
    const response = await page.goto(scenario.path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${scenario.path} did not return HTTP 200`).toBe(200);
    await settleRenderedPage(page);

    for (const expectation of scenario.expectations) {
      const locator = page.locator(expectation.selector).first();
      await expect(locator, `${scenario.name}: ${expectation.selector}`).toBeVisible();
      await locator.scrollIntoViewIfNeeded();
      await page.waitForTimeout(30);
      const renderedLines = await locator.evaluate((element) => {
        const rows: Array<{ top: number; text: string }> = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode();
        while (textNode) {
          const value = textNode.textContent ?? "";
          for (let index = 0; index < value.length; index += 1) {
            const range = document.createRange();
            range.setStart(textNode, index);
            range.setEnd(textNode, index + 1);
            const rect = [...range.getClientRects()].at(-1);
            if (!rect || rect.width === 0 || rect.height === 0) continue;
            const row = rows.find((candidate) => Math.abs(candidate.top - rect.top) <= 2);
            if (row) row.text += value[index];
            else rows.push({ top: rect.top, text: value[index] });
          }
          textNode = walker.nextNode();
        }
        return rows
          .sort((a, b) => a.top - b.top)
          .map((row) => row.text.replace(/\s+/gu, " ").trim())
          .filter(Boolean);
      });
      expect(renderedLines, `${scenario.name}: ${expectation.selector}`).toEqual(expectation.lines);
    }

    expect(runtimeErrors, `runtime errors while checking ${scenario.name}`).toEqual([]);
  });
}
