import { expect, test } from "bun:test";
import { getMmoSkillDemoAnchorTile, TILE } from "../data/world.ts";
import { earlyLoopAction, earlyLoopBlockers } from "../client/early-loop.ts";
import { mainQuestDestination } from "../client/quest-guide.ts";
import { addItem, hasInventoryItem, hasQuestFlag, hasSlot, itemQty, setItemQty, selectedAbilityForSlot } from "../shared-loadout.ts";
import { mmoSkillDemoCottage, mmoSkillDemoDungeon, mmoSkillDemoZone } from "../shared-room.ts";
import { type PlayerEntity } from "../shared-contracts.ts";
import { createAuthoritativeServer, isolateCombatTarget, sendConfig, tapPummel } from "./shared-test-support.ts";

test("MMO Skill Demo restores a character by login token", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "ashwood-persist");
  const firstJoin = await server.joinRoom({ roomId: "ashwood-persist", roomType: "mmo-skill-demo", token: "dev:ranger" });
  expect(firstJoin.ok).toBe(true);
  const firstPlayer = room.ctx.state.players[firstJoin.player!.id];
  firstPlayer.combatXp = 196;
  firstPlayer.combatLevel = 3;
  firstPlayer.x += 16;
  await server.leavePlayer(firstPlayer.id);

  const secondJoin = await server.joinRoom({ roomId: "ashwood-persist", roomType: "mmo-skill-demo", token: "dev:ranger" });
  expect(secondJoin.ok).toBe(true);
  const restored = room.ctx.state.players[secondJoin.player!.id];
  expect(restored.combatXp).toBe(196);
  expect(restored.combatLevel).toBe(3);
  expect(restored.gold).toBe(firstPlayer.gold);
  expect(restored.abilitySlots["lmb-strike"]).toBe("LMB");
});

test("MMO Skill Demo persists same login across shared world and cottage without saving instance spawn", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone, mmoSkillDemoDungeon, mmoSkillDemoCottage]
  });
  const world = server.createRoom("mmo-skill-demo", "cross-room-world");
  const dungeon = server.createRoom("mmo-skill-demo-dungeon", "cross-room-dungeon");
  const cottage = server.createRoom("mmo-skill-demo-cottage", "cross-room-cottage");
  const token = "dev:cross-room-ranger";
  const firstJoin = await server.joinRoom({ roomId: "cross-room-world", roomType: "mmo-skill-demo", token });
  expect(firstJoin.ok).toBe(true);
  const firstPlayer = world.ctx.state.players[firstJoin.player!.id];
  const oakhaven = getMmoSkillDemoAnchorTile("oakhaven");
  firstPlayer.x = oakhaven.x * 32 + 16;
  firstPlayer.y = oakhaven.y * 32 + 16;
  firstPlayer.zoneId = "ashwood";
  firstPlayer.combatXp = 210;
  firstPlayer.gold = 77;
  setItemQty(firstPlayer, "glade-berries", 6);
  setItemQty(firstPlayer, "cinder-ale", 3);
  await server.leavePlayer(firstPlayer.id);

  const dungeonJoin = await server.joinRoom({ roomId: "cross-room-dungeon", roomType: "mmo-skill-demo-dungeon", token });
  expect(dungeonJoin.ok).toBe(true);
  const dungeonPlayer = dungeon.ctx.state.players[dungeonJoin.player!.id];
  expect(dungeonPlayer.zoneId).toBe("dungeon");
  expect(dungeonPlayer.combatXp).toBe(210);
  expect(dungeonPlayer.gold).toBe(77);
  expect(itemQty(dungeonPlayer, "glade-berries")).toBe(6);
  setItemQty(dungeonPlayer, "cinder-ale", 2);
  await server.leavePlayer(dungeonPlayer.id);

  const cottageJoin = await server.joinRoom({ roomId: "cross-room-cottage", roomType: "mmo-skill-demo-cottage", token });
  expect(cottageJoin.ok).toBe(true);
  const cottagePlayer = cottage.ctx.state.players[cottageJoin.player!.id];
  expect(cottagePlayer.zoneId).toBe("cottage");
  expect(cottagePlayer.combatXp).toBe(210);
  expect(cottagePlayer.gold).toBe(77);
  expect(itemQty(cottagePlayer, "glade-berries")).toBe(6);
  expect(itemQty(cottagePlayer, "cinder-ale")).toBe(2);
  setItemQty(cottagePlayer, "glade-berries", 4);
  setItemQty(cottagePlayer, "speed-potion", 2);
  await server.leavePlayer(cottagePlayer.id);

  const secondJoin = await server.joinRoom({ roomId: "cross-room-world", roomType: "mmo-skill-demo", token });
  expect(secondJoin.ok).toBe(true);
  const restored = world.ctx.state.players[secondJoin.player!.id];
  expect(restored.combatXp).toBe(210);
  expect(restored.gold).toBe(77);
  expect(itemQty(restored, "glade-berries")).toBe(4);
  expect(itemQty(restored, "speed-potion")).toBe(2);
  expect(restored.zoneId).toBe("ashwood");
  expect(restored.x).toBe(firstPlayer.x);
  expect(restored.y).toBe(firstPlayer.y);
  expect(restored.zoneId).not.toBe("cottage");
  expect(restored.zoneId).not.toBe("dungeon");
});

test("MMO Skill Demo snapshots keep nearby cross-zone actors stable at zone seams", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "zone-interest");
  const join = await server.joinRoom({ roomId: "zone-interest", roomType: "mmo-skill-demo", token: "dev:scout" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  player.zoneId = "port-marrow";
  player.x = 32 * 32;
  player.y = 18 * 32;
  const elder = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "elder-rowan")!;
  elder.x = player.x + 34;
  elder.y = player.y;
  elder.zoneId = "ashwood";
  await server.tick();
  const snapshot = mmoSkillDemoZone.getSnapshot!(room.ctx, join.player!);

  expect(snapshot.npcs[elder.id]?.kind).toBe("elder-rowan");
});

test("MMO Skill Demo creates dungeon and cottage instance room states", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone, mmoSkillDemoDungeon, mmoSkillDemoCottage]
  });
  const dungeon = server.createRoom("mmo-skill-demo-dungeon", "dungeon-party-test");
  const cottage = server.createRoom("mmo-skill-demo-cottage", "cottage-test");

  expect(dungeon.ctx.state.roomKind).toBe("dungeon-instance");
  expect(Object.values(dungeon.ctx.state.npcs).some((npc) => npc.kind === "mirror-king")).toBe(true);
  expect(cottage.ctx.state.roomKind).toBe("cottage-instance");
  expect(Object.values(cottage.ctx.state.npcs).every((npc) => npc.zoneId === "cottage")).toBe(true);
});

test("MMO Skill Demo can accept multiple side quests without replacing the current focus", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "multi-quest-accept");
  const join = await server.joinRoom({ roomId: "multi-quest-accept", roomType: "mmo-skill-demo", token: "dev:quest-stack" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const miller = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "miller-finn")!;
  const scout = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "scout-elara")!;

  player.x = miller.x - 24;
  player.y = miller.y;
  player.zoneId = miller.zoneId;
  await server.receiveInput(player.id, { action: "interact", targetId: miller.id });
  await server.tick();

  player.cooldownMs = 0;
  player.cooldowns = {};
  player.x = scout.x - 24;
  player.y = scout.y;
  player.zoneId = scout.zoneId;
  await server.receiveInput(player.id, { action: "interact", targetId: scout.id });
  await server.tick();

  expect(hasQuestFlag(player, "wolf-pelt-quota-accepted")).toBe(true);
  expect(hasQuestFlag(player, "root-of-the-problem-accepted")).toBe(true);
  expect(player.activeQuestId).toBe("first-cut");

  await sendConfig(server, player.id, "mainQuest", "root-of-the-problem");
  expect(player.activeQuestId).toBe("root-of-the-problem");

  await sendConfig(server, player.id, "mainQuest", "not-a-quest");
  expect(player.activeQuestId).toBe("root-of-the-problem");
});

test("MMO Skill Demo new player starts with a zero-blocker First Cut route", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "early-zero-spawn");
  const join = await server.joinRoom({ roomId: "early-zero-spawn", roomType: "mmo-skill-demo", token: "dev:early-zero-spawn" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  expect(player.activeQuestId).toBe("first-cut");
  expect(hasQuestFlag(player, "first-cut-accepted")).toBe(true);
  expect(mainQuestDestination(room.ctx.state, player)).toBeDefined();
  expect(earlyLoopAction(room.ctx.state, player).hudText).toBe("Cut glowing Ash tree 0/5");
  expect(earlyLoopBlockers(room.ctx.state, player)).toEqual([]);
});

test("MMO Skill Demo First Arms remains optional with a First Cut fallback", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "first-arms-fallback");
  const join = await server.joinRoom({ roomId: "first-arms-fallback", roomType: "mmo-skill-demo", token: "dev:first-arms-fallback" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  await sendConfig(server, player.id, "proving", "accept");
  expect(hasQuestFlag(player, "first-arms-proving-accepted")).toBe(true);
  expect(player.activeQuestId).toBe("first-cut");
  expect(mainQuestDestination(room.ctx.state, player)).toBeDefined();
  const action = earlyLoopAction(room.ctx.state, player);
  expect(action.primaryLabel).toBe("Try next loaner");
  expect(action.fallbackLabel).toBe("Cut Ash tree");
  expect(earlyLoopBlockers(room.ctx.state, player)).toEqual([]);
});

test("MMO Skill Demo early quest completions hand off to the next route", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "early-handoffs");
  const join = await server.joinRoom({ roomId: "early-handoffs", roomType: "mmo-skill-demo", token: "dev:early-handoffs" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const rowan = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "elder-rowan")!;
  player.x = rowan.x;
  player.y = rowan.y;
  player.zoneId = rowan.zoneId;
  const resetInteract = () => {
    player.cooldownMs = 0;
    player.cooldowns = {};
    player.x = rowan.x;
    player.y = rowan.y;
    player.zoneId = rowan.zoneId;
  };

  player.questFlags["first-cut-ready"] = true;
  resetInteract();
  await server.receiveInput(player.id, { action: "interact", targetId: rowan.id });
  await server.tick();
  expect(hasQuestFlag(player, "first-cut")).toBe(true);
  expect(hasQuestFlag(player, "second-cut-accepted")).toBe(true);
  expect(player.activeQuestId).toBe("second-cut");

  player.questFlags["second-cut-ready"] = true;
  resetInteract();
  await server.receiveInput(player.id, { action: "interact", targetId: rowan.id });
  await server.tick();
  expect(hasQuestFlag(player, "second-cut")).toBe(true);
  expect(hasQuestFlag(player, "wolf-culling-accepted")).toBe(true);
  expect(player.activeQuestId).toBe("wolf-culling");

  player.questFlags["wolf-culling-ready"] = true;
  resetInteract();
  await server.receiveInput(player.id, { action: "interact", targetId: rowan.id });
  await server.tick();
  expect(hasQuestFlag(player, "wolf-culling")).toBe(true);
  expect(hasQuestFlag(player, "final-cut-accepted")).toBe(true);
  expect(player.activeQuestId).toBe("final-cut");

  player.questFlags["final-cut-ready"] = true;
  resetInteract();
  await server.receiveInput(player.id, { action: "interact", targetId: rowan.id });
  await server.tick();
  expect(hasQuestFlag(player, "final-cut")).toBe(true);
  expect(hasQuestFlag(player, "lost-compass-accepted")).toBe(true);
  expect(player.activeQuestId).toBe("lost-compass");
});

test("MMO Skill Demo first ten minute quest states have no early-loop blockers", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "early-loop-permutations");
  const join = await server.joinRoom({ roomId: "early-loop-permutations", roomType: "mmo-skill-demo", token: "dev:early-loop-permutations" });
  expect(join.ok).toBe(true);

  const base = room.ctx.state.players[join.player!.id];
  const scenarios: Array<{ label: string; player: Partial<PlayerEntity> }> = [
    { label: "spawn", player: { activeQuestId: "first-cut", questFlags: { "first-cut-accepted": true } } },
    { label: "first proof", player: { activeQuestId: "first-cut", inventory: { "ash-logs": 1 }, questFlags: { "first-cut-accepted": true } } },
    { label: "first ready", player: { activeQuestId: "first-cut", inventory: { "ash-logs": 5 }, questFlags: { "first-cut-accepted": true, "first-cut-ready": true } } },
    { label: "second cut", player: { activeQuestId: "second-cut", inventory: { "ash-logs": 7 }, questFlags: { "first-cut-accepted": true, "first-cut": true, "second-cut-accepted": true } } },
    { label: "wolf culling", player: { activeQuestId: "wolf-culling", wolfKills: 2, questFlags: { "first-cut-accepted": true, "first-cut": true, "second-cut": true, "wolf-culling-accepted": true } } },
    { label: "final cut", player: { activeQuestId: "final-cut", questFlags: { "first-cut-accepted": true, "first-cut": true, "second-cut": true, "wolf-culling": true, "final-cut-accepted": true } } },
    { label: "route registration", player: { activeQuestId: "lost-compass", questFlags: { "first-cut-accepted": true, "first-cut": true, "second-cut": true, "wolf-culling": true, "final-cut": true, "lost-compass-accepted": true } } }
  ];

  for (const scenario of scenarios) {
    const player: PlayerEntity = {
      ...base,
      inventory: {},
      bank: {},
      wolfKills: 0,
      ...scenario.player,
      questFlags: { ...(scenario.player.questFlags ?? {}) }
    };
    expect(earlyLoopBlockers(room.ctx.state, player), scenario.label).toEqual([]);
  }
});

test("MMO Skill Demo starts new players without advanced weapons", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "starter-weapons");
  const join = await server.joinRoom({ roomId: "starter-weapons", roomType: "mmo-skill-demo", token: "dev:starter-weapons" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  expect(player.equippedWeaponId).toBe("mace");
  expect(player.zoneId).toBe("ashwood");
  expect(player.homeZoneId).toBe("ashwood");
  const oakhaven = getMmoSkillDemoAnchorTile("oakhaven");
  expect(Math.hypot(player.x - (oakhaven.x * TILE + TILE * 0.5), player.y - (oakhaven.y * TILE + TILE * 0.5))).toBeLessThan(TILE * 6);
  expect(selectedAbilityForSlot(player, "LMB")).toBe("mace-pummel");
  expect(itemQty(player, "training-hatchet")).toBe(1);
  for (const weaponId of ["bow", "staff", "wand", "twin-blades", "blade"]) {
    expect(itemQty(player, weaponId)).toBe(0);
    expect(hasInventoryItem(player, weaponId)).toBe(false);
  }

  await sendConfig(server, player.id, "weapon", "bow");
  expect(player.equippedWeaponId).toBe("mace");
  expect(selectedAbilityForSlot(player, "LMB")).toBe("mace-pummel");
});

test("MMO Skill Demo First Arms loans weapons without granting inventory", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "first-arms-loaners");
  const join = await server.joinRoom({ roomId: "first-arms-loaners", roomType: "mmo-skill-demo", token: "dev:first-arms-loaner" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  await sendConfig(server, player.id, "proving", "lesson:statuses");
  expect(hasQuestFlag(player, "first-arms-lesson-statuses")).toBe(false);

  const startingGold = player.gold;
  await sendConfig(server, player.id, "proving", "sample:bow");
  expect(hasQuestFlag(player, "first-arms-proving-accepted")).toBe(true);
  expect(hasQuestFlag(player, "first-arms-proving-sampled-bow")).toBe(true);
  expect(player.equippedWeaponId).toBe("bow");
  expect(selectedAbilityForSlot(player, "LMB")).toBe("bow-quick-shot");
  expect(itemQty(player, "bow")).toBe(0);
  expect(player.equipment["bow"]).toBeUndefined();
  expect(player.gold).toBe(startingGold + 11);

  await sendConfig(server, player.id, "proving", "sample:staff");
  expect(player.equippedWeaponId).toBe("staff");
  expect(itemQty(player, "staff")).toBe(0);
  expect(player.equipment["staff"]).toBeUndefined();

  await sendConfig(server, player.id, "proving", "sample:wand");
  expect(player.equippedWeaponId).toBe("wand");
  expect(itemQty(player, "wand")).toBe(0);
  expect(player.equipment["wand"]).toBeUndefined();
  expect(hasQuestFlag(player, "first-arms-proving")).toBe(false);
});

test("MMO Skill Demo First Arms pays one chosen weapon and starter purse once", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "first-arms-reward");
  const join = await server.joinRoom({ roomId: "first-arms-reward", roomType: "mmo-skill-demo", token: "dev:first-arms-reward" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  await sendConfig(server, player.id, "proving", "sample:bow");
  await sendConfig(server, player.id, "proving", "sample:staff");
  await sendConfig(server, player.id, "proving", "sample:wand");
  await sendConfig(server, player.id, "proving", "choose:staff");

  expect(hasQuestFlag(player, "first-arms-proving")).toBe(true);
  expect(hasQuestFlag(player, "first-arms-proving-reward-staff")).toBe(true);
  expect(hasQuestFlag(player, "first-arms-proving-reward-bow")).toBe(false);
  expect(itemQty(player, "staff")).toBe(1);
  expect(itemQty(player, "bow")).toBe(0);
  expect(itemQty(player, "wand")).toBe(0);
  expect(player.equippedWeaponId).toBe("staff");
  expect(itemQty(player, "ash-logs")).toBe(18);
  expect(itemQty(player, "iron-ore")).toBe(14);
  expect(itemQty(player, "silk-thread")).toBe(3);
  expect(itemQty(player, "speed-potion")).toBe(3);

  const paid = {
    gold: player.gold,
    renown: player.renown,
    staff: itemQty(player, "staff"),
    logs: itemQty(player, "ash-logs"),
    ore: itemQty(player, "iron-ore"),
    silk: itemQty(player, "silk-thread"),
    potions: itemQty(player, "speed-potion")
  };
  await sendConfig(server, player.id, "proving", "choose:staff");
  await sendConfig(server, player.id, "proving", "choose:bow");
  expect(player.gold).toBe(paid.gold);
  expect(player.renown).toBe(paid.renown);
  expect(itemQty(player, "staff")).toBe(paid.staff);
  expect(itemQty(player, "bow")).toBe(0);
  expect(itemQty(player, "ash-logs")).toBe(paid.logs);
  expect(itemQty(player, "iron-ore")).toBe(paid.ore);
  expect(itemQty(player, "silk-thread")).toBe(paid.silk);
  expect(itemQty(player, "speed-potion")).toBe(paid.potions);
});

test("MMO Skill Demo First Arms follow-up lessons are optional and idempotent", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "first-arms-lessons");
  const join = await server.joinRoom({ roomId: "first-arms-lessons", roomType: "mmo-skill-demo", token: "dev:first-arms-lessons" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  await sendConfig(server, player.id, "proving", "sample:bow");
  await sendConfig(server, player.id, "proving", "sample:staff");
  await sendConfig(server, player.id, "proving", "sample:wand");
  await sendConfig(server, player.id, "proving", "choose:bow");

  const before = {
    gold: player.gold,
    renown: player.renown,
    potions: itemQty(player, "speed-potion"),
    ale: itemQty(player, "cinder-ale"),
    berries: itemQty(player, "glade-berries"),
    logs: itemQty(player, "ash-logs"),
    ore: itemQty(player, "iron-ore"),
    silk: itemQty(player, "silk-thread"),
    hatchets: itemQty(player, "training-hatchet"),
    pickaxes: itemQty(player, "pickaxe"),
    maps: itemQty(player, "captains-map")
  };

  for (const lessonId of ["statuses", "crafting", "buffs", "gathering", "cities", "travel"]) {
    await sendConfig(server, player.id, "proving", `lesson:${lessonId}`);
    expect(hasQuestFlag(player, `first-arms-lesson-${lessonId}`)).toBe(true);
  }

  expect(player.gold).toBe(before.gold + 128);
  expect(player.renown).toBeGreaterThanOrEqual(before.renown + 46);
  expect(itemQty(player, "speed-potion")).toBe(before.potions + 9);
  expect(itemQty(player, "cinder-ale")).toBe(before.ale + 8);
  expect(itemQty(player, "glade-berries")).toBe(before.berries + 10);
  expect(itemQty(player, "ash-logs")).toBe(before.logs + 28);
  expect(itemQty(player, "iron-ore")).toBe(before.ore + 26);
  expect(itemQty(player, "silk-thread")).toBe(before.silk + 5);
  expect(itemQty(player, "training-hatchet")).toBe(before.hatchets + 1);
  expect(itemQty(player, "pickaxe")).toBe(before.pickaxes + 1);
  expect(itemQty(player, "captains-map")).toBe(before.maps + 2);

  const after = { gold: player.gold, renown: player.renown, potions: itemQty(player, "speed-potion") };
  await sendConfig(server, player.id, "proving", "lesson:statuses");
  expect(player.gold).toBe(after.gold);
  expect(player.renown).toBe(after.renown);
  expect(itemQty(player, "speed-potion")).toBe(after.potions);
});

test("MMO Skill Demo first-cut and wolf achievements unlock ability slots", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "progression-unlocks");
  const join = await server.joinRoom({ roomId: "progression-unlocks", roomType: "mmo-skill-demo", token: "dev:unlocker" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const tree = Object.values(room.ctx.state.resources).find((node) => node.kind === "tree")!;
  for (let i = 0; i < 5; i += 1) {
    tree.depleted = false;
    tree.hp = 1;
    player.x = tree.x - 34;
    player.y = tree.y;
    player.cooldownMs = 0;
    await server.receiveInput(player.id, { action: "woodcut", targetId: tree.id });
    await server.tick(4.1);
  }
  expect(hasQuestFlag(player, "first-cut-ready")).toBe(true);
  expect(hasInventoryItem(player, "iron-hatchet")).toBe(false);

  const elder = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "elder-rowan")!;
  player.x = elder.x - 24;
  player.y = elder.y;
  player.cooldownMs = 0;
  await server.receiveInput(player.id, { action: "interact", targetId: elder.id });
  await server.tick();
  expect(hasInventoryItem(player, "iron-hatchet")).toBe(true);
  expect(hasSlot(player, "RMB")).toBe(true);

  player.wolfKills = 10;
  await server.tick(0);
  expect(player.wolfKills).toBe(10);
  expect(hasQuestFlag(player, "wolf-culling-ready")).toBe(true);
  expect(player.abilitySlots["space-jump"]).toBeUndefined();

  player.x = elder.x - 24;
  player.y = elder.y;
  player.cooldownMs = 0;
  await server.receiveInput(player.id, { action: "interact", targetId: elder.id });
  await server.tick();
  expect(player.abilitySlots["space-jump"]).toBe("Space");
  expect(hasSlot(player, "Space")).toBe(true);
});

test("MMO Skill Demo bazaar survival unlocks Q stun", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "silent-sands");
  const join = await server.joinRoom({ roomId: "silent-sands", roomType: "mmo-skill-demo", token: "dev:sands" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  const voidRift = getMmoSkillDemoAnchorTile("void-rift");
  player.x = voidRift.x * 32 + 16;
  player.y = voidRift.y * 32 + 16;
  player.zoneId = "bazaar";

  await server.tick(120);

  expect(hasQuestFlag(player, "silent-sands-ready")).toBe(true);
  expect(player.abilitySlots["q-stun"]).toBeUndefined();

  const master = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "master-kael")!;
  player.x = master.x - 24;
  player.y = master.y;
  player.cooldownMs = 0;
  await server.receiveInput(player.id, { action: "interact", targetId: master.id });
  await server.tick();
  expect(hasQuestFlag(player, "silent-sands")).toBe(true);
  expect(player.abilitySlots["q-stun"]).toBe("Q");
  expect(hasSlot(player, "Q")).toBe(true);
});

test("MMO Skill Demo golem requires power nodes before damage", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoDungeon]
  });
  const room = server.createRoom("mmo-skill-demo-dungeon", "dungeon-golem");
  const join = await server.joinRoom({ roomId: "dungeon-golem", roomType: "mmo-skill-demo-dungeon", token: "dev:golem" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  const golem = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "iron-core-golem")!;
  player.x = golem.x - 42;
  player.y = golem.y;
  player.zoneId = "dungeon";
  player.combatLevel = 12;

  await tapPummel(server, player.id, { action: "lmb", targetId: golem.id });
  expect(golem.hp).toBe(golem.maxHp);

  const golemNodes = Object.values(room.ctx.state.npcs).filter((npc) => npc.kind === "power-node" && (npc.summonedBy === golem.id || Math.hypot(npc.x - golem.x, npc.y - golem.y) <= 300));
  const distantNode = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "power-node" && !golemNodes.includes(npc));
  expect(golemNodes).toHaveLength(3);
  expect(distantNode?.hp).toBeGreaterThan(0);
  for (const node of golemNodes) node.hp = 0;
  player.cooldownMs = 0;
  await tapPummel(server, player.id, { action: "lmb", targetId: golem.id });
  expect(golem.hp).toBeLessThan(golem.maxHp);
});

test("MMO Skill Demo throttles Deep Fissure golem overdrive hazards", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoDungeon]
  });
  const room = server.createRoom("mmo-skill-demo-dungeon", "dungeon-golem-hazard-throttle");
  const join = await server.joinRoom({ roomId: "dungeon-golem-hazard-throttle", roomType: "mmo-skill-demo-dungeon", token: "dev:golem-hazards" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  const golem = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "iron-core-golem")!;

  player.zoneId = "dungeon";
  player.x = golem.x - 72;
  player.y = golem.y;
  golem.projectileCooldownMs = 0;
  await server.tick(1 / 60);

  expect(Object.values(room.ctx.state.hazards).filter((hazard) => hazard.ownerId === golem.id)).toHaveLength(6);
});

test("MMO Skill Demo contracts advance renown and rotate unlocked writs", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "contract-board");
  const join = await server.joinRoom({ roomId: "contract-board", roomType: "mmo-skill-demo", token: "dev:contractor" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  const board = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "contract-board")!;

  player.renown = 135;
  player.masteryRank = 1;
  player.contractId = "ashwood-hunt";
  player.contractKills = 12;
  player.x = board.x - 24;
  player.y = board.y;
  player.zoneId = board.zoneId;
  await server.receiveInput(player.id, { action: "interact", targetId: board.id });
  await server.tick();

  expect(player.renown).toBeGreaterThan(135);
  expect(player.masteryRank).toBe(2);
  expect(player.contractStreak).toBe(1);
  expect(player.contractId).toBe("crag-patrol");
  expect(player.contractKills).toBe(0);
  expect(player.contractCooldownMs).toBeGreaterThan(0);
  expect(itemQty(player, "rep-oakhaven")).toBeGreaterThanOrEqual(12);
  expect(itemQty(player, "concord-oak-leaf")).toBeGreaterThan(0);

  const bat = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "iron-eye-bat")!;
  isolateCombatTarget(room.ctx.state, bat.id);
  bat.x = player.x + 58;
  bat.y = player.y;
  bat.spawnX = bat.x;
  bat.spawnY = bat.y;
  bat.zoneId = player.zoneId;
  player.x = bat.x - 34;
  player.y = bat.y;
  player.zoneId = bat.zoneId;
  player.cooldownMs = 0;
  bat.hp = 1;
  await tapPummel(server, player.id, { action: "lmb", targetId: bat.id, aimX: bat.x, aimY: bat.y });
  expect(player.contractKills).toBe(0);

  player.contractCooldownMs = 0;
  player.cooldownMs = 0;
  player.x = bat.x - 34;
  player.y = bat.y;
  player.zoneId = bat.zoneId;
  bat.hp = 1;
  bat.iframeMs = 0;
  bat.respawnMs = 0;
  await tapPummel(server, player.id, { action: "lmb", targetId: bat.id, aimX: bat.x, aimY: bat.y });
  expect(player.contractKills).toBeGreaterThan(0);
});

test("MMO Skill Demo travel NPCs escort nearby moves instead of teleporting", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "escort-route");
  const join = await server.joinRoom({ roomId: "escort-route", roomType: "mmo-skill-demo", token: "dev:escort" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  const runner = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "runner-kael")!;

  player.x = runner.x - 24;
  player.y = runner.y;
  player.zoneId = runner.zoneId;
  const startX = player.x;
  const startY = player.y;
  await server.receiveInput(player.id, { action: "interact", targetId: runner.id });
  await server.tick();
  expect(player.escortNpcId).toBe(runner.id);

  await server.tick(0.5);
  expect(Math.hypot(player.x - startX, player.y - startY)).toBeGreaterThan(10);
  expect(Math.hypot(runner.x - player.x, runner.y - player.y)).toBeLessThan(36);
});

test("MMO Skill Demo captain route choice selects Ashwood or Void Rift", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "captain-route-choice");
  const ashwoodJoin = await server.joinRoom({ roomId: "captain-route-choice", roomType: "mmo-skill-demo", token: "dev:route-ashwood" });
  const voidJoin = await server.joinRoom({ roomId: "captain-route-choice", roomType: "mmo-skill-demo", token: "dev:route-void" });
  expect(ashwoodJoin.ok).toBe(true);
  expect(voidJoin.ok).toBe(true);

  const captain = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "captain-marrow")!;
  const ashwoodPlayer = room.ctx.state.players[ashwoodJoin.player!.id];
  const voidPlayer = room.ctx.state.players[voidJoin.player!.id];
  for (const player of [ashwoodPlayer, voidPlayer]) {
    player.zoneId = "port-marrow";
    player.x = captain.x;
    player.y = captain.y;
    addItem(player, "void-resistant-cloak", 1);
  }

  await server.receiveInput(ashwoodPlayer.id, { action: "interact", targetId: captain.id, devText: "ashwood" });
  await server.receiveInput(voidPlayer.id, { action: "interact", targetId: captain.id, devText: "void-rift" });
  await server.tick();

  expect(ashwoodPlayer.zoneId).toBe("ashwood");
  expect(voidPlayer.zoneId).toBe("bazaar");
});

test("MMO Skill Demo crafting NPC honors authored recipe picker ids", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "authored-recipe-picker");
  const join = await server.joinRoom({ roomId: "authored-recipe-picker", roomType: "mmo-skill-demo", token: "dev:recipe-picker" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const blacksmith = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "blacksmith-silas")!;
  player.zoneId = blacksmith.zoneId;
  player.x = blacksmith.x;
  player.y = blacksmith.y;
  player.gold = 80;
  addItem(player, "refined-iron-ingot", 2);
  addItem(player, "crawler-chitin-block", 1);
  addItem(player, "prism-crystal-shards", 2);
  addItem(player, "ancient-script-scroll", 1);

  await server.receiveInput(player.id, { action: "interact", targetId: blacksmith.id, devField: "recipe", devText: "aetheria-ring-focus" });
  await server.tick();

  expect(player.equipment["ring-focus"]).toBe("ring-focus");
  expect(player.equipment["iron-chest"]).toBeUndefined();
  expect(itemQty(player, "prism-crystal-shards")).toBe(0);
  expect(itemQty(player, "refined-iron-ingot")).toBe(2);
});

test("MMO Skill Demo marketplace trade uses targeted structured buy and sell inputs", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "marketplace-structured-actions");
  const join = await server.joinRoom({ roomId: "marketplace-structured-actions", roomType: "mmo-skill-demo", token: "dev:market-actions" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const merchant = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "merchant-kaya")!;
  player.zoneId = merchant.zoneId;
  player.x = merchant.x;
  player.y = merchant.y;
  player.gold = 20;
  setItemQty(player, "glade-berries", 0);

  await server.receiveInput(player.id, { action: "trade", targetId: merchant.id, devField: "market", devText: "buy", itemId: "glade-berries" });
  await server.tick(0.6);

  expect(player.gold).toBe(14);
  expect(itemQty(player, "glade-berries")).toBe(1);

  await server.receiveInput(player.id, { action: "trade", targetId: merchant.id, devField: "market", devText: "sell", itemId: "glade-berries" });
  await server.tick(0.6);

  expect(player.gold).toBe(16);
  expect(itemQty(player, "glade-berries")).toBe(0);

  const foreman = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "foreman-iron-will")!;
  player.zoneId = foreman.zoneId;
  player.x = foreman.x;
  player.y = foreman.y;
  player.gold = 20;
  setItemQty(player, "pickaxe", 0);

  await server.receiveInput(player.id, { action: "trade", targetId: foreman.id, devField: "market", devText: "buy", itemId: "pickaxe" });
  await server.tick(0.6);

  expect(player.gold).toBe(8);
  expect(itemQty(player, "pickaxe")).toBe(1);
});

test("MMO Skill Demo live world events reward players in the active event zone", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "world-event-reward");
  const firstJoin = await server.joinRoom({ roomId: "world-event-reward", roomType: "mmo-skill-demo", token: "dev:rally" });
  const secondJoin = await server.joinRoom({ roomId: "world-event-reward", roomType: "mmo-skill-demo", token: "dev:miner" });
  expect(firstJoin.ok).toBe(true);
  expect(secondJoin.ok).toBe(true);

  room.ctx.state.worldEventId = "ashwood-pack";
  room.ctx.state.worldEventName = "Ashwood Pack Rally";
  room.ctx.state.worldEventZoneId = "ashwood";
  room.ctx.state.worldEventPhase = "active";
  room.ctx.state.worldEventProgress = 0;
  room.ctx.state.worldEventGoal = 1;
  room.ctx.state.worldEventTimerMs = 60000;

  const rallyPlayer = room.ctx.state.players[firstJoin.player!.id];
  const distantPlayer = room.ctx.state.players[secondJoin.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  rallyPlayer.x = wolf.x - 34;
  rallyPlayer.y = wolf.y;
  rallyPlayer.zoneId = wolf.zoneId;
  distantPlayer.x = 18 * 32 + 16;
  distantPlayer.y = 18 * 32 + 16;
  distantPlayer.zoneId = "crags";
  wolf.hp = 1;

  const rallyRenown = rallyPlayer.renown;
  const distantRenown = distantPlayer.renown;
  await tapPummel(server, rallyPlayer.id, { action: "lmb", targetId: wolf.id });

  expect(room.ctx.state.worldEventPhase).toBe("success");
  expect(room.ctx.state.worldEventProgress).toBe(1);
  expect(rallyPlayer.renown).toBeGreaterThan(rallyRenown);
  expect(distantPlayer.renown).toBe(distantRenown);
});
