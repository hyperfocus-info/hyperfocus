import { expect, test } from "bun:test";
import { encodeSnapshot } from "@hyperfocus/engine/protocol";
import { itemQty, setItemQty, selectedAbilityForSlot } from "../shared-loadout.ts";
import { mmoSkillDemoSchema } from "../schema.ts";
import { mmoSkillDemoZone } from "../shared-room.ts";
import { createAuthoritativeServer } from "./shared-test-support.ts";

function defaultPlayerPmsps(player: { combatLevel: number; masteryRank: number }) {
  return 118 + Math.min(38, player.combatLevel * 2) + Math.min(14, Math.max(0, player.masteryRank - 1) * 2);
}

test("MMO Skill Demo held Quick Shot recasts only after windup and cooldown", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "held-quick-shot-repeat");
  const join = await server.joinRoom({ roomId: "held-quick-shot-repeat", roomType: "mmo-skill-demo", token: "dev:held-quick" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 100;
  player.y = wolf.y;

  setItemQty(player, "bow", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "bow" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "lmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  expect(player.activeAbility).toBe("bow-quick-shot");

  await server.tick(0.12);
  expect(player.activeAbility).toBe("bow-quick-shot");
  expect(player.activeMs).toBeGreaterThanOrEqual(120);

  await server.tick(0.14);
  expect(player.activeAbility).toBe("");
  expect(player.cooldowns.LMB).toBeGreaterThan(0);

  await server.tick(0.05);
  expect(player.activeAbility).toBe("");

  await server.tick(0.06);
  expect(player.activeAbility).toBe("bow-quick-shot");
});

test("MMO Skill Demo staff loadout casts meteor and starts Maelstrom", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "staff-loadout");
  const join = await server.joinRoom({ roomId: "staff-loadout", roomType: "mmo-skill-demo", token: "dev:staff" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  setItemQty(player, "staff", 1);
  expect(itemQty(player, "staff")).toBe(1);

  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "staff" });
  await server.tick(0);
  expect(player.equippedWeaponId).toBe("staff");
  expect(selectedAbilityForSlot(player, "RMB")).toBe("staff-meteor");

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 120;
  player.y = wolf.y;
  wolf.hp = wolf.maxHp;
  await server.receiveInput(player.id, { action: "rmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(1);

  expect(wolf.hp).toBeLessThan(wolf.maxHp);
  expect(player.cooldowns.RMB).toBeGreaterThan(0);

  player.energy = player.maxEnergy;
  await server.receiveInput(player.id, { action: "r", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  expect(player.activeAbility).toBe("staff-maelstrom");
  expect(player.energy).toBe(0);
});

test("MMO Skill Demo wand Hex stacks feed Rupture", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "wand-loadout");
  const join = await server.joinRoom({ roomId: "wand-loadout", roomType: "mmo-skill-demo", token: "dev:wand" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  setItemQty(player, "wand", 1);
  expect(itemQty(player, "wand")).toBe(1);

  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "wand" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "config", devField: "LMB", devText: "wand-hex" });
  await server.tick(0);
  expect(player.equippedWeaponId).toBe("wand");
  expect(selectedAbilityForSlot(player, "LMB")).toBe("wand-hex");

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 100;
  player.y = wolf.y;
  wolf.hp = wolf.maxHp;
  wolf.stunMs = 9999;
  await server.receiveInput(player.id, { action: "lmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0.26);
  await server.tick(0.35);
  expect(wolf.combatFlags).toContain("hex:1");

  const afterHex = wolf.hp;
  await server.receiveInput(player.id, { action: "e", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.22);

  expect(wolf.hp).toBeLessThan(afterHex);
  expect(wolf.combatFlags).not.toContain("hex:");
  expect(player.cooldowns.E).toBeGreaterThan(0);
});

test("MMO Skill Demo projectile skills use travel time before impact", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "projectile-speed");
  const join = await server.joinRoom({ roomId: "projectile-speed", roomType: "mmo-skill-demo", token: "dev:projectile-speed" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  for (const npc of Object.values(room.ctx.state.npcs)) if (npc.id !== wolf.id) npc.zoneId = "crags";
  setItemQty(player, "staff", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "staff" });
  await server.tick(0);

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 360;
  player.y = wolf.y;
  wolf.hp = wolf.maxHp;
  wolf.stunMs = 9999;

  await server.receiveInput(player.id, { action: "lmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0.31);
  const projectile = Object.values(room.ctx.state.hazards).find((hazard) => hazard.effectKind === "arcane-bolt");
  expect(projectile?.x).toBeCloseTo(player.x + 10, 5);
  expect(projectile?.y).toBeCloseTo(player.y, 5);
  await server.tick(0.2);
  expect(wolf.hp).toBe(wolf.maxHp);

  await server.tick(0.25);
  expect(wolf.hp).toBeLessThan(wolf.maxHp);
});

test("MMO Skill Demo homing projectiles bend toward selected targets", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "projectile-homing");
  const join = await server.joinRoom({ roomId: "projectile-homing", roomType: "mmo-skill-demo", token: "dev:projectile-homing" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  for (const npc of Object.values(room.ctx.state.npcs)) if (npc.id !== wolf.id) npc.zoneId = "crags";
  setItemQty(player, "wand", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "wand" });
  await server.tick(0);

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 300;
  player.y = wolf.y;
  wolf.hp = wolf.maxHp;
  wolf.stunMs = 9999;

  await server.receiveInput(player.id, { action: "lmb", aimX: wolf.x, aimY: wolf.y + 90 });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", aimX: wolf.x, aimY: wolf.y + 90 });
  await server.tick(0.21);
  expect(wolf.hp).toBe(wolf.maxHp);

  await server.tick(0.65);
  await server.tick(0.35);
  expect(wolf.hp).toBeLessThan(wolf.maxHp);
});

test("MMO Skill Demo Magic Missile uses extended range and tuned payload", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "magic-missile-tuning");
  const join = await server.joinRoom({ roomId: "magic-missile-tuning", roomType: "mmo-skill-demo", token: "dev:magic-missile-tuning" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  for (const npc of Object.values(room.ctx.state.npcs)) if (npc.id !== wolf.id) npc.zoneId = "crags";
  setItemQty(player, "wand", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "wand" });
  await server.tick(0);

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 520;
  player.y = wolf.y;
  player.combatLevel = 1;
  wolf.hp = wolf.maxHp;
  wolf.stunMs = 9999;

  await server.receiveInput(player.id, { action: "lmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0.41);

  const projectile = Object.values(room.ctx.state.hazards).find((hazard) => hazard.effectKind === "missile");
  expect(projectile?.targetId).toBe(wolf.id);
  expect(projectile?.damage).toBe(7);
  expect(projectile?.knockbackModifier).toBeCloseTo(0.18);
  expect(projectile?.lifetimeMs).toBe(320);

  await server.tick(0.35);
  expect(wolf.hp).toBe(wolf.maxHp - 7);
});

test("MMO Skill Demo close wand projectiles leave visible travel traces", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "projectile-traces");
  const join = await server.joinRoom({ roomId: "projectile-traces", roomType: "mmo-skill-demo", token: "dev:projectile-traces" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  for (const npc of Object.values(room.ctx.state.npcs)) if (npc.id !== wolf.id) npc.zoneId = "crags";
  setItemQty(player, "wand", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "wand" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "config", devField: "LMB", devText: "wand-hex" });
  await server.tick(0);

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 70;
  player.y = wolf.y;
  wolf.hp = wolf.maxHp;
  wolf.stunMs = 9999;
  await server.receiveInput(player.id, { action: "lmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0.26);
  expect(room.ctx.state.effects.some((effect) => effect.kind === "line" && effect.effectKind === "hex")).toBe(true);
  await server.tick(0.2);
  expect(wolf.combatFlags).toContain("hex:1");
  expect(room.ctx.state.effects.some((effect) => effect.kind === "line" && effect.effectKind === "hex")).toBe(true);

  player.energy = player.maxEnergy;
  player.x = wolf.x - 80;
  player.y = wolf.y;
  await server.receiveInput(player.id, { action: "r", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.21);
  await server.tick(0.13);
  expect(room.ctx.state.effects.some((effect) => effect.kind === "line" && effect.effectKind === "chaos")).toBe(true);
});

test("MMO Skill Demo twin blades poison feeds Exsanguinate", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "twin-blades-loadout");
  const join = await server.joinRoom({ roomId: "twin-blades-loadout", roomType: "mmo-skill-demo", token: "dev:twin" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  setItemQty(player, "twin-blades", 1);
  expect(itemQty(player, "twin-blades")).toBe(1);

  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "twin-blades" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "config", devField: "LMB", devText: "twin-toxic-slash" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "config", devField: "RMB", devText: "twin-exsanguinate" });
  await server.tick(0);
  expect(player.equippedWeaponId).toBe("twin-blades");
  expect(selectedAbilityForSlot(player, "LMB")).toBe("twin-toxic-slash");

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 50;
  player.y = wolf.y;
  wolf.hp = wolf.maxHp;
  await server.receiveInput(player.id, { action: "lmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.26);
  expect(wolf.combatFlags).toContain("poison:");

  const afterPoison = wolf.hp;
  player.x = wolf.x - 50;
  player.y = wolf.y;
  await server.receiveInput(player.id, { action: "rmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.26);

  expect(wolf.hp).toBeLessThan(afterPoison);
  expect(wolf.combatFlags).not.toContain("poison:");
  expect(player.cooldowns.RMB).toBeGreaterThan(0);
  expect(() => encodeSnapshot(mmoSkillDemoSchema, room.ctx.state)).not.toThrow();
});

test("MMO Skill Demo melee basics dash before firing", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "melee-prefire-dash");
  const join = await server.joinRoom({ roomId: "melee-prefire-dash", roomType: "mmo-skill-demo", token: "dev:melee-dash" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  setItemQty(player, "twin-blades", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "twin-blades" });
  await server.tick(0);

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 80;
  player.y = wolf.y;
  wolf.hp = wolf.maxHp;
  wolf.stunMs = 9999;
  const startX = player.x;
  const pmsps = defaultPlayerPmsps(player);

  await server.receiveInput(player.id, { action: "lmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.21);

  expect(player.x - startX).toBeGreaterThan(pmsps * 0.15 - 1);
  expect(player.x - startX).toBeLessThan(pmsps * 0.15 + 1);
  expect(wolf.hp).toBeLessThan(wolf.maxHp);
});

test("MMO Skill Demo Space dashes use pmsps movement ranges", async () => {
  const cases = [
    { roomId: "space-dash-bow-reposition", weapon: "bow", ability: "bow-reposition", seconds: 0.31, expected: 1.4, sign: 1 },
    { roomId: "space-dash-bow-vault", weapon: "bow", ability: "bow-vault", seconds: 0.46, expected: 0.85, sign: -1 },
    { roomId: "space-dash-blade-roll", weapon: "blade", ability: "blade-combat-roll", seconds: 0.36, expected: 1.6, sign: 1 },
    { roomId: "space-dash-blade-leap", weapon: "blade", ability: "blade-leap-attack", seconds: 0.61, expected: 2.15, sign: 1 }
  ] as const;

  for (const dashCase of cases) {
    const server = createAuthoritativeServer({
      transport: "websocket",
      port: 0,
      rooms: [mmoSkillDemoZone]
    });
    const room = server.createRoom("mmo-skill-demo", dashCase.roomId);
    const join = await server.joinRoom({ roomId: dashCase.roomId, roomType: "mmo-skill-demo", token: `dev:${dashCase.roomId}` });
    expect(join.ok).toBe(true);

    const player = room.ctx.state.players[join.player!.id];
    const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
    for (const npc of Object.values(room.ctx.state.npcs)) npc.zoneId = "crags";
    setItemQty(player, dashCase.weapon, 1);
    await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: dashCase.weapon });
    await server.tick(0);
    await server.receiveInput(player.id, { action: "config", devField: "Space", devText: dashCase.ability });
    await server.tick(0);

    player.zoneId = wolf.zoneId;
    player.x = wolf.x + 220;
    player.y = wolf.y + 90;
    player.cooldowns.Space = 0;
    player.cooldownMs = 0;
    const startX = player.x;
    const pmsps = defaultPlayerPmsps(player);

    await server.receiveInput(player.id, { action: "space", aimX: startX + 500, aimY: player.y });
    await server.tick(0);
    await server.tick(dashCase.seconds);

    const moved = player.x - startX;
    expect(moved * dashCase.sign).toBeGreaterThan(pmsps * dashCase.expected - 3);
    expect(moved * dashCase.sign).toBeLessThan(pmsps * dashCase.expected + 3);
    expect(player.activeAbility).toBe("");
  }
});

test("MMO Skill Demo blade loadout charges Razor Wind and gates Omnislash", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "blade-loadout");
  const join = await server.joinRoom({ roomId: "blade-loadout", roomType: "mmo-skill-demo", token: "dev:blade" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  setItemQty(player, "blade", 1);
  expect(itemQty(player, "blade")).toBe(1);

  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "blade" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "config", devField: "E", devText: "blade-razor-wind" });
  await server.tick(0);
  expect(player.equippedWeaponId).toBe("blade");
  expect(selectedAbilityForSlot(player, "RMB")).toBe("blade-brutal-strike");

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 220;
  player.y = wolf.y;
  wolf.hp = wolf.maxHp;
  wolf.stunMs = 9999;
  await server.receiveInput(player.id, { action: "e", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(1.05);
  await server.tick(0.65);
  expect(wolf.hp).toBeLessThan(wolf.maxHp);
  expect(wolf.slowMs ?? 0).toBeGreaterThan(0);
  expect(player.cooldowns.E).toBeGreaterThan(0);

  player.energy = 0;
  await server.receiveInput(player.id, { action: "r", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  expect(player.activeAbility).toBe("");

  player.energy = player.maxEnergy;
  await server.receiveInput(player.id, { action: "r", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  expect(player.activeAbility).toBe("blade-omnislash");
  expect(player.energy).toBe(0);
});

test("MMO Skill Demo Intimidating Shout slows enemies and supports nearby allies", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "blade-shout-support");
  const first = await server.joinRoom({ roomId: "blade-shout-support", roomType: "mmo-skill-demo", token: "dev:blade-shout" });
  const second = await server.joinRoom({ roomId: "blade-shout-support", roomType: "mmo-skill-demo", token: "dev:blade-shout-ally" });
  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);

  const player = room.ctx.state.players[first.player!.id];
  const ally = room.ctx.state.players[second.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  setItemQty(player, "blade", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "blade" });
  await server.tick(0);

  player.zoneId = wolf.zoneId;
  ally.zoneId = wolf.zoneId;
  player.x = wolf.x - 80;
  player.y = wolf.y;
  ally.x = player.x + 24;
  ally.y = player.y;
  ally.maxHp = 100;
  ally.hp = 50;

  await server.receiveInput(player.id, { action: "e", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.26);

  expect(wolf.combatFlags).toContain("weakened");
  expect(wolf.slowMs ?? 0).toBeGreaterThan(0);
  expect(ally.combatFlags).toContain("shout-haste:");
  expect(ally.combatFlags).toContain("shout-regen:");

  await server.tick(1.1);
  expect(ally.hp).toBeGreaterThan(50);
});

test("MMO Skill Demo Riposte and Iron Will apply defensive bonus effects", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "blade-defenses");
  const join = await server.joinRoom({ roomId: "blade-defenses", roomType: "mmo-skill-demo", token: "dev:blade-defenses" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  setItemQty(player, "blade", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "blade" });
  await server.tick(0);
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 18;
  player.y = wolf.y;
  player.maxHp = 100;
  player.hp = 50;
  wolf.kind = "sand-wraith";
  wolf.attackCooldownMs = 0;

  expect(selectedAbilityForSlot(player, "Q")).toBe("blade-riposte");
  await server.receiveInput(player.id, { action: "q", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.3);
  expect(player.hp).toBeGreaterThanOrEqual(60);
  expect(player.cooldowns.Q).toBeLessThanOrEqual(4000);

  await server.receiveInput(player.id, { action: "config", devField: "Q", devText: "blade-iron-will" });
  await server.tick(0);
  player.cooldowns.Q = 0;
  player.hp = 50;
  player.stunMs = 1000;
  player.slowMs = 1000;
  await server.receiveInput(player.id, { action: "q" });
  await server.tick(0);

  expect(player.hp).toBe(75);
  expect(player.stunMs).toBe(0);
  expect(player.slowMs).toBe(0);
  expect(player.combatFlags).toContain("ironwill-haste:");
});

test("MMO Skill Demo caltrops charge effects remain schema-encodable", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "caltrops-encode");
  const join = await server.joinRoom({ roomId: "caltrops-encode", roomType: "mmo-skill-demo", token: "dev:caltrops" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  setItemQty(player, "bow", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "bow" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "config", devField: "E", devText: "bow-caltrops" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "e", aimX: player.x + 100, aimY: player.y });
  await server.tick(0.016666666666666666);
  await server.tick(0.016666666666666666);

  expect(room.ctx.state.effects.some((effect) => effect.effectKind === "cone")).toBe(true);
  expect(() => encodeSnapshot(mmoSkillDemoSchema, room.ctx.state)).not.toThrow();
});

test("MMO Skill Demo caltrops resolve to one persistent hazard", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "caltrops-single-hazard");
  const join = await server.joinRoom({ roomId: "caltrops-single-hazard", roomType: "mmo-skill-demo", token: "dev:caltrops-one" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  setItemQty(player, "bow", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "bow" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "config", devField: "E", devText: "bow-caltrops" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "e", aimX: player.x + 100, aimY: player.y });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", aimX: player.x + 100, aimY: player.y });
  await server.tick(1.1);

  const caltrops = Object.values(room.ctx.state.hazards).filter((hazard) => hazard.effectKind === "caltrops");
  expect(caltrops).toHaveLength(1);
  expect(caltrops[0].radius).toBeGreaterThan(40);
  expect(() => encodeSnapshot(mmoSkillDemoSchema, room.ctx.state)).not.toThrow();
});

test("MMO Skill Demo reuses pooled hazard objects after expiry", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "hazard-pool-reuse");
  const join = await server.joinRoom({ roomId: "hazard-pool-reuse", roomType: "mmo-skill-demo", token: "dev:hazard-pool" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  setItemQty(player, "bow", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "bow" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "config", devField: "E", devText: "bow-caltrops" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "e", aimX: player.x + 100, aimY: player.y });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", aimX: player.x + 100, aimY: player.y });
  await server.tick(1.1);

  const first = Object.values(room.ctx.state.hazards).find((hazard) => hazard.effectKind === "caltrops")!;
  const firstId = first.id;
  await server.receiveInput(player.id, { action: "idle", aimX: player.x + 100, aimY: player.y });
  await server.tick(6);
  expect(room.ctx.state.entities[firstId]).toBeUndefined();

  player.cooldowns.E = 0;
  player.cooldownMs = 0;
  await server.receiveInput(player.id, { action: "e", aimX: player.x + 120, aimY: player.y });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", aimX: player.x + 120, aimY: player.y });
  await server.tick(1.1);

  const second = Object.values(room.ctx.state.hazards).find((hazard) => hazard.effectKind === "caltrops")!;
  expect(second).toBe(first);
  expect(second.id).not.toBe(firstId);
  expect(() => encodeSnapshot(mmoSkillDemoSchema, room.ctx.state)).not.toThrow();
});
