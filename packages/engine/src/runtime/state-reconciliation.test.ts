import { expect, test } from "bun:test";
import { applyStateRepairPatch, checksumBytes, createStateChecksumHistory } from "./state-reconciliation.ts";

type Entity = { id: string; x: number; hp: number };
const encoder = new TextEncoder();
const options = {
  capacity: 2,
  getId: (entity: Entity) => entity.id,
  encodeEntity: (entity: Entity) => encoder.encode(`${entity.x}:${entity.hp}`),
  cloneEntity: (entity: Entity) => ({ ...entity })
};

test("hierarchical state checksums isolate and repair divergent entities", () => {
  const authority = createStateChecksumHistory(options);
  const client = createStateChecksumHistory(options);
  const authoritative = new Map<string, Entity>([
    ["a", { id: "a", x: 10, hp: 8 }],
    ["b", { id: "b", x: 20, hp: 9 }]
  ]);
  const stale = new Map<string, Entity>([
    ["a", { id: "a", x: 9, hp: 8 }],
    ["orphan", { id: "orphan", x: 0, hp: 1 }]
  ]);
  authority.record(12, authoritative.values());
  const staleManifest = client.record(12, stale.values());

  expect(authority.diff(staleManifest)).toEqual({ matches: false, changed: ["a"], localOnly: ["b"], remoteOnly: ["orphan"] });
  const patch = authority.patchFor(staleManifest)!;
  expect(patch.upserts.map((entry) => entry.id)).toEqual(["a", "b"]);
  expect(patch.removals).toEqual(["orphan"]);
  applyStateRepairPatch(stale, patch, (entity) => ({ ...entity }));

  expect(client.record(12, stale.values()).root).toBe(authority.manifest(12)!.root);
  expect(stale).toEqual(authoritative);
});

test("state checksum history is bounded and frame comparisons are strict", () => {
  const history = createStateChecksumHistory(options);
  history.record(1, []);
  history.record(2, []);
  history.record(3, []);
  expect(history.size()).toBe(2);
  expect(history.manifest(1)).toBeUndefined();
  expect(() => history.diff({ frame: 2, root: 0, entities: [{ id: "x", checksum: 1 }] })?.matches).not.toThrow();
  expect(() => history.record(-1, [])).toThrow("frame");
  expect(() => history.diff({ frame: 3, root: Number.NaN, entities: [] })).toThrow("root");
  expect(() => history.diff({ frame: 3, root: 0, entities: [{ id: "x", checksum: 1 }, { id: "x", checksum: 2 }] })).toThrow("duplicate");
});

test("checksumBytes exposes stable unsigned CRC-32", () => {
  expect(checksumBytes(encoder.encode("123456789"))).toBe(0xcbf43926);
});
