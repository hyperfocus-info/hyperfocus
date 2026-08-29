import { describe, expect, test } from "bun:test";
import {
  collectExistingSourceEntries,
  collectSourceDeclarations,
  countSourceFilesByDirectory,
  countPhysicalLines,
  findSourceStructureViolations,
  findSourceStructureWarnings,
  getSourceLineLimit,
  parseSourceStructureBaseline,
  ratchetSourceStructureBaseline,
  type SourceStructureBaseline,
  type SourceDirectoryException,
  type SourceStructureEntry,
  type SourceStructureException
} from "./check-source-structure";

const metadata: Omit<SourceStructureException, "maxLines"> = {
  owner: "test-owner",
  reason: "Legacy file awaiting decomposition",
  boundary: "Keep transport and persistence responsibilities separate",
  removalTarget: "Remove after the domain modules land"
};

function exception(maxLines: number): SourceStructureException {
  return { maxLines, ...metadata };
}

function directoryException(maxFiles: number): SourceDirectoryException {
  return { maxFiles, ...metadata };
}

function baseline(exceptions: SourceStructureBaseline["exceptions"] = {}): SourceStructureBaseline {
  return {
    version: 1,
    exceptions,
    directoryExceptions: {},
    declarationExceptions: {},
    declarationWarningBaselines: {},
    declarationDeferrals: []
  };
}

describe("source structure limits", () => {
  test("classifies production, tests, example source, and data catalogs", () => {
    expect(getSourceLineLimit("packages/core/src/runtime.ts")).toBe(1_000);
    expect(getSourceLineLimit("apps/tool/src/runtime.test.ts")).toBe(1_500);
    expect(getSourceLineLimit("apps/tool/src/test-support/runtime.ts")).toBe(1_500);
    expect(getSourceLineLimit("packages/engine/examples/demo/src/client.ts")).toBe(1_000);
    expect(getSourceLineLimit("packages/engine/examples/demo/src/client.test.ts")).toBe(1_500);
    expect(getSourceLineLimit("packages/core/src/catalog.data.ts")).toBe(2_000);
    expect(getSourceLineLimit("packages/engine/examples/demo/src/catalog.data.ts")).toBe(2_000);
    expect(getSourceLineLimit("README.md")).toBeUndefined();
  });

  test("counts physical lines consistently across line endings", () => {
    expect(countPhysicalLines("")).toBe(0);
    expect(countPhysicalLines("one")).toBe(1);
    expect(countPhysicalLines("one\ntwo\n")).toBe(2);
    expect(countPhysicalLines("one\r\ntwo\r\n")).toBe(2);
  });

  test("counts authored source files in their direct directory", () => {
    expect([...countSourceFilesByDirectory([
      { path: "packages/core/src/one.ts", lineCount: 1 },
      { path: "packages/core/src/two.test.ts", lineCount: 1 },
      { path: "packages/core/src/nested/three.ts", lineCount: 1 },
      { path: "packages/core/README.md", lineCount: 1 }
    ])]).toEqual([
      ["packages/core/src", 2],
      ["packages/core/src/nested", 1]
    ]);
  });

  test("uses the TypeScript AST to measure classes, methods, assigned functions, and TSX components", () => {
    const source = [
      "class Runtime {",
      "  update() {",
      "    return 1;",
      "  }",
      "}",
      "const helper = () => {",
      "  return 2;",
      "};",
      "function Panel() {",
      "  return <div />;",
      "}",
      "items.map(() => 1);"
    ].join("\n");
    const declarations = collectSourceDeclarations("apps/tool/src/panel.tsx", source);
    expect(declarations.map(({ id, lineCount }) => ({ id, lineCount }))).toEqual([
      { id: "apps/tool/src/panel.tsx#class:Runtime", lineCount: 5 },
      { id: "apps/tool/src/panel.tsx#function:Runtime.update", lineCount: 3 },
      { id: "apps/tool/src/panel.tsx#function:helper", lineCount: 3 },
      { id: "apps/tool/src/panel.tsx#component:Panel", lineCount: 3 }
    ]);
  });
});

describe("source structure baseline", () => {
  test("rejects a new oversized source file", () => {
    const violations = findSourceStructureViolations(
      [{ path: "packages/core/src/large.ts", lineCount: 1_001 }],
      baseline()
    );
    expect(violations).toEqual([
      "packages/core/src/large.ts is 1001 lines (limit 1000) and has no approved baseline exception"
    ]);
  });

  test("allows an unchanged exception but rejects growth and demands a downward ratchet", () => {
    const policy = baseline({ "packages/core/src/large.ts": exception(1_200) });
    expect(findSourceStructureViolations(
      [{ path: "packages/core/src/large.ts", lineCount: 1_200 }],
      policy
    )).toEqual([]);
    expect(findSourceStructureViolations(
      [{ path: "packages/core/src/large.ts", lineCount: 1_201 }],
      policy
    )[0]).toContain("grew to 1201 lines");
    expect(findSourceStructureViolations(
      [{ path: "packages/core/src/large.ts", lineCount: 1_100 }],
      policy
    )[0]).toContain("ratchet its baseline down from 1200");
  });

  test("requires stale exceptions to be removed", () => {
    const policy = baseline({
      "packages/core/src/deleted.ts": exception(1_100),
      "packages/core/src/small.ts": exception(1_100)
    });
    const violations = findSourceStructureViolations(
      [{ path: "packages/core/src/small.ts", lineCount: 900 }],
      policy
    );
    expect(violations).toEqual([
      "packages/core/src/small.ts is now 900 lines (limit 1000); remove its stale baseline exception",
      "packages/core/src/deleted.ts no longer exists; remove its stale baseline exception"
    ]);
  });

  test("ratchets reductions without approving growth or new exceptions", () => {
    const entries: SourceStructureEntry[] = [
      { path: "packages/core/src/large.ts", lineCount: 1_100 },
      { path: "packages/core/src/grew.ts", lineCount: 1_300 },
      { path: "packages/core/src/small.ts", lineCount: 900 },
      { path: "packages/core/src/new-large.ts", lineCount: 1_400 }
    ];
    const ratcheted = ratchetSourceStructureBaseline(entries, baseline({
      "packages/core/src/large.ts": exception(1_200),
      "packages/core/src/grew.ts": exception(1_250),
      "packages/core/src/small.ts": exception(1_100),
      "packages/core/src/deleted.ts": exception(1_100)
    }));
    expect(ratcheted.exceptions["packages/core/src/large.ts"]?.maxLines).toBe(1_100);
    expect(ratcheted.exceptions["packages/core/src/grew.ts"]?.maxLines).toBe(1_250);
    expect(ratcheted.exceptions["packages/core/src/small.ts"]).toBeUndefined();
    expect(ratcheted.exceptions["packages/core/src/deleted.ts"]).toBeUndefined();
    expect(ratcheted.exceptions["packages/core/src/new-large.ts"]).toBeUndefined();
  });

  test("caps directories at 25 source files and ratchets legacy crowded directories", () => {
    const entries = Array.from({ length: 27 }, (_, index) => ({
      path: `packages/core/src/file-${index}.ts`,
      lineCount: 1
    }));
    expect(findSourceStructureViolations(entries, baseline())[0]).toContain("contains 27 source files (limit 25)");

    const policy = baseline();
    policy.directoryExceptions["packages/core/src"] = directoryException(30);
    expect(findSourceStructureViolations(entries, policy)[0]).toContain("ratchet its directory baseline down from 30");
    expect(ratchetSourceStructureBaseline(entries, policy).directoryExceptions["packages/core/src"]?.maxFiles).toBe(27);

    policy.directoryExceptions["packages/core/src"] = directoryException(27);
    expect(findSourceStructureViolations([...entries, { path: "packages/core/src/grew.ts", lineCount: 1 }], policy)[0]).toContain("grew to 28 source files");

    expect(findSourceStructureViolations(entries.slice(0, 25), policy)[0]).toContain("remove its stale directory exception");
    expect(findSourceStructureViolations([], policy)[0]).toContain("no longer contains source files");
  });

  test("requires durable exception metadata", () => {
    expect(() => parseSourceStructureBaseline({
      version: 1,
      directoryExceptions: {},
      declarationExceptions: {},
      declarationWarningBaselines: {},
      declarationDeferrals: [],
      exceptions: {
        "packages/core/src/large.ts": { maxLines: 1_100, owner: "", reason: "reason", boundary: "boundary", removalTarget: "target" }
      }
    })).toThrow("needs non-empty owner");
  });

  test("warns at 200 declaration lines and enforces a ratcheted 400-line limit", () => {
    const warningDeclaration = {
      id: "packages/core/src/runtime.ts#function:prepare",
      path: "packages/core/src/runtime.ts",
      name: "prepare",
      kind: "function" as const,
      startLine: 1,
      lineCount: 201
    };
    expect(findSourceStructureWarnings([warningDeclaration], baseline())[0]).toContain("warning threshold 200");
    const warningPolicy = baseline();
    warningPolicy.declarationWarningBaselines[warningDeclaration.id] = exception(250);
    expect(findSourceStructureWarnings([warningDeclaration], warningPolicy)).toEqual([]);
    expect(findSourceStructureViolations([], warningPolicy, [{ ...warningDeclaration, lineCount: 251 }])[0]).toContain("grew to 251 lines");
    expect(findSourceStructureViolations([], warningPolicy, [{ ...warningDeclaration, lineCount: 200 }])[0]).toContain("remove its stale declaration warning baseline");
    expect(findSourceStructureViolations([], warningPolicy, [{ ...warningDeclaration, lineCount: 240 }])[0]).toContain("ratchet its declaration warning baseline down");

    const oversized = { ...warningDeclaration, lineCount: 401 };
    expect(findSourceStructureViolations([], baseline(), [oversized])[0]).toContain("no approved declaration exception");
    const policy = baseline();
    policy.declarationExceptions[oversized.id] = exception(450);
    expect(findSourceStructureViolations([], policy, [oversized])[0]).toContain("ratchet its declaration baseline down");
  });

  test("supports explicit staged declaration deferrals", () => {
    const policy = baseline();
    policy.declarationDeferrals = [{
      pathPrefix: "apps/deferred/",
      ...metadata
    }];
    const declaration = {
      id: "apps/deferred/client.ts#function:start",
      path: "apps/deferred/client.ts",
      name: "start",
      kind: "function" as const,
      startLine: 1,
      lineCount: 900
    };
    expect(findSourceStructureViolations([], policy, [declaration])).toEqual([]);
    expect(findSourceStructureWarnings([declaration], policy)).toEqual([]);
  });
});

test("collectExistingSourceEntries ignores non-source and missing files", async () => {
  const entries = await collectExistingSourceEntries(
    ["packages/core/src/one.ts", "README.md", "packages/core/src/missing.ts"],
    async (filePath) => {
      if (filePath.endsWith("missing.ts")) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return "one\ntwo\n";
    }
  );
  expect(entries).toEqual([{ path: "packages/core/src/one.ts", lineCount: 2 }]);
});
