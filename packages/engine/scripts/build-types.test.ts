import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { copyRuntimeArtifacts, rewriteDeclarationImports } from "./build-types.ts";

describe("declaration package build", () => {
  test("preserves runtime artifacts without reviving stale declarations", () => {
    const root = mkdtempSync(join(tmpdir(), "catalog-engine-types-"));
    const source = join(root, "source");
    const target = join(root, "target");
    try {
      mkdirSync(source);
      mkdirSync(target);
      writeFileSync(join(source, "runtime.js"), "export const version = 'old-runtime';\n");
      writeFileSync(join(source, "entry.d.ts"), "export declare const version: 'old';\n");
      writeFileSync(join(source, "entry.d.ts.map"), "old-map");
      writeFileSync(join(target, "entry.d.ts"), "export declare const version: 'new';\n");
      writeFileSync(join(target, "entry.d.ts.map"), "new-map");

      copyRuntimeArtifacts(source, target);

      expect(readFileSync(join(target, "runtime.js"), "utf8")).toContain("old-runtime");
      expect(readFileSync(join(target, "entry.d.ts"), "utf8")).toContain("'new'");
      expect(readFileSync(join(target, "entry.d.ts.map"), "utf8")).toBe("new-map");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("rewrites static, side-effect, and dynamic TypeScript module specifiers", () => {
    const root = mkdtempSync(join(tmpdir(), "catalog-engine-specifiers-"));
    try {
      const declarationPath = join(root, "entry.d.ts");
      writeFileSync(
        declarationPath,
        [
          'export { value } from "./value.ts";',
          'import "./setup.ts";',
          'export type Lazy = typeof import("./lazy.ts");',
        ].join("\n"),
      );

      rewriteDeclarationImports(root);

      expect(readFileSync(declarationPath, "utf8")).toBe(
        [
          'export { value } from "./value.js";',
          'import "./setup.js";',
          'export type Lazy = typeof import("./lazy.js");',
        ].join("\n"),
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
