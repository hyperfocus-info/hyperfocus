import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  createProviderCredentialStore,
  createMemoryOnlyProviderCredentialStore,
  resolveProviderCredentialPath
} from "./provider-credential-store";
import { createHarnessTestTempPath } from "./test-support/test-temp-root";

function createTempDbPath() {
  return createHarnessTestTempPath("credential-store", ".sqlite");
}

test("unsupported platforms use a non-persistent memory-only credential store", () => {
  const dbPath = createTempDbPath();
  const store = createProviderCredentialStore(dbPath, "linux");

  expect(store.persistence).toBe("memory-only");
  store.set("openai", "sk-session-only");
  expect(store.get("openai")).toBe("sk-session-only");
  expect(createProviderCredentialStore(dbPath, "linux").get("openai")).toBeUndefined();
});

test("memory-only credentials preserve set, presence, and clear semantics", () => {
  const store = createMemoryOnlyProviderCredentialStore();

  expect(store.get("google")).toBeUndefined();
  store.set("google", "google-secret");
  expect(store.get("google")).toBe("google-secret");
  store.delete("google");
  expect(store.get("google")).toBeUndefined();
});

test("Windows persistence is DPAPI-protected and contains no plaintext secret", () => {
  if (process.platform !== "win32") {
    return;
  }

  const dbPath = createTempDbPath();
  const secret = `sk-dpapi-${crypto.randomUUID()}`;
  const store = createProviderCredentialStore(dbPath, "win32");
  store.set("openai", secret);
  store.set("google", `${secret}-google`);

  const credentialFile = readFileSync(resolveProviderCredentialPath(dbPath), "utf8");
  expect(credentialFile).not.toContain(secret);
  expect(credentialFile).toContain("windows-dpapi-current-user");
  expect(createProviderCredentialStore(dbPath, "win32").get("openai")).toBe(secret);
  expect(createProviderCredentialStore(dbPath, "win32").get("google")).toBe(`${secret}-google`);

  store.delete("openai");
  expect(store.get("openai")).toBeUndefined();
  expect(store.get("google")).toBe(`${secret}-google`);
});
