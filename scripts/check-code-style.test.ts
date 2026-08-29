import { describe, expect, test } from "bun:test";
import {
  collectCodeStyleEntries,
  collectLocalCodeStyleCounts,
  createCodeStyleBaseline,
  findCodeStyleViolations,
  parseCodeStyleBaseline,
  ratchetCodeStyleBaseline
} from "./check-code-style";

describe("local code style analysis", () => {
  test("counts classes, non-literal assertions, satisfies, and late StyleX declarations", () => {
    const source = [
      "class Store {}",
      "const literal = { mode: 'fast' } as const;",
      "const forced = literal as { mode: string };",
      "const checked = { mode: 'fast' } satisfies { mode: string };",
      "export function Panel() { return <div />; }",
      "const styles = stylex.create({ root: {} });"
    ].join("\n");
    const counts = collectLocalCodeStyleCounts("packages/ui/src/panel.tsx", source);
    expect(counts.classes).toBe(1);
    expect(counts.assertions).toBe(1);
    expect(counts.satisfies).toBe(1);
    expect(counts.styleOrder).toBe(1);
  });

  test("accepts literal assertions and styles declared above the component", () => {
    const source = [
      "const modes = ['fast', 'safe'] as const;",
      "const styles = stylex.create({ root: {} });",
      "export const Panel = () => <div />;"
    ].join("\n");
    const counts = collectLocalCodeStyleCounts("packages/ui/src/panel.tsx", source);
    expect(counts.assertions).toBe(0);
    expect(counts.styleOrder).toBe(0);
  });
});

describe("repository code style analysis", () => {
  test("distinguishes public barrels from internal barrels and catches flattened imports", () => {
    const files = new Map([
      ["packages/core/package.json", JSON.stringify({
        exports: { ".": "./src/index.ts" },
        sideEffects: false
      })],
      ["packages/core/src/index.ts", "export { value } from './value';"],
      ["packages/core/src/value.ts", "export const value = 1;"],
      ["packages/core/src/internal/index.ts", "export { hidden } from '../hidden';"],
      ["packages/core/src/hidden.ts", "export const hidden = 2;"],
      ["packages/core/src/use-hidden.ts", "import { hidden } from './internal'; export { hidden };"],
      ["packages/other/package.json", JSON.stringify({ sideEffects: false })],
      ["packages/other/src/cross-owner.ts", "import { value } from '../../core/src/value'; export { value };" ]
    ]);
    const entries = new Map(collectCodeStyleEntries(files).map((entry) => [entry.path, entry.counts]));
    expect(entries.get("packages/core/src/index.ts")?.internalBarrels).toBe(0);
    expect(entries.get("packages/core/src/internal/index.ts")?.internalBarrels).toBe(1);
    expect(entries.get("packages/core/src/use-hidden.ts")?.internalBarrelImports).toBe(1);
    expect(entries.get("packages/other/src/cross-owner.ts")?.crossOwnerRelativeImports).toBe(1);
  });

  test("requires package side-effect metadata for a published barrel", () => {
    const files = new Map([
      ["packages/core/package.json", JSON.stringify({ exports: { ".": "./src/index.ts" } })],
      ["packages/core/src/index.ts", "export { value } from './value';"],
      ["packages/core/src/value.ts", "export const value = 1;"]
    ]);
    const entries = collectCodeStyleEntries(files);
    expect(entries.find((entry) => entry.path === "packages/core/package.json")?.counts.packageSideEffects).toBe(1);
  });
});

describe("code style baseline", () => {
  test("blocks new debt and asks for reductions to be ratcheted", () => {
    const oldEntries = collectCodeStyleEntries(new Map([
      ["packages/core/src/store.ts", "class One {}\nclass Two {}"]
    ]));
    const baseline = createCodeStyleBaseline(oldEntries);
    const reduced = collectCodeStyleEntries(new Map([
      ["packages/core/src/store.ts", "class One {}"]
    ]));
    expect(findCodeStyleViolations(reduced, baseline)[0]).toContain("ratchet the baseline");

    const cleanBaseline = ratchetCodeStyleBaseline(reduced, baseline);
    expect(findCodeStyleViolations(reduced, cleanBaseline)).toEqual([]);
    const grew = collectCodeStyleEntries(new Map([
      ["packages/core/src/store.ts", "class One {}\nclass Two {}"]
    ]));
    expect(findCodeStyleViolations(grew, cleanBaseline)[0]).toContain("grew from 1 to 2");
  });

  test("validates baseline rules and positive counts", () => {
    expect(() => parseCodeStyleBaseline({
      version: 1,
      entries: { "packages/core/src/store.ts": { classes: 0 } }
    })).toThrow("invalid classes count");
    expect(() => parseCodeStyleBaseline({
      version: 1,
      entries: { "packages/core/src/store.ts": { mystery: 1 } }
    })).toThrow("invalid mystery count");
  });
});
