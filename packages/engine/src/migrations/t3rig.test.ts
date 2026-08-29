import { expect, test } from "bun:test";
import { createEmptyT3RigSemanticMap, type T3RigDocument } from "../motion/rig.ts";
import { migrateT3RigDocument, migrateT3RigText } from "./t3rig.ts";

function currentDocument(): T3RigDocument {
  return {
    schemaVersion: 1,
    mapperVersion: "1.0.0",
    humanoidPreset: "humanoid-v1",
    assetFingerprint: { algorithm: "test", value: "asset" },
    skinFingerprint: { algorithm: "test", value: "skin" },
    normalization: {
      sourceUp: "+y",
      sourceForward: "+z",
      sourceHandedness: "right",
      metersPerUnit: 1,
      sourceToCanonicalRotation: [0, 0, 0, 1],
    },
    semantics: createEmptyT3RigSemanticMap(),
    tags: {},
    overrides: {},
  };
}

test("current t3rig documents migrate in memory without mutating caller data", () => {
  const input = currentDocument();
  const before = JSON.stringify(input);
  const result = migrateT3RigDocument(input);
  expect(result.migrated).toBe(false);
  expect(result.applied).toEqual([]);
  expect(result.document).not.toBe(input);
  result.document.mapperVersion = "changed";
  expect(JSON.stringify(input)).toBe(before);
});

test("registered migrations advance one version and cannot mutate original input", () => {
  const input = { ...currentDocument(), schemaVersion: 0 };
  const before = JSON.stringify(input);
  const result = migrateT3RigDocument(input, {
    migrations: [{
      id: "draft-to-v1",
      fromVersion: 0,
      toVersion: 1,
      migrate(document) {
        expect(Reflect.set(document, "schemaVersion", 1)).toBe(true);
        return document;
      },
    }],
  });
  expect(result.migrated).toBe(true);
  expect(result.applied).toEqual(["draft-to-v1"]);
  expect(result.document.schemaVersion).toBe(1);
  expect(JSON.stringify(input)).toBe(before);
});

test("migrations reject missing paths, future files, and malformed versions", () => {
  expect(() => migrateT3RigDocument({ ...currentDocument(), schemaVersion: 0 })).toThrow(/no t3rig migration path/);
  expect(() => migrateT3RigDocument({ ...currentDocument(), schemaVersion: 2 })).toThrow(/newer than supported/);
  expect(() => migrateT3RigDocument({ ...currentDocument(), schemaVersion: Number.NaN })).toThrow(/finite JSON numbers/);
});

test("text migration returns canonical newline-terminated JSON", () => {
  const input = JSON.stringify(currentDocument());
  const output = migrateT3RigText(input);
  expect(output.endsWith("\n")).toBe(true);
  expect(output.indexOf('"assetFingerprint"')).toBeLessThan(output.indexOf('"schemaVersion"'));
});
