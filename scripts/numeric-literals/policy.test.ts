import { describe, expect, test } from "bun:test";
import { collectNumericLiteralSource, isNumericLiteralSourcePath } from "./policy";

describe("final numeric literal analysis", () => {
  test("reports the whole constant chain with its actual JavaScript value", () => {
    const findings = collectNumericLiteralSource("scripts/config.ts", "const gain = 15 * 3 * 0.1 * 31415 * 0.0001;");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.expression).toBe("15 * 3 * 0.1 * 31415 * 0.0001");
    expect(findings[0]?.value).toBe(14.136750000000001);
    expect(findings[0]?.line).toBe(1);
    expect(findings[0]?.column).toBe(14);
  });

  test("folds nested parentheses and signed operands without duplicate findings", () => {
    const findings = collectNumericLiteralSource("scripts/config.ts", "const gain = (-15 * +2) / (10 - 4);\nconst mask = (0xff << 2) | 3;");
    expect(findings.map((finding) => finding.value)).toEqual([-5, 1023]);
    expect(findings).toHaveLength(2);
  });

  test("allows runtime math, symbolic formulas, final literals, comparisons, and strings", () => {
    const findings = collectNumericLiteralSource("scripts/config.ts", [
      "const angle = Math.PI * 2;",
      "const duration = 5 * SECOND;",
      "const x = input / 3;",
      "const y = -0.5;",
      "const comparison = 1 < 2;",
      "const concat = '1' + 2;",
      "// const ignored = 3 * 5;",
      "const text = '3 * 5';"
    ].join("\n"));
    expect(findings).toEqual([]);
  });

  test("still reports computable subexpressions inside dynamic runtime math", () => {
    const findings = collectNumericLiteralSource("scripts/config.ts", "const value = input * (3 * 5) + Math.PI * (2 + 1);");
    expect(findings.map((finding) => finding.value)).toEqual([15, 3]);
  });

  test("handles separators, hexadecimal, exponentiation, remainder, and shift operators", () => {
    const findings = collectNumericLiteralSource("scripts/config.ts", "const values = [1_000 / 10, 0x10 + 2, 2 ** 3, 15 % 4, -8 >> 1, -8 >>> 1, 5 ^ 3, 5 & 3];");
    expect(findings.map((finding) => finding.value)).toEqual([100, 18, 8, 3, -4, 2147483644, 6, 1]);
  });

  test("includes every application but excludes generated and declaration sources", () => {
    expect(isNumericLiteralSourcePath("apps/pad-pilot/ui/src/config.ts")).toBe(true);
    expect(isNumericLiteralSourcePath("apps/engine-editor/src/config.ts")).toBe(true);
    expect(isNumericLiteralSourcePath("scripts/tool.mjs")).toBe(true);
    expect(isNumericLiteralSourcePath("apps/engine-editor/website/examples/store/releases/v1/site/main.js")).toBe(false);
    expect(isNumericLiteralSourcePath("apps/engine-editor/website/examples/store/releases/v1/site/custom.js")).toBe(true);
    expect(isNumericLiteralSourcePath("apps/engine-editor/website/examples/store/releases/v1/site/railway-setup.ts")).toBe(false);
    expect(isNumericLiteralSourcePath("apps/engine-editor/website/src/delivery/railway.ts")).toBe(true);
    expect(isNumericLiteralSourcePath("apps/engine-editor/website/src/main.ts")).toBe(true);
    expect(isNumericLiteralSourcePath(".agents/skills/dev-server/scripts/registry.ts")).toBe(true);
    expect(isNumericLiteralSourcePath(".agents/skills/dev-server/.local/probe.ts")).toBe(false);
    expect(isNumericLiteralSourcePath("packages/core/src/types.d.ts")).toBe(false);
    expect(isNumericLiteralSourcePath("packages/engine/browser/index.js")).toBe(false);
    expect(isNumericLiteralSourcePath("apps/tool/proto/generated/state.ts")).toBe(false);
    expect(isNumericLiteralSourcePath(".local/experiment.ts")).toBe(false);
  });
});
