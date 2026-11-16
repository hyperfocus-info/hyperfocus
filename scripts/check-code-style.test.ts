import { describe, expect, test } from "bun:test";
import {
  collectCodeStyleEntries,
  collectLocalCodeStyleCounts,
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
  test("checks every app root and nested dynamic imports without scanning generated output", () => {
    const files = new Map([
      ["packages/core/package.json", JSON.stringify({ sideEffects: false })],
      ["packages/core/src/value.ts", "export const value = 1;"],
      ["apps/pad-pilot/package.json", "{}"],
      ["apps/pad-pilot/scripts/load.ts", "export async function load() { return import('../../../packages/core/src/value'); }"],
      ["apps/pad-pilot-marketplace/src/store.ts", "class Store {}"],
      ["apps/pad-pilot/ui/src/proto/generated/state.ts", "class Generated {}"],
      ["apps/pad-pilot/build/artifact.ts", "class Generated {}"],
      ["apps/engine-editor/website/examples/store/releases/v1/site/main.js", "class Generated {}"],
      ["apps/engine-editor/website/examples/store/releases/v1/site/custom.js", "class Authored {}"]
    ]);
    const entries = new Map(collectCodeStyleEntries(files).map(entry => [entry.path, entry.counts]));
    expect(entries.get("apps/pad-pilot/scripts/load.ts")?.crossOwnerRelativeImports).toBe(1);
    expect(entries.get("apps/pad-pilot-marketplace/src/store.ts")?.classes).toBe(1);
    expect(entries.has("apps/pad-pilot/ui/src/proto/generated/state.ts")).toBe(false);
    expect(entries.has("apps/pad-pilot/build/artifact.ts")).toBe(false);
    expect(entries.has("apps/engine-editor/website/examples/store/releases/v1/site/main.js")).toBe(false);
    expect(entries.get("apps/engine-editor/website/examples/store/releases/v1/site/custom.js")?.classes).toBe(1);
  });

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
    const baseline = parseCodeStyleBaseline({ version: 1, entries: { "packages/core/src/store.ts": { classes: 2 } } });
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

  test("rejects every computed numeric literal without granting allowances", () => {
    const filePath = "packages/core/src/settings.ts";
    const oldEntries = collectCodeStyleEntries(new Map([[filePath, "export const delay = 15 * 3 * 0.1;"]]));
    const baseline = parseCodeStyleBaseline({ version: 1, entries: {} });
    expect(baseline.numericLiterals).toEqual({});
    expect(findCodeStyleViolations(oldEntries, baseline)).toHaveLength(1);
    const changed = collectCodeStyleEntries(new Map([[filePath, "export const delay = 15 * 4 * 0.1;"]]));
    expect(changed[0]?.numericLiterals).toHaveLength(1);
    expect(findCodeStyleViolations(changed, baseline)[0]).toContain("computed numeric literal");
    const moved = collectCodeStyleEntries(new Map([["packages/core/src/new-settings.ts", "export const delay = 15 * 3 * 0.1;"]]));
    expect(findCodeStyleViolations(moved, baseline)[0]).toContain("new-settings.ts");
  });

  test("reports each arithmetic occurrence despite comments and duplicates", () => {
    const filePath = "apps/pad-pilot/ui/src/settings.ts";
    const baseline = parseCodeStyleBaseline({ version: 1, entries: {} });
    const edited = collectCodeStyleEntries(new Map([[filePath, "export const other = 7;\n\nexport const delay = 3 /* units */ * 4;"]]));
    expect(findCodeStyleViolations(edited, baseline)).toHaveLength(1);
    const copied = collectCodeStyleEntries(new Map([[filePath, "export const delay = 3 * 4;\nexport const delay = 3 * 4;"]]));
    expect(findCodeStyleViolations(copied, baseline)).toHaveLength(2);
  });

  test("ratcheting preserves other limits without approving numeric debt", () => {
    const filePath = "packages/core/src/settings.ts";
    const baseline = parseCodeStyleBaseline({ version: 1, entries: { [filePath]: { classes: 1 } } });
    const changed = collectCodeStyleEntries(new Map([[filePath, "class Legacy {}\nexport const delay = 3 * 5;"]]));
    const ratcheted = ratchetCodeStyleBaseline(changed, baseline);
    expect(ratcheted.entries).toEqual(baseline.entries);
    expect(ratcheted.numericLiterals).toEqual({});
    expect(findCodeStyleViolations(changed, ratcheted)).toHaveLength(1);
    const clean = collectCodeStyleEntries(new Map([[filePath, "class Legacy {}\nexport const delay = 12;"]]));
    expect(findCodeStyleViolations(clean, baseline)).toEqual([]);
    expect(ratchetCodeStyleBaseline(clean, baseline).numericLiterals).toEqual({});
  });

  test("rejects numeric baseline allowances even with formerly valid occurrence IDs", () => {
    expect(parseCodeStyleBaseline({ version: 1, entries: {} }).numericLiterals).toEqual({});
    expect(() => parseCodeStyleBaseline({ version: 1, entries: {}, numericLiterals: { "scripts/test.ts": ["count"] } })).toThrow("must be empty");
    expect(() => parseCodeStyleBaseline({ version: 1, entries: {}, numericLiterals: { "scripts/test.ts": ["a".repeat(64)] } })).toThrow("must be empty");
  });
});
