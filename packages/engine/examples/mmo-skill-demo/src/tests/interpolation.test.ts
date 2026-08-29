import { expect, test } from "bun:test";
import { type HazardEntity, type LootEntity, type MmoSkillDemoState, type NpcEntity, type PlayerEntity, type ResourceEntity } from "../shared-contracts.ts";
import { createMmoStateInterpolator } from "../client/interpolation.ts";
import { createTestNpc, createTestPlayer } from "./test-fixtures.ts";

function player(overrides: Partial<PlayerEntity> = {}): PlayerEntity {
  return {
    ...createTestPlayer(),
    id: "p1",
    entityType: "player",
    name: "Tester",
    x: 0,
    y: 0,
    hp: 100,
    maxHp: 100,
    mana: 60,
    maxMana: 60,
    combatXp: 0,
    combatLevel: 1,
    miningXp: 0,
    miningLevel: 1,
    woodcuttingXp: 0,
    woodcuttingLevel: 1,
    zoneId: "ashwood",
    gold: 0,
    renown: 0,
    masteryRank: 1,
    contractId: "ashwood-hunt",
    contractKills: 0,
    contractStreak: 0,
    contractCooldownMs: 0,
    inventory: {},
    bank: {},
    equipment: {},
    abilitySlots: { "lmb-strike": "LMB", LMB: "unlocked" },
    questFlags: {},
    activeQuestId: "first-cut",
    wolfKills: 0,
    batKills: 0,
    bazaarSurvivalMs: 0,
    dungeonBossKills: 0,
    homeZoneId: "port-marrow",
    escortNpcId: "",
    escortTargetX: 0,
    escortTargetY: 0,
    escortTargetZoneId: "ashwood",
    escortMs: 0,
    instanceId: "",
    prestigeTitle: "",
    action: "idle",
    targetId: "",
    aimX: 0,
    aimY: 0,
    guardMs: 0,
    berserkMs: 0,
    cooldownMs: 0,
    visibleCount: 0,
    ...overrides
  };
}

function npc(overrides: Partial<NpcEntity> = {}): NpcEntity {
  return {
    ...createTestNpc(),
    id: "wolf",
    entityType: "npc",
    kind: "prowling-wolf",
    role: "mob",
    zoneId: "ashwood",
    elite: false,
    x: 0,
    y: 0,
    spawnX: 0,
    spawnY: 0,
    hp: 18,
    maxHp: 18,
    respawnMs: 0,
    attackCooldownMs: 0,
    projectileCooldownMs: 0,
    phaseMs: 0,
    summonedBy: "",
    ...overrides
  };
}

function state(
  tick: number,
  overrides: Partial<Omit<MmoSkillDemoState, "players" | "npcs" | "resources" | "loots" | "hazards">> & {
    players?: Record<string, PlayerEntity>;
    npcs?: Record<string, NpcEntity>;
    resources?: Record<string, ResourceEntity>;
    loots?: Record<string, LootEntity>;
    hazards?: Record<string, HazardEntity>;
  } = {}
): MmoSkillDemoState {
  return {
    tick,
    mapRevision: "test",
    roomKind: "world-zone",
    roomLabel: "Test",
    activePlayers: Object.keys(overrides.players ?? {}).length,
    worldEventId: "event",
    worldEventName: "Event",
    worldEventZoneId: "ashwood",
    worldEventPhase: "active",
    worldEventObjective: "Objective",
    worldEventProgress: 0,
    worldEventGoal: 1,
    worldEventTimerMs: 1000,
    worldEventReward: "Reward",
    effects: [],
    entities: {},
    players: {},
    npcs: {},
    resources: {},
    loots: {},
    hazards: {},
    ...overrides
  };
}

test("remote player interpolates halfway between two server ticks", () => {
  const interpolator = createMmoStateInterpolator();
  interpolator.observe(state(0, { players: { remote: player({ id: "remote", x: 0 }) } }), 0);
  const latest = state(2, { players: { remote: player({ id: "remote", x: 100 }) } });
  interpolator.observe(latest, 100);

  const visual = interpolator.sample(latest, 160, "self");

  expect(visual.players.remote.x).toBeCloseTo(50, 5);
  expect(interpolator.debug().mode).toBe("interpolate");
});

test("sampling does not mutate authoritative actor positions", () => {
  const interpolator = createMmoStateInterpolator();
  interpolator.observe(state(0, { players: { remote: player({ id: "remote", x: 0 }) } }), 0);
  const latest = state(2, { players: { remote: player({ id: "remote", x: 100 }) } });
  interpolator.observe(latest, 100);

  const visual = interpolator.sample(latest, 160, "self");

  expect(visual.players.remote.x).toBeCloseTo(50, 5);
  expect(latest.players.remote.x).toBe(100);
});

test("NPC interpolation uses server tick time instead of arrival jitter", () => {
  const interpolator = createMmoStateInterpolator();
  interpolator.observe(state(0, { npcs: { wolf: npc({ x: 0 }) } }), 0);
  const latest = state(4, { npcs: { wolf: npc({ x: 100 }) } });
  interpolator.observe(latest, 60);

  const visual = interpolator.sample(latest, 140, "self");

  expect(visual.npcs.wolf.x).toBeCloseTo(50, 5);
});

test("local player smooths toward latest without render-delay buffering", () => {
  const interpolator = createMmoStateInterpolator();
  const initial = state(0, { players: { self: player({ id: "self", x: 0 }) } });
  interpolator.observe(initial, 0);
  expect(interpolator.sample(initial, 0, "self").players.self.x).toBe(0);

  const latest = state(2, { players: { self: player({ id: "self", x: 80 }) } });
  interpolator.observe(latest, 100);
  const visual = interpolator.sample(latest, 116, "self");

  expect(visual.players.self.x).toBeGreaterThan(0);
  expect(visual.players.self.x).toBeLessThan(80);
});

test("local player visual clears omitted combat fields from sparse updates", () => {
  const interpolator = createMmoStateInterpolator();
  const charging = state(0, { players: { self: player({ id: "self", activeAbility: "mace-pummel", activeSlot: "LMB", activeMs: 500, activeDurationMs: 2400, chargeMs: 500, abilityHits: "released" }) } });
  interpolator.observe(charging, 0);
  expect(interpolator.sample(charging, 0, "self").players.self.activeAbility).toBe("mace-pummel");

  const cleared = state(2, { players: { self: player({ id: "self" }) } });
  interpolator.observe(cleared, 100);
  const visual = interpolator.sample(cleared, 116, "self").players.self;

  expect(visual.activeAbility).toBe("");
  expect(visual.activeSlot).toBe("");
  expect(visual.activeMs).toBe(0);
  expect(visual.activeDurationMs).toBe(0);
  expect(visual.chargeMs).toBe(0);
  expect(visual.abilityHits).toBe("");
});

test("teleport and zone change snap instead of gliding across the map", () => {
  const interpolator = createMmoStateInterpolator();
  interpolator.observe(state(0, { players: { remote: player({ id: "remote", x: 0, zoneId: "ashwood" }) } }), 0);
  const latest = state(2, { players: { remote: player({ id: "remote", x: 500, zoneId: "bazaar" }) } });
  interpolator.observe(latest, 100);

  const visual = interpolator.sample(latest, 185, "self");

  expect(visual.players.remote.x).toBe(500);
  expect(visual.players.remote.zoneId).toBe("bazaar");
  expect(interpolator.debug().mode).toBe("snap");
});

test("newly visible entity seeds at latest position", () => {
  const interpolator = createMmoStateInterpolator();
  interpolator.observe(state(0), 0);
  const latest = state(2, { players: { remote: player({ id: "remote", x: 400 }) } });
  interpolator.observe(latest, 100);

  const visual = interpolator.sample(latest, 185, "self");

  expect(visual.players.remote.x).toBe(400);
});

test("missing next frame holds latest known point without extrapolating", () => {
  const interpolator = createMmoStateInterpolator();
  interpolator.observe(state(0, { players: { remote: player({ id: "remote", x: 0 }) } }), 0);
  const latest = state(2, { players: { remote: player({ id: "remote", x: 100 }) } });
  interpolator.observe(latest, 100);

  const visual = interpolator.sample(latest, 500, "self");

  expect(visual.players.remote.x).toBe(100);
  expect(Number.isFinite(visual.players.remote.x)).toBe(true);
});

test("interpolation buffer stays bounded to recent frames", () => {
  const interpolator = createMmoStateInterpolator();
  let latest = state(0, { players: { remote: player({ id: "remote", x: 0 }) } });
  for (let tick = 0; tick < 30; tick += 1) {
    latest = state(tick, { players: { remote: player({ id: "remote", x: tick * 4 }) } });
    interpolator.observe(latest, tick * 50);
  }

  interpolator.sample(latest, 1500, "self");

  expect(interpolator.debug().bufferedFrames).toBeLessThanOrEqual(12);
});
