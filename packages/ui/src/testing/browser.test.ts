import { expect, mock, test } from "bun:test";
import type { Page } from "playwright-core";
import { inspectLayout } from "./browser";
import { inspectAttention } from "../attention/inspect";

test("attention failures reject before a geometry check can report success", async () => {
  const attention = { passed: false, violations: [{ rule: "cursor", detail: "Save" }] };
  const page = { evaluate: mock<Page["evaluate"]>().mockResolvedValueOnce(attention) };
  await expect(inspectLayout({ page })).rejects.toThrow(`Attention contract failed: ${JSON.stringify(attention.violations)}`);
  expect(page.evaluate).toHaveBeenCalledTimes(1);
  expect(page.evaluate).toHaveBeenCalledWith(inspectAttention, { requireBranding: false });
});

test("layout inspection retains viewport, document/body overflow and clipped controls", async () => {
  document.body.innerHTML = '<button aria-label="Outside">Save</button><input aria-label="Hidden"><button aria-label="Inside">OK</button>';
  const button = document.querySelector("button");
  const hidden = document.querySelector("input");
  if (!button || !hidden) throw new Error("Layout fixture controls missing.");
  Object.defineProperty(document.documentElement, "scrollWidth", { configurable: true, value: innerWidth });
  Object.defineProperty(document.body, "scrollWidth", { configurable: true, value: innerWidth + 20 });
  button.getBoundingClientRect = () => new DOMRect(innerWidth - 10, 0, 30, 20);
  hidden.getBoundingClientRect = () => new DOMRect(-10, 0, 30, 20);
  hidden.style.visibility = "hidden";
  const attention = { passed: true, violations: [] };
  const evaluate = mock<Page["evaluate"]>();
  // The second callback is the real self-contained browser geometry operation.
  evaluate.mockImplementationOnce(() => Promise.resolve(attention));
  evaluate.mockImplementationOnce((callback: Parameters<Page["evaluate"]>[0]) => {
    if (typeof callback !== "function") throw new Error("Expected a serializable layout callback.");
    return Promise.resolve(callback(undefined));
  });
  try {
    const result = await inspectLayout({ page: { evaluate } });
    expect(result).toMatchObject({ viewport: { width: innerWidth, height: innerHeight }, documentWidth: innerWidth, bodyWidth: innerWidth + 20, overflow: 20, attention });
    expect(result.clippedControls).toEqual([{ name: "Outside", width: 30 }]);
  } finally {
    Reflect.deleteProperty(document.documentElement, "scrollWidth");
    Reflect.deleteProperty(document.body, "scrollWidth");
    document.body.innerHTML = "";
  }
});
