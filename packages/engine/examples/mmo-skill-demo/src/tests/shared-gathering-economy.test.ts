import { expect, test } from "bun:test";
import { dailyQuestArcForDate } from "../data/daily-quests.ts";
import { worldGatherableNodeSpecs } from "../data/world-gatherables.ts";
import { addItem, hasInventoryItem, hasQuestFlag, itemQty, setItemQty, selectedAbilityForSlot } from "../shared-loadout.ts";
import { mmoSkillDemoZone } from "../shared-room.ts";
import { totalXpForLevel } from "../shared/skills.ts";
import { createAuthoritativeServer, tapPummel } from "./shared-test-support.ts";

test("MMO Skill Demo inputs advance schema-owned combat and gathering state", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "ashwood-action");
  const join = await server.joinRoom({ roomId: "ashwood-action", roomType: "mmo-skill-demo", token: "dev:alice" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const goblin = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.x = goblin.x - 34;
  player.y = goblin.y;
  await tapPummel(server, player.id, { action: "attack", targetId: goblin.id });
  expect(room.ctx.state.npcs[goblin.id].hp).toBeLessThan(goblin.maxHp);
  expect(room.ctx.state.effects.some((effect) => effect.effectKind === "damage" && effect.text.startsWith("-"))).toBe(true);
  expect(room.ctx.state.players[player.id].combatXp).toBeGreaterThan(0);

  const ore = Object.values(room.ctx.state.resources).find((node) => node.kind === "ore")!;
  player.x = ore.x - 34;
  player.y = ore.y;
  addItem(player, "pickaxe");
  player.cooldownMs = 0;
  await server.receiveInput(player.id, { action: "mine", targetId: ore.id });
  await server.tick(4.1);
  expect(room.ctx.state.players[player.id].miningXp).toBeGreaterThan(0);
});

test("MMO Skill Demo gathering starts a server-authoritative duration meter", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "gather-level-cooldown");
  const join = await server.joinRoom({ roomId: "gather-level-cooldown", roomType: "mmo-skill-demo", token: "dev:gather-speed" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const ore = Object.values(room.ctx.state.resources).find((node) => node.kind === "ore")!;
  player.zoneId = ore.zoneId;
  player.x = ore.x - 34;
  player.y = ore.y;
  addItem(player, "pickaxe");

  await server.receiveInput(player.id, { action: "mine", targetId: ore.id });
  await server.tick(0);
  expect(player.activeGatherNodeId).toBe(ore.id);
  expect(player.activeGatherTotalMs).toBe(4000);
  expect(player.activeGatherMs).toBe(0);

  await server.tick(2);
  expect(player.activeGatherMs).toBe(2000);
  expect(ore.depleted).toBe(false);

  await server.tick(2.1);
  expect(player.activeGatherNodeId).toBe("");
  expect(ore.depleted).toBe(true);
  expect(player.miningXp).toBeGreaterThan(0);
});

test("MMO Skill Demo interact button starts resource gathering", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "interact-gather-resource");
  const join = await server.joinRoom({ roomId: "interact-gather-resource", roomType: "mmo-skill-demo", token: "dev:interact-gather" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const tree = Object.values(room.ctx.state.resources).find((node) => node.kind === "tree")!;
  tree.skillId = "lumberjacking";
  tree.materialId = 1;
  player.zoneId = tree.zoneId;
  player.x = tree.x - 34;
  player.y = tree.y;
  addItem(player, "training-hatchet");

  await server.receiveInput(player.id, { action: "interact", targetId: tree.id });
  await server.tick(0);
  expect(player.action).toBe("woodcut");
  expect(player.activeGatherNodeId).toBe(tree.id);

  await server.tick(4.1);
  expect(tree.depleted).toBe(true);
  expect(player.woodcuttingXp).toBeGreaterThan(0);
});

test("MMO Skill Demo low-level gathering shows readable feedback", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "low-level-gather-feedback");
  const join = await server.joinRoom({ roomId: "low-level-gather-feedback", roomType: "mmo-skill-demo", token: "dev:low-level-gather" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const tree = Object.values(room.ctx.state.resources).find((node) => node.kind === "tree")!;
  tree.skillId = "lumberjacking";
  tree.materialId = 2;
  player.zoneId = tree.zoneId;
  player.x = tree.x - 34;
  player.y = tree.y;
  addItem(player, "training-hatchet");

  await server.receiveInput(player.id, { action: "interact", targetId: tree.id });
  await server.tick(0);

  expect(player.activeGatherNodeId).toBe("");
  expect(tree.depleted).toBe(false);
  expect(room.ctx.state.effects.some((effect) => effect.effectKind === "damage" && effect.text === "Too low level")).toBe(true);
});

test("MMO Skill Demo gathering missing tool shows readable feedback", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "missing-tool-gather-feedback");
  const join = await server.joinRoom({ roomId: "missing-tool-gather-feedback", roomType: "mmo-skill-demo", token: "dev:missing-tool-gather" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const spec = worldGatherableNodeSpecs.find((node) => node.materialName === "Twilight Sky-Oats")!;
  const node = room.ctx.state.resources[spec.id]!;
  player.zoneId = node.zoneId;
  player.x = node.x - 24;
  player.y = node.y;
  player.gatheringXp = { ...(player.gatheringXp ?? {}), "crop-harvesting": totalXpForLevel(60) };

  await server.receiveInput(player.id, { action: "interact", targetId: node.id });
  await server.tick(0);

  expect(player.activeGatherNodeId).toBe("");
  expect(node.depleted).toBe(false);
  expect(room.ctx.state.effects.some((effect) => effect.effectKind === "damage" && effect.text === "Need Sickle")).toBe(true);
});

test("MMO Skill Demo gathering aborts show readable feedback", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "moved-gather-feedback");
  const join = await server.joinRoom({ roomId: "moved-gather-feedback", roomType: "mmo-skill-demo", token: "dev:moved-gather" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const tree = Object.values(room.ctx.state.resources).find((node) => node.kind === "tree")!;
  player.zoneId = tree.zoneId;
  player.x = tree.x - 24;
  player.y = tree.y;
  addItem(player, "training-hatchet");

  await server.receiveInput(player.id, { action: "interact", targetId: tree.id });
  await server.tick(0);
  expect(player.activeGatherNodeId).toBe(tree.id);

  player.x += 8;
  await server.tick(0.1);

  expect(player.activeGatherNodeId).toBe("");
  expect(room.ctx.state.effects.some((effect) => effect.effectKind === "damage" && effect.text === "Moved")).toBe(true);
});

test("MMO Skill Demo gathering clears momentum drift instead of aborting", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "momentum-gather");
  const join = await server.joinRoom({ roomId: "momentum-gather", roomType: "mmo-skill-demo", token: "dev:momentum-gather" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const tree = Object.values(room.ctx.state.resources).find((node) => node.kind === "tree")!;
  player.zoneId = tree.zoneId;
  player.x = tree.x - 24;
  player.y = tree.y;
  addItem(player, "training-hatchet");

  await server.receiveInput(player.id, { action: "idle", dx: 1, dy: 0, aimX: player.x + 500, aimY: player.y });
  await server.tick(0.5);
  expect(Math.hypot(player.momentumX ?? 0, player.momentumY ?? 0)).toBeGreaterThan(0);

  player.x = tree.x - 24;
  player.y = tree.y;
  await server.receiveInput(player.id, { action: "interact", targetId: tree.id, dx: 0, dy: 0 });
  await server.tick(0);
  expect(player.activeGatherNodeId).toBe(tree.id);
  expect(Math.hypot(player.momentumX ?? 0, player.momentumY ?? 0)).toBe(0);

  await server.receiveInput(player.id, { action: "idle", dx: 0, dy: 0 });
  await server.tick(0);
  await server.tick(0);

  expect(player.activeGatherNodeId).toBe(tree.id);
  expect(room.ctx.state.effects.some((effect) => effect.effectKind === "damage" && effect.text === "Moved")).toBe(false);
});

test("MMO Skill Demo gathering grants faction reputation and world materials", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "expanded-gather-rep");
  const join = await server.joinRoom({ roomId: "expanded-gather-rep", roomType: "mmo-skill-demo", token: "dev:expanded-gather" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const tree = Object.values(room.ctx.state.resources).find((node) => node.kind === "tree")!;
  player.zoneId = tree.zoneId;
  player.x = tree.x - 34;
  player.y = tree.y;
  addItem(player, "training-hatchet");
  tree.hp = 1;

  await server.receiveInput(player.id, { action: "woodcut", targetId: tree.id });
  await server.tick(4.1);

  const gatheredMaterialTotal = ["oakhaven-softwood", "soft-pine-bark", "oak-sap-extract", "dry-bramble-branch", "bright-clover-flower", "wild-oats-bundle", "bitter-root-herb"]
    .reduce((total, itemId) => total + itemQty(player, itemId), 0);
  expect(tree.depleted).toBe(true);
  expect(itemQty(player, "rep-oakhaven")).toBeGreaterThan(0);
  expect(gatheredMaterialTotal).toBeGreaterThan(0);
});

test("MMO Skill Demo faction reputation unlocks tier rewards through schema-safe flags", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "expanded-rep-reward");
  const join = await server.joinRoom({ roomId: "expanded-rep-reward", roomType: "mmo-skill-demo", token: "dev:rep-reward" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  setItemQty(player, "rep-oakhaven", 24);
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 34;
  player.y = wolf.y;
  wolf.hp = 1;

  await tapPummel(server, player.id, { action: "lmb", targetId: wolf.id });

  expect(itemQty(player, "rep-oakhaven")).toBeGreaterThanOrEqual(25);
  expect(hasQuestFlag(player, "reward-oakhaven-druid-guild-entry")).toBe(true);
  expect(itemQty(player, "elderwood-ash")).toBeGreaterThan(0);
});

test("MMO Skill Demo daily quest branch choices apply server-authoritative reputation and rewards", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "daily-quest-branch");
  const join = await server.joinRoom({ roomId: "daily-quest-branch", roomType: "mmo-skill-demo", token: "dev:daily-quest" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const arc = dailyQuestArcForDate(player.dailyQuestDate);
  const step = arc.steps[0];
  player.dailyQuestStep = 0;
  player.dailyQuestProgress = step.targetCount;
  player.dailyQuestCompleted = false;
  const choice = step.choices[0];
  const beforePrimary = itemQty(player, `rep-${arc.primaryFaction}`);

  await server.receiveInput(player.id, { action: "config", devField: "dailyChoice", devText: choice.id });
  await server.tick(0);

  expect(player.dailyQuestStep).toBe(1);
  expect(player.dailyQuestProgress).toBe(0);
  expect(itemQty(player, `rep-${arc.primaryFaction}`)).toBeGreaterThan(beforePrimary);
  expect(itemQty(player, step.rewardMaterialId)).toBeGreaterThan(0);
  expect(hasQuestFlag(player, `daily:${arc.dateString}:0:${choice.id}`)).toBe(true);
});

test("MMO Skill Demo NPC stations craft representative world materials into gameplay items", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "expanded-crafting");
  const join = await server.joinRoom({ roomId: "expanded-crafting", roomType: "mmo-skill-demo", token: "dev:expanded-craft" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const foreman = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "foreman-iron-will")!;
  const blacksmith = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "blacksmith-silas" && npc.zoneId === "crags")!;
  player.gold = 40;
  addItem(player, "iron-ore", 4);
  addItem(player, "fine-coal-lump", 1);
  player.zoneId = foreman.zoneId;
  player.x = foreman.x - 24;
  player.y = foreman.y;

  await server.receiveInput(player.id, { action: "interact", targetId: foreman.id });
  await server.tick(0);

  expect(itemQty(player, "refined-iron-ingot")).toBe(1);
  expect(itemQty(player, "rep-ironcrag")).toBeGreaterThanOrEqual(2);

  player.cooldownMs = 0;
  player.cooldowns = {};
  addItem(player, "refined-iron-ingot", 1);
  addItem(player, "crawler-chitin-block", 1);
  player.zoneId = blacksmith.zoneId;
  player.x = blacksmith.x - 24;
  player.y = blacksmith.y;

  await server.receiveInput(player.id, { action: "interact", targetId: blacksmith.id });
  await server.tick(0);

  expect(hasInventoryItem(player, "iron-chest")).toBe(true);
  expect(player.equipment["iron-chest"]).toBe("iron-chest");
});

test("MMO Skill Demo bow inventory unlocks configurable bow abilities", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "bow-loadout");
  const join = await server.joinRoom({ roomId: "bow-loadout", roomType: "mmo-skill-demo", token: "dev:archer" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  setItemQty(player, "bow", 1);
  expect(itemQty(player, "bow")).toBe(1);

  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "bow" });
  await server.tick(0);
  expect(player.equippedWeaponId).toBe("bow");
  expect(selectedAbilityForSlot(player, "RMB")).toBe("bow-precision");

  await server.receiveInput(player.id, { action: "config", devField: "RMB", devText: "bow-volley" });
  await server.tick(0);
  expect(selectedAbilityForSlot(player, "RMB")).toBe("bow-volley");

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 96;
  player.y = wolf.y;
  wolf.hp = wolf.maxHp;
  await server.receiveInput(player.id, { action: "rmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.12);

  expect(wolf.hp).toBeLessThan(wolf.maxHp);
  expect(player.cooldowns.RMB).toBeGreaterThan(0);

  player.energy = 0;
  await server.receiveInput(player.id, { action: "r", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  expect(player.activeAbility).toBe("");

  player.energy = player.maxEnergy;
  await server.receiveInput(player.id, { action: "r", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  expect(player.activeAbility).toBe("bow-flurry");
  expect(player.energy).toBe(0);
});
