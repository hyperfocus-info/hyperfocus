import { describe, expect, test } from "bun:test";
import { ESLint } from "eslint";
import { readFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { parseNumericLiteralBaseline } from "./numeric-literals/policy";
import path from "node:path";

const eslint = new ESLint({
  cwd: process.cwd(),
  fix: true,
  overrideConfigFile: "eslint.config.mjs"
});

describe("repository ESLint config", () => {
  test('engine primitive sources require explicit Map presence, including in generic state code', async () => {
    const [result] = await eslint.lintText('export function restore<T>() { const states = new Map<number, T>(); const state = states.get(0); if (!state) return; }',
      { filePath: 'packages/engine/src/runtime/presence-fixture.ts' });
    expect(result?.messages.find(message => message.ruleId === 'hyperfocus/explicit-map-presence')?.severity).toBe(2);
  });
  test("skips only compiled Website archive entrypoints, retaining neighboring authored source coverage", async () => {
    const prefix = "apps/engine-editor/website/examples/store/releases/v1/site/";
    expect(await eslint.lintText("export const value = 2 * 3;", { filePath: `${prefix}main.js`, warnIgnored: false })).toEqual([]);
    const [authored] = await eslint.lintText("export const value = 2 * 3;", { filePath: `${prefix}custom.js` });
    expect(authored?.messages.some(message => message.ruleId === "hyperfocus/computed-numeric-literals")).toBe(true);
  });
  test("root skill scripts receive source rules and cannot import private application implementations", async () => {
    const [result] = await eslint.lintText('import { debugLog } from "../../../../apps/harness/cli/src/logging.ts"; export const used = debugLog; const orphan = true;', {
      filePath: ".agents/skills/user-audit/scripts/lint-fixture.ts",
    });
    expect(result?.messages.some(message => message.ruleId === "hyperfocus/canonical-imports")).toBe(true);
    expect(result?.messages.some(message => message.ruleId === "@typescript-eslint/no-unused-vars")).toBe(true);
    expect(result?.messages.some(message => message.message.includes("ignored"))).toBe(false);
  });
  test('resolves internal named reexports, type aliases and export-star owners without weakening public boundaries', async () => {
    const local = path.resolve('apps/harness/.local');mkdirSync(local, { recursive: true });
    const fixture = mkdtempSync(path.join(local, 'lint-imports-'));
    try {
      writeFileSync(path.join(fixture, 'value.ts'), 'export const value = 1; export type Value = number;');
      writeFileSync(path.join(fixture, 'barrel.ts'), 'export { value as renamed, type Value } from "./value";');
      writeFileSync(path.join(fixture, 'outer.ts'), 'export * from "./barrel";');
      const source = path.relative(path.resolve('apps/harness/ui/src'), path.join(fixture, 'outer')).replaceAll('\\', '/');
      const [result] = await eslint.lintText(`import { renamed as local, type Value } from ${JSON.stringify(source)}; export const result: Value = local;`, { filePath: 'apps/harness/ui/src/eslint-fixture.ts' });
      expect(result?.errorCount).toBe(0);
      expect(result?.output).toContain('value as local, type Value');
      expect(result?.output).toContain('/value"');
      expect(result?.output).not.toContain('/outer"');
      const [namespace] = await eslint.lintText(`import * as values from ${JSON.stringify(source)}; export const result = values;`, { filePath: 'apps/harness/ui/src/eslint-fixture.ts' });
      expect(namespace?.messages.find(message => message.ruleId === 'hyperfocus/direct-implementation-imports')?.severity).toBe(2);
      expect(namespace?.output).toBeUndefined();
    } finally { rmSync(fixture, { recursive: true, force: true }); }
  });
  test("ignores deterministic generated protobuf output", async () => {
    const [result] = await eslint.lintText(
      "/* eslint-disable */\nexport const generated = true;\n",
      { filePath: "apps/tool/src/proto/generated/state-pb.ts", warnIgnored: false }
    );
    expect(result).toBeUndefined();
  });

  test("removes unused TypeScript imports from enforced source", async () => {
    const [result] = await eslint.lintText(
      'import { unused, used } from "./dependency";\nconsole.log(used);\n',
      { filePath: "packages/ai-core/src/eslint-fixture.ts" }
    );
    expect(result?.output).not.toContain("unused");
    expect(result?.output).toContain("used");
    expect(result?.errorCount).toBe(0);
  });

  test("enforces the same unused-import cleanup in example source", async () => {
    const [result] = await eslint.lintText(
      'import { unused, used } from "./dependency";\nconsole.log(used);\n',
      { filePath: "packages/engine/examples/demo/src/eslint-fixture.ts" }
    );
    expect(result?.output).not.toContain("unused");
    expect(result?.output).toContain("used");
    expect(result?.errorCount).toBe(0);
  });

  test("rewrites an exported cross-owner module to its @hyperfocus alias", async () => {
    const [result] = await eslint.lintText(
      'import { HARNESS_APP_VERSION } from "../../../../packages/ai-core/src/harness/app-version";\nconsole.log(HARNESS_APP_VERSION);\n',
      { filePath: "apps/harness/cli/src/eslint-fixture.ts" }
    );
    expect(result?.output).toContain('from "@hyperfocus/ai-core/app-version"');
    expect(result?.messages.some((message) => message.ruleId === "hyperfocus/canonical-imports")).toBe(false);
  });

  test("reports a cross-owner import when no public alias exists", async () => {
    const [result] = await eslint.lintText(
      'import { createAssistantEvent } from "../../../../packages/ai-core/src/harness/protocol/factories";\nconsole.log(createAssistantEvent);\n',
      { filePath: "apps/harness/cli/src/eslint-fixture.ts" }
    );
    const finding = result?.messages.find((message) => message.ruleId === "hyperfocus/canonical-imports");
    expect(finding?.severity).toBe(2);
    expect(finding?.message).toContain("has no public @hyperfocus export");
  });

  test("enforces package ownership in tests as well as production", async () => {
    const [result] = await eslint.lintText(
      'import { createAssistantEvent } from "../../../../packages/ai-core/src/harness/protocol/factories";\nconsole.log(createAssistantEvent);\n',
      { filePath: "apps/harness/cli/src/eslint-fixture.test.ts" }
    );
    expect(result?.messages.find(message => message.ruleId === "hyperfocus/canonical-imports")?.severity).toBe(2);
  });

  test("resolves directory imports to their exported module", async () => {
    const [result] = await eslint.lintText(
      'export { createAuthoritativeClient } from "../../../../packages/engine/src/net";',
      { filePath: "apps/harness/cli/src/eslint-fixture.ts" }
    );
    expect(result?.output).toContain('from "@hyperfocus/engine/net"');
    expect(result?.messages.some((message) => message.ruleId === "hyperfocus/canonical-imports")).toBe(false);
  });

  test("reports ambiguous public exports without guessing an autofix", async () => {
    const [result] = await eslint.lintText('export { tokens } from "../../../../packages/ui/src/theme/tokens.stylex";', {
      filePath: "apps/harness/cli/src/eslint-fixture.ts"
    });
    expect(result?.output).toBeUndefined();
    expect(result?.messages.find(message => message.ruleId === "hyperfocus/canonical-imports")?.messageId).toBe("ambiguous");
  });

  test("checks literal dynamic imports across ownership boundaries", async () => {
    const [publicImport] = await eslint.lintText(
      'export const load = () => import("../../../../packages/ai-core/src/harness/app-version");',
      { filePath: "apps/harness/cli/src/eslint-fixture.ts" }
    );
    expect(publicImport?.output).toContain('import("@hyperfocus/ai-core/app-version")');
    const [privateImport] = await eslint.lintText(
      'export const load = () => import("../../../../packages/ai-core/src/harness/protocol/factories");',
      { filePath: "apps/harness/cli/src/eslint-fixture.ts" }
    );
    expect(privateImport?.messages.find((message) => message.ruleId === "hyperfocus/canonical-imports")?.messageId).toBe("private");
  });

  test("enforces unused symbols in formerly grandfathered files", async () => {
    const [result] = await eslint.lintText(
      "const legacyUnused = true;\n",
      { filePath: "apps/harness/cli/src/pi-orchestrator.ts", warnIgnored: false }
    );
    const finding = result?.messages.find((message) => message.ruleId === "@typescript-eslint/no-unused-vars");
    expect(finding?.severity).toBe(2);
  });

  test("retired unused-symbol exceptions enforce new findings", async () => {
    const [result] = await eslint.lintText("const newlyUnused = true;\n", {
      filePath: "apps/harness/cli/src/server.ts"
    });
    expect(result?.messages.find((message) => message.ruleId === "@typescript-eslint/no-unused-vars")?.severity).toBe(2);
  });

  test("ignores local run artifacts even inside an enforced package", async () => {
    const results = await eslint.lintText("const scratch = true;\n", {
      filePath: "packages/engine/.local/audit/probe.ts", warnIgnored: false
    });
    expect(results).toEqual([]);
  });

  test.each([
    ["no-async-promise-executor", "export const result = new Promise(async resolve => { await Promise.reject(); resolve(1); });"],
    ["no-constant-binary-expression", "export const value = {} || fallback;"],
    ["no-unreachable", "export function value() { return 1; console.log('never'); }"],
    ["@typescript-eslint/ban-ts-comment", "// @ts-ignore\nexport const value = missing;"],
    ["@typescript-eslint/ban-ts-comment", "// @ts-nocheck\nexport const value = missing;"],
    ["@typescript-eslint/ban-ts-comment", "// @ts-expect-error\nexport const value = missing;"]
  ])("rejects %s violations on app surfaces", async (ruleId, source) => {
    const [result] = await eslint.lintText(source, { filePath: "apps/pad-pilot/ui/src/eslint-fixture.ts" });
    expect(result?.messages.find((message) => message.ruleId === ruleId)?.severity).toBe(2);
  });

  test("allows explained negative type tests", async () => {
    const [result] = await eslint.lintText("// @ts-expect-error -- The public API rejects strings.\nexport const value: number = 'wrong';", {
      filePath: "packages/ai-core/src/eslint-fixture.test.ts"
    });
    expect(result?.errorCount).toBe(0);
  });

  test("rejects stale disable directives and redundant inline configuration", async () => {
    const withoutFix = new ESLint({ overrideConfigFile: "eslint.config.mjs" });
    for (const directive of ["// eslint-disable-next-line no-unreachable", "/* eslint no-unreachable: error */"]) {
      const [result] = await withoutFix.lintText(`${directive}\nexport const value = 1;`, {
        filePath: "packages/ai-core/src/eslint-fixture.ts"
      });
      expect(result?.messages.some((message) => message.ruleId === null && message.severity === 2 && message.message.startsWith("Unused"))).toBe(true);
    }
  });

  test.each(["apps/harness/ui/src", "apps/engine-editor/src", "apps/pad-pilot/ui/src", "apps/pad-pilot-marketplace/src", "scripts"])("rejects unused symbols in %s", async root => {
    const [result] = await eslint.lintText("const unused = true;", { filePath: root + "/eslint-fixture.ts" });
    expect(result?.messages.find(message => message.ruleId === "@typescript-eslint/no-unused-vars")?.severity).toBe(2);
  });

  test("app-local lint discovers the same root policy", async () => {
    const local = new ESLint({ cwd: path.resolve("apps/harness") });
    const [result] = await local.lintText("const unused = true;", { filePath: "ui/src/eslint-fixture.ts" });
    expect(result?.messages.find(message => message.ruleId === "@typescript-eslint/no-unused-vars")?.severity).toBe(2);
  });

  test("rejects new literal arithmetic, including inside runtime expressions", async () => {
    const [result] = await eslint.lintText(
      "export const value = speed * (3 * 5);\n",
      { filePath: "apps/pad-pilot/ui/src/eslint-numeric-fixture.ts" }
    );
    const finding = result?.messages.find((message) => message.ruleId === "hyperfocus/computed-numeric-literals");
    expect(finding?.severity).toBe(2);
    expect(finding?.message).toContain("final numeric value 15");
    expect(result?.messages.some((message) => message.ruleId === "hyperfocus/legacy-computed-numeric-literals")).toBe(false);
  });

  test("keeps symbolic and runtime computations legal", async () => {
    const [result] = await eslint.lintText(
      "export const values = [Math.PI * 2, speed / 5, 5 * SECOND, 0.1];\n",
      { filePath: "packages/core/src/eslint-numeric-fixture.ts" }
    );
    expect(result?.messages.some((message) => message.ruleId?.includes("computed-numeric-literals"))).toBe(false);
  });

  test("has retired every numeric-literal allowance", () => {
    const raw: unknown = JSON.parse(readFileSync("scripts/code-style-baseline.json", "utf8"));
    const baseline = parseNumericLiteralBaseline(typeof raw === "object" && raw !== null && "numericLiterals" in raw ? raw.numericLiterals : undefined);
    expect(baseline).toEqual({});
  });
});
