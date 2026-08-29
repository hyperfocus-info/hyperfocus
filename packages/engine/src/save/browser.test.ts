import { expect, test } from "bun:test";
import {
  isBrowserSaveStorageError,
  createIndexedDbSaveStorage,
  normalizeBrowserSaveStorageError,
} from "./browser.ts";

test("browser saves expose quota exhaustion as a stable delegated error", () => {
  const cause = new DOMException("disk full", "QuotaExceededError");
  const error = normalizeBrowserSaveStorageError(cause);
  expect(isBrowserSaveStorageError(error)).toBe(true);
  expect(error.code).toBe("quota-exceeded");
  expect(error.cause).toBe(cause);
});

test("browser save construction reports unavailable IndexedDB", () => {
  expect(() => createIndexedDbSaveStorage({ indexedDB: undefined })).toThrow("IndexedDB is unavailable");
});
