import { expect, test } from "bun:test";
import { type MmoSkillDemoInput, type MmoSkillDemoState, type NpcEntity, type PlayerEntity, type ResourceEntity } from "../shared-contracts.ts";
import { DEFAULT_CONTROLLER_DEADZONE, controllerAimOffset, controllerInputFromGamepad, createHeldNpcInteractionGate, currentInput, nearest, type GamepadLike } from "../client/input.ts";
import { createTestNpc, createTestPlayer } from "./test-fixtures.ts";

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
    aimX: 100,
    aimY: 100,
    guardMs: 0,
    berserkMs: 0,
    cooldownMs: 0,
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

function npc(overrides: Partial<NpcEntity> = {}): NpcEntity {
  return {
    ...createTestNpc(),
    id: "banker-01",
    entityType: "npc",
    kind: "banker-valerius",
    role: "bank",
    zoneId: "port-marrow",
    elite: false,
    x: 108,
    y: 100,
    spawnX: 108,
    spawnY: 100,
    hp: 120,
    maxHp: 120,
    respawnMs: 0,
    attackCooldownMs: 0,
    projectileCooldownMs: 0,
    phaseMs: 0,
    summonedBy: "",
    ...overrides
  };
}

function resource(overrides: Partial<ResourceEntity> = {}): ResourceEntity {
  return {
    id: "ore-01",
    entityType: "resource",
    kind: "ore",
    zoneId: "crags",
    x: 110,
    y: 100,
    hp: 4,
    maxHp: 4,
    depleted: false,
    respawnMs: 0,
    ...overrides
  };
}

function gamepad(overrides: Partial<GamepadLike> = {}): GamepadLike {
  return {
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 8 }, () => ({ pressed: false, value: 0 })),
    ...overrides
  };
}

test("currentInput ignores cross-zone resources for interaction target selection", () => {
  const actor = player({ zoneId: "ashwood" });
  const input = currentInput(
    new Set(["KeyZ"]),
    actor,
    state({
      resources: {
        "ore-01": resource({ zoneId: "crags" })
      }
    }),
    undefined
  );

  expect(input.action).toBe("interact");
  expect(input.targetId).toBe("");
});

test("currentInput can still select nearby support NPCs across zone seams", () => {
  const actor = player({ zoneId: "ashwood" });
  const input = currentInput(
    new Set(["KeyZ"]),
    actor,
    state({
      npcs: {
        "banker-01": npc({ zoneId: "port-marrow" })
      }
    }),
    undefined
  );

  expect(input.action).toBe("interact");
  expect(input.targetId).toBe("banker-01");
});

test("currentInput chooses the nearest same-zone interaction target", () => {
  const actor = player({ zoneId: "port-marrow" });
  const input = currentInput(
    new Set(["KeyZ"]),
    actor,
    state({
      npcs: {
        "banker-01": npc({ id: "banker-01", zoneId: "port-marrow", x: 112 }),
        "merchant-01": npc({ id: "merchant-01", kind: "merchant-kaya", role: "merchant", zoneId: "port-marrow", x: 140 })
      },
      resources: {
        "ore-01": resource({ zoneId: "crags", x: 104 })
      }
    }),
    undefined
  );

  expect(input.targetId).toBe("banker-01");
});

test("nearest keeps insertion tie order and strict max radius", () => {
  const origin = { id: "origin", x: 0, y: 0 };
  expect(nearest(origin, [{ id: "b", x: 3, y: 4 }, { id: "a", x: -3, y: -4 }], 6)?.id).toBe("b");
  expect(nearest(origin, [{ id: "edge", x: 6, y: 0 }], 6)).toBeUndefined();
});

test("currentInput can select owned nearby loot for pickup", () => {
  const actor = player({ id: "p1", zoneId: "ashwood" });
  const input = currentInput(
    new Set(["KeyZ"]),
    actor,
    state({
      loots: {
        "loot-01": {
          id: "loot-01",
          entityType: "loot",
          itemId: "gold",
          amount: 5,
          zoneId: "ashwood",
          x: 106,
          y: 100,
          ownerId: "p1",
          expiresMs: 12000,
          pickupRadius: 32
        }
      }
    }),
    undefined
  );

  expect(input.action).toBe("interact");
  expect(input.targetId).toBe("loot-01");
});

test("currentInput can select nearby same-zone resource for gathering", () => {
  const actor = player({ zoneId: "ashwood" });
  const input = currentInput(
    new Set(["KeyZ"]),
    actor,
    state({
      resources: {
        "tree-01": resource({ id: "tree-01", kind: "tree", zoneId: "ashwood", x: 112 })
      }
    }),
    undefined
  );

  expect(input.action).toBe("interact");
  expect(input.targetId).toBe("tree-01");
});

test("currentInput accepts analog controller movement", () => {
  const actor = player({ zoneId: "ashwood" });
  const input = currentInput(new Set(), actor, state(), undefined, { dx: 0.75, dy: -0.5 });

  expect(input.dx).toBeCloseTo(0.75);
  expect(input.dy).toBeCloseTo(-0.5);
});

test("currentInput prefers aimed hostile over nearest hostile for attacks", () => {
  const actor = player({ x: 100, y: 100 });
  const input = currentInput(
    new Set(["Mouse0"]),
    actor,
    state({
      npcs: {
        near: npc({ id: "near", kind: "prowling-wolf", role: "mob", zoneId: "ashwood", x: 120, y: 100 }),
        aimed: npc({ id: "aimed", kind: "prowling-wolf", role: "mob", zoneId: "ashwood", x: 148, y: 100 })
      }
    }),
    { x: 148, y: 100 }
  );

  expect(input.action).toBe("lmb");
  expect(input.targetId).toBe("aimed");
});

test("currentInput ignores aimed hostiles outside the player's zone", () => {
  const actor = player({ zoneId: "ashwood", x: 100, y: 100 });
  const input = currentInput(
    new Set(["Mouse0"]),
    actor,
    state({
      npcs: {
        aimed: npc({ id: "aimed", kind: "prowling-wolf", role: "mob", zoneId: "bazaar", x: 108, y: 100 })
      }
    }),
    { x: 108, y: 100 }
  );

  expect(input.action).toBe("lmb");
  expect(input.targetId).toBe("");
});

test("controllerInputFromGamepad maps PS5 buttons to existing ability keys", () => {
  const buttons = Array.from({ length: 13 }, () => ({ pressed: false, value: 0 }));
  buttons[6] = { pressed: false, value: 1 };
  buttons[7] = { pressed: false, value: 1 };
  buttons[0] = { pressed: true, value: 1 };
  buttons[2] = { pressed: true, value: 1 };
  buttons[3] = { pressed: true, value: 1 };
  buttons[4] = { pressed: true, value: 1 };
  buttons[1] = { pressed: true, value: 1 };
  buttons[5] = { pressed: true, value: 1 };
  buttons[8] = { pressed: true, value: 1 };
  buttons[12] = { pressed: true, value: 1 };

  const frame = controllerInputFromGamepad(gamepad({ buttons }));

  expect(frame.keys.has("Mouse0")).toBe(true);
  expect(frame.keys.has("Mouse2")).toBe(true);
  expect(frame.keys.has("Space")).toBe(true);
  expect(frame.keys.has("KeyQ")).toBe(true);
  expect(frame.keys.has("KeyE")).toBe(true);
  expect(frame.keys.has("KeyZ")).toBe(true);
  expect(frame.keys.has("KeyR")).toBe(true);
  expect(frame.keys.has("KeyM")).toBe(true);
  expect(frame.keys.has("KeyN")).toBe(true);
});

test("controllerInputFromGamepad reads left-stick movement and right-stick aim", () => {
  const frame = controllerInputFromGamepad(gamepad({ axes: [0.5, -0.5, 1, 0] }));

  expect(frame.movement.dx).toBeGreaterThan(0);
  expect(frame.movement.dy).toBeLessThan(0);
  expect(frame.aimOffset?.x).toBeCloseTo(220);
  expect(frame.aimOffset?.y).toBeCloseTo(0);
  expect(frame.active).toBe(true);
});

test("controllerInputFromGamepad defaults to a five percent stick deadzone", () => {
  expect(DEFAULT_CONTROLLER_DEADZONE).toBe(0.05);

  const frame = controllerInputFromGamepad(gamepad({ axes: [0.04, 0, 0.06, 0] }));

  expect(frame.movement.dx).toBe(0);
  expect(frame.aimOffset?.x).toBeGreaterThan(0);
});

test("controllerInputFromGamepad accepts a custom deadzone setting", () => {
  const frame = controllerInputFromGamepad(gamepad({ axes: [0.19, 0, 0.21, 0] }), { deadzone: 0.2 });

  expect(frame.movement.dx).toBe(0);
  expect(frame.aimOffset?.x).toBeGreaterThan(0);
});

test("controllerInputFromGamepad uses radial deadzone for full-circle analog movement", () => {
  const frame = controllerInputFromGamepad(gamepad({ axes: [0.18, 0.18, 0, 0] }), { deadzone: 0.2 });

  expect(frame.movement.dx).toBeGreaterThan(0);
  expect(frame.movement.dy).toBeGreaterThan(0);
});

test("controllerAimOffset falls back to movement direction when aim stick is idle", () => {
  const frame = controllerInputFromGamepad(gamepad({ axes: [0, 1, 0.04, 0] }));
  const offset = controllerAimOffset(frame);

  expect(offset?.x).toBeCloseTo(0);
  expect(offset?.y).toBeCloseTo(220);
});

test("controllerAimOffset prefers aim stick direction over movement direction", () => {
  const frame = controllerInputFromGamepad(gamepad({ axes: [0, 1, -1, 0] }));
  const offset = controllerAimOffset(frame);

  expect(offset?.x).toBeCloseTo(-220);
  expect(offset?.y).toBeCloseTo(0);
});

test("currentInput uses newest held ability as priority", () => {
  const actor = player({ zoneId: "ashwood", x: 100, y: 100 });
  const world = state();
  const keys = new Set(["Mouse2"]);

  expect(currentInput(keys, actor, world, { x: 160, y: 100 }).action).toBe("rmb");

  keys.add("Space");
  expect(currentInput(keys, actor, world, { x: 160, y: 100 }).action).toBe("space");

  expect(currentInput(keys, actor, world, { x: 160, y: 100 }).action).toBe("space");

  keys.delete("Mouse2");
  currentInput(keys, actor, world, { x: 160, y: 100 });
  keys.add("Mouse2");
  expect(currentInput(keys, actor, world, { x: 160, y: 100 }).action).toBe("rmb");
});

test("held NPC interaction gate suppresses the same NPC until release", () => {
  const gate = createHeldNpcInteractionGate();
  const world = state({
    npcs: {
      "banker-01": npc({ id: "banker-01" }),
      "merchant-01": npc({ id: "merchant-01", kind: "merchant-kaya", role: "merchant" })
    }
  });
  const bankerInput: MmoSkillDemoInput = { action: "interact", targetId: "banker-01", dx: 1 };
  const merchantInput: MmoSkillDemoInput = { action: "interact", targetId: "merchant-01" };

  expect(gate.apply(bankerInput, world, true)).toEqual(bankerInput);
  expect(gate.apply(bankerInput, world, true)).toMatchObject({ action: "idle", targetId: "", dx: 1 });
  expect(gate.apply(merchantInput, world, true)).toEqual(merchantInput);
  gate.release();
  expect(gate.apply(bankerInput, world, true)).toEqual(bankerInput);
});
