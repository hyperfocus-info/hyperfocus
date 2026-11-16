import { probeWasmBrowserVariants } from "./wasm-browser-probe.ts";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, firefox, webkit, type BrowserType } from "playwright";
import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { createPerformanceEvidenceReport, readBenchmarkEnvironment } from "@hyperfocus/performance";

const repositoryRoot = path.resolve(import.meta.dir, "../../..");
const outputPath = path.join(repositoryRoot, ".local", "engine-perf", "wasm-browser-variants.json");
const scalarWasmBytes = [...new Uint8Array(await Bun.file(
  new URL("../wasm/collision-kernel.scalar.wasm", import.meta.url)
).arrayBuffer())];
const simdWasmBytes = [...new Uint8Array(await Bun.file(
  new URL("../wasm/collision-kernel.simd.wasm", import.meta.url)
).arrayBuffer())];
const batchSizes = [1, 4, 16, 64, 256, 1_024, 4_096, 16_384];
const targetElements = 1_048_576;
const rounds = 6;
const engines: Array<{ name: string; type: BrowserType }> = [
  { name: "chromium", type: chromium },
  { name: "firefox", type: firefox },
  { name: "webkit", type: webkit }
];
const browserResults = [];
const requiredBrowsers = new Set((process.env.PERFORMANCE_REQUIRE_BROWSERS ?? "")
  .split(",").map((name) => name.trim()).filter(Boolean));

for (const engine of engines) {
  let browser;
  let ownedBrowser: Awaited<ReturnType<typeof connectHeadlessBrowser>> | undefined;
  try {
    if (engine.name === "chromium") {
      const connected = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: (endpoint) => chromium.connectOverCDP(endpoint) });
      ownedBrowser = connected;
      browser = connected.browser;
    } else {
      // Firefox/WebKit have no CDP transport; the patched SDK owns their ordinary
      // exit/signal cleanup. Forced owner death may leave its temporary profile.
      browser = await engine.type.launch({ headless: true, timeout: 15_000 });
    }
    const page = await browser.newPage();
    const result = await page.evaluate(probeWasmBrowserVariants, { scalarBytes: scalarWasmBytes, simdBytes: simdWasmBytes, batchSizes, targetElements, rounds });
    browserResults.push({ engine: engine.name, status: "measured", version: browser.version(), ...result });
  } catch (error) {
    browserResults.push({
      engine: engine.name,
      status: "unavailable",
      reason: error instanceof Error ? error.message.split("\n")[0] : String(error)
    });
  } finally {
    try { await browser?.close(); } finally { await ownedBrowser?.close(); }
  }
}

const report = createPerformanceEvidenceReport({
  benchmark: "wasm-browser-scalar-simd-variants",
  environment: readBenchmarkEnvironment({ name: "bun-host", version: Bun.version }),
  config: { batchSizes, targetElements, rounds },
  structuralEvidence: {
    portableEvidence: [
      "scalar and SIMD use distinct production artifacts with equivalent resident arenas, logical input bytes, call counts, and output masks",
      "SIMD handles four packed elements per full group and retains an explicit scalar tail",
      "the timed kernel loop transfers zero bytes across the JavaScript/WASM boundary"
    ],
    moduleBytes: { scalar: scalarWasmBytes.length, simd: simdWasmBytes.length },
    measuredBrowserEngines: browserResults.filter((result) => result.status === "measured").map((result) => result.engine),
    caveat: "Crossovers are ranges; use operation-specific policy thresholds and forced modes rather than copying this host's timing into a universal default."
  },
  measurements: { browsers: browserResults }
});
await mkdir(path.dirname(outputPath), { recursive: true });
await Bun.write(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
const unavailableRequired = browserResults.filter((result) => requiredBrowsers.has(result.engine)
  && result.status !== "measured");
if (unavailableRequired.length) {
  throw new Error(`Required browser evidence unavailable: ${unavailableRequired.map(({ engine }) => engine).join(", ")}`);
}
