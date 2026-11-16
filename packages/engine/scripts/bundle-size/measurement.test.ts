import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkBundleBytes, compressedBundleBytes, javascriptArtifacts, measureDeliveredBundle } from "./measurement.ts";

const fixtures: string[] = [];
afterEach(() => { for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "engine-bundle-budget-"));
  fixtures.push(root);
  mkdirSync(join(root, "chunks"));
  return root;
}

test("native delivery counts shared code once and cannot pass on facade bytes", async () => {
  const root = fixture();
  writeFileSync(join(root, "entry.js"), 'export { left } from "./left.js"; export { right } from "./right.js";');
  writeFileSync(join(root, "left.js"), 'import { shared } from "./chunks/shared.js"; export const left = () => shared;');
  writeFileSync(join(root, "right.js"), 'import { shared } from "./chunks/shared.js"; export const right = () => shared;');
  writeFileSync(join(root, "chunks/shared.js"), `export const shared = ${JSON.stringify("large public payload ".repeat(100))};`);
  const measurement = await measureDeliveredBundle(root, "entry.js");
  expect(measurement.files).toHaveLength(4);
  expect(measurement.native.raw).toBe(javascriptArtifacts(root).reduce((sum, path) => sum + readFileSync(path).byteLength, 0));
  expect(checkBundleBytes("native", measurement.native, { raw: 100, gzip: 100_000, brotli: 100_000 })).toHaveLength(1);
  expect(measurement.rebundled.raw).toBeGreaterThan(2_000);
});

test("aggregate delivery includes unnamed and unreachable chunks", () => {
  const root = fixture();
  writeFileSync(join(root, "entry.js"), "export const value = 1;");
  writeFileSync(join(root, "chunks/orphan.js"), "export const orphan = 2;");
  expect(javascriptArtifacts(root)).toHaveLength(2);
});

test("missing delivered chunk fails resolution", async () => {
  const root = fixture();
  writeFileSync(join(root, "entry.js"), 'export { value } from "./chunks/missing.js";');
  await expect(measureDeliveredBundle(root, "entry.js")).rejects.toThrow();
});

test("compression dimensions each enforce their own ceiling", () => {
  const bytes = compressedBundleBytes(new TextEncoder().encode("runtime payload"));
  expect(checkBundleBytes("candidate", bytes, { raw: 0, gzip: 0, brotli: 0 })).toHaveLength(3);
});
