import { describe, expect, test } from "bun:test";
import { ESLint } from "eslint";

const eslint = new ESLint({
  cwd: process.cwd(),
  fix: true,
  overrideConfigFile: "eslint.config.mjs"
});

describe("repository ESLint config", () => {
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
    expect(finding?.severity).toBe(1);
    expect(finding?.message).toContain("has no public @hyperfocus export");
  });

  test("keeps legacy findings visible as warnings", async () => {
    const [result] = await eslint.lintText(
      "const legacyUnused = true;\n",
      { filePath: "apps/harness/cli/src/server.ts", warnIgnored: false }
    );
    const finding = result?.messages.find((message) => message.ruleId === "@typescript-eslint/no-unused-vars");
    expect(finding?.severity).toBe(1);
  });

  test("defers unused-symbol enforcement for the active UI workstream", async () => {
    const [result] = await eslint.lintText(
      "const deferredUnused = true;\n",
      { filePath: "apps/harness/ui/src/eslint-fixture.ts", warnIgnored: false }
    );
    expect(result?.messages.some((message) => message.ruleId === "@typescript-eslint/no-unused-vars")).toBe(false);
  });
});
