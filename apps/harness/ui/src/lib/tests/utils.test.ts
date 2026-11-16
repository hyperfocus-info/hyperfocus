import { expect, test } from "bun:test";
import { isAbsolutePath, isPathPrefixMatch, normalizePathForComparison } from "../utils";

test("project paths accept both Windows separators and reject drive-relative paths", () => {
  for (const value of ["C:/Users/work", "C:\\Users\\work", "\\\\server\\share", "/tmp/work"]) expect(isAbsolutePath(value)).toBe(true);
  for (const value of ["C:work", "relative/file", ""]) expect(isAbsolutePath(value)).toBe(false);
  expect(normalizePathForComparison("C:\\Users\\work\\")).toBe("C:/Users/work");
  expect(isPathPrefixMatch("C:/Users/", "C:\\Users\\work")).toBe(true);
});
