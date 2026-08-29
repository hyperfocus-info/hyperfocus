export const ARENA_ID = "three-arena";

export const BALANCE_CONSTANTS = {
  run: {
    targetMinutes: 18,
    softWinAtSeconds: 1080,
    hardEnrageAtSeconds: 1140,
    maxActiveEnemies: 170,
    maxDropsOnGround: 90,
    maxHazardsActive: 18,
    eliteEverySeconds: 150,
    chestEverySeconds: 180
  },
  player: {
    startHealth: 120,
    healthRegenPerSecond: 0.008,
    moveSpeed: 6.2,
    sprintMoveSpeed: 8.1,
    pickupRadius: 2.4,
    magnetRadius: 7.5,
    contactGraceSeconds: 0.18,
    invulnerableAfterHitSeconds: 0.55,
    reviveHealthRatio: 0.45,
    maxWeaponSlots: 6,
    maxPassiveSlots: 6
  },
  progression: {
    startLevel: 1,
    xpCurveBase: 24,
    xpCurvePower: 1.28,
    xpCurveLinear: 8,
    levelChoiceCount: 3,
    rerollsStart: 2,
    banishesStart: 1,
    evolutionLevel: 8,
    passiveEvolutionLevel: 5
  },
  combat: {
    globalCooldownFloor: 0.12,
    baseKnockbackDecay: 10.5,
    enemyContactDamageCooldown: 0.65,
    enemyDamageMultiplier: 10,
    critMultiplier: 1.75,
    armorDamageReductionPerPoint: 0.018,
    armorReductionCap: 0.55,
    slowResistCap: 0.8,
    bossStatusDurationScale: 0.35
  },
  director: {
    spawnRingMinRadius: 26,
    spawnRingMaxRadius: 44,
    nearSpawnBlockRadius: 18,
    flankSpawnAngleDegrees: 85,
    packSpawnJitter: 4.5,
    pressureDropThreshold: 0.28,
    restBudgetMultiplier: 0.55,
    panicPickupChance: 0.12,
    healingDropChance: 0.6
  },
  arena: {
    floorSize: 92,
    innerSafeRadius: 9,
    propClearanceRadius: 2.2,
    maxBlockingProps: 56,
    maxDecorativeProps: 140,
    cameraDistance: 18,
    cameraPitchDegrees: 58,
    fogStart: 48,
    fogEnd: 86
  }
};

export const DAMAGE_TYPES = [
  "physical",
  "silver",
  "fire",
  "shadow",
  "holy",
  "plague",
  "bleed"
];

export const PASSIVE_ITEMS = {
  blackGarlic: {
    id: "blackGarlic",
    name: "Black Garlic",
    maxLevel: 5,
    tierBadge: "Passive",
    stateLabel: "Aura control",
    tags: ["aura", "control"],
    categories: {
      utility: "space control",
      synergy: "graveLantern",
      skill: "positioning"
    },
    visual: {
      color: "#d6c0a4",
      timerHint: "persistent aura"
    },
    bonuses: [
      { level: 1, auraRadiusMultiplier: 1.08, badge: "Reach", stateLabel: "Wider aura", category: "area" },
      { level: 2, auraDamageMultiplier: 1.08, badge: "Bite", stateLabel: "Stronger aura", category: "damage" },
      { level: 3, auraRadiusMultiplier: 1.1, badge: "Reach", stateLabel: "Wider aura", category: "area" },
      { level: 4, cooldownMultiplier: 0.94, badge: "Pulse", stateLabel: "Faster aura", category: "tempo" },
      { level: 5, auraDamageMultiplier: 1.16, badge: "Max", stateLabel: "Heavy aura", category: "damage" }
    ]
  },
  silverRosary: {
    id: "silverRosary",
    name: "Silver Rosary",
    maxLevel: 5,
    tierBadge: "Passive",
    stateLabel: "Elite focus",
    tags: ["holy", "elite-killer"],
    categories: {
      utility: "priority damage",
      synergy: "silverStake, funeralBell",
      skill: "target selection"
    },
    visual: {
      color: "#f2f4df",
      timerHint: "persistent blessing"
    },
    bonuses: [
      { level: 1, silverDamageMultiplier: 1.08, badge: "Bless", stateLabel: "Silver boost", category: "damage" },
      { level: 2, eliteDamageMultiplier: 1.06, badge: "Judgment", stateLabel: "Elite boost", category: "damage" },
      { level: 3, silverDamageMultiplier: 1.1, badge: "Bless", stateLabel: "Silver boost", category: "damage" },
      { level: 4, pickupRadiusFlat: 0.8, badge: "Draw", stateLabel: "Wider pickup", category: "utility" },
      { level: 5, eliteDamageMultiplier: 1.12, badge: "Max", stateLabel: "Elite breaker", category: "damage" }
    ]
  },
  graveBoots: {
    id: "graveBoots",
    name: "Grave Boots",
    maxLevel: 5,
    tierBadge: "Passive",
    stateLabel: "Mobility",
    tags: ["mobility"],
    categories: {
      utility: "escape",
      synergy: "batSwarm",
      skill: "pathing"
    },
    visual: {
      color: "#9f8d72",
      timerHint: "persistent movement"
    },
    bonuses: [
      { level: 1, moveSpeedMultiplier: 1.06, badge: "Stride", stateLabel: "Faster move", category: "mobility" },
      { level: 2, contactGraceSecondsFlat: 0.03, badge: "Slip", stateLabel: "More grace", category: "forgiveness" },
      { level: 3, moveSpeedMultiplier: 1.07, badge: "Stride", stateLabel: "Faster move", category: "mobility" },
      { level: 4, knockbackResistFlat: 0.12, badge: "Anchor", stateLabel: "Steadier footing", category: "defense" },
      { level: 5, moveSpeedMultiplier: 1.1, badge: "Max", stateLabel: "Fast escape", category: "mobility" }
    ]
  },
  funeralBellClapper: {
    id: "funeralBellClapper",
    name: "Funeral Bell Clapper",
    maxLevel: 5,
    tierBadge: "Passive",
    stateLabel: "Tempo",
    tags: ["cooldown", "projectile"],
    categories: {
      utility: "rate of fire",
      synergy: "boneSplinter",
      skill: "uptime"
    },
    visual: {
      color: "#c8b784",
      timerHint: "persistent cooldown"
    },
    bonuses: [
      { level: 1, cooldownMultiplier: 0.96, badge: "Tempo", stateLabel: "Lower cooldown", category: "tempo" },
      { level: 2, projectileSpeedMultiplier: 1.08, badge: "Flight", stateLabel: "Faster shots", category: "projectile" },
      { level: 3, cooldownMultiplier: 0.95, badge: "Tempo", stateLabel: "Lower cooldown", category: "tempo" },
      { level: 4, projectileCountFlat: 1, badge: "Echo", stateLabel: "Extra projectile", category: "coverage" },
      { level: 5, cooldownMultiplier: 0.93, badge: "Max", stateLabel: "Fast rhythm", category: "tempo" }
    ]
  },
  bloodHourglass: {
    id: "bloodHourglass",
    name: "Blood Hourglass",
    maxLevel: 5,
    tierBadge: "Passive",
    stateLabel: "Duration",
    tags: ["duration", "bleed"],
    categories: {
      utility: "damage over time",
      synergy: "plagueVial, reaperScythe",
      skill: "zone upkeep"
    },
    visual: {
      color: "#9f2635",
      timerHint: "longer effects"
    },
    bonuses: [
      { level: 1, effectDurationMultiplier: 1.1, badge: "Delay", stateLabel: "Longer effects", category: "duration" },
      { level: 2, bleedDamageMultiplier: 1.08, badge: "Bleed", stateLabel: "Stronger bleed", category: "damage" },
      { level: 3, effectDurationMultiplier: 1.12, badge: "Delay", stateLabel: "Longer effects", category: "duration" },
      { level: 4, pickupLifetimeMultiplier: 1.2, badge: "Hold", stateLabel: "Longer drops", category: "utility" },
      { level: 5, bleedDamageMultiplier: 1.16, badge: "Max", stateLabel: "Heavy bleed", category: "damage" }
    ]
  },
  coffinNails: {
    id: "coffinNails",
    name: "Coffin Nails",
    maxLevel: 5,
    tierBadge: "Passive",
    stateLabel: "Guard",
    tags: ["armor", "thorns"],
    categories: {
      utility: "survival",
      synergy: "coffinLid",
      skill: "close pressure"
    },
    visual: {
      color: "#857066",
      timerHint: "persistent armor"
    },
    bonuses: [
      { level: 1, armorFlat: 3, badge: "Plate", stateLabel: "More armor", category: "defense" },
      { level: 2, contactThornsDamage: 5, badge: "Thorns", stateLabel: "Contact punish", category: "counter" },
      { level: 3, armorFlat: 4, badge: "Plate", stateLabel: "More armor", category: "defense" },
      { level: 4, knockbackForceMultiplier: 1.1, badge: "Shove", stateLabel: "More pushback", category: "control" },
      { level: 5, contactThornsDamage: 10, badge: "Max", stateLabel: "Heavy thorns", category: "counter" }
    ]
  }
};
