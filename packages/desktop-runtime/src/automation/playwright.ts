import type { Page } from "playwright-core";
import { setAuditViewport } from "./viewport";

/** Native window sizing preserves pointer/keyboard input into opaque iframes. */
export async function setNativeDesktopViewport({ page, width = 1440, height = 1000 }: {
  page: Page; width?: number; height?: number;
}) {
  const cdp = await page.context().newCDPSession(page);
  try {
    return await setAuditViewport({ send: cdp.send.bind(cdp), width, height, mode: "native" });
  } finally { await cdp.detach(); }
}

/** Captures the current viewport without letting a screenshot change its width. */
export async function captureViewportScreenshot({ page, path }: {
  page: Pick<Page, "bringToFront" | "evaluate" | "screenshot">; path: string;
}) {
  await page.bringToFront();
  const before = await page.evaluate(() => innerWidth);
  await page.screenshot({ path, fullPage: false });
  if (await page.evaluate(() => innerWidth) !== before) throw new Error("Screenshot changed the page viewport width.");
}
