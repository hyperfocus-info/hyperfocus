import { expect, test } from "bun:test";
import { build, version } from "esbuild";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureBundleInputs, createGameBuildReceipt, discoverBuildConfiguration, verifyGameBuildReceipt } from "./receipt.ts";

test("receipt tracks transitive source, package and runtime inputs even when output stays identical", async () => {
  const root = await mkdtemp(join(tmpdir(), "game-receipt-"));
  try {
    await mkdir(join(root, "node_modules", "fixture-dependency"), { recursive: true });
    await writeFile(join(root, "node_modules", "fixture-dependency", "package.json"), JSON.stringify({ name: "fixture-dependency", main: "index.js" }));
    await writeFile(join(root, "node_modules", "fixture-dependency", "index.js"), "export const value = 1;");
    await writeFile(join(root, "runtime.ts"), "export const runtime = 2;");
    await writeFile(join(root, "source.ts"), "export const authored = 3;");
    await writeFile(join(root, "bun.lock"), "fixture lock v1");
    const entry = 'import { value } from "fixture-dependency"; import { runtime } from "./runtime.ts"; import { authored } from "./source.ts"; console.log(value + runtime + authored);';
    const compile = async () => {
      const capture = captureBundleInputs();
      const result = await build({ absWorkingDir: root, stdin: { contents: entry, resolveDir: root, sourcefile: "hyperfocus-project-entry.ts", loader: "ts" },
        bundle: true, minify: true, metafile: true, write: false, plugins: [capture.plugin] });
      const artifact = result.outputFiles[0]?.text;
      if (!artifact) throw new Error("Missing bundle");
      const configuration = await discoverBuildConfiguration([root]);
      return { artifact, receipt: createGameBuildReceipt({ artifactPath: "game.html", artifact, projectRoot: root,
        inputs: [...capture.closure(result.metafile, root, entry), ...configuration],
        toolVersions: { bun: Bun.version, esbuild: version, engine: "fixture", platform: process.platform, arch: process.arch } }) };
    };
    const baseline = await compile();
    expect(verifyGameBuildReceipt({ ...baseline })).toEqual({ receiptMatches: true, artifactMatches: true });
    expect(baseline.receipt.inputs.some((input) => input.path.endsWith("/bun.lock"))).toBe(true);
    for (const path of ["source.ts", "runtime.ts", "node_modules/fixture-dependency/index.js"]) {
      const contents = path === "source.ts" ? "export const authored = 3;" : path === "runtime.ts" ? "export const runtime = 2;" : "export const value = 1;";
      await writeFile(join(root, path), `${contents}\n// changed input, unchanged program\n`);
      const candidate = await compile();
      expect(candidate.artifact).toBe(baseline.artifact);
      expect(candidate.receipt.identity).not.toBe(baseline.receipt.identity);
      await writeFile(join(root, path), contents);
    }
    await writeFile(join(root, "bun.lock"), "fixture lock v2");
    expect((await compile()).receipt.identity).not.toBe(baseline.receipt.identity);
    expect(verifyGameBuildReceipt({ receipt: baseline.receipt, artifact: "changed artifact" }).artifactMatches).toBe(false);
    baseline.receipt.toolVersions.bun = "different-runtime-version";
    expect(verifyGameBuildReceipt(baseline).receiptMatches).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
