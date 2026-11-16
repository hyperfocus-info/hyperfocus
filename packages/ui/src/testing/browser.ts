import type { Page } from "playwright-core";
import { inspectAttention } from "../attention/inspect";

/** Host-side presentation verification; the browser driver remains caller-owned. */
export async function inspectLayout({ page }: { page: Pick<Page, "evaluate"> }) {
  const attention = await page.evaluate(inspectAttention, { requireBranding: false });
  if (!attention.passed) throw new Error(`Attention contract failed: ${JSON.stringify(attention.violations)}`);
  const layout = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
    clippedControls: [...document.querySelectorAll<HTMLElement>("button,input,textarea,[role=tab]")].filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden" && (box.left < -1 || box.right > innerWidth + 1);
    }).map((element) => ({ name: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 100) ?? element.tagName, width: element.getBoundingClientRect().width })),
  }));
  return { ...layout, attention };
}
