import { expect, test } from "bun:test";
import {
  gatheringHazardProfiles,
  resolveGatheringHazard,
  shouldTriggerGatheringHazard,
  spawnGatheringHazard,
  type GatheringHazardMaterial
} from "../server/hazardEngine.ts";
import type { MmoSkillDemoState } from "../shared.ts";

function rngSequence(values: number[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

const player = { id: "player-one", x: 100, y: 120, zoneId: "ashwood" as const };
const node = { id: "node-one", x: 132, y: 140, zoneId: "ashwood" as const };

test("gathering hazard profiles cover all sixteen gathering skills", () => {
  expect(Object.keys(gatheringHazardProfiles).sort()).toEqual([
    "apiculture",
    "archaeology",
    "crop-harvesting",
    "dredging",
    "essence-siphoning",
    "fishing",
    "foraging",
    "gemology",
    "hunting",
    "lumberjacking",
    "mining",
    "quarrying",
    "sap-tapping",
    "scavenging",
    "skinning",
    "spore-hunting"
  ]);
});

test("shouldTriggerGatheringHazard respects tier gates and deterministic chance rolls", () => {
  expect(shouldTriggerGatheringHazard({ tier: 2, hazardChance: 1 }, () => 0)).toBe(false);
  expect(shouldTriggerGatheringHazard({ tier: 3, hazardChance: 0.5 }, () => 0.49)).toBe(true);
  expect(shouldTriggerGatheringHazard({ tier: 3, hazardChance: 0.5 }, () => 0.5)).toBe(false);
  expect(shouldTriggerGatheringHazard({ tier: 5, hazardChance: 1 }, () => 1)).toBe(true);
});

test("resolveGatheringHazard creates tier three skill-specific elite warning packs", () => {
  const material: GatheringHazardMaterial = {
    id: 203,
    skillId: "Mining",
    tier: 3,
    name: "True Silver",
    hazardChance: 0.75
  };

  const result = resolveGatheringHazard(material, { player, node, tick: 12 }, { rng: rngSequence([0.2, 0, 0.1, 0.25, 0.4, 0.5, 0.7]) });

  expect(result.triggered).toBe(true);
  expect(result.skillId).toBe("mining");
  expect(result.severity).toBe("warning");
  expect(result.spawnSpecs).toHaveLength(3);
  expect(result.spawnSpecs.every((spec) => spec.kind === "sapper-goblin" && spec.elite)).toBe(true);
  expect(result.spawnSpecs.every((spec) => spec.focusedAggroOwnerId === player.id)).toBe(true);
  expect(result.soundCues.map((cue) => cue.id)).toEqual(["gathering-hazard-warning"]);
});

test("resolveGatheringHazard creates tier five punitive threat anchors", () => {
  const material: GatheringHazardMaterial = {
    id: 510,
    skillId: "Apiculture",
    tier: 5,
    name: "Golden Nectar",
    hazardChance: 1
  };

  const result = resolveGatheringHazard(material, { player, node, tick: 44 }, { rng: rngSequence([0.1, 0.3, 0.7]) });

  expect(result.triggered).toBe(true);
  expect(result.severity).toBe("punitive");
  expect(result.spawnSpecs).toHaveLength(1);
  expect(result.spawnSpecs[0]).toMatchObject({
    kind: "infinite-magical-hornet-nest",
    name: "Infinite Magical Hornet Nest",
    role: "threat-anchor",
    focusedAggroOwnerId: player.id,
    threatAnchor: {
      summonKind: "venomous-hornet",
      focusedAggroOwnerId: player.id
    }
  });
  expect(result.soundCues.map((cue) => cue.id)).toEqual(["gathering-hazard-punitive"]);
});

test("spawnGatheringHazard inserts resolved NPC specs into state buckets", () => {
  const material: GatheringHazardMaterial = {
    id: 601,
    skillId: "Gemology",
    tier: 5,
    name: "Prism Geode Crystal",
    hazardChance: 1
  };
  const state: Pick<MmoSkillDemoState, "entities" | "npcs" | "hazards"> = { entities: {}, npcs: {}, hazards: {} };
  const result = resolveGatheringHazard(material, { player, node, tick: 3 }, { force: true, rng: rngSequence([0, 0]) });
  const spawned = spawnGatheringHazard(state, result);

  expect(spawned).toHaveLength(1);
  expect(Object.keys(state.entities)).toEqual([spawned[0].id]);
  expect(state.npcs[spawned[0].id]).toBe(spawned[0]);
  expect(spawned[0]).toMatchObject({
    entityType: "npc",
    kind: "prism-geode-lens",
    role: "hazard-anchor",
    summonedBy: player.id,
    combatState: "gather-threat-anchor"
  });
  expect(spawned[0].combatFlags).toContain("threat-anchor");
});
