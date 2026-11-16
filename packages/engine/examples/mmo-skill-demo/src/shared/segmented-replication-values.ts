import {
  type MmoSkillDemoAction,
  type MmoSkillDemoEntity,
  type ZoneId
} from "../shared-contracts.ts";

export const ENTITY_TYPE_CODES: Record<MmoSkillDemoEntity["entityType"], number> = {
  player: 1,
  npc: 2,
  resource: 3,
  loot: 4,
  hazard: 5
};

export const ENTITY_TYPE_BY_CODE = new Map<number, MmoSkillDemoEntity["entityType"]>([
  [1, "player"],
  [2, "npc"],
  [3, "resource"],
  [4, "loot"],
  [5, "hazard"]
]);

export const ZONE_CODES: Record<ZoneId, number> = {
  ashwood: 1,
  crags: 2,
  bazaar: 3,
  "port-marrow": 4,
  "holy-reach": 5,
  "canaan-desert": 6,
  "void-rift": 7,
  "ashwood-wilderness": 8,
  "whisperwind-ascent": 9,
  dungeon: 10,
  cottage: 11
};

export const ZONE_BY_CODE = new Map<number, ZoneId>([
  [1, "ashwood"],
  [2, "crags"],
  [3, "bazaar"],
  [4, "port-marrow"],
  [5, "holy-reach"],
  [6, "canaan-desert"],
  [7, "void-rift"],
  [8, "ashwood-wilderness"],
  [9, "whisperwind-ascent"],
  [10, "dungeon"],
  [11, "cottage"]
]);

export const ACTION_CODES: Record<MmoSkillDemoAction, number> = {
  idle: 1,
  lmb: 2,
  rmb: 3,
  space: 4,
  q: 5,
  e: 6,
  r: 7,
  attack: 8,
  mine: 9,
  woodcut: 10,
  interact: 11,
  travel: 12,
  bank: 13,
  trade: 14,
  "use-item": 15,
  config: 16,
  dev: 17
};

export const ACTION_BY_CODE = new Map<number, MmoSkillDemoAction>([
  [1, "idle"],
  [2, "lmb"],
  [3, "rmb"],
  [4, "space"],
  [5, "q"],
  [6, "e"],
  [7, "r"],
  [8, "attack"],
  [9, "mine"],
  [10, "woodcut"],
  [11, "interact"],
  [12, "travel"],
  [13, "bank"],
  [14, "trade"],
  [15, "use-item"],
  [16, "config"],
  [17, "dev"]
]);

const COMBAT_STATE_CODES: Record<string, number> = {
  "": 0,
  real: 1,
  fake: 2,
  shattered: 3,
  "player-projectile": 4,
  "spore-shield": 5,
  overdrive: 6,
  overloaded: 7,
  "gravity-well": 8
};

export const COMBAT_STATE_BY_CODE = new Map<number, string>(Object.entries(COMBAT_STATE_CODES).map(([state, code]) => [code, state]));

const MMO_SHARED_STATUS_BITS = {
  BOW_VULNERABLE: 1,
  DEATHMARK: 2,
  FRACTURED: 4,
  SOULBOUND: 8,
  HEX: 16,
  POISON: 32,
  MORTAL: 64,
  ANTIHEAL: 128,
  WEAKENED: 256,
  ENFEEBLED: 512,
  BLIND: 1024
};

const MMO_SHARED_STATUS_EXACT: Record<string, number> = {
  "bow-vulnerable": MMO_SHARED_STATUS_BITS.BOW_VULNERABLE,
  deathmark: MMO_SHARED_STATUS_BITS.DEATHMARK,
  fractured: MMO_SHARED_STATUS_BITS.FRACTURED,
  soulbound: MMO_SHARED_STATUS_BITS.SOULBOUND,
  mortal: MMO_SHARED_STATUS_BITS.MORTAL,
  antiheal: MMO_SHARED_STATUS_BITS.ANTIHEAL,
  weakened: MMO_SHARED_STATUS_BITS.WEAKENED,
  enfeebled: MMO_SHARED_STATUS_BITS.ENFEEBLED,
  blind: MMO_SHARED_STATUS_BITS.BLIND
};

const MMO_SHARED_STATUS_PREFIX: Record<string, number> = {
  hex: MMO_SHARED_STATUS_BITS.HEX,
  poison: MMO_SHARED_STATUS_BITS.POISON
};

export const SLOT_CODES: Partial<Record<string, number>> = { LMB: 1, RMB: 2, Space: 3, Q: 4, E: 5, R: 6 };
export const SLOT_BY_CODE = new Map<number, string>([
  [1, "LMB"],
  [2, "RMB"],
  [3, "Space"],
  [4, "Q"],
  [5, "E"],
  [6, "R"]
]);

export function enumCode(map: Partial<Record<string, number>>, value: unknown) {
  return typeof value === "string" ? map[value] ?? 0 : 0;
}

export function validZoneId(value: unknown): ZoneId | undefined {
  if (typeof value !== "string") return undefined;
  for (const zoneId of ZONE_BY_CODE.values()) {
    if (zoneId === value) return zoneId;
  }
  return undefined;
}

export function validAction(value: unknown): MmoSkillDemoAction | undefined {
  if (typeof value !== "string") return undefined;
  for (const action of ACTION_BY_CODE.values()) {
    if (action === value) return action;
  }
  return undefined;
}

export function mmoSkillDemoEntityTypeCode(value: unknown) {
  if (value === "player" || value === "npc" || value === "resource" || value === "loot" || value === "hazard") {
    return ENTITY_TYPE_CODES[value];
  }
  return 0;
}

export function mmoSkillDemoActionCode(value: unknown) {
  return enumCode(ACTION_CODES, value);
}

export function mmoSkillDemoCombatStateCode(value: unknown) {
  return enumCode(COMBAT_STATE_CODES, value);
}

export function mmoSkillDemoStatusMask(value: unknown) {
  if (typeof value !== "string" || value.length === 0) return 0;
  let mask = 0;
  for (const part of value.split("|")) {
    if (!part) continue;
    const [prefix] = part.split(":", 1);
    mask |= MMO_SHARED_STATUS_EXACT[part] ?? MMO_SHARED_STATUS_PREFIX[prefix] ?? 0;
  }
  return mask >>> 0;
}

export function combatFlagsFromMmoStatusMask(mask: number) {
  const flags: string[] = [];
  if (mask & MMO_SHARED_STATUS_BITS.BOW_VULNERABLE) flags.push("bow-vulnerable");
  if (mask & MMO_SHARED_STATUS_BITS.DEATHMARK) flags.push("deathmark");
  if (mask & MMO_SHARED_STATUS_BITS.FRACTURED) flags.push("fractured");
  if (mask & MMO_SHARED_STATUS_BITS.SOULBOUND) flags.push("soulbound");
  if (mask & MMO_SHARED_STATUS_BITS.HEX) flags.push("hex:1");
  if (mask & MMO_SHARED_STATUS_BITS.POISON) flags.push("poison:1");
  if (mask & MMO_SHARED_STATUS_BITS.MORTAL) flags.push("mortal");
  if (mask & MMO_SHARED_STATUS_BITS.ANTIHEAL) flags.push("antiheal");
  if (mask & MMO_SHARED_STATUS_BITS.WEAKENED) flags.push("weakened");
  if (mask & MMO_SHARED_STATUS_BITS.ENFEEBLED) flags.push("enfeebled");
  if (mask & MMO_SHARED_STATUS_BITS.BLIND) flags.push("blind");
  return flags.join("|");
}
