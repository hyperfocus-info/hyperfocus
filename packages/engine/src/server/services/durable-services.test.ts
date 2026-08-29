import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";
import { SignedSessionAuthority } from "../operations/operations.ts";
import {
  createDurableMmoServices,
  createDurableServiceAuthAdapter,
  createDurableServiceBackup,
  createMemoryDurableServiceStore,
  restoreDurableServiceBackup,
} from "./durable-services.ts";
import { createSqliteDurableServiceStore } from "./durable-services-sqlite.ts";

describe("durable MMO services", () => {
  test("keeps concurrent economy transfers atomic and idempotent", async () => {
    const services = createDurableMmoServices(createMemoryDurableServiceStore(), { randomId: deterministicIds() });
    await services.economy.credit("alice", "gold", 1_000, "system", "seed-alice");
    await services.economy.credit("bob", "gold", 1_000, "system", "seed-bob");
    await Promise.all(Array.from({ length: 200 }, (_, index) => index % 2 === 0
      ? services.economy.transfer("alice", "bob", "gold", 1, `a-${index}`)
      : services.economy.transfer("bob", "alice", "gold", 1, `b-${index}`)));
    expect(await services.economy.balance("alice", "gold")).toBe(1_000);
    expect(await services.economy.balance("bob", "gold")).toBe(1_000);
    const first = await services.economy.transfer("alice", "bob", "gold", 25, "once");
    const replay = await services.economy.transfer("alice", "bob", "gold", 25, "once");
    expect(replay).toEqual(first);
    expect(await services.economy.balance("alice", "gold")).toBe(975);
    await expect(services.economy.transfer("alice", "bob", "gold", 26, "once")).rejects.toThrow("different input");
  });

  test("supports bounded inventory, guild, moderation, chat pagination and retention", async () => {
    let clock = 1_000;
    const services = createDurableMmoServices(createMemoryDurableServiceStore(), {
      now: () => clock++, randomId: deterministicIds(), maxChatMessagesPerChannel: 3, maxPageSize: 2,
    });
    await services.inventory.grant("alice", "potion", 2, { quality: "rare" }, "grant-potion");
    await services.inventory.grant("alice", "key", 1, undefined, "grant-key");
    expect((await services.inventory.list("alice", { limit: 1 })).nextCursor).toBeDefined();
    expect(await services.inventory.consume("alice", "potion", 1, "drink")).toBe(true);

    const guild = await services.guilds.create("Raiders", "alice", "create");
    await services.guilds.join(guild.id, "bob", "join-bob");
    await services.guilds.join(guild.id, "cara", "join-cara");
    expect((await services.guilds.members(guild.id, { limit: 2 })).nextCursor).toBeDefined();
    expect((await services.guilds.get(guild.id))?.memberCount).toBe(3);
    expect(await services.guilds.leave(guild.id, "cara", "leave-cara")).toBe(true);

    for (let index = 0; index < 5; index += 1) await services.chat.send("global", "alice", `message ${index}`, `chat-${index}`);
    const history = await services.chat.history("global", { limit: 2 });
    expect(history.items.map((message) => message.text)).toEqual(["message 4", "message 3"]);
    expect(history.nextCursor).toBeDefined();

    const ban = await services.moderation.record({ targetId: "alice", moderatorId: "mod", kind: "ban", reason: "abuse" }, "ban-alice");
    expect(await services.moderation.isBanned("alice")).toBe(true);
    await expect(services.chat.send("global", "alice", "blocked", "blocked-chat")).rejects.toThrow("is banned");
    expect(await services.moderation.revoke("alice", ban.id, "mod", "revoke-ban")).toBe(true);
    expect(await services.moderation.isBanned("alice")).toBe(false);
    expect((await services.audit.list({ limit: 2 })).nextCursor).toBeDefined();
  });

  test("persists reconnect-safe matchmaking handoff and checksum backup", async () => {
    let clock = 10_000;
    const source = createMemoryDurableServiceStore();
    const services = createDurableMmoServices(source, { now: () => clock, randomId: deterministicIds() });
    const ticket = await services.matchmaking.enqueue("alice", "dungeon", { idempotencyKey: "enqueue-1", attributes: { level: 9 } });
    const reconnect = await services.matchmaking.enqueue("alice", "dungeon", { idempotencyKey: "enqueue-2", attributes: { level: 9 } });
    expect(reconnect.id).toBe(ticket.id);
    const [matched] = await services.matchmaking.match("dungeon", "room-7", 1);
    expect(matched?.handoff?.token).toBeString();

    const backup = await createDurableServiceBackup(source, clock);
    const restoredStore = createMemoryDurableServiceStore();
    await restoreDurableServiceBackup(restoredStore, backup);
    const restored = createDurableMmoServices(restoredStore, { now: () => clock, randomId: deterministicIds() });
    expect((await restored.matchmaking.ticketForPlayer("alice"))?.handoff?.roomId).toBe("room-7");
    const claim = await restored.matchmaking.claim("alice", matched!.id, matched!.handoff!.token, "claim-1");
    expect(claim).toEqual({ ok: true, roomId: "room-7", ticketId: matched!.id });
    expect(await restored.matchmaking.claim("alice", matched!.id, matched!.handoff!.token, "claim-1")).toEqual(claim);

    const tampered = new TextEncoder().encode(new TextDecoder().decode(backup).replace("room-7", "room-8"));
    await expect(restoreDurableServiceBackup(restoredStore, tampered)).rejects.toThrow("checksum");
    expect((await restored.matchmaking.ticketForPlayer("alice"))?.handoff?.roomId).toBe("room-7");
  });

  test("rolls back failed transactions and rejects signed identities for banned accounts", async () => {
    const store = createMemoryDurableServiceStore();
    await expect(store.transaction((tx) => { tx.put("wallet", "alice/gold", { amount: 10 }); throw new Error("fault"); })).rejects.toThrow("fault");
    expect(await store.exportRecords()).toEqual([]);
    await expect(store.transaction(async (tx) => { tx.put("wallet", "alice/gold", { amount: 10 }); })).rejects.toThrow("must be synchronous");
    expect(await store.exportRecords()).toEqual([]);

    const services = createDurableMmoServices(store, { randomId: deterministicIds() });
    await services.moderation.record({ targetId: "alice", moderatorId: "mod", kind: "ban" }, "ban");
    const authority = new SignedSessionAuthority({ issuer: "test", audience: "game", keys: [{ id: "key", secret: new Uint8Array(32).fill(7) }], activeKeyId: "key" });
    const auth = createDurableServiceAuthAdapter(authority, services);
    expect(await auth.verify(await authority.issue("alice"))).toEqual({ ok: false, reason: "account banned" });
    expect(await auth.verify(await authority.issue("bob"))).toMatchObject({ ok: true, userId: "bob" });
  });

  test("rejects impossible restored domain states before replacing live records", async () => {
    const store = createMemoryDurableServiceStore();
    const services = createDurableMmoServices(store, { randomId: deterministicIds() });
    await services.inventory.grant("alice", "potion", 1, undefined, "seed");
    const before = await store.exportRecords();

    await expect(store.replaceRecordsAtomic([{
      bucket: "ticket",
      key: "ticket-1",
      value: {
        id: "ticket-1",
        playerId: "alice",
        queue: "dungeon",
        state: "waiting",
        createdAt: 1,
        expiresAt: 2,
        attributes: {},
        handoff: { roomId: "room-1", token: "unexpected", expiresAt: 2 }
      }
    }])).rejects.toThrow("cannot contain a handoff");
    expect(await store.exportRecords()).toEqual(before);

    await expect(store.replaceRecordsAtomic([{
      bucket: "guild-member",
      key: "missing/alice",
      value: { guildId: "missing", accountId: "alice", role: "owner", joinedAt: 1 }
    }])).rejects.toThrow("missing guild");
    expect(await store.exportRecords()).toEqual(before);
  });

  test("SQLite survives reopen, commits transfers atomically, and surfaces corruption", async () => {
    const directory = mkdtempSync(join(tmpdir(), "hyperfocus-durable-services-"));
    const path = join(directory, "services.sqlite");
    try {
      let store = createSqliteDurableServiceStore({ path });
      let services = createDurableMmoServices(store, { randomId: deterministicIds() });
      await services.economy.credit("alice", "gold", 50, "system", "seed");
      await services.economy.transfer("alice", "bob", "gold", 20, "transfer");
      const peerStore = createSqliteDurableServiceStore({ path });
      const peerServices = createDurableMmoServices(peerStore, { randomId: deterministicIds() });
      await Promise.all(Array.from({ length: 100 }, (_, index) => index % 2 === 0
        ? services.economy.transfer("alice", "bob", "gold", 1, `sqlite-a-${index}`)
        : peerServices.economy.transfer("bob", "alice", "gold", 1, `sqlite-b-${index}`)));
      const [guildA, guildB] = await Promise.all([
        services.guilds.create("A", "alice", "guild-a"),
        peerServices.guilds.create("B", "bob", "guild-b"),
      ]);
      expect(guildA.id).not.toBe(guildB.id);
      peerStore.close();
      await expect(store.transaction((tx) => { tx.put("wallet", "alice/gold", { amount: 0 }); throw new Error("rollback"); })).rejects.toThrow("rollback");
      store.close();

      store = createSqliteDurableServiceStore({ path });
      services = createDurableMmoServices(store, { randomId: deterministicIds() });
      expect(await services.economy.balance("alice", "gold")).toBe(30);
      expect(await services.economy.balance("bob", "gold")).toBe(20);
      store.close();

      const raw = new Database(path);
      raw.run("update durable_records set value = '{bad json' where bucket = 'wallet' and key = 'alice/gold'");
      raw.close();
      store = createSqliteDurableServiceStore({ path });
      services = createDurableMmoServices(store, { randomId: deterministicIds() });
      await expect(services.economy.balance("alice", "gold")).rejects.toThrow("corrupt JSON");
      store.close();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});

function deterministicIds() {
  let value = 0;
  return () => `deterministic-${++value}`;
}
