import { type MmoSkillDemoAction } from "./shared-contracts.ts";

const ACTION_COOLDOWN_MS = {
  attack: 560,
  mine: 2000,
  woodcut: 2000,
  lmb: 560,
  rmb: 900,
  space: 420,
  q: 850,
  e: 2600,
  r: 0,
  interact: 360,
  travel: 700,
  bank: 500,
  trade: 500,
  "use-item": 280
} as const;

const GATHER_MIN_LEVEL = 1;

const GATHER_MAX_LEVEL = 99;

const GATHER_BASE_COOLDOWN_MS = 2000;

const GATHER_FASTEST_COOLDOWN_MS = 250;

type AbilitySlot = "LMB" | "RMB" | "Space" | "Q" | "E" | "R";

type PlayerAbilityDef = {
  id: string;
  slot: AbilitySlot;
  weaponId: string;
  cooldownMs: number;
  castMs: number;
  energyGain: number;
  name: string;
};

const MAX_ENERGY = 100;

const MACE_WEAPON_ID = "mace";

const BOW_WEAPON_ID = "bow";

const STAFF_WEAPON_ID = "staff";

const WAND_WEAPON_ID = "wand";

const TWIN_BLADES_WEAPON_ID = "twin-blades";

const BLADE_WEAPON_ID = "blade";

const ABILITY_SLOTS = ["LMB", "RMB", "Space", "Q", "E", "R"] as const;

const SLOT_ACTIONS: Record<AbilitySlot, MmoSkillDemoAction> = { LMB: "lmb", RMB: "rmb", Space: "space", Q: "q", E: "e", R: "r" };

const ACTION_TO_SLOT: Partial<Record<MmoSkillDemoAction, AbilitySlot>> = {
  attack: "LMB",
  lmb: "LMB",
  rmb: "RMB",
  space: "Space",
  q: "Q",
  e: "E",
  r: "R"
};

const PLAYER_ABILITY_DEFS = {
  "mace-pummel": { id: "mace-pummel", name: "Pummel", weaponId: MACE_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 350, energyGain: 6 },
  "mace-crushing-leap": { id: "mace-crushing-leap", name: "Slam", weaponId: MACE_WEAPON_ID, slot: "RMB", cooldownMs: 7000, castMs: 100, energyGain: 14 },
  "space-rush": { id: "space-rush", name: "Rush", weaponId: MACE_WEAPON_ID, slot: "Space", cooldownMs: 8000, castMs: 500, energyGain: 10 },
  "q-berserk": { id: "q-berserk", name: "Berserk", weaponId: MACE_WEAPON_ID, slot: "Q", cooldownMs: 10000, castMs: 100, energyGain: 30 },
  "mace-rock-smash": { id: "mace-rock-smash", name: "Boulder", weaponId: MACE_WEAPON_ID, slot: "E", cooldownMs: 6000, castMs: 100, energyGain: 8 },
  "mace-whirlwind": { id: "mace-whirlwind", name: "Whirlwind", weaponId: MACE_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 160, energyGain: 0 },
  "bow-quick-shot": { id: "bow-quick-shot", name: "Quick Shot", weaponId: BOW_WEAPON_ID, slot: "LMB", cooldownMs: 100, castMs: 250, energyGain: 5 },
  "bow-precision": { id: "bow-precision", name: "Precision", weaponId: BOW_WEAPON_ID, slot: "RMB", cooldownMs: 10000, castMs: 1000, energyGain: 14 },
  "bow-volley": { id: "bow-volley", name: "Volley", weaponId: BOW_WEAPON_ID, slot: "RMB", cooldownMs: 5000, castMs: 100, energyGain: 10 },
  "bow-reposition": { id: "bow-reposition", name: "Reposition", weaponId: BOW_WEAPON_ID, slot: "Space", cooldownMs: 7000, castMs: 50, energyGain: 8 },
  "bow-vault": { id: "bow-vault", name: "Vault", weaponId: BOW_WEAPON_ID, slot: "Space", cooldownMs: 15000, castMs: 200, energyGain: 10 },
  "bow-stealth": { id: "bow-stealth", name: "Stealth", weaponId: BOW_WEAPON_ID, slot: "Q", cooldownMs: 20000, castMs: 0, energyGain: 6 },
  "bow-decoy": { id: "bow-decoy", name: "Decoy", weaponId: BOW_WEAPON_ID, slot: "Q", cooldownMs: 15000, castMs: 100, energyGain: 6 },
  "bow-bolas": { id: "bow-bolas", name: "Bolas", weaponId: BOW_WEAPON_ID, slot: "E", cooldownMs: 8000, castMs: 100, energyGain: 9 },
  "bow-caltrops": { id: "bow-caltrops", name: "Caltrops", weaponId: BOW_WEAPON_ID, slot: "E", cooldownMs: 13000, castMs: 100, energyGain: 6 },
  "bow-flurry": { id: "bow-flurry", name: "Flurry", weaponId: BOW_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 250, energyGain: 0 },
  "bow-arrowstorm": { id: "bow-arrowstorm", name: "Arrow Storm", weaponId: BOW_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 250, energyGain: 0 },
  "staff-arcane-bolt": { id: "staff-arcane-bolt", name: "Arcane Bolt", weaponId: STAFF_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 300, energyGain: 5 },
  "staff-siphon-beam": { id: "staff-siphon-beam", name: "Siphon Beam", weaponId: STAFF_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 50, energyGain: 3 },
  "staff-meteor": { id: "staff-meteor", name: "Meteor", weaponId: STAFF_WEAPON_ID, slot: "RMB", cooldownMs: 8000, castMs: 1000, energyGain: 14 },
  "staff-healing-pulse": { id: "staff-healing-pulse", name: "Healing Pulse", weaponId: STAFF_WEAPON_ID, slot: "RMB", cooldownMs: 7000, castMs: 800, energyGain: 8 },
  "staff-frost-chain": { id: "staff-frost-chain", name: "Frost Chain", weaponId: STAFF_WEAPON_ID, slot: "RMB", cooldownMs: 8000, castMs: 400, energyGain: 12 },
  "staff-astral-walk": { id: "staff-astral-walk", name: "Astral Walk", weaponId: STAFF_WEAPON_ID, slot: "Space", cooldownMs: 12000, castMs: 150, energyGain: 9 },
  "staff-zephyr": { id: "staff-zephyr", name: "Zephyr", weaponId: STAFF_WEAPON_ID, slot: "Space", cooldownMs: 10000, castMs: 50, energyGain: 6 },
  "staff-ice-wall": { id: "staff-ice-wall", name: "Ice Wall", weaponId: STAFF_WEAPON_ID, slot: "Q", cooldownMs: 15000, castMs: 300, energyGain: 6 },
  "staff-arcane-bubble": { id: "staff-arcane-bubble", name: "Arcane Bubble", weaponId: STAFF_WEAPON_ID, slot: "Q", cooldownMs: 16000, castMs: 200, energyGain: 6 },
  "staff-petrify": { id: "staff-petrify", name: "Petrify", weaponId: STAFF_WEAPON_ID, slot: "Q", cooldownMs: 14000, castMs: 500, energyGain: 10 },
  "staff-gravity-well": { id: "staff-gravity-well", name: "Gravity Well", weaponId: STAFF_WEAPON_ID, slot: "E", cooldownMs: 12000, castMs: 300, energyGain: 10 },
  "staff-consecration": { id: "staff-consecration", name: "Consecration", weaponId: STAFF_WEAPON_ID, slot: "E", cooldownMs: 14000, castMs: 400, energyGain: 10 },
  "staff-dispel-nova": { id: "staff-dispel-nova", name: "Dispel Nova", weaponId: STAFF_WEAPON_ID, slot: "E", cooldownMs: 12000, castMs: 200, energyGain: 8 },
  "staff-maelstrom": { id: "staff-maelstrom", name: "Maelstrom", weaponId: STAFF_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 500, energyGain: 0 },
  "staff-tranquility": { id: "staff-tranquility", name: "Tranquility", weaponId: STAFF_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 500, energyGain: 0 },
  "wand-magic-missile": { id: "wand-magic-missile", name: "Magic Missile", weaponId: WAND_WEAPON_ID, slot: "LMB", cooldownMs: 200, castMs: 400, energyGain: 4 },
  "wand-hex": { id: "wand-hex", name: "Hex", weaponId: WAND_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 250, energyGain: 4 },
  "wand-mending-spark": { id: "wand-mending-spark", name: "Mending Spark", weaponId: WAND_WEAPON_ID, slot: "LMB", cooldownMs: 200, castMs: 300, energyGain: 4 },
  "wand-focused-ray": { id: "wand-focused-ray", name: "Focused Ray", weaponId: WAND_WEAPON_ID, slot: "RMB", cooldownMs: 7000, castMs: 200, energyGain: 13 },
  "wand-soul-bind": { id: "wand-soul-bind", name: "Soul Bind", weaponId: WAND_WEAPON_ID, slot: "RMB", cooldownMs: 10000, castMs: 300, energyGain: 8 },
  "wand-flash-heal": { id: "wand-flash-heal", name: "Flash Heal", weaponId: WAND_WEAPON_ID, slot: "RMB", cooldownMs: 6000, castMs: 400, energyGain: 6 },
  "wand-blink": { id: "wand-blink", name: "Blink", weaponId: WAND_WEAPON_ID, slot: "Space", cooldownMs: 8000, castMs: 50, energyGain: 5 },
  "wand-phase-shift": { id: "wand-phase-shift", name: "Phase Shift", weaponId: WAND_WEAPON_ID, slot: "Space", cooldownMs: 13000, castMs: 50, energyGain: 6 },
  "wand-rewind": { id: "wand-rewind", name: "Rewind", weaponId: WAND_WEAPON_ID, slot: "Space", cooldownMs: 18000, castMs: 50, energyGain: 8 },
  "wand-mirror-shield": { id: "wand-mirror-shield", name: "Mirror Shield", weaponId: WAND_WEAPON_ID, slot: "Q", cooldownMs: 12000, castMs: 100, energyGain: 8 },
  "wand-nightmare": { id: "wand-nightmare", name: "Nightmare", weaponId: WAND_WEAPON_ID, slot: "Q", cooldownMs: 15000, castMs: 300, energyGain: 9 },
  "wand-rupture": { id: "wand-rupture", name: "Rupture", weaponId: WAND_WEAPON_ID, slot: "E", cooldownMs: 8000, castMs: 200, energyGain: 10 },
  "wand-enfeeble": { id: "wand-enfeeble", name: "Enfeeble", weaponId: WAND_WEAPON_ID, slot: "E", cooldownMs: 12000, castMs: 100, energyGain: 8 },
  "wand-chaos-volley": { id: "wand-chaos-volley", name: "Chaos Volley", weaponId: WAND_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 200, energyGain: 0 },
  "wand-apotheosis": { id: "wand-apotheosis", name: "Apotheosis", weaponId: WAND_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 200, energyGain: 0 },
  "twin-strike": { id: "twin-strike", name: "Twin Strike", weaponId: TWIN_BLADES_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 200, energyGain: 5 },
  "twin-toxic-slash": { id: "twin-toxic-slash", name: "Toxic Slash", weaponId: TWIN_BLADES_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 250, energyGain: 5 },
  "twin-throwing-dirk": { id: "twin-throwing-dirk", name: "Throwing Dirk", weaponId: TWIN_BLADES_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 250, energyGain: 5 },
  "twin-shadow-lunge": { id: "twin-shadow-lunge", name: "Shadow Lunge", weaponId: TWIN_BLADES_WEAPON_ID, slot: "RMB", cooldownMs: 6000, castMs: 150, energyGain: 12 },
  "twin-exsanguinate": { id: "twin-exsanguinate", name: "Exsanguinate", weaponId: TWIN_BLADES_WEAPON_ID, slot: "RMB", cooldownMs: 8000, castMs: 250, energyGain: 12 },
  "twin-fan-of-knives": { id: "twin-fan-of-knives", name: "Fan of Knives", weaponId: TWIN_BLADES_WEAPON_ID, slot: "RMB", cooldownMs: 5250, castMs: 150, energyGain: 10 },
  "twin-swift-step": { id: "twin-swift-step", name: "Swift Step", weaponId: TWIN_BLADES_WEAPON_ID, slot: "Space", cooldownMs: 8000, castMs: 50, energyGain: 8 },
  "twin-smoke-bomb": { id: "twin-smoke-bomb", name: "Smoke Bomb", weaponId: TWIN_BLADES_WEAPON_ID, slot: "Space", cooldownMs: 12000, castMs: 100, energyGain: 8 },
  "twin-bloodlust": { id: "twin-bloodlust", name: "Bloodlust", weaponId: TWIN_BLADES_WEAPON_ID, slot: "Space", cooldownMs: 14000, castMs: 0, energyGain: 8 },
  "twin-blur": { id: "twin-blur", name: "Blur", weaponId: TWIN_BLADES_WEAPON_ID, slot: "Q", cooldownMs: 10000, castMs: 0, energyGain: 8 },
  "twin-vanish": { id: "twin-vanish", name: "Vanish", weaponId: TWIN_BLADES_WEAPON_ID, slot: "Q", cooldownMs: 15000, castMs: 150, energyGain: 8 },
  "twin-noxious-flask": { id: "twin-noxious-flask", name: "Noxious Flask", weaponId: TWIN_BLADES_WEAPON_ID, slot: "E", cooldownMs: 11000, castMs: 250, energyGain: 10 },
  "twin-deaths-mark": { id: "twin-deaths-mark", name: "Death's Mark", weaponId: TWIN_BLADES_WEAPON_ID, slot: "E", cooldownMs: 14000, castMs: 100, energyGain: 10 },
  "twin-blade-dance": { id: "twin-blade-dance", name: "Blade Dance", weaponId: TWIN_BLADES_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 200, energyGain: 0 },
  "twin-assassinate": { id: "twin-assassinate", name: "Assassinate", weaponId: TWIN_BLADES_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 350, energyGain: 0 },
  "blade-cleave": { id: "blade-cleave", name: "Cleave", weaponId: BLADE_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 350, energyGain: 6 },
  "blade-sever": { id: "blade-sever", name: "Sever", weaponId: BLADE_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 350, energyGain: 6 },
  "blade-sunder": { id: "blade-sunder", name: "Sunder", weaponId: BLADE_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 400, energyGain: 6 },
  "blade-brutal-strike": { id: "blade-brutal-strike", name: "Brutal Strike", weaponId: BLADE_WEAPON_ID, slot: "RMB", cooldownMs: 6000, castMs: 450, energyGain: 12 },
  "blade-thrust": { id: "blade-thrust", name: "Thrust", weaponId: BLADE_WEAPON_ID, slot: "RMB", cooldownMs: 7000, castMs: 200, energyGain: 10 },
  "blade-bloodthirst": { id: "blade-bloodthirst", name: "Bloodthirst", weaponId: BLADE_WEAPON_ID, slot: "RMB", cooldownMs: 8000, castMs: 300, energyGain: 10 },
  "blade-combat-roll": { id: "blade-combat-roll", name: "Combat Roll", weaponId: BLADE_WEAPON_ID, slot: "Space", cooldownMs: 7000, castMs: 50, energyGain: 8 },
  "blade-leap-attack": { id: "blade-leap-attack", name: "Leap Attack", weaponId: BLADE_WEAPON_ID, slot: "Space", cooldownMs: 10000, castMs: 200, energyGain: 10 },
  "blade-juggernaut": { id: "blade-juggernaut", name: "Juggernaut", weaponId: BLADE_WEAPON_ID, slot: "Space", cooldownMs: 14000, castMs: 100, energyGain: 8 },
  "blade-riposte": { id: "blade-riposte", name: "Riposte", weaponId: BLADE_WEAPON_ID, slot: "Q", cooldownMs: 8000, castMs: 100, energyGain: 12 },
  "blade-iron-will": { id: "blade-iron-will", name: "Iron Will", weaponId: BLADE_WEAPON_ID, slot: "Q", cooldownMs: 15000, castMs: 0, energyGain: 8 },
  "blade-intimidating-shout": { id: "blade-intimidating-shout", name: "Intimidating Shout", weaponId: BLADE_WEAPON_ID, slot: "E", cooldownMs: 14000, castMs: 250, energyGain: 10 },
  "blade-razor-wind": { id: "blade-razor-wind", name: "Razor Wind", weaponId: BLADE_WEAPON_ID, slot: "E", cooldownMs: 12000, castMs: 200, energyGain: 10 },
  "blade-omnislash": { id: "blade-omnislash", name: "Omnislash", weaponId: BLADE_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 200, energyGain: 0 },
  "blade-duelists-trance": { id: "blade-duelists-trance", name: "Duelist's Trance", weaponId: BLADE_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 300, energyGain: 0 }
} as const;

type PlayerDashSpec = {
  rangePmsps: number;
  durationMs: number;
  effectKind?: string;
};

type MeleeDashAbilityId =
  | "twin-strike"
  | "twin-toxic-slash"
  | "twin-shadow-lunge"
  | "twin-exsanguinate"
  | "twin-assassinate"
  | "blade-cleave"
  | "blade-sever"
  | "blade-sunder"
  | "blade-brutal-strike"
  | "blade-thrust"
  | "blade-bloodthirst";

const MELEE_PREFIRE_DASHES = {
  "twin-strike": { rangePmsps: 0.15, durationMs: 100 },
  "twin-toxic-slash": { rangePmsps: 0.15, durationMs: 100 },
  "twin-shadow-lunge": { rangePmsps: 1.25, durationMs: 150 },
  "twin-exsanguinate": { rangePmsps: 0.22, durationMs: 150 },
  "twin-assassinate": { rangePmsps: 3.2, durationMs: 200 },
  "blade-cleave": { rangePmsps: 0.1, durationMs: 150 },
  "blade-sever": { rangePmsps: 0.1, durationMs: 150 },
  "blade-sunder": { rangePmsps: 0.1, durationMs: 150 },
  "blade-brutal-strike": { rangePmsps: 0.45, durationMs: 200 },
  "blade-thrust": { rangePmsps: 1.45, durationMs: 250 },
  "blade-bloodthirst": { rangePmsps: 0.3, durationMs: 150 }
} as const;

type MovementDashAbilityId = "bow-reposition" | "bow-vault" | "blade-combat-roll" | "blade-leap-attack";

const MOVEMENT_DASHES = {
  "bow-reposition": { rangePmsps: 1.4, durationMs: 250, effectKind: "rushdust" },
  "bow-vault": { rangePmsps: 0.85, durationMs: 250, effectKind: "rushdust" },
  "blade-combat-roll": { rangePmsps: 1.6, durationMs: 300, effectKind: "rushdust" },
  "blade-leap-attack": { rangePmsps: 2.15, durationMs: 400, effectKind: "dust" }
} as const;

const WEAPON_LOADOUTS = {
  mace: {
    id: MACE_WEAPON_ID,
    name: "Mace",
    slots: {
      LMB: "mace-pummel",
      RMB: "mace-crushing-leap",
      Space: "space-rush",
      Q: "q-berserk",
      E: "mace-rock-smash",
      R: "mace-whirlwind"
    },
    options: {
      LMB: ["mace-pummel"],
      RMB: ["mace-crushing-leap"],
      Space: ["space-rush"],
      Q: ["q-berserk"],
      E: ["mace-rock-smash"],
      R: ["mace-whirlwind"]
    }
  },
  bow: {
    id: BOW_WEAPON_ID,
    name: "Bow",
    slots: {
      LMB: "bow-quick-shot",
      RMB: "bow-precision",
      Space: "bow-reposition",
      Q: "bow-stealth",
      E: "bow-bolas",
      R: "bow-flurry"
    },
    options: {
      LMB: ["bow-quick-shot"],
      RMB: ["bow-precision", "bow-volley"],
      Space: ["bow-reposition", "bow-vault"],
      Q: ["bow-stealth", "bow-decoy"],
      E: ["bow-bolas", "bow-caltrops"],
      R: ["bow-flurry", "bow-arrowstorm"]
    }
  },
  staff: {
    id: STAFF_WEAPON_ID,
    name: "Staff",
    slots: {
      LMB: "staff-arcane-bolt",
      RMB: "staff-meteor",
      Space: "staff-astral-walk",
      Q: "staff-ice-wall",
      E: "staff-gravity-well",
      R: "staff-maelstrom"
    },
    options: {
      LMB: ["staff-arcane-bolt", "staff-siphon-beam"],
      RMB: ["staff-meteor", "staff-healing-pulse", "staff-frost-chain"],
      Space: ["staff-astral-walk", "staff-zephyr"],
      Q: ["staff-ice-wall", "staff-arcane-bubble", "staff-petrify"],
      E: ["staff-gravity-well", "staff-consecration", "staff-dispel-nova"],
      R: ["staff-maelstrom", "staff-tranquility"]
    }
  },
  wand: {
    id: WAND_WEAPON_ID,
    name: "Wand",
    slots: {
      LMB: "wand-magic-missile",
      RMB: "wand-focused-ray",
      Space: "wand-blink",
      Q: "wand-mirror-shield",
      E: "wand-rupture",
      R: "wand-chaos-volley"
    },
    options: {
      LMB: ["wand-magic-missile", "wand-hex", "wand-mending-spark"],
      RMB: ["wand-focused-ray", "wand-soul-bind", "wand-flash-heal"],
      Space: ["wand-blink", "wand-phase-shift", "wand-rewind"],
      Q: ["wand-mirror-shield", "wand-nightmare"],
      E: ["wand-rupture", "wand-enfeeble"],
      R: ["wand-chaos-volley", "wand-apotheosis"]
    }
  },
  "twin-blades": {
    id: TWIN_BLADES_WEAPON_ID,
    name: "Twin Blades",
    slots: {
      LMB: "twin-strike",
      RMB: "twin-shadow-lunge",
      Space: "twin-swift-step",
      Q: "twin-blur",
      E: "twin-noxious-flask",
      R: "twin-blade-dance"
    },
    options: {
      LMB: ["twin-strike", "twin-toxic-slash", "twin-throwing-dirk"],
      RMB: ["twin-shadow-lunge", "twin-exsanguinate", "twin-fan-of-knives"],
      Space: ["twin-swift-step", "twin-smoke-bomb", "twin-bloodlust"],
      Q: ["twin-blur", "twin-vanish"],
      E: ["twin-noxious-flask", "twin-deaths-mark"],
      R: ["twin-blade-dance", "twin-assassinate"]
    }
  },
  blade: {
    id: BLADE_WEAPON_ID,
    name: "Blade",
    slots: {
      LMB: "blade-cleave",
      RMB: "blade-brutal-strike",
      Space: "blade-combat-roll",
      Q: "blade-riposte",
      E: "blade-intimidating-shout",
      R: "blade-omnislash"
    },
    options: {
      LMB: ["blade-cleave", "blade-sever", "blade-sunder"],
      RMB: ["blade-brutal-strike", "blade-thrust", "blade-bloodthirst"],
      Space: ["blade-combat-roll", "blade-leap-attack", "blade-juggernaut"],
      Q: ["blade-riposte", "blade-iron-will"],
      E: ["blade-intimidating-shout", "blade-razor-wind"],
      R: ["blade-omnislash", "blade-duelists-trance"]
    }
  }
} as const;

export const playerAbilityMetadata: Record<string, { id: string; name: string; slot: AbilitySlot; weaponId: string; cooldownMs: number; castMs: number }> = Object.fromEntries(
  Object.values(PLAYER_ABILITY_DEFS).map((ability) => [
    ability.id,
    {
      id: ability.id,
      name: ability.name,
      slot: ability.slot,
      weaponId: ability.weaponId,
      cooldownMs: ability.cooldownMs,
      castMs: ability.castMs
    }
  ])
);

export const weaponMetadata = {
  [MACE_WEAPON_ID]: { id: MACE_WEAPON_ID, name: "Mace" },
  [BOW_WEAPON_ID]: { id: BOW_WEAPON_ID, name: "Bow" },
  [STAFF_WEAPON_ID]: { id: STAFF_WEAPON_ID, name: "Staff" },
  [WAND_WEAPON_ID]: { id: WAND_WEAPON_ID, name: "Wand" },
  [TWIN_BLADES_WEAPON_ID]: { id: TWIN_BLADES_WEAPON_ID, name: "Twin Blades" },
  [BLADE_WEAPON_ID]: { id: BLADE_WEAPON_ID, name: "Blade" }
} as const;

export {
  ABILITY_SLOTS,
  ACTION_COOLDOWN_MS,
  ACTION_TO_SLOT,
  BLADE_WEAPON_ID,
  BOW_WEAPON_ID,
  GATHER_BASE_COOLDOWN_MS,
  GATHER_FASTEST_COOLDOWN_MS,
  GATHER_MAX_LEVEL,
  GATHER_MIN_LEVEL,
  MACE_WEAPON_ID,
  MAX_ENERGY,
  MELEE_PREFIRE_DASHES,
  MOVEMENT_DASHES,
  PLAYER_ABILITY_DEFS,
  SLOT_ACTIONS,
  STAFF_WEAPON_ID,
  TWIN_BLADES_WEAPON_ID,
  WAND_WEAPON_ID,
  WEAPON_LOADOUTS
};

export type {
  AbilitySlot,
  MeleeDashAbilityId,
  MovementDashAbilityId,
  PlayerAbilityDef,
  PlayerDashSpec
};
