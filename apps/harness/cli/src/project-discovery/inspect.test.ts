import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inspectProject, projectDiscoveryPrompt, projectVerificationCommands } from "./inspect";

const roots: string[] = [];
function fixture(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "project-discovery-"));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) { mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); writeFileSync(path.join(root, name), text); }
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("declared project discovery", () => {
  test("lists Bun script argv and provenance without executing script contents", () => {
    const root = fixture({ "package.json": JSON.stringify({ name: "example", packageManager: "bun@1.4.0", scripts: { test: "throw-if-executed", "build:release": "native-build", postinstall: "never execute", "test; echo injected": "bad" } }), "AGENTS.md": "Instructions" });
    const report = inspectProject({ root });
    expect(report.tasks.map(task => task.command)).toEqual([["bun", "run", "test"], ["bun", "run", "build:release"]]);
    expect(report.tasks[0]?.source).toBe("package.json#scripts");
    expect(report.instructions).toContain("AGENTS.md");
    expect(JSON.stringify(report)).not.toContain("throw-if-executed");
  });
  test("finds Python configuration and never invents TypeScript verification", () => {
    const root = fixture({ "pyproject.toml": '[project]\nname = "python-app"\n[tool.pytest.ini_options]\ntestpaths = ["tests"]' });
    expect(inspectProject({ root }).tasks.map(task => task.command)).toEqual([["python", "-m", "pytest"]]);
    expect(projectDiscoveryPrompt(root)).not.toContain("bun");
  });
  test("reports native presets and configuration unknowns", () => {
    const root = fixture({ "plugin/CMakeLists.txt": "project(native)", "CMakePresets.json": JSON.stringify({ buildPresets: [{ name: "release" }, { name: "hidden", hidden: true }], testPresets: [{ name: "native" }] }) });
    const report = inspectProject({ root });
    expect(report.tasks.map(task => task.command)).toEqual([["cmake", "--build", "--preset", "release"], ["ctest", "--preset", "native"]]);
    expect(report.unknowns.join(" ")).toContain("Native compiler");
  });
  test("keeps the check fallback when typecheck is also declared", () => {
    const root = fixture({ "package.json": JSON.stringify({ packageManager: "bun@1.4.0", scripts: { typecheck: "tsc", check: "vitest run", "lint:fix": "eslint --fix ." } }) });
    expect(projectVerificationCommands(root)).toEqual(["bun run typecheck", "bun run check"]);
    expect(inspectProject({ root }).tasks.find(task => task.name === "lint:fix")?.kind).toBe("maintenance");
  });
  test("does not select disabled or unresolved inherited native presets", () => {
    const root = fixture({ "CMakePresets.json": JSON.stringify({
      configurePresets: [{ name: "platform", condition: { type: "equals", lhs: "${hostSystemName}", rhs: "Linux" } }],
      testPresets: [{ name: "off", condition: false }, { name: "inherited", inherits: "base" },
        { name: "conditional", configurePreset: "platform" }, { name: "included", configurePreset: "elsewhere" }]
    }) });
    expect(projectVerificationCommands(root)).toEqual([]);
    expect(inspectProject({ root }).unknowns.join(" ")).toContain("preset applicability");
  });
  test("keeps malformed, ambiguous and absent declarations explicit", () => {
    const cases: Parameters<typeof fixture>[0][] = [{ "package.json": "{" }, { "package.json": JSON.stringify({ scripts: { test: "test" } }), "bun.lock": "", "package-lock.json": "{}" }, {}];
    for (const files of cases) {
      const report = inspectProject({ root: fixture(files) });
      expect(report.tasks).toEqual([]);
      expect(report.unknowns.join(" ")).toContain("No project-specific verification");
    }
  });
  test("bounds manifest reads and never opens environment files", () => {
    const report = inspectProject({ root: fixture({ "package.json": " ".repeat(262145), ".env": "SECRET=do-not-read" }) });
    expect(report.unknowns.join(" ")).toContain("exceeds");
    expect(JSON.stringify(report)).not.toContain("do-not-read");
  });
});
