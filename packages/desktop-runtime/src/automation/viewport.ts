import { requireRecord } from "@hyperfocus/utilities/records";

// These concrete command ports accept native CDP clients and typed Playwright
// sessions. Responses remain unknown until validated below.
type CdpSend = {
  (method: "Emulation.clearDeviceMetricsOverride", parameters: Record<string, never>): Promise<unknown>;
  (method: "Emulation.setDeviceMetricsOverride", parameters: { width: number; height: number; deviceScaleFactor: number; mobile: boolean }): Promise<unknown>;
  (method: "Browser.getWindowForTarget", parameters: Record<string, never>): Promise<unknown>;
  (method: "Browser.getWindowBounds", parameters: { windowId: number }): Promise<unknown>;
  (method: "Browser.setWindowBounds", parameters: { windowId: number; bounds: { windowState?: "normal"; width?: number; height?: number } }): Promise<unknown>;
  (method: "Runtime.evaluate", parameters: { expression: string; awaitPromise: boolean; returnByValue: boolean }): Promise<unknown>;
};

/** Size the real owned Chromium window: emulated viewports can lose opaque-iframe input. */
export async function setAuditViewport(options: { send: CdpSend; width: number; height: number; mode?: "native" | "emulated" }) {
  const mode = options.mode ?? "native";
  if (mode !== "native" && mode !== "emulated") throw new Error("Audit viewport mode must be native or emulated.");
  for (const dimension of [options.width, options.height]) {
    if (!Number.isSafeInteger(dimension) || dimension < 1 || dimension > 8192) throw new Error("Audit viewport dimensions must be integers from 1 to 8192.");
  }
  if (mode === "emulated") {
    await options.send("Emulation.setDeviceMetricsOverride", { width: options.width, height: options.height, deviceScaleFactor: 1, mobile: false });
    const actual = await measureViewport(options.send);
    if (actual.width !== options.width || actual.height !== options.height) throw new Error("Emulated audit viewport does not match requested dimensions.");
    return { ...actual, mode, inputEvidenceScope: "main-frame-only; opaque-iframe pointer delivery unverified", adjustments: 1 };
  }
  await options.send("Emulation.clearDeviceMetricsOverride", {});
  const windowInfo = record(await options.send("Browser.getWindowForTarget", {}));
  const windowId = number(windowInfo.windowId);
  await options.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
  const observed: Array<{ width: number; height: number }> = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    const actual = await measureViewport(options.send);
    observed.push({ width: actual.width, height: actual.height });
    if (actual.width === options.width && actual.height === options.height) return { ...actual, mode, inputEvidenceScope: "real-window; verify target interactions", windowId, adjustments: attempt };
    const response = record(await options.send("Browser.getWindowBounds", { windowId }));
    const bounds = record(response.bounds);
    await options.send("Browser.setWindowBounds", { windowId, bounds: {
      width: number(bounds.width) + options.width - actual.width,
      height: number(bounds.height) + options.height - actual.height,
    } });
  }
  throw new Error(`Owned browser window cannot provide requested viewport ${options.width}x${options.height}; observed ${JSON.stringify(observed)}; refusing an emulated fallback.`);
}

async function measureViewport(send: CdpSend) {
  const result = record(await send("Runtime.evaluate", {
    expression: "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({width:innerWidth,height:innerHeight,devicePixelRatio}))))",
    awaitPromise: true, returnByValue: true,
  }));
  if (result.exceptionDetails) throw new Error("Unable to measure the owned browser viewport.");
  const value = record(record(result.result).value);
  return { width: number(value.width), height: number(value.height), devicePixelRatio: number(value.devicePixelRatio) };
}

function record(value: unknown): Record<string, unknown> {
  return requireRecord(value, { message: "Invalid viewport CDP response." });
}

function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid viewport CDP numeric field.");
  return value;
}
