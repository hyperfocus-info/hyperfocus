import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProtocolMessage } from "../protocol/messages.ts";
import {
  createFleetManager,
  createMemoryAccountBackend,
  createMmoGameplayServices,
  createPersistenceAdapter,
  createServerPhysicsWorld,
  createSqlitePersistenceAdapter,
  createWebTransportMessageAdapter,
  createWebTransportWelcome
} from "./index.ts";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

test("account backend creates accounts, logs in, verifies sessions, and bans users", async () => {
  const accounts = createMemoryAccountBackend({ now: () => 10 });
  const account = await accounts.createAccount({ username: "Alice", password: "secret", displayName: "Alice" });
  const login = await accounts.login("alice", "secret");

  expect(account.username).toBe("alice");
  expect(login.ok).toBe(true);
  await expect(accounts.verify(login.sessionId!)).resolves.toMatchObject({ ok: true, userId: account.id });
  await expect(accounts.verify(`account:${account.id}`)).resolves.toMatchObject({ ok: false, reason: "unknown session" });

  await accounts.setBanned(account.id, true);
  await expect(accounts.verify(login.sessionId!)).resolves.toMatchObject({ ok: false, reason: "account banned" });
  await accounts.setBanned(account.id, false);
  await expect(accounts.verify(login.sessionId!)).resolves.toMatchObject({ ok: false, reason: "unknown session" });
  await expect(accounts.login("alice", "secret")).resolves.toMatchObject({ ok: true, userId: account.id });
});

test("memory persistence snapshots records instead of retaining caller references", async () => {
  const adapter = createPersistenceAdapter();
  const room = { nested: { tick: 1 } };
  await adapter.saveRoom("snapshot", room);
  room.nested.tick = 2;

  const loaded = (await adapter.loadRoom("snapshot")) as typeof room;
  expect(loaded).toEqual({ nested: { tick: 1 } });
  loaded.nested.tick = 3;
  await expect(adapter.loadRoom("snapshot")).resolves.toEqual({ nested: { tick: 1 } });
});

test("gameplay services cover inventory economy guild moderation and chat", () => {
  const services = createMmoGameplayServices({ now: () => 20, maxChatMessageLength: 8 });

  services.inventory.grant("alice", "potion", 2);
  expect(services.inventory.consume("alice", "potion")).toBe(true);
  expect(services.inventory.list("alice")[0]).toMatchObject({ sku: "potion", quantity: 1 });

  services.economy.credit("alice", "gold", 10);
  expect(services.economy.transfer("alice", "bob", "gold", 4)).toBe(true);
  expect(services.economy.balance("bob", "gold")).toBe(4);

  const guild = services.guilds.create("Raiders", "alice");
  expect(services.guilds.join(guild.id, "bob")).toBe(true);
  expect(services.guilds.get(guild.id)?.members).toEqual(["alice", "bob"]);

  services.moderation.record({ targetId: "bob", moderatorId: "alice", kind: "ban", reason: "test" });
  expect(services.moderation.isBanned("bob")).toBe(true);

  const message = services.chat.send("zone", "alice", "hello world");
  expect(message.text).toBe("hello wo");
  expect(services.chat.history("zone")).toHaveLength(1);
});

test("fleet manager places zones and creates cross-process handoff transport", async () => {
  const fleet = createFleetManager([
    { id: "west-a", endpoint: "https://west-a.test", region: "west", capacity: 2, load: 1 },
    { id: "east-a", endpoint: "https://east-a.test", region: "east", capacity: 2, load: 0 }
  ]);

  const placement = fleet.placeZone({ id: "zone-1", roomId: "room-1" }, { region: "east" });
  expect(placement).toMatchObject({ nodeId: "east-a", zone: { endpoint: "https://east-a.test" } });

  const transport = fleet.createHandoffTransport({
    fetch: async () => Response.json({ ok: true, state: { accepted: true } })
  });
  await expect(transport.handoff({ playerId: "p1", fromRoomId: "old", target: placement!.zone, state: {} })).resolves.toMatchObject({
    ok: true,
    state: { accepted: true }
  });
});

test("server physics integrates dynamic bodies and resolves static collision", () => {
  const physics = createServerPhysicsWorld({ gravityY: 100 });
  physics.upsert({ id: "ground", x: 0, y: 10, w: 100, h: 10, static: true });
  physics.upsert({ id: "player", x: 0, y: 0, w: 10, h: 10, vy: 10 });

  const contacts = physics.step(0.1);
  const player = physics.body("player");

  expect(contacts).toEqual([{ a: "ground", b: "player" }]);
  expect(player).toMatchObject({ y: 0, vy: 0, onGround: true });
});

test("sqlite persistence adapter stores players rooms and events", async () => {
  const dir = mkdtempSync(join(tmpdir(), "engine-sqlite-"));
  tempDirs.push(dir);
  const adapter = createSqlitePersistenceAdapter({ path: join(dir, "engine.db") });

  await adapter.savePlayer("p1", { level: 2 });
  await adapter.saveRoom("r1", { tick: 3 });
  await adapter.appendEvent?.({ kind: "join" });
  await expect(adapter.saveRoom("invalid", { missing: undefined })).rejects.toThrow("only JSON values");

  await expect(adapter.loadPlayer("p1")).resolves.toEqual({ level: 2 });
  await expect(adapter.loadRoom("r1")).resolves.toEqual({ tick: 3 });
  adapter.close();
  adapter.close();
});

test("webtransport message adapter sends and reads protocol datagrams", async () => {
  const outbound = new TransformStream<Uint8Array, Uint8Array>();
  const inbound = new TransformStream<Uint8Array, Uint8Array>();
  const adapter = createWebTransportMessageAdapter({
    datagrams: {
      readable: inbound.readable,
      writable: outbound.writable
    }
  });
  const outboundReader = outbound.readable.getReader();
  const inboundWriter = inbound.writable.getWriter();

  const sentPromise = outboundReader.read();
  await adapter.send(createWebTransportWelcome(20));
  const sent = await sentPromise;
  expect(new TextDecoder().decode(sent.value)).toContain("webtransport");

  const readPromise = adapter.read();
  await inboundWriter.write(new TextEncoder().encode(JSON.stringify(createProtocolMessage("ping", { now: 1 }))));
  await expect(readPromise).resolves.toMatchObject({ type: "ping", payload: { now: 1 } });

  await inboundWriter.close();
  adapter.close();
  adapter.close();
  await expect(adapter.send(createWebTransportWelcome(20))).rejects.toThrow("closed");
});

test("webtransport adapter rejects malformed UTF-8 and invalid tick rates", async () => {
  const outbound = new TransformStream<Uint8Array, Uint8Array>();
  const inbound = new TransformStream<Uint8Array, Uint8Array>();
  const adapter = createWebTransportMessageAdapter({
    datagrams: { readable: inbound.readable, writable: outbound.writable }
  });
  const inboundWriter = inbound.writable.getWriter();
  const reading = adapter.read();
  await inboundWriter.write(Uint8Array.of(0xc3, 0x28));

  await expect(reading).rejects.toThrow();
  expect(() => createWebTransportWelcome(0)).toThrow("positive finite");
  adapter.close();
});
