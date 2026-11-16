import { expect, mock, test } from "bun:test";
import type { Page } from "playwright-core";
import { captureViewportScreenshot } from "./playwright";

test("viewport screenshots retain focus, capture bounds and width checks", async () => {
  const evaluate = mock<Page["evaluate"]>().mockResolvedValueOnce(1440).mockResolvedValueOnce(1440);
  const bringToFront = mock<Page["bringToFront"]>().mockResolvedValue(undefined);
  const screenshot = mock<Page["screenshot"]>().mockResolvedValue(Buffer.alloc(0));
  const page = { evaluate, bringToFront, screenshot };
  await captureViewportScreenshot({ page, path: "viewport.png" });
  expect(screenshot).toHaveBeenCalledWith({ path: "viewport.png", fullPage: false });
  expect(bringToFront.mock.invocationCallOrder[0]).toBeLessThan(evaluate.mock.invocationCallOrder[0]!);
  expect(evaluate.mock.invocationCallOrder[0]).toBeLessThan(screenshot.mock.invocationCallOrder[0]!);
  expect(screenshot.mock.invocationCallOrder[0]).toBeLessThan(evaluate.mock.invocationCallOrder[1]!);
});

test("a screenshot that changes viewport width rejects", async () => {
  const page = {
    evaluate: mock<Page["evaluate"]>().mockResolvedValueOnce(1440).mockResolvedValueOnce(1439),
    bringToFront: mock<Page["bringToFront"]>().mockResolvedValue(undefined),
    screenshot: mock<Page["screenshot"]>().mockResolvedValue(Buffer.alloc(0)),
  };
  await expect(captureViewportScreenshot({ page, path: "changed.png" })).rejects.toThrow("Screenshot changed the page viewport width.");
});

test("screenshot failure preserves the original error", async () => {
  const failure = new Error("capture unavailable");
  const page = {
    evaluate: mock<Page["evaluate"]>().mockResolvedValueOnce(1440),
    bringToFront: mock<Page["bringToFront"]>().mockResolvedValue(undefined),
    screenshot: mock<Page["screenshot"]>().mockRejectedValue(failure),
  };
  await expect(captureViewportScreenshot({ page, path: "failed.png" })).rejects.toBe(failure);
  expect(page.evaluate).toHaveBeenCalledTimes(1);
});
