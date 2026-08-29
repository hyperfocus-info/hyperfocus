import { expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { RenderData, Renderable, RenderPointBuffer } from "@hyperfocus/engine/render";
import { createBenchmarkImage } from "../../scripts/render-bench-support.ts";
import { type MmoSkillDemoState, type NpcEntity, type PlayerEntity } from "../shared-contracts.ts";
import { createTestNpc, createTestPlayer } from "./test-fixtures.ts";
const renderRoot = join(import.meta.dir, "..", "client");

export function renderFiles() {
  const dir = join(renderRoot, "render");
  const files = readdirSync(dir).filter((name) => name.endsWith(".ts")).map((name) => join(dir, name));
  files.push(join(renderRoot, "render.ts"));
  return files;
}

export function fakeImage(width = 64, height = 64) {
  return createBenchmarkImage(width, height);
}

export type RenderInspection = RenderData & {
  id?: string;
  kind?: string;
  text?: string;
  x?: number;
  y?: number;
  x1?: number;
  x2?: number;
  width?: number;
  height?: number;
  radius?: number;
  alpha?: number;
  lineWidth?: number;
  shadowBlur?: number;
  stroke?: unknown;
  fill?: unknown;
  dash?: readonly number[];
  lineDash?: readonly number[];
  flipX?: boolean;
  anchor?: unknown;
  image?: CanvasImageSource;
  points?: RenderPointBuffer;
  draw?: unknown;
  calls?: readonly Renderable[];
  commands?: readonly object[];
};

export function inspectRender(call: Renderable): RenderInspection {
  if (typeof call === "function") throw new Error("Expected structured render data");
  return call;
}

export function inspectRenderCalls(call: Renderable): RenderInspection[] {
  const inspection = inspectRender(call);
  if (inspection.kind !== "group") return [];
  return inspection.calls.flatMap((child) => typeof child === "function" ? [] : [inspectRender(child)]);
}

export function renderPointAxis(points: RenderPointBuffer | undefined, index: number, axis: "x" | "y") {
  if (!points) return undefined;
  const candidate = points[index];
  if (typeof candidate === "number") {
    const value = points[index * 2 + (axis === "x" ? 0 : 1)];
    return typeof value === "number" ? value : undefined;
  }
  if (Array.isArray(candidate)) return candidate[axis === "x" ? 0 : 1];
  if (typeof candidate === "object" && candidate !== null) {
    const value = Reflect.get(candidate, axis);
    return typeof value === "number" ? value : undefined;
  }
  return undefined;
}

export function readPngSize(path: string) {
  const data = readFileSync(path);
  expect([...data.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

export function assertStructured(call: Renderable): void {
  expect(typeof call).not.toBe("function");
  const data = inspectRender(call);
  expect(data.kind).not.toBe("custom");
  expect(data.draw).toBeUndefined();
  for (const child of data.calls ?? []) assertStructured(child);
}

export function flattenRenderCalls(calls: readonly Renderable[]): RenderInspection[] {
  const flat: RenderInspection[] = [];
  for (const call of calls) {
    if (typeof call === "function") continue;
    const inspection = inspectRender(call);
    flat.push(inspection);
    const children = inspection.kind === "group" ? inspection.calls : undefined;
    if (children) flat.push(...flattenRenderCalls(children));
  }
  return flat;
}

export function player(overrides: Partial<PlayerEntity> = {}): PlayerEntity {
  return {
    ...createTestPlayer(),
    id: "p1",
    entityType: "player",
    name: "Tester",
    x: 100,
    y: 120,
    hp: 90,
    maxHp: 100,
    mana: 30,
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
    aimY: 120,
    guardMs: 0,
    berserkMs: 0,
    cooldownMs: 0,
    visibleCount: 0,
    ...overrides
  };
}
export function npc(overrides: Partial<NpcEntity> = {}): NpcEntity {
  return {
    ...createTestNpc(),
    id: "npc-1",
    entityType: "npc",
    kind: "prowling-wolf",
    role: "mob",
    zoneId: "ashwood",
    elite: false,
    x: 140,
    y: 160,
    spawnX: 140,
    spawnY: 160,
    hp: 20,
    maxHp: 20,
    respawnMs: 0,
    attackCooldownMs: 0,
    projectileCooldownMs: 0,
    phaseMs: 0,
    summonedBy: "",
    ...overrides
  };
}

export function state(overrides: Partial<MmoSkillDemoState> = {}): MmoSkillDemoState {
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
