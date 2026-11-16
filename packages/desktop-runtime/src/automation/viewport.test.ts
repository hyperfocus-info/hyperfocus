import { expect, test } from "bun:test";
import { setAuditViewport } from "./viewport.ts";

function driver(refuseResize = false) {
  let outer = { width: 800, height: 600 };
  const calls: string[] = [];
  return { calls, send: async (method: string, parameters: Record<string, unknown>) => {
    calls.push(method);
    if (method === "Browser.getWindowForTarget") return { windowId: 7 };
    if (method === "Browser.getWindowBounds") return { bounds: outer };
    if (method === "Runtime.evaluate") return { result: { value: { width: outer.width - 22, height: outer.height - 154, devicePixelRatio: 1.25 } } };
    if (method === "Browser.setWindowBounds") {
      const bounds = parameters.bounds;
      if (bounds && typeof bounds === "object" && "width" in bounds && "height" in bounds
        && typeof bounds.width === "number" && typeof bounds.height === "number"
        && bounds.width && bounds.height && !refuseResize) outer = { width: bounds.width, height: bounds.height };
    }
    return {};
  } };
}

test("measures browser chrome rather than assuming a platform offset, including narrow resize", async () => {
  const browser = driver();
  expect(await setAuditViewport({ send: browser.send, width: 1440, height: 800 })).toMatchObject({ width: 1440, height: 800, adjustments: 1, devicePixelRatio: 1.25 });
  expect(await setAuditViewport({ send: browser.send, width: 390, height: 844 })).toMatchObject({ width: 390, height: 844, adjustments: 1 });
  expect(browser.calls).not.toContain("Emulation.setDeviceMetricsOverride");
  expect(browser.calls[0]).toBe("Emulation.clearDeviceMetricsOverride");
});

test("refused window resize fails boundedly without pretending emulated input works", async () => {
  const browser = driver(true);
  await expect(setAuditViewport({ send: browser.send, width: 1440, height: 800 })).rejects.toThrow("refusing an emulated fallback");
  expect(browser.calls.filter(method => method === "Runtime.evaluate")).toHaveLength(5);
});

test("invalid dimensions reject before browser mutation", async () => {
  const browser = driver();
  for (const width of [0, -1, NaN, Infinity, 1.5, 8193]) await expect(setAuditViewport({ send: browser.send, width, height: 800 })).rejects.toThrow("dimensions");
  expect(browser.calls).toHaveLength(0);
});

test("explicit emulated narrow mode labels its limited input evidence and never resizes the real window", async () => {
  const calls: string[] = [];
  const result = await setAuditViewport({ width: 390, height: 844, mode: "emulated", send: async method => {
    calls.push(method);
    return method === "Runtime.evaluate" ? { result: { value: { width: 390, height: 844, devicePixelRatio: 1 } } } : {};
  } });
  expect(result).toMatchObject({ mode: "emulated", width: 390, height: 844 });
  expect(result.inputEvidenceScope).toContain("opaque-iframe pointer delivery unverified");
  expect(calls).toEqual(["Emulation.setDeviceMetricsOverride", "Runtime.evaluate"]);
});
