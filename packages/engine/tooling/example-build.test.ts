import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildExampleBundles } from "./example-build.ts";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("failed example builds preserve the last valid output and clean staging", async () => {
  const root = mkdtempSync(join(tmpdir(), "engine-example-build-"));
  temporaryRoots.push(root);
  const outdir = join(root, "dist");
  mkdirSync(outdir);
  await Bun.write(join(outdir, "client.js"), "last-valid");

  await expect(buildExampleBundles("Broken Example", outdir, [{
    entrypoints: [join(root, "missing.ts")],
    target: "browser",
    format: "esm",
    expectedOutputs: ["client.js"]
  }])).rejects.toThrow("Bundle failed");

  expect(await Bun.file(join(outdir, "client.js")).text()).toBe("last-valid");
  expect(readdirSync(root).filter((name) => name.includes(".staging-") || name.includes(".backup-"))).toEqual([]);
});

test("successful example builds replace stale output as one directory", async () => {
  const root = mkdtempSync(join(tmpdir(), "engine-example-build-"));
  temporaryRoots.push(root);
  const outdir = join(root, "dist");
  const entry = join(root, "main.ts");
  mkdirSync(outdir);
  await Bun.write(entry, "export const answer = 42;");
  await Bun.write(join(outdir, "stale.js"), "stale");

  await buildExampleBundles("Good Example", outdir, [{
    entrypoints: [entry],
    target: "browser",
    format: "esm",
    naming: { entry: "[name].js" },
    expectedOutputs: ["main.js"]
  }]);

  expect(existsSync(join(outdir, "main.js"))).toBe(true);
  expect(existsSync(join(outdir, "stale.js"))).toBe(false);
  expect(readdirSync(root).filter((name) => name.includes(".staging-") || name.includes(".backup-"))).toEqual([]);
});
