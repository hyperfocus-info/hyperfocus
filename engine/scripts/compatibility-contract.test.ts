import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type ExportTarget = { types?: string; import?: string; default?: string };
type Contract = {
  package: string;
  line: string;
  stable: Record<string, ExportTarget>;
  experimental: Record<string, ExportTarget>;
};

const root = join(import.meta.dir, "..");

test("the 0.1 public package contract classifies and preserves every entrypoint", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    name: string;
    version: string;
    exports: Record<string, ExportTarget>;
  };
  const contract = JSON.parse(readFileSync(join(root, "docs", "public-api-v0.1.json"), "utf8")) as Contract;
  expect(manifest.name).toBe(contract.package);
  expect(manifest.version.startsWith(`${contract.line}.`)).toBe(true);

  const classified = { ...contract.stable, ...contract.experimental };
  expect(Object.keys(classified).sort()).toEqual(Object.keys(manifest.exports).sort());
  expect(new Set([...Object.keys(contract.stable), ...Object.keys(contract.experimental)]).size).toBe(Object.keys(classified).length);
  for (const [entrypoint, expected] of Object.entries(classified)) {
    expect(manifest.exports[entrypoint]).toEqual(expected);
  }
});

test("stable server operations remain on the protected entrypoint", () => {
  const source = readFileSync(join(root, "src", "server", "index.ts"), "utf8");
  for (const name of [
    "SignedSessionAuthority",
    "SessionReplayStore",
    "createEncryptedPortablePersistenceBackup",
    "restoreEncryptedPortablePersistenceBackup",
    "createGracefulDrainController",
    "createServerOperations",
  ]) expect(source).toContain(name);
});
