import { expect, test } from "bun:test";
import { createSharedStore } from "./shared-store.ts";

test("shared store emits nested LWW patches and applies them on another peer", () => {
  let clock = 0;
  const a = createSharedStore({ players: { a: { color: "red" } } }, { peerId: "a", now: () => ++clock });
  const b = createSharedStore({ players: { a: { color: "red" } } }, { peerId: "b", now: () => ++clock });
  a.$subscribe((patch) => b.$applyPatch(patch));

  a.players.a.color = "blue";

  expect(b.players.a.color).toBe("blue");
});

test("shared store ignores stale patches for same path", () => {
  const store = createSharedStore({ score: 1 }, { peerId: "a" });

  store.$applyPatch({ path: ["score"], value: 10, timestamp: 2, peerId: "b" });
  store.$applyPatch({ path: ["score"], value: 3, timestamp: 1, peerId: "c" });

  expect(store.score).toBe(10);
});

test("shared store resolves equal timestamps by peer id on every peer", () => {
  const first = createSharedStore({ score: 0 }, { peerId: "local-a" });
  const second = createSharedStore({ score: 0 }, { peerId: "local-b" });
  const patchA = { path: ["score"], value: 1, timestamp: 10, peerId: "a" } as const;
  const patchB = { path: ["score"], value: 2, timestamp: 10, peerId: "b" } as const;

  first.$applyPatch(patchA);
  first.$applyPatch(patchB);
  second.$applyPatch(patchB);
  second.$applyPatch(patchA);

  expect(first.score).toBe(2);
  expect(second.score).toBe(2);
});

test("shared store path clocks cannot collide through delimiter characters", () => {
  const store = createSharedStore({ "a\u001fb": 0, a: { b: 0 } }, { peerId: "local" });

  store.$applyPatch({ path: ["a\u001fb"], value: 1, timestamp: 2, peerId: "remote" });
  store.$applyPatch({ path: ["a", "b"], value: 2, timestamp: 1, peerId: "remote" });

  expect(store["a\u001fb"]).toBe(1);
  expect(store.a.b).toBe(2);
});

test("shared store rejects unsafe and malformed remote patches", () => {
  const store = createSharedStore({ score: 1, payload: { safe: true } }, { peerId: "local" });
  const pollutionKey = "engineSharedStorePolluted";
  const unsafePayload = JSON.parse('{"nested":{"constructor":{"prototype":{"engineSharedStorePolluted":"yes"}}}}');

  store.$applyPatch({ path: ["__proto__", pollutionKey], value: "yes", timestamp: 1, peerId: "remote" });
  store.$applyPatch({ path: [], value: 10, timestamp: 2, peerId: "remote" });
  store.$applyPatch({ path: ["score"], value: 10, timestamp: Number.NaN, peerId: "remote" });
  store.$applyPatch({ path: ["payload"], value: unsafePayload, timestamp: 3, peerId: "remote" });
  store.$applyPatch({ path: ["payload"], value: () => "not cloneable", timestamp: 4, peerId: "remote" });

  expect(Reflect.get({}, pollutionKey)).toBeUndefined();
  expect(store.score).toBe(1);
  expect(store.payload).toEqual({ safe: true });
});

test("shared store rejects clocks that could exhaust future local writes", () => {
  const store = createSharedStore({ score: 0 }, { peerId: "local", now: () => 1 });

  expect(store.$applyPatch({ path: ["score"], value: 1, timestamp: Number.MAX_SAFE_INTEGER, peerId: "remote" })).toBe(false);
  expect(() => { store.score = 2; }).not.toThrow();
  expect(store.score).toBe(2);
});

test("shared store bounds remote paths and nested wire structures", () => {
  const store = createSharedStore<{ value: unknown }>({ value: null }, { peerId: "local", now: () => 1 });
  const path = Array.from({ length: 65 }, (_, index) => `part-${index}`);
  let nested: unknown = "leaf";
  for (let index = 0; index < 65; index += 1) nested = { next: nested };

  expect(store.$applyPatch({ path, value: 1, timestamp: 1, peerId: "remote" })).toBe(false);
  expect(store.$applyPatch({ path: ["value"], value: nested, timestamp: 1, peerId: "remote" })).toBe(false);
  expect(store.value).toBeNull();
});

test("shared store proxies preserve the path used to reach aliased objects", () => {
  const nested = { value: 0 };
  const store = createSharedStore({ first: nested, second: nested }, { peerId: "local", now: () => 1 });
  const paths: Array<readonly (string | number)[]> = [];
  store.$subscribe((patch) => paths.push(patch.path));

  void store.first.value;
  store.second.value = 2;

  expect(paths).toEqual([["second", "value"]]);
});

test("shared store snapshots replace missing keys without emitting patches", () => {
  const emitted: unknown[] = [];
  const store = createSharedStore<{ keep: number; remove?: number }>(
    { keep: 1, remove: 2 },
    { peerId: "local", onPatch: (patch) => emitted.push(patch) }
  );

  store.$applySnapshot({ state: { keep: 3 }, clocks: [] });

  expect(store.$snapshot()).toEqual({ keep: 3 });
  expect(emitted).toEqual([]);
});

test("shared store converges for overlapping parent and child patches regardless of arrival order", () => {
  const first = createSharedStore({ node: { x: 0, y: 0 } }, { peerId: "first" });
  const second = createSharedStore({ node: { x: 0, y: 0 } }, { peerId: "second" });
  const parent = { path: ["node"], value: { x: 1, y: 1 }, timestamp: 2, peerId: "a" } as const;
  const child = { path: ["node", "x"], value: 2, timestamp: 3, peerId: "b" } as const;

  first.$applyPatch(parent);
  first.$applyPatch(child);
  second.$applyPatch(child);
  second.$applyPatch(parent);

  expect(first.$snapshot()).toEqual({ node: { x: 2, y: 1 } });
  expect(second.$snapshot()).toEqual(first.$snapshot());
});

test("shared store snapshots carry replay data and preserve unseen newer local operations", () => {
  let time = 10;
  const source = createSharedStore({ node: { x: 0, y: 0 }, local: 0 }, { peerId: "source", now: () => ++time });
  source.node = { x: 1, y: 1 };
  source.node.x = 2;

  const target = createSharedStore({ node: { x: -1, y: -1 }, local: 0 }, { peerId: "target", now: () => ++time });
  target.local = 9;
  target.$applySnapshot(source.$exportSnapshot());

  expect(target.$snapshot()).toEqual({ node: { x: 2, y: 1 }, local: 9 });
  expect(target.$exportSnapshot().patches).toHaveLength(3);
});

test("shared store rejects values that cannot converge over its JSON transport", () => {
  expect(() => createSharedStore({ value: Number.NaN }, { peerId: "local" })).toThrow("wire-safe");
  expect(() => createSharedStore({ value: -0 }, { peerId: "local" })).toThrow("wire-safe");
  const store = createSharedStore<{ value: unknown }>({ value: 1 }, { peerId: "local", now: () => 1 });

  expect(() => {
    store.value = new Map([["key", "value"]]);
  }).toThrow("wire-safe");
  expect(store.value).toBe(1);
});

test("shared store reserves root API names and rejects inconsistent snapshot replay clocks", () => {
  expect(() => createSharedStore({ $snapshot: 1 }, { peerId: "local" })).toThrow("reserved API");
  const store = createSharedStore({ score: 0 }, { peerId: "local" });
  const applied = store.$applySnapshot({
    state: { score: 1 },
    base: { score: 0 },
    patches: [{ path: ["score"], value: 1, timestamp: 1, peerId: "remote" }],
    clocks: [{ path: ["score"], timestamp: 2, peerId: "remote" }]
  });

  expect(applied).toBe(false);
  expect(store.score).toBe(0);
  store.$applyPatch({ path: ["score"], value: 2, timestamp: 3, peerId: "remote" });
  expect(store.score).toBe(2);
});

test("canonical shared store snapshots require an exact patch for every clock", () => {
  const store = createSharedStore({ score: 0 }, { peerId: "local" });
  const applied = store.$applySnapshot({
    state: { score: 0 },
    base: { score: 0 },
    patches: [],
    clocks: [{ path: ["score"], timestamp: 2, peerId: "remote" }]
  });

  expect(applied).toBe(false);
  store.$applyPatch({ path: ["score"], value: 1, timestamp: 1, peerId: "remote" });
  expect(store.score).toBe(1);
});

test("legacy snapshots are authoritative full replacements of local operations", () => {
  const store = createSharedStore({ score: 0 }, { peerId: "local", now: () => 1 });
  store.score = 99;

  store.$applySnapshot({ state: { score: 2 }, clocks: [] });

  expect(store.score).toBe(2);
  expect(store.$exportSnapshot().patches).toEqual([]);
});

test("exported canonical snapshots materialize compacted legacy clocks as replay patches", () => {
  const source = createSharedStore({ score: 0 }, { peerId: "source" });
  expect(source.$applySnapshot({
    state: { score: 5 },
    clocks: [{ path: ["score"], timestamp: 2, peerId: "server" }]
  })).toBe(true);
  const snapshot = source.$exportSnapshot();
  const target = createSharedStore({ score: -1 }, { peerId: "target" });

  expect(snapshot.patches).toEqual([{ path: ["score"], value: 5, timestamp: 2, peerId: "server" }]);
  expect(target.$applySnapshot(snapshot)).toBe(true);
  expect(target.score).toBe(5);
});

test("shared store patch listeners are isolated after the state commits", () => {
  const calls: string[] = [];
  const store = createSharedStore({ score: 0 }, {
    peerId: "local",
    now: () => 1,
    onPatch: () => {
      calls.push("option");
      throw new Error("option failed");
    }
  });
  store.$subscribe(() => {
    calls.push("first");
    throw new Error("listener failed");
  });
  store.$subscribe(() => calls.push("second"));

  expect(() => {
    store.score = 1;
  }).not.toThrow();
  expect(store.score).toBe(1);
  expect(calls).toEqual(["option", "first", "second"]);
});

test("shared store rejects reflective mutations that bypass replicated patch clocks", () => {
  const store = createSharedStore({ nested: { value: 1 } }, { peerId: "local", now: () => 1 });

  expect(() => Object.defineProperty(store.nested, "value", { value: 2, enumerable: true })).toThrow();
  expect(() => Object.setPrototypeOf(store.nested, { injected: true })).toThrow();
  expect(() => Object.preventExtensions(store.nested)).toThrow();

  expect(store.$snapshot()).toEqual({ nested: { value: 1 } });
  expect(store.$exportSnapshot().patches).toEqual([]);
  store.nested.value = 3;
  expect(store.nested.value).toBe(3);
});

test("shared store wire validation rejects accessors without evaluating them", () => {
  let reads = 0;
  const hostile: Record<string, unknown> = {};
  Object.defineProperty(hostile, "value", {
    enumerable: true,
    get() {
      reads += 1;
      return 1;
    }
  });

  expect(() => createSharedStore(hostile, { peerId: "local" })).toThrow("wire-safe");
  expect(reads).toBe(0);
});
