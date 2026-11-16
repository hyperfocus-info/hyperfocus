import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readPackageManifest, readPublicApiContract } from "./smoke/json-boundaries.ts";
import * as starterFacade from '@hyperfocus/engine/tooling/create-project';
import * as starterImplementation from '../tooling/create-project-runtime.ts';

const root = join(import.meta.dir, "..");

test('starter source facade preserves names while installed resolution uses bundled artifacts', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const config = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8'));
  expect(manifest.imports['#project-starter']).toEqual({ types: './dist/tooling/create-project-runtime.d.ts', default: './dist/tooling/create-project.js' });
  expect(config.compilerOptions.paths['#project-starter']).toEqual(['./tooling/create-project-runtime.ts']);
  expect(manifest.files).toContain('tooling/create-project.ts');expect(manifest.files).not.toContain('tooling/create-project-runtime.ts');
  expect(Object.keys(starterFacade).sort()).toEqual(Object.keys(starterImplementation).sort());
  expect(starterFacade.createStarterProject('top-down', 'Facade', '2026-01-01T00:00:00Z')).toEqual(starterImplementation.createStarterProject('top-down', 'Facade', '2026-01-01T00:00:00Z'));
});

test("the 0.0 public package contract classifies and preserves every entrypoint", () => {
  const manifest = readPackageManifest(join(root, "package.json"));
  const contract = readPublicApiContract(join(root, "docs", "public-api-v0.0.json"));
  if (!manifest.exports) throw new Error("Engine package manifest must declare exports.");
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
