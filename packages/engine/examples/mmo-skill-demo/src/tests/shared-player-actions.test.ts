import { expect, test } from "bun:test";
import { encodeDelta, encodeSnapshot } from "@hyperfocus/engine/protocol";
import { getMmoSkillDemoAnchorTile } from "../data/world.ts";
import { addItem, bankQty, hasInventoryItem, hasQuestFlag, hasSlot, itemQty, setItemQty, selectedAbilityForSlot } from "../shared-loadout.ts";
import { mmoSkillDemoSchema } from "../schema.ts";
import { mmoSkillDemoZone } from "../shared-room.ts";
import { castCrushingLeap, createAuthoritativeServer, isolateCombatTarget, tapPummel } from "./shared-test-support.ts";
import { createTestPlayer } from "./test-fixtures.ts";

test("MMO Skill Demo use-item consumes only valid needed consumables", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "consumable-use");
  const join = await server.joinRoom({ roomId: "consumable-use", roomType: "mmo-skill-demo", token: "dev:item-user" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  player.maxHp = 100;
  player.hp = 50;
  setItemQty(player, "glade-berries", 2);
  await server.receiveInput(player.id, { action: "use-item", itemId: "glade-berries" });
  await server.tick(0);
  expect(player.hp).toBe(74);
  expect(itemQty(player, "glade-berries")).toBe(1);

  player.cooldownMs = 0;
  player.hp = player.maxHp;
  await server.receiveInput(player.id, { action: "use-item", itemId: "glade-berry" });
  await server.tick(0);
  expect(itemQty(player, "glade-berries")).toBe(1);

  player.cooldownMs = 0;
  player.maxMana = 60;
  player.mana = 10;
  setItemQty(player, "cinder-ale", 2);
  await server.receiveInput(player.id, { action: "use-item", itemId: "cinder-ale" });
  await server.tick(0);
  expect(player.mana).toBe(46);
  expect(itemQty(player, "cinder-ale")).toBe(1);

  player.cooldownMs = 0;
  player.mana = player.maxMana;
  await server.receiveInput(player.id, { action: "use-item", itemId: "cinder-ale" });
  await server.tick(0);
  expect(itemQty(player, "cinder-ale")).toBe(1);

  player.cooldownMs = 0;
  player.berserkMs = 0;
  setItemQty(player, "speed-potion", 2);
  await server.receiveInput(player.id, { action: "use-item", itemId: "speed-potion" });
  await server.tick(0);
  expect(itemQty(player, "speed-potion")).toBe(1);
  expect(player.berserkMs).toBeGreaterThan(0);

  player.cooldownMs = 0;
  player.berserkMs = 0;
  const before = { berries: itemQty(player, "glade-berries"), ale: itemQty(player, "cinder-ale"), potions: itemQty(player, "speed-potion"), hp: player.hp, mana: player.mana };
  await server.receiveInput(player.id, { action: "use-item", itemId: "unknown" });
  await server.tick(0);
  expect(itemQty(player, "glade-berries")).toBe(before.berries);
  expect(itemQty(player, "cinder-ale")).toBe(before.ale);
  expect(itemQty(player, "speed-potion")).toBe(before.potions);
  expect(player.hp).toBe(before.hp);
  expect(player.mana).toBe(before.mana);
});

test("MMO Skill Demo enemies drop pickupable loot from loot tables", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "loot-table");
  const join = await server.joinRoom({ roomId: "loot-table", roomType: "mmo-skill-demo", token: "dev:looter" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.x = wolf.x - 34;
  player.y = wolf.y;
  player.zoneId = wolf.zoneId;
  wolf.hp = 1;
  await tapPummel(server, player.id, { action: "lmb", targetId: wolf.id });

  const loot = Object.values(room.ctx.state.loots).find((drop) => drop.itemId === "gold");
  expect(loot).toBeDefined();
  expect(loot!.zoneId).toBe(wolf.zoneId);
  expect(loot!.amount).toBeGreaterThan(0);

  const beforeGold = player.gold;
  player.x = loot!.x;
  player.y = loot!.y;
  player.cooldownMs = 0;
  await server.receiveInput(player.id, { action: "interact", targetId: loot!.id });
  await server.tick();

  expect(room.ctx.state.loots[loot!.id]).toBeUndefined();
  expect(player.gold).toBeGreaterThan(beforeGold);
});

test("MMO Skill Demo loot pickup rejects direct ids outside reach or zone", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "loot-authority");
  const join = await server.joinRoom({ roomId: "loot-authority", roomType: "mmo-skill-demo", token: "dev:far-loot" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const oakhaven = getMmoSkillDemoAnchorTile("oakhaven");
  player.zoneId = "ashwood";
  player.x = oakhaven.x * 32 + 16;
  player.y = oakhaven.y * 32 + 16;
  room.ctx.state.loots["loot-far"] = {
    id: "loot-far",
    entityType: "loot",
    itemId: "gold",
    amount: 9,
    zoneId: "ashwood",
    x: player.x + 140,
    y: player.y,
    ownerId: player.id,
    expiresMs: 12000,
    pickupRadius: 32
  };
  room.ctx.state.loots["loot-zone"] = {
    id: "loot-zone",
    entityType: "loot",
    itemId: "iron-ore",
    amount: 3,
    zoneId: "crags",
    x: player.x,
    y: player.y,
    ownerId: player.id,
    expiresMs: 12000,
    pickupRadius: 32
  };

  await server.receiveInput(player.id, { action: "interact", targetId: "loot-far" });
  await server.tick();
  expect(room.ctx.state.loots["loot-far"]).toBeDefined();

  player.cooldownMs = 0;
  await server.receiveInput(player.id, { action: "interact", targetId: "loot-zone" });
  await server.tick();
  expect(room.ctx.state.loots["loot-zone"]).toBeDefined();
  expect(itemQty(player, "iron-ore")).toBe(0);
});

test("MMO Skill Demo loot pickup accepts highlighted interaction range", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "loot-highlight-range");
  const join = await server.joinRoom({ roomId: "loot-highlight-range", roomType: "mmo-skill-demo", token: "dev:highlight-loot" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const oakhaven = getMmoSkillDemoAnchorTile("oakhaven");
  player.zoneId = "ashwood";
  player.x = oakhaven.x * 32 + 16;
  player.y = oakhaven.y * 32 + 16;
  player.cooldownMs = 0;
  room.ctx.state.loots["loot-highlighted"] = {
    id: "loot-highlighted",
    entityType: "loot",
    itemId: "gold",
    amount: 9,
    zoneId: "ashwood",
    x: player.x + 88,
    y: player.y,
    ownerId: player.id,
    expiresMs: 12000,
    pickupRadius: 32
  };

  await server.receiveInput(player.id, { action: "interact", targetId: "loot-highlighted" });
  await server.tick();

  expect(room.ctx.state.loots["loot-highlighted"]).toBeUndefined();
  expect(player.gold).toBeGreaterThanOrEqual(9);
});

test("MMO Skill Demo rejects direct NPC interaction ids outside reach", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "npc-authority");
  const join = await server.joinRoom({ roomId: "npc-authority", roomType: "mmo-skill-demo", token: "dev:bank-check" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const elder = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "elder-rowan")!;
  const banker = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "banker-valerius")!;
  setItemQty(player, "ash-logs", 5);
  player.x = elder.x;
  player.y = elder.y;
  await server.receiveInput(player.id, { action: "interact", targetId: banker.id });
  await server.tick();
  expect(bankQty(player, "ash-logs")).toBe(0);
  expect(itemQty(player, "ash-logs")).toBe(5);

  player.x = banker.x - 24;
  player.y = banker.y;
  player.cooldownMs = 0;
  await server.receiveInput(player.id, { action: "interact", targetId: banker.id });
  await server.tick();
  expect(bankQty(player, "ash-logs")).toBe(5);
  expect(itemQty(player, "ash-logs")).toBe(0);
});

test("MMO Skill Demo read helpers treat missing replicated maps as empty", () => {
  const player = createTestPlayer();
  for (const field of ["inventory", "bank", "abilitySlots", "questFlags"]) Reflect.set(player, field, undefined);

  expect(itemQty(player, "ash-logs")).toBe(0);
  expect(bankQty(player, "ash-logs")).toBe(0);
  expect(hasInventoryItem(player, "ash-logs")).toBe(false);
  expect(hasQuestFlag(player, "first-cut")).toBe(false);
  expect(hasSlot(player, "LMB")).toBe(false);
  expect(selectedAbilityForSlot(player, "LMB")).toBe("mace-pummel");
});

test("MMO Skill Demo rejects direct combat ids outside the player's zone", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "combat-authority");
  const join = await server.joinRoom({ roomId: "combat-authority", roomType: "mmo-skill-demo", token: "dev:duelist" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.x = wolf.x - 34;
  player.y = wolf.y;
  wolf.zoneId = "bazaar";
  await tapPummel(server, player.id, { action: "lmb", targetId: wolf.id });
  expect(wolf.hp).toBe(wolf.maxHp);

  wolf.zoneId = player.zoneId;
  player.cooldownMs = 0;
  await tapPummel(server, player.id, { action: "lmb", targetId: wolf.id });
  expect(wolf.hp).toBeLessThan(wolf.maxHp);
});

test("MMO Skill Demo rejects direct resource ids outside the player's zone", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "resource-authority");
  const join = await server.joinRoom({ roomId: "resource-authority", roomType: "mmo-skill-demo", token: "dev:miner" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const ore = Object.values(room.ctx.state.resources).find((node) => node.kind === "ore")!;
  addItem(player, "pickaxe");
  player.x = ore.x - 34;
  player.y = ore.y;
  ore.zoneId = "bazaar";
  await server.receiveInput(player.id, { action: "mine", targetId: ore.id });
  await server.tick();
  expect(ore.hp).toBe(ore.maxHp);
  expect(player.miningXp).toBe(0);

  ore.zoneId = player.zoneId;
  player.cooldownMs = 0;
  await server.receiveInput(player.id, { action: "mine", targetId: ore.id });
  await server.tick(4.1);
  expect(ore.hp).toBe(0);
  expect(player.miningXp).toBeGreaterThan(0);
});

test("MMO Skill Demo gates network dev cheats behind an explicit env flag", async () => {
  const previous = process.env.MMO_SKILL_DEMO_DEV_CHEATS;
  delete process.env.MMO_SKILL_DEMO_DEV_CHEATS;
  try {
    const server = createAuthoritativeServer({
      transport: "websocket",
      port: 0,
      rooms: [mmoSkillDemoZone]
    });
    const room = server.createRoom("mmo-skill-demo", "dev-cheat-gate");
    const join = await server.joinRoom({ roomId: "dev-cheat-gate", roomType: "mmo-skill-demo", token: "dev:qa" });
    expect(join.ok).toBe(true);

    const player = room.ctx.state.players[join.player!.id];
    await server.receiveInput(player.id, { action: "dev", devField: "hp", devValue: 1 });
    await server.tick();
    expect(player.hp).toBe(100);

    process.env.MMO_SKILL_DEMO_DEV_CHEATS = "1";
    await server.receiveInput(player.id, { action: "dev", devField: "hp", devValue: 42 });
    await server.tick();
    expect(player.hp).toBe(42);
  } finally {
    if (previous === undefined) delete process.env.MMO_SKILL_DEMO_DEV_CHEATS;
    else process.env.MMO_SKILL_DEMO_DEV_CHEATS = previous;
  }
});

test("MMO Skill Demo mouse aim drives ground-targeted abilities", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "aimed-actions");
  const join = await server.joinRoom({ roomId: "aimed-actions", roomType: "mmo-skill-demo", token: "dev:rook" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  isolateCombatTarget(room.ctx.state, wolf.id);
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 72;
  player.y = wolf.y;
  player.abilitySlots.RMB = "unlocked";
  player.abilitySlots["rmb-crushing-blow"] = "RMB";
  await castCrushingLeap(server, player.id, { action: "rmb", aimX: wolf.x, aimY: wolf.y });

  expect(wolf.hp).toBeLessThan(wolf.maxHp);
  expect(player.targetId).toBe(wolf.id);
});

test("MMO Skill Demo spawn hub does not silently lock out player abilities", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "spawn-abilities");
  const join = await server.joinRoom({ roomId: "spawn-abilities", roomType: "mmo-skill-demo", token: "dev:spawn-abilities" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  expect(player.zoneId).toBe("ashwood");

  await server.receiveInput(player.id, { action: "lmb", aimX: player.x + 90, aimY: player.y });
  await server.tick(0);

  expect(player.activeAbility).toBe("mace-pummel");
  expect(player.cooldowns.LMB ?? 0).toBe(0);
});

test("MMO Skill Demo Pummel charge preview stays client-side", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "pummel-preview");
  const join = await server.joinRoom({ roomId: "pummel-preview", roomType: "mmo-skill-demo", token: "dev:pummel-preview" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 72;
  player.y = wolf.y;

  await server.receiveInput(player.id, { action: "lmb", targetId: wolf.id, aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.05);

  const previews = room.ctx.state.effects.filter((effect) => effect.effectKind === "cone");
  expect(previews).toHaveLength(0);

  await server.receiveInput(player.id, { action: "idle", targetId: wolf.id, aimX: wolf.x, aimY: wolf.y });
  await server.tick(0.35);
  expect(room.ctx.state.effects.some((effect) => effect.effectKind === "cone")).toBe(false);
});

test("MMO Skill Demo zero-cooldown Pummel does not block other slots", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "independent-cooldowns");
  const join = await server.joinRoom({ roomId: "independent-cooldowns", roomType: "mmo-skill-demo", token: "dev:slots" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 34;
  player.y = wolf.y;

  await server.receiveInput(player.id, { action: "lmb", targetId: wolf.id, aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", targetId: wolf.id, aimX: wolf.x, aimY: wolf.y });
  await server.tick(0.35);
  expect(player.cooldowns.LMB ?? 0).toBe(0);
  const shockwaves = room.ctx.state.effects.filter((effect) => effect.effectKind === "conewave");
  expect(shockwaves).toHaveLength(1);
  expect(shockwaves[0].radius).toBeGreaterThanOrEqual(55);
  expect(shockwaves[0].radius).toBeLessThanOrEqual(112);
  expect(shockwaves[0].pulse).toBeGreaterThanOrEqual(50);
  expect(shockwaves[0].pulse).toBeLessThanOrEqual(90);

  await server.receiveInput(player.id, { action: "q" });
  await server.tick(0);
  expect(player.activeAbility).toBe("q-berserk");
  expect(player.guardMs).toBe(750);
  expect(player.cooldowns.Q).toBe(10000);
});

test("MMO Skill Demo Rush auto-ends at its max channel even if held", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "rush-timeout");
  const join = await server.joinRoom({ roomId: "rush-timeout", roomType: "mmo-skill-demo", token: "dev:rush" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  isolateCombatTarget(room.ctx.state, wolf.id);
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 150;
  player.y = wolf.y;

  await server.receiveInput(player.id, { action: "space", aimX: wolf.x + 160, aimY: wolf.y });
  await server.tick(0);
  expect(player.activeAbility).toBe("space-rush");

  await server.tick(5.1);
  expect(player.activeAbility).toBe("");
  expect(player.action).toBe("idle");
  expect(player.cooldowns.Space).toBeGreaterThan(0);
  const stoppedX = player.x;
  const stoppedY = player.y;

  await server.receiveInput(player.id, { action: "space", aimX: wolf.x + 220, aimY: wolf.y });
  await server.tick(0.5);
  expect(player.activeAbility).toBe("");
  expect(Math.hypot(player.x - stoppedX, player.y - stoppedY)).toBeLessThan(1);

  await server.tick(8.5);
  expect(player.activeAbility).toBe("space-rush");
  expect(player.cooldowns.Space ?? 0).toBe(0);
});

test("MMO Skill Demo Rush movement snapshots stay schema-encodable", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "rush-snapshot-u16");
  const join = await server.joinRoom({ roomId: "rush-snapshot-u16", roomType: "mmo-skill-demo", token: "dev:rush-snapshot" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 150;
  player.y = wolf.y;

  await server.tick(0.016);
  const before = structuredClone(room.snapshotFor(player.id));
  await server.receiveInput(player.id, { action: "space", aimX: wolf.x + 160, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.7);
  const after = structuredClone(room.snapshotFor(player.id));

  expect(player.activeAbility).toBe("space-rush");
  expect(player.rushDistance).toBeGreaterThan(0);
  expect(Number.isInteger(player.rushDistance)).toBe(true);
  expect(() => encodeSnapshot(mmoSkillDemoSchema, after)).not.toThrow();
  expect(() => encodeDelta(mmoSkillDemoSchema, before, after)).not.toThrow();
});

test("MMO Skill Demo snapshots sanitize schema-constrained runtime values", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "snapshot-sanitize-u16");
  const join = await server.joinRoom({ roomId: "snapshot-sanitize-u16", roomType: "mmo-skill-demo", token: "dev:sanitize-u16" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 80;
  player.y = wolf.y;
  await server.tick(0.016);

  player.rushDistance = 12.75;
  player.cooldownMs = 70000;
  player.cooldowns.Space = 70000;
  wolf.attackCooldownMs = 70000;
  const snapshot = room.snapshotFor(player.id);
  const snapshotPlayer = snapshot.entities[player.id];
  const snapshotWolf = snapshot.entities[wolf.id];
  if (snapshotPlayer?.entityType !== "player") throw new Error("Expected sanitized player snapshot.");
  if (snapshotWolf?.entityType !== "npc") throw new Error("Expected sanitized NPC snapshot.");

  expect(snapshotPlayer.rushDistance).toBe(12);
  expect(snapshotPlayer.cooldownMs).toBe(65535);
  expect(snapshotPlayer.cooldowns.Space).toBe(65535);
  expect(snapshotWolf.attackCooldownMs).toBe(65535);
  expect(() => encodeSnapshot(mmoSkillDemoSchema, snapshot)).not.toThrow();
});

test("MMO Skill Demo held Space on cooldown does not add movement speed", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "space-cooldown-speed");
  const join = await server.joinRoom({ roomId: "space-cooldown-speed", roomType: "mmo-skill-demo", token: "dev:space-speed" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 220;
  player.y = wolf.y + 90;
  player.abilitySlots["space-jump"] = "Space";
  setItemQty(player, "bow", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "bow" });
  await server.tick(0);

  const startX = player.x;
  const startY = player.y;
  await server.receiveInput(player.id, { action: "idle", dx: 1, dy: 0, aimX: startX + 500, aimY: startY });
  await server.tick(0.4);
  const normalMove = Math.hypot(player.x - startX, player.y - startY);

  player.x = startX;
  player.y = startY;
  player.momentumX = 0;
  player.momentumY = 0;
  player.cooldowns.Space = 6000;
  player.cooldownMs = 6000;
  await server.receiveInput(player.id, { action: "space", dx: 1, dy: 0, aimX: startX + 500, aimY: startY });
  await server.tick(0.4);
  const heldCooldownMove = Math.hypot(player.x - startX, player.y - startY);

  expect(heldCooldownMove).toBeLessThanOrEqual(normalMove + 1);
  expect(player.activeAbility).toBe("");
});

test("MMO Skill Demo Berserk halves Rush windup timing", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "rush-berserk-speed");
  const join = await server.joinRoom({ roomId: "rush-berserk-speed", roomType: "mmo-skill-demo", token: "dev:fast-rush" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 150;
  player.y = wolf.y;
  player.berserkMs = 3000;

  await server.receiveInput(player.id, { action: "space", aimX: wolf.x + 160, aimY: wolf.y });
  await server.tick(0);
  expect(player.activeAbility).toBe("space-rush");
  expect(player.castMs).toBe(250);
  expect(player.activeDurationMs).toBe(5000);

  await server.tick(0.26);
  expect(player.rushDistance).toBeGreaterThan(0);
});

test("MMO Skill Demo Rush uses swept collision against resources", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "rush-sweep-resource");
  const join = await server.joinRoom({ roomId: "rush-sweep-resource", roomType: "mmo-skill-demo", token: "dev:rush-sweep" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const tree = Object.values(room.ctx.state.resources).find((resource) => resource.kind === "tree" && !resource.depleted)!;
  player.zoneId = tree.zoneId;
  player.x = tree.x - 90;
  player.y = tree.y;

  await server.receiveInput(player.id, { action: "space", aimX: tree.x + 220, aimY: tree.y });
  await server.tick(0.75);

  expect(player.x).toBeLessThan(tree.x);
  expect(Math.hypot(player.x - tree.x, player.y - tree.y)).toBeGreaterThanOrEqual(27);
});

test("MMO Skill Demo held casts fire toward current mouse aim", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "fire-frame-aim");
  const join = await server.joinRoom({ roomId: "fire-frame-aim", roomType: "mmo-skill-demo", token: "dev:frame-aim" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 80;
  player.y = wolf.y;
  player.abilitySlots.E = "unlocked";
  const hpBefore = wolf.hp;

  await server.receiveInput(player.id, { action: "e", aimX: player.x - 200, aimY: player.y });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0.12);

  expect(wolf.hp).toBeLessThan(hpBefore);
});

test("MMO Skill Demo stuns cancel active player attacks", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "stun-cancel-player");
  const join = await server.joinRoom({ roomId: "stun-cancel-player", roomType: "mmo-skill-demo", token: "dev:stun-cancel" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 40;
  player.y = wolf.y;

  await server.receiveInput(player.id, { action: "lmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  expect(player.activeAbility).toBe("mace-pummel");

  player.stunMs = 1000;
  await server.tick(0.1);
  expect(player.activeAbility).toBe("");
  expect(player.castMs).toBe(0);
});

test("MMO Skill Demo defensive input cancels a charging mace swing", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "cancel-heavy");
  const join = await server.joinRoom({ roomId: "cancel-heavy", roomType: "mmo-skill-demo", token: "dev:cancel" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 34;
  player.y = wolf.y;

  await server.receiveInput(player.id, { action: "lmb", targetId: wolf.id });
  await server.tick(0);
  expect(player.activeAbility).toBe("mace-pummel");

  await server.receiveInput(player.id, { action: "q" });
  await server.tick(0);
  expect(player.activeAbility).toBe("q-berserk");
  expect(player.guardMs).toBeGreaterThan(0);
  expect(player.activeDurationMs).toBe(750);
  expect(player.cooldowns.LMB ?? 0).toBe(0);
});

test("MMO Skill Demo windup interruption refunds interrupted slot cooldown", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "windup-refund");
  const join = await server.joinRoom({ roomId: "windup-refund", roomType: "mmo-skill-demo", token: "dev:windup-refund" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 110;
  player.y = wolf.y;

  await server.receiveInput(player.id, { action: "q" });
  await server.tick(0);
  expect(player.activeAbility).toBe("q-berserk");
  expect(player.cooldowns.Q).toBeGreaterThan(0);

  await server.receiveInput(player.id, { action: "space", aimX: wolf.x + 120, aimY: wolf.y });
  await server.tick(0);

  expect(player.activeAbility).toBe("space-rush");
  expect(player.cooldowns.Q ?? 0).toBe(0);
});

test("MMO Skill Demo abilities cannot be interrupted after cast frame", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "post-cast-no-interrupt");
  const join = await server.joinRoom({ roomId: "post-cast-no-interrupt", roomType: "mmo-skill-demo", token: "dev:post-cast" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 110;
  player.y = wolf.y;

  await server.receiveInput(player.id, { action: "q" });
  await server.tick(0);
  await server.tick(0.12);
  expect(player.activeAbility).toBe("q-berserk");

  await server.receiveInput(player.id, { action: "space", aimX: wolf.x + 120, aimY: wolf.y });
  await server.tick(0);

  expect(player.activeAbility).toBe("q-berserk");
  expect(player.cooldowns.Q).toBeGreaterThan(0);
  expect(player.cooldowns.Space ?? 0).toBe(0);
});

test("MMO Skill Demo ultimate consumes full Energy and channels mace damage", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "mace-ultimate");
  const join = await server.joinRoom({ roomId: "mace-ultimate", roomType: "mmo-skill-demo", token: "dev:ult" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 20;
  player.y = wolf.y;
  player.energy = 100;

  await server.receiveInput(player.id, { action: "r", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  expect(player.energy).toBe(0);
  expect(player.activeAbility).toBe("mace-whirlwind");
  expect(player.castMs).toBe(160);

  await server.tick(0);
  await server.tick(0.25);
  expect(wolf.hp).toBeLessThan(wolf.maxHp);
});

test("MMO Skill Demo Whirlwind ticks quickly and pulls enemies inward", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "mace-whirlwind-pull");
  const join = await server.joinRoom({ roomId: "mace-whirlwind-pull", roomType: "mmo-skill-demo", token: "dev:pull" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 105;
  player.y = wolf.y;
  player.energy = 100;
  const originalWolfX = wolf.x;

  await server.receiveInput(player.id, { action: "r", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.25);

  expect(wolf.hp).toBeLessThan(wolf.maxHp);
  expect(wolf.x).toBeLessThan(originalWolfX);
});

test("MMO Skill Demo immune enemies show dodge combat text", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "immune-readback");
  const join = await server.joinRoom({ roomId: "immune-readback", roomType: "mmo-skill-demo", token: "dev:immune" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 34;
  player.y = wolf.y;
  wolf.iframeMs = 1000;
  const hpBefore = wolf.hp;

  await tapPummel(server, player.id, { action: "lmb", targetId: wolf.id, aimX: wolf.x, aimY: wolf.y });

  expect(wolf.hp).toBe(hpBefore);
  expect(room.ctx.state.effects.some((effect) => effect.effectKind === "dodge")).toBe(true);
});

test("MMO Skill Demo elite line hazards telegraph before damaging players", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "hazard-patterns");
  const join = await server.joinRoom({ roomId: "hazard-patterns", roomType: "mmo-skill-demo", token: "dev:tank" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const archer = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "cursed-archer")!;
  player.zoneId = archer.zoneId;
  player.x = archer.x - 90;
  player.y = archer.y;
  archer.projectileCooldownMs = 0;
  const before = player.hp;
  await server.tick();
  expect(Object.values(room.ctx.state.hazards).some((hazard) => hazard.kind === "line")).toBe(true);

  await server.tick(20);
  expect(player.hp).toBeLessThan(before);
});
