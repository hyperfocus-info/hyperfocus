import { expect, test } from "bun:test";
import {
  BrowserSaveStorageError,
  IndexedDbSaveStorage,
  normalizeBrowserSaveStorageError,
} from "./browser.ts";

test("browser saves expose quota exhaustion as a stable delegated error", () => {
  const cause = new DOMException("disk full", "QuotaExceededError");
  const error = normalizeBrowserSaveStorageError(cause);
  expect(error).toBeInstanceOf(BrowserSaveStorageError);
  expect(error.code).toBe("quota-exceeded");
  expect(error.cause).toBe(cause);
});

test("browser save construction reports unavailable IndexedDB", () => {
  expect(() => new IndexedDbSaveStorage({ indexedDB: undefined })).toThrow(BrowserSaveStorageError);
});
