import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stylexSolidPlugin } from "./stylex-solid-plugin";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("stylexSolidPlugin", () => {
  test("collects lazy chunk CSS and extracted rules into the host stylesheet", async () => {
    const outdir = await mkdtemp(path.join(tmpdir(), "hyperfocus-stylex-split-"));
    temporaryDirectories.push(outdir);
    const result = await Bun.build({
      entrypoints: [path.join(import.meta.dir, "fixtures", "stylex-split.tsx")],
      outdir, target: "browser", format: "esm", splitting: true,
      external: ["solid-js", "solid-js/web", "@stylexjs/stylex"],
      plugins: [stylexSolidPlugin({ cssOutputFile: "main.css" })],
    });
    expect(result.success).toBe(true);
    expect(result.outputs.filter(output => output.path.endsWith(".js")).length).toBeGreaterThan(1);
    const css = await readFile(path.join(outdir, "main.css"), "utf8");
    expect(css).toContain(".split-entry-fixture");
    expect(css).toContain(".split-optional-fixture");
    expect(css).toContain("rgb(18,52,86)");
    expect(css).toContain("rgb(86,52,18)");
  });
  test("emits Solid DOM code and extracted StyleX CSS in one build", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "hyperfocus-stylex-solid-"));
    const outdir = path.join(temporaryRoot, "staging", "dist");
    temporaryDirectories.push(temporaryRoot);

    const result = await Bun.build({
      entrypoints: [
        path.join(import.meta.dir, "fixtures", "stylex-solid.tsx"),
        path.join(import.meta.dir, "fixtures", "stylex-solid-secondary.tsx")
      ],
      outdir,
      target: "browser",
      format: "esm",
      external: ["solid-js", "solid-js/web", "@stylexjs/stylex"],
      plugins: [stylexSolidPlugin({ useCSSLayers: { before: ["reset", "legacy"], prefix: "hyperfocus" } })]
    });

    expect(result.success).toBe(true);
    const javascriptOutputs = result.outputs.filter((output) => output.path.endsWith(".js"));
    expect(javascriptOutputs).toHaveLength(2);

    const javascript = (await Promise.all(javascriptOutputs.map((output) => readFile(output.path, "utf8")))).join("\n");
    const css = await readFile(path.join(outdir, "main.css"), "utf8");
    expect(javascript).not.toContain("React.");
    expect(javascript).not.toContain("stylex.create");
    expect(javascript).toContain("StyleX + Solid");
    expect(javascript).toContain("Concurrent StyleX + Solid");
    expect(css).toContain("rgb(18,52,86)");
    expect(css).toContain("rgb(86,52,18)");
    expect(css).toContain("display:grid");
    expect(css).toContain("@media (min-width: 640px)");
    expect(css).toContain("@media (min-width: 1024px)");
  });
});
