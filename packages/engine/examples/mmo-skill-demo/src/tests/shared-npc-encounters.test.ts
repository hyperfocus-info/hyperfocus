import { expect, test } from "bun:test";
import { encodeDelta, encodeSnapshot } from "@hyperfocus/engine/protocol";
import { mmoSkillDemoRegionConfig, TILE } from "../data/world.ts";
import { bestiaryById } from "../data/bestiary.ts";
import { createMmoSkillDemoState, mmoSkillDemoNpcRespawnMs } from "../shared-world-state.ts";
import { mmoSkillDemoDungeon, mmoSkillDemoZone } from "../shared-room.ts";
import { mmoSkillDemoSchema } from "../schema.ts";
import { syncMmoEntityRegistry } from "../shared-entity-registry.ts";
import { castCrushingLeap, createAuthoritativeServer, isolateCombatTarget, tapPummel } from "./shared-test-support.ts";

test("MMO Skill Demo support and bomber enemies add readable encounter roles", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "new-enemy-roles");
  const join = await server.joinRoom({ roomId: "new-enemy-roles", roomType: "mmo-skill-demo", token: "dev:roles" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  const priest = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "rune-priest")!;
  const guard = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "bazaar-guard")!;
  const bomber = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "mire-bomber")!;

  guard.hp = 20;
  priest.x = guard.x - 24;
  priest.y = guard.y;
  priest.zoneId = guard.zoneId;
  priest.projectileCooldownMs = 0;
  await server.tick();
  expect(guard.hp).toBeGreaterThan(20);

  player.zoneId = bomber.zoneId;
  player.x = bomber.x - 96;
  player.y = bomber.y;
  bomber.projectileCooldownMs = 0;
  await server.tick();
  expect(Object.values(room.ctx.state.hazards).some((hazard) => hazard.ownerId === bomber.id && hazard.kind === "aoe")).toBe(true);
});

test("MMO Skill Demo enemy melee attacks expose hit markers and clamped casts", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "enemy-hit-marker-casts");
  const join = await server.joinRoom({ roomId: "enemy-hit-marker-casts", roomType: "mmo-skill-demo", token: "dev:enemy-hit-marker" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  isolateCombatTarget(room.ctx.state, wolf.id);
  player.zoneId = wolf.zoneId;
  player.x = wolf.x + 18;
  player.y = wolf.y;
  wolf.combatFlags = `aggro:${player.id}`;
  wolf.stunMs = 0;
  wolf.attackCooldownMs = 0;
  wolf.projectileCooldownMs = 9999;
  const hpBefore = player.hp;

  await server.tick(0);

  expect(wolf.castMs).toBeGreaterThanOrEqual(200);
  expect(wolf.castMs).toBeLessThanOrEqual(1400);
  expect(player.hp).toBe(hpBefore);
  expect(Object.values(room.ctx.state.hazards).some((hazard) => hazard.ownerId === wolf.id && hazard.damage > 0 && hazard.windupMs >= 200 && hazard.windupMs <= 1400)).toBe(true);

  await server.tick(0.21);
  expect(player.hp).toBeLessThan(hpBefore);
});

test("MMO Skill Demo sight aggro reaches doubled detection range", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "doubled-aggro-range");
  const join = await server.joinRoom({ roomId: "doubled-aggro-range", roomType: "mmo-skill-demo", token: "dev:aggro-range" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const bat = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "iron-eye-bat")!;
  for (const npc of Object.values(room.ctx.state.npcs)) {
    if (npc.id !== bat.id) npc.hp = 0;
  }

  bat.zoneId = player.zoneId;
  bat.x = player.x + 260;
  bat.y = player.y;
  bat.spawnX = bat.x;
  bat.spawnY = bat.y;
  bat.projectileCooldownMs = 5000;

  await server.tick(0);
  const startX = bat.x;
  await server.tick(1);

  expect(bat.x).toBeLessThan(startX);
});

test("MMO Skill Demo neutral ecology tags suppress sight aggro until provoked", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "neutral-ecology-aggro");
  const join = await server.joinRoom({ roomId: "neutral-ecology-aggro", roomType: "mmo-skill-demo", token: "dev:eco-aggro" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const spider = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "gloom-weaver-spider")!;
  for (const npc of Object.values(room.ctx.state.npcs)) {
    if (npc.id !== spider.id) npc.hp = 0;
  }

  spider.zoneId = "ashwood";
  spider.x = 2200;
  spider.y = 2200;
  spider.spawnX = spider.x;
  spider.spawnY = spider.y;
  spider.hp = spider.maxHp;
  spider.projectileCooldownMs = 5000;
  player.zoneId = spider.zoneId;
  player.x = spider.x - 260;
  player.y = spider.y;

  await server.tick(0);
  const idleX = spider.x;
  const idleY = spider.y;
  await server.tick(1);
  expect(spider.x).toBe(idleX);
  expect(spider.y).toBe(idleY);

  spider.hp = spider.maxHp - 1;
  await server.tick(1);
  expect(Math.hypot(spider.x - idleX, spider.y - idleY)).toBeGreaterThan(0);
});

test("MMO Skill Demo spawns four added enemy types with stronger health", () => {
  const world = createMmoSkillDemoState();
  const dungeon = createMmoSkillDemoState("dungeon-party-test");
  const worldKinds = new Set(Object.values(world.npcs).map((npc) => npc.kind));
  const dungeonKinds = new Set(Object.values(dungeon.npcs).map((npc) => npc.kind));
  const wolf = Object.values(world.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  const bramble = Object.values(world.npcs).find((npc) => npc.kind === "ash-bramble-stalker")!;

  expect(worldKinds.has("ash-bramble-stalker")).toBe(true);
  expect(worldKinds.has("crag-sapper")).toBe(true);
  expect(worldKinds.has("veil-oracle")).toBe(true);
  expect(dungeonKinds.has("dungeon-revenant")).toBe(true);
  expect(bramble.maxHp).toBeGreaterThan(wolf.maxHp);
});

test("MMO Skill Demo spawned hostile kinds have explicit bestiary profiles", () => {
  const supportRoles = new Set(["quest", "trainer", "bank", "merchant", "travel", "contract", "crafting", "hidden", "home"]);
  const states = [createMmoSkillDemoState(), createMmoSkillDemoState("dungeon-party-test")];
  const hostileKinds = new Set(
    states.flatMap((state) => Object.values(state.npcs).filter((npc) => !supportRoles.has(npc.role)).map((npc) => npc.kind))
  );

  expect([...hostileKinds].filter((kind) => !bestiaryById[kind])).toEqual([]);
});

test("MMO Skill Demo enemy camps add world congregations", () => {
  const world = createMmoSkillDemoState();
  const counts = Object.values(world.npcs).reduce((acc, npc) => acc.set(npc.kind, (acc.get(npc.kind) ?? 0) + 1), new Map<string, number>());
  for (const kind of ["bramble-beast", "sapper-goblin", "marrow-cove-rat", "spire-sentinel", "high-peak-eagle", "scavenger-jackal", "rift-leech", "void-crawler", "cursed-oracle", "void-amalgam"]) {
    expect(counts.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(2);
  }
});

test("MMO Skill Demo keeps shared-world hostile spawns beyond town safe screens", () => {
  const supportRoles = new Set(["quest", "trainer", "bank", "merchant", "travel", "contract", "crafting", "hidden", "home"]);
  const townCenters = mmoSkillDemoRegionConfig.anchors
    .filter((anchor) => anchor.kind === "town" || anchor.id === "obsidian-sanctum")
    .map((anchor) => ({ id: anchor.id, x: anchor.tileX * TILE + TILE * 0.5, y: anchor.tileY * TILE + TILE * 0.5 }));
  const minDistance = 960 * 1.5;
  const world = createMmoSkillDemoState();
  const offenders = Object.values(world.npcs)
    .filter((npc) => !supportRoles.has(npc.role) && npc.role !== "boss-node")
    .flatMap((npc) =>
      townCenters
        .map((town) => ({ npc: npc.kind, town: town.id, distance: Math.hypot(npc.x - town.x, npc.y - town.y) }))
        .filter((entry) => entry.distance < minDistance)
        .map((entry) => `${entry.npc}@${entry.town}:${Math.round(entry.distance)}`)
    );

  expect(offenders).toEqual([]);
});

test("MMO Skill Demo enemy health scales 1.5x to 4x by strength", () => {
  const world = createMmoSkillDemoState();
  const dungeon = createMmoSkillDemoState("dungeon-party-test");
  const wolves = Object.values(world.npcs).filter((npc) => npc.kind === "prowling-wolf");
  const sapper = Object.values(world.npcs).find((npc) => npc.kind === "crag-sapper" && npc.maxHp === 104);
  const alpha = Object.values(world.npcs).find((npc) => npc.kind === "alpha-timberwolf")!;
  const boss = Object.values(dungeon.npcs).find((npc) => npc.kind === "great-ash-lord")!;
  const banker = Object.values(world.npcs).find((npc) => npc.kind === "banker-valerius")!;

  expect(wolves.some((npc) => npc.maxHp === 39 || npc.maxHp === 42)).toBe(true);
  expect(sapper).toBeDefined();
  expect(alpha.maxHp).toBe(276);
  expect(boss.maxHp).toBe(840);
  expect(banker.maxHp).toBe(120);
});

test("MMO Skill Demo enemy respawn timers scale 10x to 30x by strength", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone, mmoSkillDemoDungeon]
  });
  const killKindWithPummel = async (roomId: string, kind: string) => {
    const room = server.createRoom("mmo-skill-demo", roomId);
    const join = await server.joinRoom({ roomId, roomType: "mmo-skill-demo", token: `dev:${roomId}` });
    expect(join.ok).toBe(true);
    const player = room.ctx.state.players[join.player!.id];
    const target = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === kind)!;
    player.zoneId = target.zoneId;
    player.x = target.x - 20;
    player.y = target.y;
    player.aimX = target.x;
    player.aimY = target.y;
    player.combatLevel = 20;
    player.cooldownMs = 0;
    player.cooldowns = {};
    player.activeAbility = "";
    player.activeSlot = "";
    player.activeMs = 0;
    player.activeDurationMs = 0;
    player.chargeMs = 0;
    player.castMs = 0;
    player.abilityHits = "";
    target.hp = 1;
    target.respawnMs = 0;
    target.phaseMs = 0;
    target.iframeMs = 0;

    await tapPummel(server, player.id, { action: "lmb", targetId: target.id, aimX: target.x, aimY: target.y });

    if (target.hp !== 0) throw new Error(`${kind} survived pummel with ${target.hp} hp`);
    expect(target.hp).toBe(0);
    return target.respawnMs;
  };

  const wolfTimer = await killKindWithPummel("respawn-scale-wolf", "prowling-wolf");
  const alphaTimer = await killKindWithPummel("respawn-scale-alpha", "alpha-timberwolf");
  const dungeonState = createMmoSkillDemoState("respawn-scale-boss-dungeon");
  const boss = Object.values(dungeonState.npcs).find((npc) => npc.kind === "great-ash-lord")!;
  const bossTimer = mmoSkillDemoNpcRespawnMs(boss);

  expect(wolfTimer).toBeGreaterThanOrEqual(51500);
  expect(wolfTimer).toBeLessThanOrEqual(52000);
  expect(alphaTimer).toBeGreaterThanOrEqual(239000);
  expect(alphaTimer).toBeLessThanOrEqual(240000);
  expect(bossTimer).toBe(540000);
  expect(bossTimer).toBeGreaterThan(0xffff);
});

test("MMO Skill Demo melee pack hunters lunge instead of firing ranged lines", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "wolf-lunge");
  const join = await server.joinRoom({ roomId: "wolf-lunge", roomType: "mmo-skill-demo", token: "dev:wolf-lunge" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x + 108;
  player.y = wolf.y;
  player.hp = player.maxHp;
  wolf.projectileCooldownMs = 0;
  wolf.attackCooldownMs = 0;
  const beforeDistance = Math.hypot(player.x - wolf.x, player.y - wolf.y);

  await server.tick();

  expect(Math.hypot(player.x - wolf.x, player.y - wolf.y)).toBeLessThan(beforeDistance);
  expect(player.hp).toBe(player.maxHp);
  expect(Object.values(room.ctx.state.hazards).some((hazard) => hazard.ownerId === wolf.id && hazard.kind === "line")).toBe(true);

  await server.tick(0.9);

  expect(player.hp).toBeLessThan(player.maxHp);
});

test("MMO Skill Demo elite melee wolves show lunge indicators before hits", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "alpha-lunge");
  const join = await server.joinRoom({ roomId: "alpha-lunge", roomType: "mmo-skill-demo", token: "dev:alpha-lunge" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  const alpha = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "alpha-timberwolf")!;
  player.zoneId = alpha.zoneId;
  player.x = alpha.x + 136;
  player.y = alpha.y;
  player.hp = player.maxHp;
  alpha.phaseMs = 0;
  alpha.projectileCooldownMs = 0;
  alpha.attackCooldownMs = 0;
  const beforeDistance = Math.hypot(player.x - alpha.x, player.y - alpha.y);

  await server.tick();

  expect(Math.hypot(player.x - alpha.x, player.y - alpha.y)).toBeLessThan(beforeDistance);
  expect(player.hp).toBe(player.maxHp);
  expect(Object.values(room.ctx.state.hazards).some((hazard) => hazard.ownerId === alpha.id && hazard.kind === "line")).toBe(true);

  await server.tick(0.9);

  expect(player.hp).toBeLessThan(player.maxHp);
});

test("MMO Skill Demo stronger enemies phase through invulnerability then buffed attacks", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone, mmoSkillDemoDungeon]
  });
  const world = server.createRoom("mmo-skill-demo", "strong-phase");
  const worldJoin = await server.joinRoom({ roomId: "strong-phase", roomType: "mmo-skill-demo", token: "dev:phase" });
  expect(worldJoin.ok).toBe(true);

  const worldPlayer = world.ctx.state.players[worldJoin.player!.id];
  const gargoyle = Object.values(world.ctx.state.npcs).find((npc) => npc.kind === "crag-gargoyle")!;
  worldPlayer.zoneId = gargoyle.zoneId;
  worldPlayer.x = gargoyle.x - 34;
  worldPlayer.y = gargoyle.y;
  worldPlayer.combatLevel = 12;
  gargoyle.phaseMs = 3300;
  gargoyle.hp = gargoyle.maxHp;
  await tapPummel(server, worldPlayer.id, { action: "lmb", targetId: gargoyle.id });
  expect(gargoyle.hp).toBe(gargoyle.maxHp);

  const dungeon = server.createRoom("mmo-skill-demo-dungeon", "dungeon-phase");
  const dungeonJoin = await server.joinRoom({ roomId: "dungeon-phase", roomType: "mmo-skill-demo-dungeon", token: "dev:revenant" });
  expect(dungeonJoin.ok).toBe(true);
  const dungeonPlayer = dungeon.ctx.state.players[dungeonJoin.player!.id];
  const revenant = Object.values(dungeon.ctx.state.npcs).find((npc) => npc.kind === "dungeon-revenant")!;
  dungeonPlayer.zoneId = revenant.zoneId;
  dungeonPlayer.x = revenant.x - 90;
  dungeonPlayer.y = revenant.y;
  revenant.phaseMs = 5300;
  revenant.projectileCooldownMs = 0;
  await server.tick();

  expect(Object.values(dungeon.ctx.state.hazards).some((hazard) => hazard.ownerId === revenant.id && hazard.kind === "line")).toBe(true);
});

test("MMO Skill Demo crushing leap applies slam crowd-control metadata", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "combat-kbm");
  const join = await server.joinRoom({ roomId: "combat-kbm", roomType: "mmo-skill-demo", token: "dev:kbm" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 42;
  player.y = wolf.y;
  player.combatLevel = 6;
  player.abilitySlots.RMB = "unlocked";
  player.abilitySlots["rmb-crushing-blow"] = "RMB";
  player.cooldownMs = 0;

  await castCrushingLeap(server, player.id, { action: "rmb", aimX: wolf.x, aimY: wolf.y });

  expect(wolf.hp).toBeLessThan(wolf.maxHp);
  expect(wolf.stunMs).toBeGreaterThan(0);
  expect(wolf.slowMs).toBeGreaterThan(0);
  expect(player.castMs).toBeGreaterThan(0);
});

test("MMO Skill Demo crushing leap keeps replicated timer extensions encodable", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "combat-kbm-u16");
  const join = await server.joinRoom({ roomId: "combat-kbm-u16", roomType: "mmo-skill-demo", token: "dev:kbm-u16" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 42;
  player.y = wolf.y;
  player.combatLevel = 6;
  player.abilitySlots.RMB = "unlocked";
  player.abilitySlots["rmb-crushing-blow"] = "RMB";
  player.cooldownMs = 0;
  wolf.attackCooldownMs = 65400;
  wolf.projectileCooldownMs = 65400;

  await server.tick(0.016);
  const before = structuredClone(room.snapshotFor(player.id));
  await castCrushingLeap(server, player.id, { action: "rmb", aimX: wolf.x, aimY: wolf.y });
  const after = structuredClone(room.snapshotFor(player.id));

  expect(wolf.attackCooldownMs).toBeLessThanOrEqual(65535);
  expect(wolf.projectileCooldownMs).toBeLessThanOrEqual(65535);
  expect(() => encodeSnapshot(mmoSkillDemoSchema, after)).not.toThrow();
  expect(() => encodeDelta(mmoSkillDemoSchema, before, after)).not.toThrow();
});

test("MMO Skill Demo personalities drive aggro-tree neutrality and vacuum roots", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "persona-tree");
  const join = await server.joinRoom({ roomId: "persona-tree", roomType: "mmo-skill-demo", token: "dev:tree" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const tree = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "aggro-tree")!;
  player.zoneId = tree.zoneId;
  player.x = tree.x - 112;
  player.y = tree.y;
  tree.projectileCooldownMs = 0;
  await server.tick();
  expect(Object.values(room.ctx.state.hazards).some((hazard) => hazard.ownerId === tree.id)).toBe(false);

  tree.hp = tree.maxHp - 1;
  tree.projectileCooldownMs = 0;
  await server.tick();
  const root = Object.values(room.ctx.state.hazards).find((hazard) => hazard.ownerId === tree.id);
  expect(root).toBeDefined();
  expect(root!.knockbackModifier).toBeLessThan(0);
  expect(tree.personality).toBe("territorial-rooted");
});

test("MMO Skill Demo boss phase minigames spawn shield objects", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoDungeon]
  });
  const room = server.createRoom("mmo-skill-demo-dungeon", "dungeon-boss-minigames");
  const join = await server.joinRoom({ roomId: "dungeon-boss-minigames", roomType: "mmo-skill-demo-dungeon", token: "dev:boss-phase" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  const ashLord = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "great-ash-lord")!;
  const mirror = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "mirror-king")!;

  player.zoneId = "dungeon";
  ashLord.hp = Math.floor(ashLord.maxHp * 0.65);
  await server.tick();
  expect(Object.values(room.ctx.state.npcs).filter((npc) => npc.kind === "spore-pod" && npc.hp > 0)).toHaveLength(4);
  expect(ashLord.combatState).toBe("spore-shield");

  mirror.hp = Math.floor(mirror.maxHp * 0.49);
  await server.tick();
  expect(Object.values(room.ctx.state.npcs).filter((npc) => npc.kind === "glass-clone" && npc.hp > 0)).toHaveLength(4);
  expect(mirror.combatState).toBe("gravity-well");
});

test("MMO Skill Demo 10-player Flurry boss benchmark stays under the server frame budget", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "flurry-dungeon-benchmark");
  const joins = [];
  for (let i = 0; i < 10; i += 1) {
    const join = await server.joinRoom({ roomId: "flurry-dungeon-benchmark", roomType: "mmo-skill-demo", token: `dev:flurry-bench-${i}` });
    expect(join.ok).toBe(true);
    joins.push(join);
  }

  const state = room.ctx.state;
  const boss = Object.values(state.npcs).find((npc) => npc.kind === "great-ash-lord")!;
  for (const id of Object.keys(state.npcs)) {
    if (id !== boss.id) delete state.npcs[id];
  }
  boss.hp = 60000;
  boss.maxHp = 60000;
  boss.attackCooldownMs = 60000;
  boss.projectileCooldownMs = 60000;
  boss.stunMs = 60000;
  boss.iframeMs = 0;
  boss.damageAmpMs = 0;
  boss.combatState = "";
  boss.combatFlags = "";

  for (let i = 0; i < joins.length; i += 1) {
    const player = state.players[joins[i].player!.id];
    player.x = Math.max(48, boss.x - 320);
    player.y = boss.y - 120 + i * 26;
    player.zoneId = "dungeon";
    player.hp = player.maxHp;
    player.energy = player.maxEnergy || 100;
    player.combatLevel = 20;
    player.inventory.bow = 1;
    player.equipment.weapon = "bow";
    player.equippedWeaponId = "bow";
    player.equipment["ability:R"] = "bow-flurry";
    player.abilitySlots["bow-flurry"] = "R";
    player.abilitySlots.R = "unlocked";
    player.aimX = boss.x;
    player.aimY = boss.y;
  }
  syncMmoEntityRegistry(state);

  for (const join of joins) await server.receiveInput(join.player!.id, { action: "r", aimX: boss.x, aimY: boss.y });
  await server.tick(0);

  const samples: number[] = [];
  for (let tick = 0; tick < 360; tick += 1) {
    for (const join of joins) {
      const player = state.players[join.player!.id];
      if (!player.activeAbility) player.energy = player.maxEnergy || 100;
      await server.receiveInput(player.id, { action: "r", aimX: boss.x, aimY: boss.y });
    }
    const start = performance.now();
    await server.tick(1 / 60);
    let bytes = 0;
    for (const join of joins) {
      const snapshot = mmoSkillDemoZone.getSnapshot!(room.ctx, join.player!);
      bytes += encodeSnapshot(mmoSkillDemoSchema, snapshot).byteLength;
    }
    expect(bytes).toBeGreaterThan(0);
    samples.push(performance.now() - start);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const avg = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const p95 = sorted[Math.floor(sorted.length * 0.95)];

  expect(avg).toBeLessThan(8);
  expect(p95).toBeLessThan(15);
  expect(60000 - state.npcs[boss.id].hp).toBeGreaterThan(1000);
  expect(Object.values(state.players).filter((player) => player.activeAbility === "bow-flurry")).toHaveLength(10);
  expect(Object.keys(state.hazards).length).toBeLessThanOrEqual(40);
});

test("MMO Skill Demo snapshots cap replicated hazards through the interest grid", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "hazard-interest-cap");
  const join = await server.joinRoom({ roomId: "hazard-interest-cap", roomType: "mmo-skill-demo", token: "dev:hazard-cap" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  player.zoneId = "dungeon";
  player.x = 1000;
  player.y = 600;
  for (let i = 0; i < 80; i += 1) {
    room.ctx.state.hazards[`bench-hazard-${i}`] = {
      id: `bench-hazard-${i}`,
      entityType: "hazard",
      kind: "line",
      zoneId: "dungeon",
      ownerId: player.id,
      x: player.x - 80 + (i % 10) * 16,
      y: player.y - 80 + Math.floor(i / 10) * 16,
      toX: player.x + 80,
      toY: player.y,
      radius: 8,
      windupMs: 0,
      lifetimeMs: 1000,
      damage: 0,
      knockbackModifier: 0,
      isHeavyImpact: false,
      armorPierce: false,
      effectKind: "arrow",
      text: "",
      pulse: 0
    };
  }
  syncMmoEntityRegistry(room.ctx.state);
  await server.tick(0);

  const snapshot = mmoSkillDemoZone.getSnapshot!(room.ctx, join.player!);
  expect(Object.keys(room.ctx.state.hazards)).toHaveLength(80);
  expect(Object.keys(snapshot.hazards).length).toBeLessThanOrEqual(16);
});
