import { describe, expect, test } from "bun:test";
import { normalizeWorkspacePath, resolveWorkspacePath } from "./path-policy";

describe("workspace path policy", () => {
  test("normalizes separators and safe dot segments", () => {
    expect(normalizeWorkspacePath("src\\features/./chat.ts")).toBe("src/features/chat.ts");
    expect(normalizeWorkspacePath("src/shared/../index.ts")).toBe("src/index.ts");
  });

  test("rejects absolute paths and traversal", () => {
    for (const path of ["../secret", "a/../../secret", "/etc/passwd", "C:\\secret", "C:secret", "\\\\server\\share"]) {
      expect(() => normalizeWorkspacePath(path)).toThrow();
    }
  });

  test("rejects portable-host aliases and unsafe segments", () => {
    for (const path of ["save.dat:metadata", "src/CON", "src/com1.txt", "src/trailing. ", `src/${"x".repeat(256)}`]) {
      expect(() => normalizeWorkspacePath(path)).toThrow();
    }
  });

  test("resolves inside Windows and POSIX roots", () => {
    expect(resolveWorkspacePath("C:\\repo", "src/index.ts")).toBe("C:\\repo\\src\\index.ts");
    expect(resolveWorkspacePath("/repo/", "src/index.ts")).toBe("/repo/src/index.ts");
  });
});
