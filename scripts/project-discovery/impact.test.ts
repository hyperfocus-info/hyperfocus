import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { inspectChangeImpact, summarizeChangeImpact } from "./impact";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function repository() {
  const root = await mkdtemp(path.join(tmpdir(), "change-impact-")); roots.push(root);
  await writeFile(path.join(root, "package.json"), JSON.stringify({ workspaces: ["apps/*", "packages/*"] }));
  for (const [directory, name, dependencies, devDependencies] of [
    ["packages/leaf", "leaf", {}, {}], ["packages/middle", "middle", { leaf: "workspace:*" }, {}],
    ["apps/engine-editor", "editor", { middle: "workspace:*" }, {}], ["apps/tool", "tool", {}, { leaf: "workspace:*" }],
    ["apps/unrelated", "unrelated", {}, {}],
  ] as const) {
    await mkdir(path.join(root, directory), { recursive: true });
    await writeFile(path.join(root, directory, "package.json"), JSON.stringify({ name, dependencies, devDependencies }));
  }
  return root;
}
test("finds transitive and tooling consumers with dependency evidence and existing gate routes", async () => {
  const root = await repository();
  const report = await inspectChangeImpact({ root, paths: ["packages/leaf/src/removed.ts"] });
  expect(report.consumers.map(item => item.name).sort()).toEqual(["editor", "leaf", "middle", "tool"]);
  expect(report.consumers.find(item => item.name === "editor")?.via).toEqual(["leaf", "middle", "editor"]);
  expect(report.consumers.find(item => item.name === "editor")?.validationRoutes[0]?.target).toBe("editor");
  expect(report.consumers.find(item => item.name === "tool")?.dependencyEvidence[0]?.kind).toBe("devDependencies");
  expect(report.status).toBe("discovery-only");
  const summary = summarizeChangeImpact(report);
  expect(summary.consumers.map(item => item.name)).toEqual(report.consumers.map(item => item.name));
  expect(summary.unknowns).toEqual(report.unknowns);
  expect(summary.status).toBe("discovery-only");
  expect(summary.consumers.find(item => item.name === "editor")?.dependencyEvidenceCount).toBeGreaterThan(0);
  expect(JSON.stringify(summary.consumers).length).toBeLessThan(JSON.stringify(report.consumers).length);
});
test("unknown ownership stays explicit and paths cannot escape the chosen repository", async () => {
  const root = await repository();
  const report = await inspectChangeImpact({ root, paths: ["README.md"] });
  expect(report.changed[0]?.owner).toBeNull();
  expect(report.unknowns.join(" ")).toContain("may affect every product");
  await expect(inspectChangeImpact({ root, paths: ["../outside.ts"] })).rejects.toThrow("inside the repository");
});

async function source(root: string, file: string, content: string) {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), content);
}

test("finds undeclared literal imports and build paths without treating prose or computed imports as dependencies", async () => {
  const root = await repository();
  await source(root, "apps/unrelated/build.ts", `
    import { resolve as resolvePath } from "node:path";
    const runtime = resolvePath(import.meta.dir, "../../apps/engine-editor/src/runtime.ts");
    const ignored = "import 'leaf'";
    // import 'leaf';
    await import(selectedModule);
  `);
  await source(root, "apps/engine-editor/entry.ts", 'export { run } from "../../apps/unrelated/src/runtime";');
  await source(root, "apps/tool/plugin.ts", 'await import("unrelated/plugin");');
  const report = await inspectChangeImpact({ root, paths: ["apps/engine-editor/src/runtime.ts"] });
  expect(report.consumers.map(item => item.name).sort()).toEqual(["editor", "tool", "unrelated"]);
  expect(report.consumers.find(item => item.name === "unrelated")?.dependencyEvidence).toContainEqual({ name: "editor", kind: "literal-build-path", source: "apps/unrelated/build.ts:3", target: "apps/engine-editor/src/runtime.ts" });
  expect(report.consumers.find(item => item.name === "tool")?.via).toEqual(["editor", "unrelated", "tool"]);
  expect(report.sourceScan.computedImports).toBe(1);
  // The reverse reference is a cycle; traversal must still terminate without adding unrelated leaf packages.
  expect(report.consumers.some(item => item.name === "leaf")).toBe(false);
});

test("CMake literal input globs expose native consumers and exact root build inputs", async () => {
  const root = await repository();
  await source(root, "apps/unrelated/plugin/CMakeLists.txt", [
    'file(GLOB_RECURSE INPUTS "${CMAKE_CURRENT_SOURCE_DIR}/../../../packages/leaf/src/*")',
    'set(INPUTS "${CMAKE_CURRENT_SOURCE_DIR}/../../../bun.lock")',
    '# "${CMAKE_CURRENT_SOURCE_DIR}/../../../apps/tool/src/*"',
    'set(UNKNOWN "${CMAKE_CURRENT_SOURCE_DIR}/${PACKAGE}/src/*")',
    '#[[',
    'set(COMMENT "${CMAKE_CURRENT_SOURCE_DIR}/../../../apps/tool/src/*")',
    ']]',
  ].join("\n"));
  const changedPackage = await inspectChangeImpact({ root, paths: ["packages/leaf/src/index.ts"] });
  expect(changedPackage.consumers.find(item => item.name === "unrelated")?.dependencyEvidence).toContainEqual({ name: "leaf", kind: "cmake-path", source: "apps/unrelated/plugin/CMakeLists.txt:1", target: "packages/leaf/src/*" });
  const changedLock = await inspectChangeImpact({ root, paths: ["bun.lock"] });
  expect(changedLock.consumers.map(item => item.name)).toEqual(["unrelated"]);
  expect(changedLock.consumers[0]?.buildInputEvidence[0]?.target).toBe("bun.lock");
  expect(changedLock.unknowns.join(" ")).toContain("may affect every product");
  const changedTool = await inspectChangeImpact({ root, paths: ["apps/tool/src/index.ts"] });
  expect(changedTool.consumers.some(item => item.name === "unrelated")).toBe(false);
});

test("source scan excludes generated artifacts, bounds reads, and preserves uncertainty", async () => {
  const root = await repository();
  await source(root, "apps/unrelated/dist/index.ts", 'import "leaf";');
  await source(root, "apps/unrelated/generated/index.ts", 'import "leaf";');
  await source(root, "apps/unrelated/large.ts", 'import "leaf";' + " ".repeat(1048576));
  await source(root, "apps/unrelated/normal.ts", '// import "leaf";\nconst text = `import "leaf"`;');
  const report = await inspectChangeImpact({ root, paths: ["packages/leaf/src/index.ts"] });
  expect(report.consumers.some(item => item.name === "unrelated")).toBe(false);
  expect(report.sourceScan.scannedFiles).toBe(1);
  expect(report.sourceScan.skippedFiles).toEqual(["apps/unrelated/large.ts"]);
  expect(report.unknowns.join(" ")).toContain("external consumers");
});

test("source scan does not follow linked source directories", async () => {
  const root = await repository();
  const outside = await mkdtemp(path.join(tmpdir(), "impact-linked-source-")); roots.push(outside);
  await writeFile(path.join(outside, "index.ts"), 'import "leaf";');
  await symlink(outside, path.join(root, "apps/unrelated/linked"), process.platform === "win32" ? "junction" : "dir");
  const report = await inspectChangeImpact({ root, paths: ["packages/leaf/src/index.ts"] });
  expect(report.consumers.some(item => item.name === "unrelated")).toBe(false);
  expect(report.sourceScan.skippedFiles).toEqual(["apps/unrelated/linked"]);
});


test('nested game workspaces own their files without becoming engine source', async () => {
  const root = await repository();
  await source(root, 'package.json', JSON.stringify({ workspaces: ['apps/*', 'packages/*', 'packages/leaf/examples/game'] }));
  await source(root, 'packages/leaf/examples/game/package.json', JSON.stringify({ name: 'game', dependencies: { leaf: 'workspace:*' } }));
  await source(root, 'packages/leaf/examples/game/src/rules.ts', 'export const damage = 5;');
  const impact = await inspectChangeImpact({ root, paths: ['packages/leaf/examples/game/src/rules.ts'] });
  expect(impact.consumers.map(item => item.name)).toEqual(['game']);
  const engine = await inspectChangeImpact({ root, paths: ['packages/leaf/src/index.ts'] });
  expect(engine.consumers.map(item => item.name)).toContain('game');
});
