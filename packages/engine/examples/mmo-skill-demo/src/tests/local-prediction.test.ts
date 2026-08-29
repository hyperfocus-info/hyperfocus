import { expect, test } from "bun:test";
import { applyLocalPrediction, createLocalPredictionState } from "../client/local-prediction.ts";
import { type MmoSkillDemoInput, type MmoSkillDemoState, type PlayerEntity, type ResourceEntity } from "../shared-contracts.ts";
import { createTestPlayer } from "./test-fixtures.ts";

function player(overrides: Partial<PlayerEntity> = {}): PlayerEntity {
  return {
    ...createTestPlayer(),
    id: "p1",
    entityType: "player",
    name: "Tester",
    x: 100,
    y: 100,
    hp: 100,
    maxHp: 100,
    mana: 60,
    maxMana: 60,
    energy: 0,
    maxEnergy: 100,
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
    abilitySlots: { "space-rush": "Space", Space: "unlocked" },
    cooldowns: {},
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
    aimX: 220,
    aimY: 100,
    guardMs: 0,
    berserkMs: 0,
    cooldownMs: 0,
    equippedWeaponId: "mace",
    activeAbility: "",
    activeSlot: "",
    activeMs: 0,
    activeDurationMs: 0,
    chargeMs: 0,
    rushDistance: 0,
    abilityVectorX: 1,
    abilityVectorY: 0,
    abilityTickMs: 0,
    abilityHits: "",
    knockbackX: 0,
    knockbackY: 0,
    knockbackMs: 0,
    knockbackHeavy: false,
    iframeMs: 0,
    castMs: 0,
    damageAmpMs: 0,
    combatFlags: "",
    lastAttackStyle: "",
    visibleCount: 0,
    ...overrides
  };
}

function state(overrides: Partial<MmoSkillDemoState> = {}): MmoSkillDemoState {
  return {
    tick: 0,
    mapRevision: "test",
    roomKind: "world-zone",
    roomLabel: "Test",
    activePlayers: 1,
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

function resource(overrides: Partial<ResourceEntity> = {}): ResourceEntity {
  return {
    id: "tree-1",
    entityType: "resource",
    kind: "tree",
    zoneId: "ashwood",
    x: 140,
    y: 100,
    hp: 4,
    maxHp: 4,
    depleted: false,
    respawnMs: 0,
    ...overrides
  };
}

test("local Rush prediction advances between server snapshots only after Rush is active", () => {
  const prediction = createLocalPredictionState();
  const raw = player({ activeAbility: "space-rush", activeSlot: "Space", activeMs: 700, activeDurationMs: 5000, abilityHits: "windup:rush:500" });
  const visual = { ...raw };
  const input: MmoSkillDemoInput = { action: "space", aimX: 600, aimY: 100 };

  applyLocalPrediction(prediction, visual, raw, input, state(), 0);
  const firstX = visual.x;
  applyLocalPrediction(prediction, visual, raw, input, state(), 16);

  expect(visual.x).toBeGreaterThan(firstX);
  expect(visual.activeMs).toBeGreaterThan(raw.activeMs);
  expect(visual.abilityVectorX).toBeGreaterThan(0.9);
});

test("holding Space on Rush cooldown does not create local momentum", () => {
  const prediction = createLocalPredictionState();
  const raw = player({ cooldowns: { Space: 6000 }, cooldownMs: 6000 });
  const visual = { ...raw };
  const input: MmoSkillDemoInput = { action: "space", aimX: 600, aimY: 100 };

  applyLocalPrediction(prediction, visual, raw, input, state(), 0);
  applyLocalPrediction(prediction, visual, raw, input, state(), 16);

  expect(visual.x).toBe(raw.x);
  expect(visual.y).toBe(raw.y);
});

test("holding non-Rush Space on cooldown does not add local movement speed", () => {
  const prediction = createLocalPredictionState();
  const raw = player({
    equippedWeaponId: "bow",
    equipment: { weapon: "bow" },
    abilitySlots: { "bow-reposition": "Space", "space-jump": "Space", Space: "unlocked" },
    cooldowns: { Space: 6000 },
    cooldownMs: 6000
  });
  const visual = { ...raw };
  const baseInput: MmoSkillDemoInput = { action: "idle", dx: 1, dy: 0, aimX: 600, aimY: 100 };
  const heldSpaceInput: MmoSkillDemoInput = { action: "space", dx: 1, dy: 0, aimX: 600, aimY: 100 };
  const baseVisual = { ...raw };

  applyLocalPrediction(prediction, baseVisual, raw, baseInput, state(), 0);
  applyLocalPrediction(prediction, baseVisual, raw, baseInput, state(), 16);
  const baseMove = baseVisual.x - raw.x;

  const heldPrediction = createLocalPredictionState();
  applyLocalPrediction(heldPrediction, visual, raw, heldSpaceInput, state(), 0);
  applyLocalPrediction(heldPrediction, visual, raw, heldSpaceInput, state(), 16);

  expect(visual.x - raw.x).toBeLessThanOrEqual(baseMove + 0.01);
});

test("local Rush prediction uses swept entity collision", () => {
  const prediction = createLocalPredictionState();
  const raw = player({ activeAbility: "space-rush", activeSlot: "Space", activeMs: 900, activeDurationMs: 5000, abilityHits: "windup:rush:500" });
  const visual = { ...raw };
  const input: MmoSkillDemoInput = { action: "space", aimX: 600, aimY: 100 };
  const blockedState = state({ resources: { tree: resource({ x: 138, y: 100 }) } });

  applyLocalPrediction(prediction, visual, raw, input, blockedState, 0);
  for (let timeMs = 34; timeMs <= 340; timeMs += 34) {
    applyLocalPrediction(prediction, visual, raw, input, blockedState, timeMs);
  }

  expect(visual.x).toBeLessThan(138);
  expect(Math.hypot(visual.x - 138, visual.y - 100)).toBeGreaterThanOrEqual(27);
});
