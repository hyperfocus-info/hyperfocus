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
  test("emits Solid DOM code and extracted StyleX CSS in one build", async () => {
    const outdir = await mkdtemp(path.join(tmpdir(), "hyperfocus-stylex-solid-"));
    temporaryDirectories.push(outdir);

    const result = await Bun.build({
      entrypoints: [path.join(import.meta.dir, "fixtures", "stylex-solid.tsx")],
      outdir,
      target: "browser",
      format: "esm",
      external: ["solid-js", "solid-js/web", "@stylexjs/stylex"],
      plugins: [stylexSolidPlugin()]
    });

    expect(result.success).toBe(true);
    const javascriptOutput = result.outputs.find((output) => output.path.endsWith(".js"));
    expect(javascriptOutput).toBeDefined();

    const javascript = await readFile(javascriptOutput!.path, "utf8");
    const css = await readFile(path.join(outdir, "main.css"), "utf8");
    expect(javascript).not.toContain("React.");
    expect(javascript).not.toContain("stylex.create");
    expect(javascript).toContain("StyleX + Solid");
    expect(css).toContain("rgb(18,52,86)");
    expect(css).toContain("display:grid");
  });
});
