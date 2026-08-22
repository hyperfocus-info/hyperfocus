import { describe, expect, test } from "bun:test";
import {
  InMemorySaveStorage,
  SaveMigrationRegistry,
  SaveProfileStore,
  canonicalSaveJson,
  createSaveProfile,
  exportSaveProfile,
  findSaveSlot,
  importSaveProfile,
  migrateSaveProfile,
  withSaveSlot,
  withoutSaveSlot,
} from "./index.ts";

describe("save profiles", () => {
  test("encodes deterministic, checksummed named-slot profiles", async () => {
    let profile = createSaveProfile("com.example.game", "player-one", 100);
    profile = withSaveSlot(profile, "z-last", { score: 20, nested: { z: false, a: true } }, 2, 120);
    profile = withSaveSlot(profile, "a-first", { area: "dock" }, 2, 110);

    const encodedA = await exportSaveProfile(profile);
    const encodedB = await exportSaveProfile({ ...profile, slots: [...profile.slots].reverse() });
    expect(encodedA).toEqual(encodedB);
    expect(new TextDecoder().decode(encodedA).endsWith("\n")).toBe(true);

    const restored = await importSaveProfile(encodedA);
    expect(restored.slots.map((slot) => slot.name)).toEqual(["a-first", "z-last"]);
    expect(findSaveSlot(restored, "z-last")?.data).toEqual({ nested: { a: true, z: false }, score: 20 });
  });

  test("detects payload tampering before returning data", async () => {
    const profile = withSaveSlot(createSaveProfile("game", "one", 10), "manual", { lives: 3 }, 0, 11);
    const text = new TextDecoder().decode(await exportSaveProfile(profile));
    await expect(importSaveProfile(text.replace('"lives":3', '"lives":9'))).rejects.toThrow("checksum verification failed");
  });

  test("supports immutable named slot replacement and removal", () => {
    const empty = createSaveProfile("game", "one", 10);
    const first = withSaveSlot(empty, "manual", { level: 1 }, 0, 11);
    const replaced = withSaveSlot(first, "manual", { level: 2 }, 0, 12);
    const removed = withoutSaveSlot(replaced, "manual", 13);
    expect(empty.slots).toHaveLength(0);
    expect(first.slots[0].data).toEqual({ level: 1 });
    expect(replaced.slots).toHaveLength(1);
    expect(replaced.revision).toBe(2);
    expect(removed.slots).toHaveLength(0);
    expect(removed.revision).toBe(3);
  });

  test("runs every migration step sequentially and rejects gaps or future saves", () => {
    const migrations = new SaveMigrationRegistry()
      .register(0, (data) => ({ ...(data as Record<string, never>), coins: 1 }))
      .register(1, (data) => ({ ...(data as Record<string, never>), region: "north" }));
    const old = withSaveSlot(createSaveProfile("game", "one", 10), "auto", { hp: 5 }, 0, 11);
    const migrated = migrateSaveProfile(old, 2, migrations);
    expect(migrated.slots[0]).toMatchObject({ dataVersion: 2, data: { coins: 1, hp: 5, region: "north" } });
    expect(() => new SaveMigrationRegistry().register(0, (data) => data).register(0, (data) => data)).toThrow("already registered");
    expect(() => migrateSaveProfile(old, 2, new SaveMigrationRegistry().register(0, (data) => data))).toThrow("Missing save migration from version 1");
    expect(() => migrateSaveProfile(withSaveSlot(createSaveProfile("game", "future", 1), "slot", {}, 3, 2), 2, migrations)).toThrow("newer than supported");
  });

  test("bounds JSON bytes, depth, nodes, names, and slot count", async () => {
    expect(() => canonicalSaveJson({ one: { two: true } }, { maxDepth: 1 })).toThrow("depth limit");
    expect(() => canonicalSaveJson([1, 2, 3], { maxNodes: 3 })).toThrow("node limit");
    expect(() => createSaveProfile("game\nname", "one", 0)).toThrow("control characters");
    const profile = withSaveSlot(createSaveProfile("game", "one", 0), "first", {}, 0, 1, { maxSlots: 1 });
    expect(() => withSaveSlot(profile, "second", {}, 0, 2, { maxSlots: 1 })).toThrow("slot limit");
    await expect(exportSaveProfile(profile, { maxBytes: 32 })).rejects.toThrow("byte limit");
  });

  test("rejects cycles, accessors, non-finite numbers, and sparse arrays", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => canonicalSaveJson(cycle)).toThrow("cycles");
    expect(() => canonicalSaveJson({ value: Number.NaN })).toThrow("finite");
    const accessor = Object.defineProperty({}, "secret", { enumerable: true, get: () => 1 });
    expect(() => canonicalSaveJson(accessor)).toThrow("accessor");
    expect(() => canonicalSaveJson(new Array(1))).toThrow("dense");
  });
});

describe("atomic save storage and profile store", () => {
  test("serializes concurrent named-slot writes without losing either update", async () => {
    const storage = new InMemorySaveStorage();
    let time = 100;
    const store = new SaveProfileStore(storage, "game", { clock: () => time++ });
    await Promise.all([
      store.saveSlot("player", "auto", { x: 1 }),
      store.saveSlot("player", "manual", { x: 2 }),
    ]);
    const profile = await store.loadProfile("player");
    expect(profile?.slots.map((slot) => slot.name)).toEqual(["auto", "manual"]);
    expect(profile?.revision).toBe(2);
  });

  test("migrates old slots on load and on the next atomic write", async () => {
    const storage = new InMemorySaveStorage();
    const oldStore = new SaveProfileStore(storage, "game", { clock: () => 10 });
    await oldStore.saveSlot("player", "auto", { score: 4 });
    const migrations = new SaveMigrationRegistry().register(0, (data) => ({ ...(data as Record<string, never>), migrated: true }));
    const currentStore = new SaveProfileStore(storage, "game", { currentDataVersion: 1, migrations, clock: () => 20 });
    expect((await currentStore.loadSlot("player", "auto"))?.data).toEqual({ migrated: true, score: 4 });
    await currentStore.saveSlot("player", "manual", { score: 8 });
    const persisted = await currentStore.loadProfile("player");
    expect(persisted?.slots.every((slot) => slot.dataVersion === 1)).toBe(true);
  });

  test("exports and imports explicitly without accidental overwrite", async () => {
    const source = new SaveProfileStore(new InMemorySaveStorage(), "game", { clock: () => 5 });
    await source.saveSlot("player", "manual", { complete: true });
    const exported = await source.exportProfile("player");
    const destination = new SaveProfileStore(new InMemorySaveStorage(), "game");
    await destination.importProfile(exported);
    expect((await destination.loadSlot("player", "manual"))?.data).toEqual({ complete: true });
    await expect(destination.importProfile(exported)).rejects.toThrow("already exists");
    await destination.importProfile(exported, true);
    await expect(new SaveProfileStore(new InMemorySaveStorage(), "other").importProfile(exported)).rejects.toThrow("belongs to game");
  });

  test("copies adapter buffers across the storage boundary", async () => {
    const storage = new InMemorySaveStorage();
    const source = new Uint8Array([1, 2, 3]);
    await storage.updateAtomic("key", async () => source);
    source[0] = 9;
    const first = await storage.read("key");
    expect(first).toEqual(new Uint8Array([1, 2, 3]));
    first![1] = 9;
    expect(await storage.read("key")).toEqual(new Uint8Array([1, 2, 3]));
  });
});
