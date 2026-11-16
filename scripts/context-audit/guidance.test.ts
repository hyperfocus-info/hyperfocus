import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { localLinks, skillMetadata, validateGuidance } from "./guidance";
import { scenarios } from "./scenarios.json";

test("skill metadata accepts YAML scalar styles and rejects unusable discovery", () => {
  const file = path.join("skills", "sample", "SKILL.md");
  expect(skillMetadata({ file, source: "\uFEFF---\r\nname: sample\r\ndescription: >-\r\n  Inspect one candidate.\r\n  Use for release preparation.\r\n---\r\n" }).description)
    .toBe("Inspect one candidate. Use for release preparation.");
  for (const header of ["name: wrong\ndescription: Fine", "name: sample\ndescription: []", "name: sample\ndescription: ''", "name: sample\nname: other\ndescription: Fine"]) {
    expect(() => skillMetadata({ file, source: `---\n${header}\n---\n` })).toThrow();
  }
  expect(() => skillMetadata({ file, source: "No header" })).toThrow("frontmatter");
});

test("links handle spaces, anchors and reference definitions without treating examples as routes", () => {
  const source = [
    "[owner](<references/a b.md#scope>) [web](https://example.com) [heading](#done)",
    "[named]: references/c.md 'Title'",
    "`[literal](absent.md)`",
    "~~~md", "[example](missing.md)", "```", "~~~", "[real](script.ts?mode=read)",
  ].join("\n");
  expect(localLinks(source).map((link) => link.target)).toEqual(["references/a b.md", "references/c.md", "script.ts"]);
});

test("portable skills cannot depend on checkout files and broken references fail", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "guidance-fixture-"));
  try {
    const rootSkill = path.join(root, ".agents/skills/sample");
    const portable = path.join(root, "apps/harness/.agents/skills/sample");
    await mkdir(rootSkill, { recursive: true });
    await mkdir(portable, { recursive: true });
    await writeFile(path.join(root, "README.md"), "# Fixture\n");
    const header = "---\nname: sample\ndescription: Inspect one sample when requested.\n---\n";
    await writeFile(path.join(rootSkill, "SKILL.md"), `${header}[owner](../../../README.md)\n`);
    await writeFile(path.join(portable, "SKILL.md"), `${header}[leak](../../../../../README.md) [missing](gone.md)\n`);
    const result = await validateGuidance({ root });
    expect(result.catalog).toHaveLength(2); // Separate discovery scopes may reuse names.
    expect(result.failures).toHaveLength(2);
    expect(result.failures.some((failure) => failure.reason.includes("escapes its bundle"))).toBe(true);
    expect(result.failures.some((failure) => failure.reason.includes("missing link"))).toBe(true);
    await writeFile(path.join(portable, "SKILL.md"), `${header}[local](operation.md)\n`);
    await writeFile(path.join(portable, "operation.md"), "Bundled operation.\n");
    expect((await validateGuidance({ root })).failures).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repository skill catalogs and instruction routes are usable", async () => {
  const result = await validateGuidance({ root: path.resolve(import.meta.dir, "../..") });
  expect(result.catalog.length).toBeGreaterThan(0);
  expect(result.failures).toEqual([]);
});

test("behavioral evaluation fixtures point to existing guidance", async () => {
  expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(scenarios.length);
  for (const scenario of scenarios) {
    for (const file of scenario.requiredPaths) {
      expect(await Bun.file(path.resolve(import.meta.dir, "../..", file)).exists()).toBe(true);
    }
  }
});
