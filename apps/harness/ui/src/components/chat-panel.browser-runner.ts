import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import type { Page } from "playwright";

export {};

const baseUrl = process.env.CHAT_PANEL_BROWSER_URL;
const viewportSelector = process.env.CHAT_PANEL_BROWSER_VIEWPORT_SELECTOR ?? '[data-test-virtual-list="project-chat-transcript"]';
const targetText = process.env.CHAT_PANEL_BROWSER_TARGET_TEXT ?? "Project chat browser message 159";
const remountMode = process.env.CHAT_PANEL_BROWSER_REMOUNT_MODE ?? "project-chat";
const verifyAssistantSourcePending = process.env.CHAT_PANEL_BROWSER_SOURCE_PENDING === "1";
const verifyRunCardAccessibility = process.env.CHAT_PANEL_BROWSER_RUN_CARD_ACCESSIBILITY === "1";
const verifyEffortVisibility = process.env.CHAT_PANEL_BROWSER_EFFORT_VISIBILITY === "1";
const viewportWidth = Number(process.env.CHAT_PANEL_BROWSER_VIEWPORT_WIDTH ?? 1040);

if (!baseUrl) {
  throw new Error("CHAT_PANEL_BROWSER_URL is required");
}

const { chromium } = await import("playwright");
const ownedBrowser = await connectHeadlessBrowser({
  executable: chromium.executablePath(),
  connect: (endpoint) => chromium.connectOverCDP(endpoint, { timeout: 10_000 }),
});
const browser = ownedBrowser.browser;

try {
  const page: Page = await browser.newPage({ viewport: { width: viewportWidth, height: 760 } });
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      pageErrors.push(`console:${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(`pageerror:${error.message}`);
  });
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  try {
    await waitForFixtureLayout(page);
    if (verifyEffortVisibility) {
      await assertEffortVisibility(page);
    } else if (verifyRunCardAccessibility) {
      await assertRunCardAccessibility(page);
    } else {
      assertVirtualListSnapshot(await readVirtualListSnapshot(page, viewportSelector, targetText), "virtual list first paint");

      if (verifyAssistantSourcePending) {
        await assertAssistantSourcePendingFeedback(page);
      } else {
        await remountSurface(page, remountMode);
        await waitForAnimationFrames(page, 2);
        assertVirtualListSnapshot(await readVirtualListSnapshot(page, viewportSelector, targetText), "virtual list tab remount");
      }
    }
  } catch (error) {
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const rootHtml = await page.locator("#root").evaluate((root) => root.innerHTML.slice(0, 8000)).catch(() => "");
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${detail}\nPage errors:\n${pageErrors.join("\n") || "(none)"}\nBody:\n${bodyText}\nRoot HTML:\n${rootHtml}`);
  }

  console.log(verifyEffortVisibility ? "browser effort visibility check passed"
    : verifyRunCardAccessibility ? "browser run card accessibility check passed"
    : verifyAssistantSourcePending ? "browser assistant source pending check passed" : "browser virtual transcript first-load check passed");
} finally {
  try { await browser.close(); } finally { await ownedBrowser.close(); }
}

type VirtualListSnapshot = {
  missing: boolean;
  viewportHeight: number;
  canvasHeight: number;
  visibleCount: number;
  overlapCount: number;
  zeroHeightRows: number;
  targetVisible: boolean;
  scrollTop: number;
  scrollHeight: number;
};

async function waitForFixtureLayout(page: Page) {
  await page.locator('[data-test-fixture-ready="1"]').waitFor({ state: "attached" });
  await waitForAnimationFrames(page, 3);
}

async function waitForAnimationFrames(page: Page, count: number) {
  await page.evaluate(
    (frameCount: number) =>
      new Promise<void>((resolve) => {
        let remaining = frameCount;
        const step = () => {
          remaining -= 1;
          if (remaining <= 0) {
            resolve();
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    count
  );
}

async function remountSurface(page: Page, mode: string) {
  if (mode === "none") {
    return;
  }
  if (mode === "assistant-chat") {
    await page.getByRole("tab", { name: /todos/i }).click();
    await page.getByRole("tab", { name: /chat/i }).click();
    return;
  }
  await page.locator('[data-test-chat-pane-tab="plan"]').click();
  await page.locator('[data-test-chat-pane-tab="chat"]').click();
}

async function assertAssistantSourcePendingFeedback(page: Page) {
  await page.getByRole("tab", { name: /jobs/i }).click();
  const jobsList = page.getByRole("list", { name: "Assistant jobs" });
  const runsList = page.getByRole("list", { name: "Recent runs" });
  await page.getByRole("heading", { name: "Assistant jobs" }).waitFor({ state: "attached" });
  await page.getByRole("heading", { name: "Recent runs" }).waitFor({ state: "attached" });
  await page.getByRole("listitem", { name: "Assistant job Browser source job" }).waitFor({ state: "attached" });
  const [jobsBox, runsBox] = await Promise.all([jobsList.boundingBox(), runsList.boundingBox()]);
  if (!jobsBox || !runsBox || Math.abs(jobsBox.x - runsBox.x) > 8 || runsBox.y < jobsBox.y + jobsBox.height) {
    throw new Error(`assistant workload collections did not stack at narrow width: ${JSON.stringify({ jobsBox, runsBox })}`);
  }
  const loadMore = page.getByRole("button", { name: "Load more jobs" });
  await loadMore.focus();
  await loadMore.click();
  const loadingMore = page.getByRole("button", { name: "Loading more jobs..." });
  await loadingMore.waitFor({ state: "attached" });
  if (await loadingMore.getAttribute("aria-busy") !== "true" || !(await loadingMore.isDisabled())) {
    throw new Error("assistant workload load-more did not expose a busy disabled state");
  }
  const completed = page.getByRole("button", { name: "All loaded jobs shown" });
  await completed.waitFor({ state: "attached" });
  const retainedFocus = await completed.evaluate((button) => document.activeElement === button);
  if (!retainedFocus || !(await completed.isDisabled())) {
    throw new Error(`assistant workload load-more completion lost focus or enabled an exhausted page: ${retainedFocus}`);
  }
  const sourceButton = page.getByRole("button", { name: "Open source for Browser source job" });
  await sourceButton.focus();
  await page.keyboard.press("Enter");
  await sourceButton.waitFor({ state: "attached" });
  const feedback = await sourceButton.evaluate((button: HTMLButtonElement) => ({
    ariaBusy: button.getAttribute("aria-busy"), ariaDisabled: button.getAttribute("aria-disabled"),
    retainedFocus: document.activeElement === button
  }));
  if (feedback.ariaBusy !== "true" || feedback.ariaDisabled !== "true" || !feedback.retainedFocus || !(await sourceButton.isDisabled())) {
    throw new Error(`assistant source pending feedback failed: ${JSON.stringify(feedback)}`);
  }
}

async function assertRunCardAccessibility(page: Page) {
  await page.getByRole("tab", { name: "Runs" }).click();
  const card = page.getByRole("article", { name: "Run Browser run card" });
  await card.waitFor({ state: "attached" });
  if (await card.locator('[role="button"]').count()) throw new Error("run card retained a nested button-role container");
  const expected = ["Open run details for Browser run card", "Add Browser run card to bulk selection", "Open source for Browser run card"];
  const controls = card.getByRole("button");
  if (await controls.count() !== expected.length) throw new Error(`run card controls mismatch: ${await controls.allTextContents()}`);
  for (let index = 0; index < expected.length; index += 1) {
    const control = controls.nth(index);
    await control.focus();
    if (await control.getAttribute("aria-label") !== expected[index]) throw new Error(`run card tab order mismatch at ${index}`);
    if (index < expected.length - 1) {
      await page.keyboard.press("Tab");
      if (!await controls.nth(index + 1).evaluate((button: HTMLButtonElement) => document.activeElement === button)) {
        throw new Error(`run card keyboard traversal skipped control ${index + 1}`);
      }
    }
  }
  await controls.first().focus();
  await page.keyboard.press("Enter");
  await page.getByText("Run detail", { exact: true }).waitFor({ state: "attached" });
}

async function assertEffortVisibility(page: Page) {
  const controls = page.locator('[data-test-effort-trigger]');
  const visibleEffort = controls.filter({ visible: true });
  const compactMenu = page.getByRole("button", { name: "More task settings" }).filter({ visible: true });
  if (await compactMenu.count()) {
    if (await visibleEffort.count()) throw new Error("compact composer exposed a separate effort dropdown");
    const model = page.locator('[data-test-model-select]').filter({ visible: true }).first();
    await model.waitFor({ state: "visible" });
    const modelBox = await model.boundingBox();
    if (!modelBox || modelBox.y < 0 || modelBox.y + modelBox.height > (page.viewportSize()?.height ?? 0)) {
      throw new Error(`narrow composer model control is outside the viewport: ${JSON.stringify(modelBox)}`);
    }
    await compactMenu.click();
    await page.getByText("Effort", { exact: true }).waitFor({ state: "visible" });
    if (await page.locator('[data-test-tooltip-content]').count()) throw new Error("task settings tooltip obscured its open popover");
    return;
  }
  if (await visibleEffort.count() !== 1) throw new Error(`expected one desktop effort control, received ${await visibleEffort.count()}`);
  await visibleEffort.click();
  await page.locator('[data-test-popover-content]').waitFor({ state: "visible" });
  if (await page.locator('[data-test-tooltip-content]').count()) throw new Error("effort tooltip obscured its open popover");
}

async function readVirtualListSnapshot(page: Page, viewportSelector: string, targetText: string): Promise<VirtualListSnapshot> {
  return page.evaluate(({ viewportSelector, targetText }: { viewportSelector: string; targetText: string }) => {
    type BrowserRow = {
      text: string;
      top: number;
      bottom: number;
      height: number;
      visible: boolean;
    };
    const viewport = document.querySelector(viewportSelector);
    if (!viewport) {
      return {
        missing: true,
        viewportHeight: 0,
        canvasHeight: 0,
        visibleCount: 0,
        overlapCount: 0,
        zeroHeightRows: 0,
        targetVisible: false,
        scrollTop: 0,
        scrollHeight: 0
      };
    }

    const viewportRect = viewport.getBoundingClientRect();
    const canvas = viewport.firstElementChild;
    const canvasRect = canvas?.getBoundingClientRect();
    const rows: BrowserRow[] = Array.from(viewport.querySelectorAll("[data-test-virtual-list-item]")).map((row) => {
      const rect = row.getBoundingClientRect();
      const text = row.textContent ?? "";
      return {
        text,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        visible: rect.bottom > viewportRect.top + 1 && rect.top < viewportRect.bottom - 1
      };
    });
    const visibleRows = rows.filter((row) => row.visible);
    const overlapCount = visibleRows.filter((row, index) => {
      const next = visibleRows[index + 1];
      return next ? next.top < row.bottom - 1 : false;
    }).length;
    const target = rows.find((row) => row.text.includes(targetText));

    return {
      missing: false,
      viewportHeight: viewportRect.height,
      canvasHeight: canvasRect?.height ?? 0,
      visibleCount: visibleRows.length,
      overlapCount,
      zeroHeightRows: rows.filter((row) => row.height <= 0).length,
      targetVisible: target?.visible ?? false,
      scrollTop: viewport.scrollTop,
      scrollHeight: viewport.scrollHeight
    };
  }, { viewportSelector, targetText });
}

function assertVirtualListSnapshot(snapshot: VirtualListSnapshot, label: string) {
  const failures = [];
  if (snapshot.missing) {
    failures.push("missing viewport");
  }
  if (!(snapshot.viewportHeight >= 240)) {
    failures.push(`viewport height ${snapshot.viewportHeight}`);
  }
  if (!(snapshot.canvasHeight > snapshot.viewportHeight)) {
    failures.push(`canvas height ${snapshot.canvasHeight} <= viewport ${snapshot.viewportHeight}`);
  }
  if (!(snapshot.visibleCount >= 1)) {
    failures.push(`visible rows ${snapshot.visibleCount}`);
  }
  if (snapshot.zeroHeightRows !== 0) {
    failures.push(`zero-height rows ${snapshot.zeroHeightRows}`);
  }
  if (snapshot.overlapCount !== 0) {
    failures.push(`overlap count ${snapshot.overlapCount}`);
  }
  if (!snapshot.targetVisible) {
    failures.push("latest message not visible");
  }
  if (failures.length > 0) {
    throw new Error(`${label} failed: ${failures.join("; ")}\n${JSON.stringify(snapshot, null, 2)}`);
  }
}
