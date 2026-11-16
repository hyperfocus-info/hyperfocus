import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSharedAiPreferencesStore } from "./store";
import { readStoredBytes } from "@hyperfocus/serialization";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function isolatedPath() {
  const directory = mkdtempSync(path.join(tmpdir(), "hyperfocus-ai-preferences-"));
  directories.push(directory);
  return path.join(directory, "preferences.json");
}

test("independent stores read current disk values and replacements remove old defaults", () => {
  const filePath = isolatedPath();
  const first = createSharedAiPreferencesStore({ filePath });
  const second = createSharedAiPreferencesStore({ filePath });
  expect(first.read()).toEqual({ version: 1 });
  first.write({ version: 1, providerId: "google", reasoning: "high" });
  expect(second.read()).toEqual({ version: 1, providerId: "google", reasoning: "high" });
  second.write({ version: 1, reasoning: "low" });
  expect(first.read()).toEqual({ version: 1, reasoning: "low" });
  expect(readdirSync(path.dirname(filePath))).toEqual(["preferences.json"]);
});

test("malformed persisted defaults fail visibly while invalid writes preserve valid data", () => {
  const filePath = isolatedPath();
  const store = createSharedAiPreferencesStore({ filePath });
  store.write({ version: 1, providerId: "openai" });
  expect(() => store.write({ version: 1, apiKey: "secret" })).toThrow();
  expect(store.read()).toEqual({ version: 1, providerId: "openai" });
  for (const content of ["{broken", JSON.stringify({ version: 1, providerId: "invalid" })]) {
    writeFileSync(filePath, content);
    expect(() => store.read()).toThrow("Invalid shared AI preferences");
  }
});

test("retired design preference is ignored on read and removed on the next explicit write", () => {
  const filePath = isolatedPath();
  const legacy = { version: 1, providerId: "google", reasoning: "high", designGuidance: "none" };
  writeFileSync(filePath, JSON.stringify(legacy));
  const store = createSharedAiPreferencesStore({ filePath });
  const current = store.read();
  expect(current).toEqual({ version: 1, providerId: "google", reasoning: "high" });
  expect(JSON.parse(readFileSync(filePath, "utf8"))).toEqual(legacy);
  store.write(current);
  expect(readStoredBytes(readFileSync(filePath))).toEqual(current);
});
