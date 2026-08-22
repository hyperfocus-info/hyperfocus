import type { MmoSkillDemoState, NpcEntity, ZoneId } from "../shared.ts";

export type GatheringMaterialTier = 1 | 2 | 3 | 4 | 5;

export interface GatheringHazardMaterial {
  id: number;
  skillId: string;
  tier: GatheringMaterialTier;
  name: string;
  hazardChance: number;
}

export type GatheringSkillId =
  | "lumberjacking"
  | "mining"
  | "foraging"
  | "quarrying"
  | "fishing"
  | "skinning"
  | "crop-harvesting"
  | "scavenging"
  | "essence-siphoning"
  | "apiculture"
  | "sap-tapping"
  | "spore-hunting"
  | "dredging"
  | "archaeology"
  | "hunting"
  | "gemology";

export type GatheringHazardSeverity = "none" | "warning" | "punitive";
export type GatheringHazardRng = () => number;

export type GatheringHazardPoint = {
  id?: string;
  x: number;
  y: number;
  zoneId: ZoneId;
};

export type GatheringHazardContext = {
  player: GatheringHazardPoint & { id: string };
  node?: GatheringHazardPoint;
  tick?: number;
};

export type GatheringHazardSoundCue = {
  id: string;
  x: number;
  y: number;
  radius: number;
  priority: number;
};

export type GatheringHazardThreatAnchor = {
  summonKind: string;
  summonName: string;
  spawnIntervalMs: number;
  leashRadius: number;
  focusedAggroOwnerId: string;
};

export type GatheringHazardSpawnSpec = {
  entityType: "npc";
  id: string;
  kind: string;
  name: string;
  role: "elite-pack" | "threat-anchor";
  elite: boolean;
  x: number;
  y: number;
  zoneId: ZoneId;
  hp: number;
  damageHint: number;
  effectKind: "blood" | "sap" | "spark" | "dust" | "void" | "spore";
  focusedAggroOwnerId: string;
  sourceMaterialId: number;
  sourceMaterialName: string;
  threatAnchor?: GatheringHazardThreatAnchor;
};

export type GatheringHazardResolution = {
  triggered: boolean;
  roll: number;
  chance: number;
  skillId?: GatheringSkillId;
  severity: GatheringHazardSeverity;
  materialId: number;
  materialName: string;
  spawnSpecs: GatheringHazardSpawnSpec[];
  soundCues: GatheringHazardSoundCue[];
  message: string;
};

type WarningHazardProfile = {
  kind: string;
  name: string;
  count: number;
  hp: number;
  damageHint: number;
  effectKind: GatheringHazardSpawnSpec["effectKind"];
};

type PunitiveHazardProfile = {
  anchorKind: string;
  anchorName: string;
  summonKind: string;
  summonName: string;
  hp: number;
  damageHint: number;
  spawnIntervalMs: number;
  effectKind: GatheringHazardSpawnSpec["effectKind"];
};

export type GatheringHazardProfile = {
  skillId: GatheringSkillId;
  warning: WarningHazardProfile;
  punitive: PunitiveHazardProfile;
};

const SKILL_ALIASES: Record<string, GatheringSkillId> = {
  lumberjacking: "lumberjacking",
  woodcutting: "lumberjacking",
  mining: "mining",
  foraging: "foraging",
  quarrying: "quarrying",
  fishing: "fishing",
  skinning: "skinning",
  cropharvesting: "crop-harvesting",
  crop: "crop-harvesting",
  harvesting: "crop-harvesting",
  scavenging: "scavenging",
  essencesiphoning: "essence-siphoning",
  siphoning: "essence-siphoning",
  apiculture: "apiculture",
  saptapping: "sap-tapping",
  sporehunting: "spore-hunting",
  dredging: "dredging",
  archaeology: "archaeology",
  hunting: "hunting",
  gemology: "gemology"
};

export const gatheringHazardProfiles = {
  lumberjacking: {
    skillId: "lumberjacking",
    warning: { kind: "bramble-beast", name: "Bramble-Beast", count: 2, hp: 62, damageHint: 8, effectKind: "sap" },
    punitive: { anchorKind: "world-tree-heart-ward", anchorName: "Heart of World-Tree Ward", summonKind: "timber-goliath", summonName: "Timber-Goliath", hp: 180, damageHint: 14, spawnIntervalMs: 2600, effectKind: "sap" }
  },
  mining: {
    skillId: "mining",
    warning: { kind: "sapper-goblin", name: "Sapper-Goblin", count: 3, hp: 48, damageHint: 7, effectKind: "spark" },
    punitive: { anchorKind: "vulcan-sentinel", anchorName: "Vulcan Sentinel", summonKind: "rust-biter", summonName: "Rust-Biter", hp: 190, damageHint: 15, spawnIntervalMs: 2400, effectKind: "spark" }
  },
  foraging: {
    skillId: "foraging",
    warning: { kind: "ash-bramble-stalker", name: "Ash Bramble Stalker", count: 3, hp: 42, damageHint: 6, effectKind: "sap" },
    punitive: { anchorKind: "voidbloom-bramble-crown", anchorName: "Voidbloom Bramble Crown", summonKind: "void-leper", summonName: "Void-Leper", hp: 150, damageHint: 12, spawnIntervalMs: 2800, effectKind: "void" }
  },
  quarrying: {
    skillId: "quarrying",
    warning: { kind: "fissure-skitterer", name: "Fissure-Skitterer", count: 3, hp: 45, damageHint: 7, effectKind: "dust" },
    punitive: { anchorKind: "null-geode-warden", anchorName: "Null-Geode Warden", summonKind: "crag-gargoyle", summonName: "Crag-Gargoyle", hp: 210, damageHint: 16, spawnIntervalMs: 3000, effectKind: "spark" }
  },
  fishing: {
    skillId: "fishing",
    warning: { kind: "tide-stalker", name: "Tide-Stalker", count: 2, hp: 52, damageHint: 8, effectKind: "blood" },
    punitive: { anchorKind: "leviathan-scale-anchor", anchorName: "Leviathan Scale Anchor", summonKind: "abyssal-eel", summonName: "Abyssal Eel", hp: 170, damageHint: 14, spawnIntervalMs: 2300, effectKind: "blood" }
  },
  skinning: {
    skillId: "skinning",
    warning: { kind: "moss-grizzly", name: "Moss-Grizzly", count: 2, hp: 70, damageHint: 9, effectKind: "blood" },
    punitive: { anchorKind: "behemoth-hide-totem", anchorName: "Behemoth Hide Totem", summonKind: "ashwood-alpha", summonName: "Ashwood Alpha", hp: 220, damageHint: 16, spawnIntervalMs: 3200, effectKind: "blood" }
  },
  "crop-harvesting": {
    skillId: "crop-harvesting",
    warning: { kind: "scavenger-jackal", name: "Scavenger Jackal", count: 3, hp: 44, damageHint: 6, effectKind: "dust" },
    punitive: { anchorKind: "sun-thread-scarecrow", anchorName: "Sun-Thread Scarecrow", summonKind: "high-peak-eagle", summonName: "High-Peak Eagle", hp: 155, damageHint: 12, spawnIntervalMs: 2500, effectKind: "spark" }
  },
  scavenging: {
    skillId: "scavenging",
    warning: { kind: "rust-biter", name: "Rust-Biter", count: 3, hp: 55, damageHint: 8, effectKind: "spark" },
    punitive: { anchorKind: "sunken-engine-core", anchorName: "Sunken Engine Core", summonKind: "dungeon-harvester", summonName: "Dungeon Harvester", hp: 190, damageHint: 15, spawnIntervalMs: 2200, effectKind: "spark" }
  },
  "essence-siphoning": {
    skillId: "essence-siphoning",
    warning: { kind: "rift-leech", name: "Rift-Leech", count: 3, hp: 40, damageHint: 7, effectKind: "void" },
    punitive: { anchorKind: "cosmic-rift-anchor", anchorName: "Cosmic Rift Anchor", summonKind: "void-amalgam", summonName: "Void-Amalgam", hp: 210, damageHint: 17, spawnIntervalMs: 2600, effectKind: "void" }
  },
  apiculture: {
    skillId: "apiculture",
    warning: { kind: "gloom-weaver-spider", name: "Gloom-Weaver Spider", count: 3, hp: 43, damageHint: 6, effectKind: "sap" },
    punitive: { anchorKind: "infinite-magical-hornet-nest", anchorName: "Infinite Magical Hornet Nest", summonKind: "venomous-hornet", summonName: "Venomous Hornet", hp: 160, damageHint: 13, spawnIntervalMs: 1400, effectKind: "sap" }
  },
  "sap-tapping": {
    skillId: "sap-tapping",
    warning: { kind: "aggro-tree", name: "Aggro-Tree", count: 2, hp: 68, damageHint: 8, effectKind: "sap" },
    punitive: { anchorKind: "yggdrasil-elixir-font", anchorName: "Yggdrasil Elixir Font", summonKind: "timber-goliath", summonName: "Timber-Goliath", hp: 200, damageHint: 15, spawnIntervalMs: 3000, effectKind: "sap" }
  },
  "spore-hunting": {
    skillId: "spore-hunting",
    warning: { kind: "mire-bomber", name: "Mire Bomber", count: 3, hp: 42, damageHint: 7, effectKind: "spore" },
    punitive: { anchorKind: "mycelium-void-cord", anchorName: "Mycelium Void-Cord", summonKind: "void-leper", summonName: "Void-Leper", hp: 175, damageHint: 14, spawnIntervalMs: 2400, effectKind: "spore" }
  },
  dredging: {
    skillId: "dredging",
    warning: { kind: "grave-stalker", name: "Grave-Stalker", count: 3, hp: 47, damageHint: 7, effectKind: "dust" },
    punitive: { anchorKind: "abyssal-clay-maw", anchorName: "Abyssal Clay Maw", summonKind: "abyssal-eel", summonName: "Abyssal Eel", hp: 185, damageHint: 15, spawnIntervalMs: 2300, effectKind: "void" }
  },
  archaeology: {
    skillId: "archaeology",
    warning: { kind: "ruins-archer", name: "Ruins Archer", count: 3, hp: 44, damageHint: 8, effectKind: "void" },
    punitive: { anchorKind: "archon-seal-obelisk", anchorName: "Archon Seal Obelisk", summonKind: "anointed-crusader", summonName: "Anointed Crusader", hp: 210, damageHint: 16, spawnIntervalMs: 2800, effectKind: "spark" }
  },
  hunting: {
    skillId: "hunting",
    warning: { kind: "ashwood-alpha", name: "Ashwood Alpha", count: 2, hp: 74, damageHint: 10, effectKind: "blood" },
    punitive: { anchorKind: "primal-heart-effigy", anchorName: "Primal Heart Effigy", summonKind: "moss-grizzly", summonName: "Moss-Grizzly", hp: 220, damageHint: 17, spawnIntervalMs: 2600, effectKind: "blood" }
  },
  gemology: {
    skillId: "gemology",
    warning: { kind: "prism-golem", name: "Prism-Golem", count: 2, hp: 78, damageHint: 10, effectKind: "spark" },
    punitive: { anchorKind: "prism-geode-lens", anchorName: "Prism Geode Lens", summonKind: "crystalline-strider", summonName: "Crystalline Strider", hp: 205, damageHint: 16, spawnIntervalMs: 2400, effectKind: "spark" }
  }
} as const satisfies Record<GatheringSkillId, GatheringHazardProfile>;

function clampUnit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function sampleUnit(rng: GatheringHazardRng) {
  const value = Number(rng());
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1 - Number.EPSILON, value));
}

function skillKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeGatheringSkillId(skillId: string): GatheringSkillId | undefined {
  return SKILL_ALIASES[skillKey(skillId)];
}

export function gatheringHazardSeverityForTier(tier: number): GatheringHazardSeverity {
  if (tier >= 5) return "punitive";
  if (tier >= 3) return "warning";
  return "none";
}

export function shouldTriggerGatheringHazard(material: Pick<GatheringHazardMaterial, "tier" | "hazardChance">, rng: GatheringHazardRng = Math.random) {
  const severity = gatheringHazardSeverityForTier(material.tier);
  if (severity === "none") return false;
  const chance = clampUnit(material.hazardChance);
  if (chance <= 0) return false;
  return sampleUnit(rng) < chance;
}

function spawnCenterForSeverity(context: GatheringHazardContext, severity: GatheringHazardSeverity) {
  if (severity === "punitive") return context.player;
  return context.node ?? context.player;
}

function spawnOffset(index: number, count: number, rng: GatheringHazardRng, severity: GatheringHazardSeverity) {
  const baseRadius = severity === "punitive" ? 34 : 78;
  const radius = baseRadius + sampleUnit(rng) * (severity === "punitive" ? 18 : 34);
  const angle = ((Math.PI * 2) / Math.max(1, count)) * index + sampleUnit(rng) * 0.8;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius
  };
}

function hazardId(context: GatheringHazardContext, material: GatheringHazardMaterial, kind: string, index: number) {
  const tick = Math.max(0, Math.floor(context.tick ?? 0));
  return `gather-${material.id}-${tick}-${kind}-${index}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 32);
}

function warningSpawns(profile: GatheringHazardProfile, material: GatheringHazardMaterial, context: GatheringHazardContext, rng: GatheringHazardRng) {
  const center = spawnCenterForSeverity(context, "warning");
  const count = profile.warning.count + (material.tier >= 4 ? 1 : 0);
  const spawns: GatheringHazardSpawnSpec[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = spawnOffset(index, count, rng, "warning");
    spawns.push({
      entityType: "npc",
      id: hazardId(context, material, profile.warning.kind, index),
      kind: profile.warning.kind,
      name: profile.warning.name,
      role: "elite-pack",
      elite: true,
      x: center.x + offset.x,
      y: center.y + offset.y,
      zoneId: center.zoneId,
      hp: profile.warning.hp + (material.tier - 3) * 12,
      damageHint: profile.warning.damageHint + Math.max(0, material.tier - 3),
      effectKind: profile.warning.effectKind,
      focusedAggroOwnerId: context.player.id,
      sourceMaterialId: material.id,
      sourceMaterialName: material.name
    });
  }
  return spawns;
}

function punitiveSpawns(profile: GatheringHazardProfile, material: GatheringHazardMaterial, context: GatheringHazardContext, rng: GatheringHazardRng) {
  const center = spawnCenterForSeverity(context, "punitive");
  const offset = spawnOffset(0, 1, rng, "punitive");
  return [{
    entityType: "npc",
    id: hazardId(context, material, profile.punitive.anchorKind, 0),
    kind: profile.punitive.anchorKind,
    name: profile.punitive.anchorName,
    role: "threat-anchor",
    elite: true,
    x: center.x + offset.x,
    y: center.y + offset.y,
    zoneId: center.zoneId,
    hp: profile.punitive.hp,
    damageHint: profile.punitive.damageHint,
    effectKind: profile.punitive.effectKind,
    focusedAggroOwnerId: context.player.id,
    sourceMaterialId: material.id,
    sourceMaterialName: material.name,
    threatAnchor: {
      summonKind: profile.punitive.summonKind,
      summonName: profile.punitive.summonName,
      spawnIntervalMs: profile.punitive.spawnIntervalMs,
      leashRadius: 180,
      focusedAggroOwnerId: context.player.id
    }
  }] satisfies GatheringHazardSpawnSpec[];
}

export function resolveGatheringHazard(
  material: GatheringHazardMaterial,
  context: GatheringHazardContext,
  options: { rng?: GatheringHazardRng; force?: boolean } = {}
): GatheringHazardResolution {
  const rng = options.rng ?? Math.random;
  const severity = gatheringHazardSeverityForTier(material.tier);
  const chance = clampUnit(material.hazardChance);
  const roll = options.force ? 0 : sampleUnit(rng);
  const skillId = normalizeGatheringSkillId(material.skillId);
  if (severity === "none" || !skillId || chance <= 0 || (!options.force && roll >= chance)) {
    return {
      triggered: false,
      roll,
      chance,
      skillId,
      severity: skillId ? severity : "none",
      materialId: material.id,
      materialName: material.name,
      spawnSpecs: [],
      soundCues: [],
      message: skillId ? "" : `Unknown gathering skill: ${material.skillId}`
    };
  }

  const profile = gatheringHazardProfiles[skillId];
  const spawnSpecs = severity === "punitive"
    ? punitiveSpawns(profile, material, context, rng)
    : warningSpawns(profile, material, context, rng);
  const center = spawnCenterForSeverity(context, severity);
  const soundCues: GatheringHazardSoundCue[] = [{
    id: severity === "punitive" ? "gathering-hazard-punitive" : "gathering-hazard-warning",
    x: center.x,
    y: center.y,
    radius: severity === "punitive" ? 360 : 240,
    priority: severity === "punitive" ? 90 : 70
  }];

  return {
    triggered: true,
    roll,
    chance,
    skillId,
    severity,
    materialId: material.id,
    materialName: material.name,
    spawnSpecs,
    soundCues,
    message: severity === "punitive"
      ? `${profile.punitive.anchorName} answers the ${material.name} harvest.`
      : `${profile.warning.name} pack defends the ${material.name} node.`
  };
}

type GatheringHazardWritableState = Pick<MmoSkillDemoState, "entities" | "npcs" | "hazards">;

function combatFlagsForSpec(spec: GatheringHazardSpawnSpec) {
  const flags = ["gather-hazard", `src:${spec.sourceMaterialId}`, `aggro:${spec.focusedAggroOwnerId}`];
  if (spec.threatAnchor) flags.push("threat-anchor", `summon:${spec.threatAnchor.summonKind}`);
  return flags.join("|").slice(0, 96);
}

function toNpcEntity(spec: GatheringHazardSpawnSpec): NpcEntity {
  return {
    id: spec.id,
    entityType: "npc",
    kind: spec.kind,
    role: spec.role === "threat-anchor" ? "hazard-anchor" : "elite",
    zoneId: spec.zoneId,
    elite: spec.elite,
    x: spec.x,
    y: spec.y,
    spawnX: spec.x,
    spawnY: spec.y,
    hp: spec.hp,
    maxHp: spec.hp,
    respawnMs: 1000,
    attackCooldownMs: 350,
    projectileCooldownMs: spec.threatAnchor?.spawnIntervalMs ?? 900,
    phaseMs: 0,
    summonedBy: spec.focusedAggroOwnerId,
    personality: spec.threatAnchor ? "defensive-guardian" : "aggressive-pack-hunter",
    impactType: spec.effectKind,
    knockbackModifier: spec.threatAnchor ? 0 : 1.2,
    knockbackX: 0,
    knockbackY: 0,
    knockbackMs: 0,
    knockbackHeavy: false,
    stunMs: 0,
    slowMs: 0,
    iframeMs: 0,
    castMs: 0,
    damageAmpMs: 0,
    combatState: spec.threatAnchor ? "gather-threat-anchor" : "gather-warning",
    combatFlags: combatFlagsForSpec(spec),
    lastAttackStyle: ""
  };
}

export function spawnGatheringHazard(state: GatheringHazardWritableState, resolution: GatheringHazardResolution) {
  const spawned: NpcEntity[] = [];
  if (!resolution.triggered) return spawned;
  for (const spec of resolution.spawnSpecs) {
    const entity = toNpcEntity(spec);
    state.entities[entity.id] = entity;
    state.npcs[entity.id] = entity;
    spawned.push(entity);
  }
  return spawned;
}
