// Game-local content data for the Three Arena undead survival prototype.

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

export const WEAPON_DEFINITIONS = {
  boneSplinter: {
    id: "boneSplinter",
    name: "Bone Splinter",
    fantasy: "Finger-bones snap into the nearest lane when the grave pack crowds you.",
    tags: ["starter", "projectile", "physical", "pierce"],
    unlockTier: 0,
    tierBadge: "Starter",
    stateLabel: "Piercing volley",
    categories: {
      risk: "low",
      utility: "lane clear",
      synergy: "funeralBellClapper",
      skill: "aim nearest lane"
    },
    maxLevel: 8,
    base: {
      damage: 13,
      damageType: "physical",
      cooldown: 0.62,
      projectiles: 2,
      projectileSpeed: 18,
      lifetime: 1.25,
      pierce: 2,
      knockback: 3.4,
      spreadDegrees: 10,
      targetMode: "nearest"
    },
    levels: [
      { level: 2, damage: 3, pierce: 1, badge: "Sharpen", stateLabel: "Harder pierce", category: "damage" },
      { level: 3, projectiles: 1, spreadDegrees: -2, badge: "Split", stateLabel: "Extra dart", category: "coverage" },
      { level: 4, cooldownMultiplier: 0.9, projectileSpeedMultiplier: 1.08, badge: "Quickcast", stateLabel: "Faster shots", category: "tempo" },
      { level: 5, damage: 5, pierce: 1, badge: "Break", stateLabel: "Deeper hits", category: "damage" },
      { level: 6, projectiles: 1, badge: "Volley", stateLabel: "Extra dart", category: "coverage" },
      { level: 7, cooldownMultiplier: 0.88, knockback: 1.2, badge: "Tempo", stateLabel: "Push and pace", category: "control" },
      { level: 8, damage: 9, pierce: 2, badge: "Max", stateLabel: "Heavy pierce", category: "damage" }
    ],
    evolution: {
      requires: "funeralBellClapper",
      resultId: "ossuaryStorm",
      name: "Ossuary Storm",
      tierBadge: "Evolution",
      stateLabel: "Orbiting bone storm",
      categories: { utility: "crowd clear", synergy: "cooldown", skill: "swarm pathing" },
      color: "#d8d0bd",
      timerHint: "brief orbit then launch",
      change: "Darts circle once, then fire out to rake packed lanes."
    },
    visual: {
      mesh: "thin-bone-bolt",
      color: "#d8d0bd",
      impactColor: "#fff0cf",
      soundCue: "dry-crack",
      timerHint: "short cooldown"
    }
  },
  graveLantern: {
    id: "graveLantern",
    name: "Grave Lantern",
    fantasy: "A stolen grave lantern circles your boots and burns anything that crowds the light.",
    tags: ["orbit", "fire", "area", "control"],
    unlockTier: 0,
    tierBadge: "Starter",
    stateLabel: "Orbit aura",
    categories: {
      risk: "medium",
      utility: "close control",
      synergy: "blackGarlic",
      skill: "spacing"
    },
    maxLevel: 8,
    base: {
      damage: 9,
      damageType: "fire",
      cooldown: 0.18,
      orbitals: 2,
      radius: 4.6,
      orbitalSize: 1.1,
      rotationSpeed: 1.65,
      burnDamagePerSecond: 5,
      burnSeconds: 2.4,
      knockback: 1.1
    },
    levels: [
      { level: 2, radius: 0.45, burnDamagePerSecond: 2, badge: "Reach", stateLabel: "Wider burn", category: "area" },
      { level: 3, orbitals: 1, badge: "Orbit", stateLabel: "Extra lantern", category: "coverage" },
      { level: 4, damage: 3, rotationSpeedMultiplier: 1.12, badge: "Spin", stateLabel: "Faster ring", category: "tempo" },
      { level: 5, radius: 0.55, burnSeconds: 0.7, badge: "Flare", stateLabel: "Lasting burn", category: "duration" },
      { level: 6, orbitals: 1, badge: "Orbit", stateLabel: "Extra lantern", category: "coverage" },
      { level: 7, cooldownMultiplier: 0.86, damage: 4, badge: "Heat", stateLabel: "Hotter pulses", category: "damage" },
      { level: 8, orbitalSize: 0.35, burnDamagePerSecond: 4, badge: "Max", stateLabel: "Large flame", category: "area" }
    ],
    evolution: {
      requires: "blackGarlic",
      resultId: "witchfireHalo",
      name: "Witchfire Halo",
      tierBadge: "Evolution",
      stateLabel: "Pulsing fire ring",
      categories: { utility: "close control", synergy: "aura radius", skill: "spacing" },
      color: "#ff9d4a",
      timerHint: "continuous pulse",
      change: "Lanterns collapse into one hot ring around your boots."
    },
    visual: {
      mesh: "iron-lantern",
      color: "#ff9d4a",
      impactColor: "#ffcf6e",
      light: { color: "#ff7a2f", intensity: 1.8, range: 8 },
      timerHint: "continuous orbit"
    }
  },
  silverStake: {
    id: "silverStake",
    name: "Silver Stake",
    fantasy: "Undertaker silver drives through the largest corpse in sight.",
    tags: ["projectile", "silver", "elite-killer", "line"],
    unlockTier: 1,
    tierBadge: "Tier I",
    stateLabel: "Elite piercer",
    categories: {
      risk: "medium",
      utility: "priority burst",
      synergy: "silverRosary",
      skill: "line timing"
    },
    maxLevel: 8,
    base: {
      damage: 34,
      damageType: "silver",
      cooldown: 1.25,
      projectiles: 1,
      projectileSpeed: 24,
      lifetime: 1.05,
      pierce: 5,
      knockback: 8.5,
      targetMode: "highestHealth"
    },
    levels: [
      { level: 2, damage: 8, badge: "Punch", stateLabel: "More impact", category: "damage" },
      { level: 3, pierce: 2, projectileSpeedMultiplier: 1.08, badge: "Skewer", stateLabel: "Faster pierce", category: "tempo" },
      { level: 4, cooldownMultiplier: 0.9, badge: "Reload", stateLabel: "Faster shots", category: "tempo" },
      { level: 5, projectiles: 1, spreadDegrees: 7, badge: "Fork", stateLabel: "Twin line", category: "coverage" },
      { level: 6, damage: 12, knockback: 2, badge: "Impale", stateLabel: "Heavy shove", category: "control" },
      { level: 7, cooldownMultiplier: 0.88, badge: "Reload", stateLabel: "Faster shots", category: "tempo" },
      { level: 8, pierce: 4, eliteDamageMultiplier: 1.2, badge: "Max", stateLabel: "Elite breaker", category: "damage" }
    ],
    evolution: {
      requires: "silverRosary",
      resultId: "sunlessImpaler",
      name: "Sunless Impaler",
      tierBadge: "Evolution",
      stateLabel: "Elite pin burst",
      categories: { utility: "priority control", synergy: "holy damage", skill: "line setup" },
      color: "#cfd7df",
      timerHint: "pin then burst",
      change: "Pinned elites burst into holy splinters for the next pack."
    },
    visual: {
      mesh: "silver-stake",
      color: "#cfd7df",
      trailColor: "#f7fbff",
      soundCue: "stake-thunk",
      timerHint: "slow burst"
    }
  },
  plagueVial: {
    id: "plagueVial",
    name: "Plague Vial",
    fantasy: "Sealed rot glass breaks under the mob and leaves sick ground behind.",
    tags: ["lob", "plague", "pool", "area"],
    unlockTier: 1,
    tierBadge: "Tier I",
    stateLabel: "Plague pools",
    categories: {
      risk: "medium",
      utility: "zone denial",
      synergy: "bloodHourglass",
      skill: "cluster reads"
    },
    maxLevel: 8,
    base: {
      damage: 12,
      damageType: "plague",
      cooldown: 1.45,
      projectiles: 2,
      projectileSpeed: 12,
      arcHeight: 4,
      poolRadius: 2.8,
      poolSeconds: 4.2,
      tickRate: 0.35,
      slowMultiplier: 0.82,
      targetMode: "densestCluster"
    },
    levels: [
      { level: 2, poolRadius: 0.35, poolSeconds: 0.6, badge: "Spread", stateLabel: "Larger pool", category: "area" },
      { level: 3, projectiles: 1, badge: "Toss", stateLabel: "Extra vial", category: "coverage" },
      { level: 4, damage: 4, slowMultiplier: 0.78, badge: "Sicken", stateLabel: "Stronger slow", category: "control" },
      { level: 5, cooldownMultiplier: 0.9, badge: "Mix", stateLabel: "Faster throws", category: "tempo" },
      { level: 6, poolRadius: 0.5, tickRateMultiplier: 0.86, badge: "Bloom", stateLabel: "Quicker ticks", category: "damage" },
      { level: 7, projectiles: 1, badge: "Toss", stateLabel: "Extra vial", category: "coverage" },
      { level: 8, damage: 7, poolSeconds: 1.1, badge: "Max", stateLabel: "Lasting pool", category: "duration" }
    ],
    evolution: {
      requires: "bloodHourglass",
      resultId: "blackMoldBloom",
      name: "Black Mold Bloom",
      tierBadge: "Evolution",
      stateLabel: "Chain blooms",
      categories: { utility: "zone denial", synergy: "effect duration", skill: "cluster timing" },
      color: "#74c96b",
      timerHint: "death-triggered bloom",
      change: "Infected deaths leave another bloom in the dirt."
    },
    visual: {
      mesh: "green-glass-vial",
      color: "#74c96b",
      poolColor: "#436d37",
      soundCue: "glass-splash",
      timerHint: "lingering pool"
    }
  },
  coffinLid: {
    id: "coffinLid",
    name: "Coffin Lid",
    fantasy: "A nailed coffin lid slams out, comes back, and buys room to turn.",
    tags: ["boomerang", "physical", "knockback", "defense"],
    unlockTier: 1,
    tierBadge: "Tier I",
    stateLabel: "Rebound guard",
    categories: {
      risk: "low",
      utility: "breathing room",
      synergy: "coffinNails",
      skill: "movement facing"
    },
    maxLevel: 8,
    base: {
      damage: 22,
      damageType: "physical",
      cooldown: 1.8,
      projectiles: 1,
      projectileSpeed: 13,
      returnSpeed: 18,
      lifetime: 2.2,
      pierce: 999,
      knockback: 12,
      width: 1.8,
      targetMode: "movementDirection"
    },
    levels: [
      { level: 2, damage: 5, knockback: 2, badge: "Slam", stateLabel: "Harder shove", category: "control" },
      { level: 3, cooldownMultiplier: 0.9, badge: "Reset", stateLabel: "Faster throws", category: "tempo" },
      { level: 4, projectiles: 1, spreadDegrees: 18, badge: "Fan", stateLabel: "Twin lids", category: "coverage" },
      { level: 5, width: 0.35, returnSpeedMultiplier: 1.12, badge: "Brace", stateLabel: "Wider return", category: "defense" },
      { level: 6, damage: 8, badge: "Crush", stateLabel: "More impact", category: "damage" },
      { level: 7, cooldownMultiplier: 0.86, badge: "Reset", stateLabel: "Faster throws", category: "tempo" },
      { level: 8, knockback: 5, stunSeconds: 0.2, badge: "Max", stateLabel: "Stopping blow", category: "control" }
    ],
    evolution: {
      requires: "coffinNails",
      resultId: "mausoleumGate",
      name: "Mausoleum Gate",
      tierBadge: "Evolution",
      stateLabel: "Returning wall",
      categories: { utility: "defense", synergy: "armor", skill: "retreat lanes" },
      color: "#6b4a35",
      timerHint: "return wall window",
      change: "Returning lids brace into a short wall that shoves dead aside."
    },
    visual: {
      mesh: "splintered-coffin-lid",
      color: "#6b4a35",
      impactColor: "#d2b08d",
      soundCue: "wood-slam",
      timerHint: "return window"
    }
  },
  batSwarm: {
    id: "batSwarm",
    name: "Bat Swarm",
    fantasy: "Blood bats smell the weakest dead and spread the cut.",
    tags: ["summon", "bleed", "homing", "finisher"],
    unlockTier: 2,
    tierBadge: "Tier II",
    stateLabel: "Homing finisher",
    categories: {
      risk: "low",
      utility: "cleanup",
      synergy: "graveBoots",
      skill: "wounded target flow"
    },
    maxLevel: 8,
    base: {
      damage: 9.6,
      damageType: "bleed",
      cooldown: 1.1,
      summons: 7,
      summonSpeed: 15,
      biteCooldown: 0.55,
      summonSeconds: 4.5,
      bleedDamagePerSecond: 4,
      bleedSeconds: 3.5,
      targetMode: "lowestHealth"
    },
    levels: [
      { level: 2, summons: 1, badge: "Flock", stateLabel: "Extra bat", category: "coverage" },
      { level: 3, damage: 3, bleedDamagePerSecond: 2, badge: "Fang", stateLabel: "Deeper bleed", category: "damage" },
      { level: 4, summonSeconds: 0.8, badge: "Roost", stateLabel: "Longer hunt", category: "duration" },
      { level: 5, cooldownMultiplier: 0.9, badge: "Stir", stateLabel: "Faster calls", category: "tempo" },
      { level: 6, summons: 1, badge: "Flock", stateLabel: "Extra bat", category: "coverage" },
      { level: 7, biteCooldownMultiplier: 0.82, badge: "Frenzy", stateLabel: "Quicker bites", category: "tempo" },
      { level: 8, bleedSeconds: 1.2, damage: 5, badge: "Max", stateLabel: "Long bleed", category: "damage" }
    ],
    evolution: {
      requires: "graveBoots",
      resultId: "bloodMoonFlock",
      name: "Blood Moon Flock",
      tierBadge: "Evolution",
      stateLabel: "Bleeding dash trails",
      categories: { utility: "cleanup lines", synergy: "mobility", skill: "kite routing" },
      color: "#a8324a",
      timerHint: "summon trail duration",
      change: "Bats leave red dash trails that open a lane through the swarm."
    },
    visual: {
      mesh: "bat-silhouette",
      color: "#36243d",
      trailColor: "#a8324a",
      soundCue: "wing-flutter",
      timerHint: "temporary summons"
    }
  },
  funeralBell: {
    id: "funeralBell",
    name: "Funeral Bell",
    fantasy: "A hand bell tolls from your belt and makes close dead stumble.",
    tags: ["pulse", "holy", "stagger", "area"],
    unlockTier: 2,
    tierBadge: "Tier II",
    stateLabel: "Stagger pulse",
    categories: {
      risk: "medium",
      utility: "panic control",
      synergy: "silverRosary",
      skill: "timed spacing"
    },
    maxLevel: 8,
    base: {
      damage: 18,
      damageType: "holy",
      cooldown: 2.4,
      radius: 8,
      waveSpeed: 18,
      staggerSeconds: 0.45,
      knockback: 5,
      pulseCount: 1
    },
    levels: [
      { level: 2, radius: 0.8, badge: "Toll", stateLabel: "Wider pulse", category: "area" },
      { level: 3, damage: 6, badge: "Peal", stateLabel: "More force", category: "damage" },
      { level: 4, cooldownMultiplier: 0.9, badge: "Rhythm", stateLabel: "Faster toll", category: "tempo" },
      { level: 5, pulseCount: 1, pulseDelaySeconds: 0.28, badge: "Echo", stateLabel: "Second pulse", category: "coverage" },
      { level: 6, staggerSeconds: 0.18, badge: "Stagger", stateLabel: "Longer flinch", category: "control" },
      { level: 7, radius: 1, damage: 8, badge: "Resound", stateLabel: "Wide impact", category: "area" },
      { level: 8, cooldownMultiplier: 0.84, badge: "Max", stateLabel: "Fast toll", category: "tempo" }
    ],
    evolution: {
      requires: "silverRosary",
      resultId: "cathedralKnell",
      name: "Cathedral Knell",
      tierBadge: "Evolution",
      stateLabel: "Holy mark",
      categories: { utility: "burst setup", synergy: "silver and holy", skill: "mark timing" },
      color: "#f5e4a4",
      timerHint: "mark until next hit",
      change: "Each toll marks the dead for the next silver or holy strike."
    },
    visual: {
      mesh: "shockwave-ring",
      color: "#f5e4a4",
      impactColor: "#fff8d2",
      soundCue: "bell-low",
      timerHint: "wide cooldown"
    }
  },
  reaperScythe: {
    id: "reaperScythe",
    name: "Reaper Scythe",
    fantasy: "A graveyard scythe cuts the flank first and finishes the weak.",
    tags: ["melee", "shadow", "cleave", "execute"],
    unlockTier: 3,
    tierBadge: "Tier III",
    stateLabel: "Execution arc",
    categories: {
      risk: "high",
      utility: "flank clear",
      synergy: "bloodHourglass",
      skill: "close arc timing"
    },
    maxLevel: 8,
    base: {
      damage: 28,
      damageType: "shadow",
      cooldown: 1.65,
      arcs: 2,
      arcDegrees: 105,
      radius: 5.8,
      executeHealthRatio: 0.08,
      knockback: 6,
      targetMode: "sidePressure"
    },
    levels: [
      { level: 2, damage: 7, badge: "Reap", stateLabel: "Sharper cut", category: "damage" },
      { level: 3, radius: 0.6, badge: "Reach", stateLabel: "Longer arc", category: "area" },
      { level: 4, cooldownMultiplier: 0.9, badge: "Tempo", stateLabel: "Faster swing", category: "tempo" },
      { level: 5, arcs: 1, badge: "Cleave", stateLabel: "Extra arc", category: "coverage" },
      { level: 6, executeHealthRatio: 0.04, badge: "Execute", stateLabel: "Higher finish", category: "damage" },
      { level: 7, damage: 11, knockback: 2, badge: "Harvest", stateLabel: "Heavy shove", category: "control" },
      { level: 8, cooldownMultiplier: 0.84, arcDegrees: 20, badge: "Max", stateLabel: "Wide reap", category: "area" }
    ],
    evolution: {
      requires: "bloodHourglass",
      resultId: "midnightHarvest",
      name: "Midnight Harvest",
      tierBadge: "Evolution",
      stateLabel: "Execution blades",
      categories: { utility: "chain clear", synergy: "duration", skill: "low-health routing" },
      color: "#5c4c91",
      timerHint: "short-lived blades",
      change: "Executed enemies loose short-lived shadow blades."
    },
    visual: {
      mesh: "shadow-scythe-arc",
      color: "#5c4c91",
      impactColor: "#bda9ff",
      soundCue: "scythe-whoosh",
      timerHint: "melee sweep"
    }
  }
};

export const ENEMY_ARCHETYPES = {
  shambler: {
    id: "shambler",
    name: "Grave Shambler",
    tier: "fodder",
    tags: ["zombie", "melee", "horde"],
    unlockSecond: 0,
    health: 18,
    speed: 2.35,
    radius: 0.55,
    height: 1.7,
    contactDamage: 9,
    xp: 2,
    coinValue: 1,
    weight: 100,
    behavior: {
      style: "direct-chase",
      separation: 0.8,
      turnRate: 5.5,
      retargetSeconds: 0.6
    },
    readableCue: "Slow upright silhouette with dragging arms.",
    visual: {
      mesh: "zombie-shambler",
      tint: "#7d8a5d",
      scale: 1,
      deathFx: "green-dust"
    }
  },
  crawler: {
    id: "crawler",
    name: "Crypt Crawler",
    tier: "fodder",
    tags: ["zombie", "low-profile", "flanker"],
    unlockSecond: 45,
    health: 14,
    speed: 3.45,
    radius: 0.5,
    height: 0.65,
    contactDamage: 8,
    xp: 2,
    coinValue: 1,
    weight: 62,
    behavior: {
      style: "flank-chase",
      flankDistance: 7,
      lungeRange: 3.2,
      lungeCooldown: 3.8,
      lungeSpeedMultiplier: 1.75
    },
    readableCue: "Low crawling body; brighter spine before lunge.",
    visual: {
      mesh: "zombie-crawler",
      tint: "#6d7350",
      scale: 0.85,
      deathFx: "bone-chip"
    }
  },
  ghoulRunner: {
    id: "ghoulRunner",
    name: "Ghoul Runner",
    tier: "fodder",
    tags: ["ghoul", "fast", "pressure"],
    unlockSecond: 95,
    health: 24,
    speed: 4.55,
    radius: 0.52,
    height: 1.45,
    contactDamage: 12,
    xp: 3,
    coinValue: 1,
    weight: 52,
    behavior: {
      style: "burst-chase",
      burstEverySeconds: 4.4,
      burstSeconds: 1.1,
      burstSpeedMultiplier: 1.45,
      recoverySpeedMultiplier: 0.7
    },
    readableCue: "Hunched runner with red shoulder flash before burst.",
    visual: {
      mesh: "ghoul-runner",
      tint: "#9a6c62",
      scale: 0.92,
      deathFx: "red-spark"
    }
  },
  plagueBloat: {
    id: "plagueBloat",
    name: "Plague Bloat",
    tier: "bruiser",
    tags: ["zombie", "exploder", "plague"],
    unlockSecond: 150,
    health: 72,
    speed: 1.85,
    radius: 0.9,
    height: 1.95,
    contactDamage: 15,
    xp: 8,
    coinValue: 3,
    weight: 28,
    armor: 2,
    behavior: {
      style: "slow-chase-explode",
      explodeAtHealthRatio: 0.18,
      explodeRadius: 4.2,
      explodeDamage: 24,
      telegraphSeconds: 1.15,
      leavesPoolSeconds: 5
    },
    readableCue: "Wide green belly inflates before burst.",
    visual: {
      mesh: "plague-bloat",
      tint: "#8fad4e",
      scale: 1.15,
      deathFx: "plague-pop"
    }
  },
  boneArcher: {
    id: "boneArcher",
    name: "Bone Archer",
    tier: "ranged",
    tags: ["skeleton", "ranged", "line-telegraph"],
    unlockSecond: 210,
    health: 42,
    speed: 2.1,
    radius: 0.52,
    height: 1.65,
    contactDamage: 10,
    xp: 7,
    coinValue: 2,
    weight: 24,
    behavior: {
      style: "kite-and-shoot",
      preferredRange: 14,
      aimSeconds: 1.05,
      arrowDamage: 18,
      arrowSpeed: 16,
      shotCooldown: 4.2
    },
    readableCue: "Thin skeleton plants feet and draws a pale line.",
    visual: {
      mesh: "bone-archer",
      tint: "#c9c4ad",
      scale: 0.98,
      deathFx: "bone-collapse"
    }
  },
  graveMaw: {
    id: "graveMaw",
    name: "Grave Maw",
    tier: "trap",
    tags: ["ambush", "zone-denial", "melee"],
    unlockSecond: 255,
    health: 54,
    speed: 0,
    radius: 1.1,
    height: 0.55,
    contactDamage: 22,
    xp: 6,
    coinValue: 2,
    weight: 18,
    behavior: {
      style: "burrow-trap",
      hiddenSeconds: 2.2,
      warningRadius: 2.1,
      biteRadius: 2.8,
      biteDamage: 22,
      activeSeconds: 7,
      despawnIfFartherThan: 30
    },
    readableCue: "Cracked grave circle opens before teeth rise.",
    visual: {
      mesh: "grave-maw",
      tint: "#5b463d",
      scale: 1,
      deathFx: "dirt-burst"
    }
  },
  revenantGuard: {
    id: "revenantGuard",
    name: "Revenant Guard",
    tier: "bruiser",
    tags: ["armored", "shield", "melee"],
    unlockSecond: 330,
    health: 115,
    speed: 2.25,
    radius: 0.72,
    height: 1.9,
    contactDamage: 16,
    xp: 13,
    coinValue: 4,
    weight: 20,
    armor: 9,
    behavior: {
      style: "shielded-advance",
      frontDamageReduction: 0.55,
      shieldBreakDamage: 80,
      shieldBreakStunSeconds: 1.1,
      turnRate: 2.8
    },
    readableCue: "Tall shield silhouette; attack from side or burn down shield.",
    visual: {
      mesh: "revenant-guard",
      tint: "#59606a",
      scale: 1.1,
      deathFx: "blue-ash"
    }
  },
  witchAcolyte: {
    id: "witchAcolyte",
    name: "Witch Acolyte",
    tier: "ranged",
    tags: ["caster", "curse", "area-denial"],
    unlockSecond: 390,
    health: 64,
    speed: 2.6,
    radius: 0.55,
    height: 1.7,
    contactDamage: 11,
    xp: 12,
    coinValue: 4,
    weight: 18,
    behavior: {
      style: "cast-and-reposition",
      preferredRange: 16,
      castSeconds: 1.25,
      curseRadius: 3.6,
      curseDamagePerSecond: 11,
      curseSeconds: 4.5,
      castCooldown: 5.5
    },
    readableCue: "Purple hands lift; target circle fills before curse lands.",
    visual: {
      mesh: "witch-acolyte",
      tint: "#7d5da3",
      scale: 1,
      deathFx: "purple-smoke"
    }
  },
  corpseHound: {
    id: "corpseHound",
    name: "Corpse Hound",
    tier: "special",
    tags: ["beast", "fast", "pack"],
    unlockSecond: 465,
    health: 52,
    speed: 5.15,
    radius: 0.48,
    height: 0.9,
    contactDamage: 14,
    xp: 6,
    coinValue: 2,
    weight: 34,
    behavior: {
      style: "pack-pincer",
      packSizePreference: 5,
      circleRadius: 9,
      pounceRange: 5,
      pounceCooldown: 5,
      pounceSpeedMultiplier: 1.9
    },
    readableCue: "Small fast pack with bright eyes and crouch before pounce.",
    visual: {
      mesh: "corpse-hound",
      tint: "#6e5147",
      scale: 0.85,
      deathFx: "red-dust"
    }
  },
  necroBrute: {
    id: "necroBrute",
    name: "Necro Brute",
    tier: "elite",
    tags: ["elite", "slam", "bruiser"],
    unlockSecond: 540,
    health: 360,
    speed: 1.9,
    radius: 1.15,
    height: 2.45,
    contactDamage: 24,
    xp: 36,
    coinValue: 12,
    weight: 8,
    armor: 7,
    behavior: {
      style: "telegraphed-slam",
      slamRange: 5.6,
      slamRadius: 4.8,
      slamDamage: 34,
      windupSeconds: 1.35,
      cooldownSeconds: 6.5,
      shockwaveCount: 3
    },
    readableCue: "Huge raised club; expanding rings show slam reach.",
    visual: {
      mesh: "necro-brute",
      tint: "#5d635d",
      scale: 1.35,
      deathFx: "heavy-soul-burst"
    }
  },
  vampireKnight: {
    id: "vampireKnight",
    name: "Vampire Knight",
    tier: "elite",
    tags: ["elite", "dash", "bleed", "vampire"],
    unlockSecond: 660,
    health: 300,
    speed: 3.2,
    radius: 0.72,
    height: 1.9,
    contactDamage: 20,
    xp: 34,
    coinValue: 12,
    weight: 7,
    armor: 5,
    behavior: {
      style: "dash-striker",
      dashRange: 12,
      dashWidth: 2.4,
      dashDamage: 30,
      windupSeconds: 0.9,
      recoverySeconds: 0.75,
      cooldownSeconds: 5.8,
      lifeStealRatio: 0.12
    },
    readableCue: "Red cape locks into a straight path before dash.",
    visual: {
      mesh: "vampire-knight",
      tint: "#8d2435",
      scale: 1.08,
      deathFx: "blood-mist"
    }
  },
  tombLich: {
    id: "tombLich",
    name: "Tomb Lich",
    tier: "boss",
    tags: ["boss", "summoner", "caster"],
    unlockSecond: 900,
    health: 1800,
    speed: 1.65,
    radius: 1,
    height: 2.25,
    contactDamage: 28,
    xp: 180,
    coinValue: 50,
    weight: 1,
    armor: 6,
    behavior: {
      style: "phase-summoner",
      phases: [
        { healthRatio: 1, summonIds: ["shambler", "crawler"], castCooldown: 7 },
        { healthRatio: 0.66, summonIds: ["ghoulRunner", "boneArcher"], castCooldown: 5.8 },
        { healthRatio: 0.33, summonIds: ["vampireKnight", "witchAcolyte"], castCooldown: 4.8 }
      ],
      bonePrisonRadius: 7,
      bonePrisonWarningSeconds: 1.4,
      novaDamage: 38,
      novaWarningSeconds: 1.8
    },
    readableCue: "Floating crowned skeleton; floor runes preview each spell.",
    visual: {
      mesh: "tomb-lich",
      tint: "#8fb4cf",
      scale: 1.25,
      deathFx: "blue-soul-column"
    }
  }
};

export const WAVE_PACING = [
  {
    id: "graveyard-wake",
    label: "Graveyard Wake",
    startSecond: 0,
    durationSeconds: 90,
    spawnIntervalSeconds: 1.35,
    spawnBudgetPerMinute: 48,
    spawnCap: 44,
    eliteId: null,
    squads: [
      { enemyId: "shambler", weight: 100, packMin: 3, packMax: 7 }
    ],
    pickups: ["xpSmall", "bloodDrop"],
    hazards: [],
    note: "Teach kiting, pickups, and contact danger with slow bodies only."
  },
  {
    id: "crawl-from-crypts",
    label: "Crawl From Crypts",
    startSecond: 90,
    durationSeconds: 90,
    spawnIntervalSeconds: 1.12,
    spawnBudgetPerMinute: 68,
    spawnCap: 58,
    eliteId: null,
    squads: [
      { enemyId: "shambler", weight: 72, packMin: 4, packMax: 9 },
      { enemyId: "crawler", weight: 28, packMin: 2, packMax: 5 }
    ],
    pickups: ["xpSmall", "xpMedium", "bloodDrop"],
    hazards: ["boneSpikes"],
    note: "First low-profile flankers; keep spike hazards sparse."
  },
  {
    id: "ghoul-sprint",
    label: "Ghoul Sprint",
    startSecond: 180,
    durationSeconds: 90,
    spawnIntervalSeconds: 0.95,
    spawnBudgetPerMinute: 88,
    spawnCap: 74,
    eliteId: "plagueBloat",
    squads: [
      { enemyId: "shambler", weight: 52, packMin: 6, packMax: 12 },
      { enemyId: "crawler", weight: 18, packMin: 3, packMax: 6 },
      { enemyId: "ghoulRunner", weight: 30, packMin: 2, packMax: 5 }
    ],
    pickups: ["xpSmall", "xpMedium", "foodHeart"],
    hazards: ["boneSpikes"],
    note: "Runners break simple circles; first elite bloat teaches death zones."
  },
  {
    id: "rotting-barrage",
    label: "Rotting Barrage",
    startSecond: 270,
    durationSeconds: 90,
    spawnIntervalSeconds: 0.82,
    spawnBudgetPerMinute: 106,
    spawnCap: 90,
    eliteId: "boneArcher",
    squads: [
      { enemyId: "shambler", weight: 48, packMin: 8, packMax: 14 },
      { enemyId: "ghoulRunner", weight: 22, packMin: 3, packMax: 7 },
      { enemyId: "plagueBloat", weight: 15, packMin: 1, packMax: 3 },
      { enemyId: "boneArcher", weight: 15, packMin: 1, packMax: 2 }
    ],
    pickups: ["xpSmall", "xpMedium", "magnetBone"],
    hazards: ["boneSpikes", "graveGas"],
    note: "Line shooters make future path reads matter."
  },
  {
    id: "open-graves",
    label: "Open Graves",
    startSecond: 360,
    durationSeconds: 90,
    spawnIntervalSeconds: 0.74,
    spawnBudgetPerMinute: 124,
    spawnCap: 108,
    eliteId: "revenantGuard",
    squads: [
      { enemyId: "shambler", weight: 34, packMin: 10, packMax: 16 },
      { enemyId: "crawler", weight: 18, packMin: 4, packMax: 8 },
      { enemyId: "boneArcher", weight: 16, packMin: 1, packMax: 3 },
      { enemyId: "graveMaw", weight: 14, packMin: 1, packMax: 2 },
      { enemyId: "revenantGuard", weight: 18, packMin: 1, packMax: 2 }
    ],
    pickups: ["xpMedium", "foodHeart", "holyWater"],
    hazards: ["graveGas", "openGrave"],
    note: "Stationary ambushes ask player to scan floor without cluttering HUD."
  },
  {
    id: "witching-hour",
    label: "Witching Hour",
    startSecond: 450,
    durationSeconds: 90,
    spawnIntervalSeconds: 0.66,
    spawnBudgetPerMinute: 142,
    spawnCap: 126,
    eliteId: "witchAcolyte",
    squads: [
      { enemyId: "shambler", weight: 25, packMin: 12, packMax: 18 },
      { enemyId: "ghoulRunner", weight: 22, packMin: 4, packMax: 8 },
      { enemyId: "corpseHound", weight: 22, packMin: 4, packMax: 7 },
      { enemyId: "witchAcolyte", weight: 16, packMin: 1, packMax: 3 },
      { enemyId: "plagueBloat", weight: 15, packMin: 1, packMax: 3 }
    ],
    pickups: ["xpMedium", "xpLarge", "rosaryBurst"],
    hazards: ["graveGas", "bloodGeyser"],
    note: "Pack pressure plus caster circles; avoid stacking archers here."
  },
  {
    id: "bone-tide",
    label: "Bone Tide",
    startSecond: 540,
    durationSeconds: 120,
    spawnIntervalSeconds: 0.58,
    spawnBudgetPerMinute: 168,
    spawnCap: 144,
    eliteId: "necroBrute",
    squads: [
      { enemyId: "shambler", weight: 26, packMin: 14, packMax: 22 },
      { enemyId: "crawler", weight: 12, packMin: 5, packMax: 9 },
      { enemyId: "boneArcher", weight: 18, packMin: 2, packMax: 4 },
      { enemyId: "revenantGuard", weight: 18, packMin: 1, packMax: 3 },
      { enemyId: "necroBrute", weight: 8, packMin: 1, packMax: 1 },
      { enemyId: "corpseHound", weight: 18, packMin: 5, packMax: 9 }
    ],
    pickups: ["xpMedium", "xpLarge", "clockStop", "foodHeart"],
    hazards: ["boneSpikes", "openGrave", "fallingCryptStone"],
    note: "First heavy slam elite; spawn fewer hazard types than prior wave."
  },
  {
    id: "blood-moon",
    label: "Blood Moon",
    startSecond: 660,
    durationSeconds: 120,
    spawnIntervalSeconds: 0.52,
    spawnBudgetPerMinute: 190,
    spawnCap: 156,
    eliteId: "vampireKnight",
    squads: [
      { enemyId: "ghoulRunner", weight: 20, packMin: 5, packMax: 10 },
      { enemyId: "corpseHound", weight: 22, packMin: 6, packMax: 10 },
      { enemyId: "vampireKnight", weight: 8, packMin: 1, packMax: 1 },
      { enemyId: "witchAcolyte", weight: 18, packMin: 2, packMax: 4 },
      { enemyId: "plagueBloat", weight: 14, packMin: 2, packMax: 4 },
      { enemyId: "revenantGuard", weight: 18, packMin: 2, packMax: 4 }
    ],
    pickups: ["xpLarge", "magnetBone", "bloodDrop", "weaponChest"],
    hazards: ["bloodGeyser", "graveGas"],
    note: "Dash lanes and pounce packs; keep floor circles big and slow."
  },
  {
    id: "catacomb-collapse",
    label: "Catacomb Collapse",
    startSecond: 780,
    durationSeconds: 120,
    spawnIntervalSeconds: 0.48,
    spawnBudgetPerMinute: 215,
    spawnCap: 164,
    eliteId: "necroBrute",
    squads: [
      { enemyId: "shambler", weight: 18, packMin: 18, packMax: 26 },
      { enemyId: "boneArcher", weight: 18, packMin: 2, packMax: 5 },
      { enemyId: "graveMaw", weight: 14, packMin: 2, packMax: 4 },
      { enemyId: "witchAcolyte", weight: 16, packMin: 2, packMax: 5 },
      { enemyId: "necroBrute", weight: 10, packMin: 1, packMax: 2 },
      { enemyId: "vampireKnight", weight: 6, packMin: 1, packMax: 1 },
      { enemyId: "corpseHound", weight: 18, packMin: 6, packMax: 11 }
    ],
    pickups: ["xpLarge", "clockStop", "rosaryBurst", "foodHeart"],
    hazards: ["fallingCryptStone", "openGrave"],
    note: "Late mixed read. Collapse hazards replace gas to avoid visual soup."
  },
  {
    id: "lich-procession",
    label: "Lich Procession",
    startSecond: 900,
    durationSeconds: 180,
    spawnIntervalSeconds: 0.44,
    spawnBudgetPerMinute: 235,
    spawnCap: 170,
    eliteId: "tombLich",
    bossAtSecond: 960,
    squads: [
      { enemyId: "shambler", weight: 15, packMin: 18, packMax: 28 },
      { enemyId: "ghoulRunner", weight: 14, packMin: 6, packMax: 12 },
      { enemyId: "corpseHound", weight: 14, packMin: 7, packMax: 12 },
      { enemyId: "boneArcher", weight: 14, packMin: 3, packMax: 5 },
      { enemyId: "witchAcolyte", weight: 14, packMin: 2, packMax: 5 },
      { enemyId: "revenantGuard", weight: 12, packMin: 2, packMax: 4 },
      { enemyId: "vampireKnight", weight: 5, packMin: 1, packMax: 2 },
      { enemyId: "necroBrute", weight: 4, packMin: 1, packMax: 2 },
      { enemyId: "tombLich", weight: 1, packMin: 1, packMax: 1 }
    ],
    pickups: ["xpLarge", "magnetBone", "weaponChest", "soulVessel"],
    hazards: ["boneSpikes", "bloodGeyser", "fallingCryptStone"],
    note: "Final boss over horde. Hazards become punctuation, not constant carpet."
  }
];

export const ARENA_OBJECTIVES = [
  "Kite the first grave hands. Grab blue shards before they sink.",
  "Crawlers left the crypt rows. Keep your back out of the grass.",
  "Runners are cutting circles. Break one lane and leave through it.",
  "Archers have the far stones. Watch pale lines before you cross.",
  "Open graves are biting at your route. Step wide of fresh dirt.",
  "Acolytes are painting curse circles. Move before the purple fill closes.",
  "The brute is raising a club. Leave the ring before it lands.",
  "Blood moon hunters dash straight. Cross their lane after the cape locks.",
  "The crypt roof is coming down. Read shadows before loot.",
  "The lich procession is inside the fence. Keep one escape lane open."
];

export const PICKUP_DEFINITIONS = {
  xpSmall: {
    id: "xpSmall",
    name: "Dim Soul Shard",
    tags: ["xp"],
    rarity: "common",
    value: 2,
    lifetimeSeconds: 60,
    magnetizedSpeed: 17,
    radius: 0.35,
    color: "#78b7ff",
    mesh: "small-soul-shard"
  },
  xpMedium: {
    id: "xpMedium",
    name: "Bright Soul Shard",
    tags: ["xp"],
    rarity: "common",
    value: 8,
    lifetimeSeconds: 70,
    magnetizedSpeed: 18,
    radius: 0.42,
    color: "#9fe8ff",
    mesh: "medium-soul-shard"
  },
  xpLarge: {
    id: "xpLarge",
    name: "Greater Soul Shard",
    tags: ["xp"],
    rarity: "uncommon",
    value: 28,
    lifetimeSeconds: 80,
    magnetizedSpeed: 19,
    radius: 0.55,
    color: "#d8f8ff",
    mesh: "large-soul-shard"
  },
  bloodDrop: {
    id: "bloodDrop",
    name: "Blood Drop",
    tags: ["heal"],
    rarity: "common",
    heal: 8,
    lifetimeSeconds: 34,
    magnetizedSpeed: 14,
    radius: 0.4,
    color: "#b92b3b",
    mesh: "blood-drop"
  },
  foodHeart: {
    id: "foodHeart",
    name: "Still Heart",
    tags: ["heal"],
    rarity: "uncommon",
    heal: 32,
    lifetimeSeconds: 26,
    magnetizedSpeed: 13,
    radius: 0.58,
    color: "#e05364",
    mesh: "heart-pickup"
  },
  magnetBone: {
    id: "magnetBone",
    name: "Magnet Bone",
    tags: ["magnet", "utility"],
    rarity: "uncommon",
    effectSeconds: 5,
    pickupRadiusMultiplier: 6,
    lifetimeSeconds: 24,
    radius: 0.52,
    color: "#e3dcc5",
    mesh: "horseshoe-bone"
  },
  clockStop: {
    id: "clockStop",
    name: "Dead Clock",
    tags: ["crowd-control", "panic"],
    rarity: "rare",
    freezeSeconds: 3.2,
    bossFreezeSeconds: 0.8,
    lifetimeSeconds: 18,
    radius: 0.55,
    color: "#c9d6ff",
    mesh: "broken-clock"
  },
  rosaryBurst: {
    id: "rosaryBurst",
    name: "Rosary Burst",
    tags: ["screen-clear", "holy", "panic"],
    rarity: "rare",
    damage: 180,
    damageType: "holy",
    effectRadius: 34,
    eliteDamageMultiplier: 0.45,
    lifetimeSeconds: 16,
    radius: 0.62,
    color: "#fff2b5",
    mesh: "silver-rosary"
  },
  holyWater: {
    id: "holyWater",
    name: "Holy Water Flask",
    tags: ["temporary-weapon", "area"],
    rarity: "uncommon",
    throws: 5,
    damage: 35,
    damageType: "holy",
    poolRadius: 3,
    poolSeconds: 3.5,
    lifetimeSeconds: 22,
    radius: 0.5,
    color: "#d9f9ff",
    mesh: "holy-water-flask"
  },
  weaponChest: {
    id: "weaponChest",
    name: "Cursed Stat Chest",
    tags: ["reward", "upgrade"],
    rarity: "rare",
    upgradeCount: 1,
    bonusGoldMin: 18,
    bonusGoldMax: 45,
    lifetimeSeconds: 120,
    radius: 0.85,
    color: "#a8783c",
    mesh: "cursed-chest"
  },
  soulVessel: {
    id: "soulVessel",
    name: "Soul Vessel",
    tags: ["finale", "reward"],
    rarity: "boss",
    levelUps: 2,
    healRatio: 0.5,
    lifetimeSeconds: 120,
    radius: 0.9,
    color: "#86d9ff",
    mesh: "soul-vessel"
  }
};

export const HAZARD_DEFINITIONS = {
  boneSpikes: {
    id: "boneSpikes",
    name: "Bone Spikes",
    tags: ["floor", "delayed", "physical"],
    unlockSecond: 90,
    maxActive: 7,
    spawnWeight: 34,
    warningSeconds: 1.1,
    activeSeconds: 3.4,
    cooldownSeconds: 7,
    radius: 2.2,
    damage: 18,
    damageType: "physical",
    knockback: 8,
    readableCue: "White cracks radiate outward before spikes rise.",
    visual: {
      decal: "bone-crack-ring",
      mesh: "bone-spike-cluster",
      color: "#d7ceb5"
    }
  },
  graveGas: {
    id: "graveGas",
    name: "Grave Gas",
    tags: ["floor", "damage-over-time", "plague"],
    unlockSecond: 240,
    maxActive: 5,
    spawnWeight: 24,
    warningSeconds: 0.8,
    activeSeconds: 7,
    cooldownSeconds: 10,
    radius: 4.8,
    damagePerSecond: 9,
    damageType: "plague",
    slowMultiplier: 0.82,
    readableCue: "Low green mist grows from cracked soil.",
    visual: {
      decal: "green-stain",
      mesh: "gas-volume",
      color: "#6c9d56"
    }
  },
  openGrave: {
    id: "openGrave",
    name: "Open Grave",
    tags: ["floor", "snare", "trap"],
    unlockSecond: 360,
    maxActive: 5,
    spawnWeight: 22,
    warningSeconds: 1.35,
    activeSeconds: 6,
    cooldownSeconds: 11,
    radius: 2.4,
    damage: 12,
    damageType: "physical",
    snareSeconds: 1.2,
    readableCue: "Rectangle of sinking dirt, then a dark hole.",
    visual: {
      decal: "grave-rectangle",
      mesh: "open-grave-hole",
      color: "#3c3029"
    }
  },
  bloodGeyser: {
    id: "bloodGeyser",
    name: "Blood Geyser",
    tags: ["line", "burst", "bleed"],
    unlockSecond: 450,
    maxActive: 4,
    spawnWeight: 18,
    warningSeconds: 1.45,
    activeSeconds: 1.25,
    cooldownSeconds: 12,
    lineLength: 13,
    lineWidth: 2.2,
    damage: 28,
    damageType: "bleed",
    bleedDamagePerSecond: 6,
    bleedSeconds: 3,
    readableCue: "Red seam draws full future eruption line.",
    visual: {
      decal: "blood-line",
      mesh: "geyser-column-row",
      color: "#9f2635"
    }
  },
  fallingCryptStone: {
    id: "fallingCryptStone",
    name: "Falling Crypt Stone",
    tags: ["impact", "delayed", "physical"],
    unlockSecond: 540,
    maxActive: 3,
    spawnWeight: 14,
    warningSeconds: 1.65,
    activeSeconds: 0.8,
    cooldownSeconds: 13,
    radius: 3,
    damage: 36,
    damageType: "physical",
    stunSeconds: 0.35,
    leavesPropId: "brokenCryptStone",
    readableCue: "Dust cone and shadow circle mark exact impact.",
    visual: {
      decal: "fall-shadow",
      mesh: "crypt-stone",
      color: "#77746b"
    }
  }
};

export const MAP_PROP_DESCRIPTORS = {
  tombstone: {
    id: "tombstone",
    name: "Tilted Tombstone",
    category: "graveyard",
    blocking: true,
    destructible: true,
    health: 42,
    radius: 0.75,
    height: 1.25,
    density: 0.9,
    lootTable: [
      { pickupId: "xpSmall", chance: 0.18 },
      { pickupId: "bloodDrop", chance: 0.04 }
    ],
    placement: {
      minFromPlayerStart: 10,
      clusterSizeMin: 2,
      clusterSizeMax: 5,
      alignToRows: true
    },
    visual: {
      mesh: "tilted-tombstone",
      tintOptions: ["#7c7c73", "#696b65", "#8b897d"]
    }
  },
  mausoleumWall: {
    id: "mausoleumWall",
    name: "Mausoleum Wall",
    category: "crypt",
    blocking: true,
    destructible: false,
    radius: 1.25,
    height: 2.4,
    density: 0.34,
    placement: {
      minFromPlayerStart: 15,
      clusterSizeMin: 2,
      clusterSizeMax: 4,
      formsShortBarriers: true
    },
    visual: {
      mesh: "mausoleum-wall-segment",
      tintOptions: ["#686963", "#5b5b56"]
    }
  },
  deadTree: {
    id: "deadTree",
    name: "Dead Tree",
    category: "graveyard",
    blocking: true,
    destructible: true,
    health: 85,
    radius: 1.05,
    height: 4.8,
    density: 0.28,
    lootTable: [
      { pickupId: "xpMedium", chance: 0.08 },
      { pickupId: "magnetBone", chance: 0.015 }
    ],
    placement: {
      minFromPlayerStart: 16,
      clusterSizeMin: 1,
      clusterSizeMax: 3,
      avoidCenterLanes: true
    },
    visual: {
      mesh: "dead-tree",
      tintOptions: ["#3e322c", "#4c3b32"]
    }
  },
  bonePile: {
    id: "bonePile",
    name: "Bone Pile",
    category: "graveyard",
    blocking: false,
    destructible: true,
    health: 24,
    radius: 0.85,
    height: 0.45,
    density: 0.65,
    lootTable: [
      { pickupId: "xpSmall", chance: 0.24 },
      { pickupId: "holyWater", chance: 0.02 }
    ],
    placement: {
      minFromPlayerStart: 8,
      clusterSizeMin: 2,
      clusterSizeMax: 6,
      canFillEdges: true
    },
    visual: {
      mesh: "bone-pile",
      tintOptions: ["#d0c7ae", "#b9b096"]
    }
  },
  ironFence: {
    id: "ironFence",
    name: "Iron Fence",
    category: "graveyard",
    blocking: true,
    destructible: true,
    health: 58,
    radius: 0.45,
    height: 1.65,
    density: 0.45,
    placement: {
      minFromPlayerStart: 14,
      clusterSizeMin: 3,
      clusterSizeMax: 7,
      formsShortBarriers: true
    },
    visual: {
      mesh: "iron-fence-segment",
      tintOptions: ["#24272a", "#313438"]
    }
  },
  cryptLantern: {
    id: "cryptLantern",
    name: "Crypt Lantern",
    category: "crypt",
    blocking: false,
    destructible: true,
    health: 18,
    radius: 0.38,
    height: 1.6,
    density: 0.38,
    lootTable: [
      { pickupId: "bloodDrop", chance: 0.1 },
      { pickupId: "rosaryBurst", chance: 0.01 }
    ],
    placement: {
      minFromPlayerStart: 7,
      clusterSizeMin: 1,
      clusterSizeMax: 2,
      placeNearWalls: true
    },
    visual: {
      mesh: "crypt-lantern",
      tintOptions: ["#312b25"],
      light: { color: "#f08a42", intensity: 0.8, range: 7 }
    }
  },
  brokenCryptStone: {
    id: "brokenCryptStone",
    name: "Broken Crypt Stone",
    category: "hazard-remnant",
    blocking: true,
    destructible: true,
    health: 95,
    radius: 1.35,
    height: 1.15,
    density: 0,
    placement: {
      spawnedByHazard: "fallingCryptStone",
      minFromPlayerStart: 0
    },
    visual: {
      mesh: "broken-crypt-stone",
      tintOptions: ["#706c63", "#5f5b55"]
    }
  },
  ritualObelisk: {
    id: "ritualObelisk",
    name: "Ritual Obelisk",
    category: "landmark",
    blocking: true,
    destructible: false,
    radius: 1.2,
    height: 4,
    density: 0.1,
    aura: {
      radius: 7,
      enemySpeedMultiplier: 1.08,
      pulseSeconds: 5
    },
    placement: {
      minFromPlayerStart: 24,
      clusterSizeMin: 1,
      clusterSizeMax: 1,
      preferQuadrants: true
    },
    visual: {
      mesh: "ritual-obelisk",
      tintOptions: ["#4e5360", "#56515e"],
      light: { color: "#8064b9", intensity: 1.1, range: 9 }
    }
  }
};

export const BIOME_PROP_SETS = {
  moonlitGraveyard: {
    id: "moonlitGraveyard",
    label: "Moonlit Graveyard",
    floorTint: "#253029",
    fogTint: "#9ca6b5",
    ambientLight: "#7f91a6",
    propWeights: [
      { propId: "tombstone", weight: 34 },
      { propId: "bonePile", weight: 22 },
      { propId: "deadTree", weight: 12 },
      { propId: "ironFence", weight: 18 },
      { propId: "cryptLantern", weight: 10 },
      { propId: "ritualObelisk", weight: 4 }
    ]
  },
  sunkenCrypt: {
    id: "sunkenCrypt",
    label: "Sunken Crypt",
    floorTint: "#2c2d2c",
    fogTint: "#6f7868",
    ambientLight: "#6f7a82",
    propWeights: [
      { propId: "mausoleumWall", weight: 26 },
      { propId: "bonePile", weight: 18 },
      { propId: "cryptLantern", weight: 16 },
      { propId: "tombstone", weight: 16 },
      { propId: "ironFence", weight: 10 },
      { propId: "ritualObelisk", weight: 14 }
    ]
  },
  bloodMoonField: {
    id: "bloodMoonField",
    label: "Blood Moon Field",
    floorTint: "#332528",
    fogTint: "#8e4e57",
    ambientLight: "#9a626c",
    propWeights: [
      { propId: "deadTree", weight: 22 },
      { propId: "tombstone", weight: 22 },
      { propId: "bonePile", weight: 18 },
      { propId: "ironFence", weight: 14 },
      { propId: "ritualObelisk", weight: 14 },
      { propId: "cryptLantern", weight: 10 }
    ]
  }
};

export const LEVEL_UP_POOLS = {
  starterWeapons: ["boneSplinter", "graveLantern", "coffinLid"],
  unlockOrder: [
    { second: 0, weaponIds: ["boneSplinter", "graveLantern", "coffinLid"] },
    { second: 120, weaponIds: ["silverStake", "plagueVial"] },
    { second: 300, weaponIds: ["batSwarm", "funeralBell"] },
    { second: 540, weaponIds: ["reaperScythe"] }
  ],
  passiveIds: [
    "blackGarlic",
    "silverRosary",
    "graveBoots",
    "funeralBellClapper",
    "bloodHourglass",
    "coffinNails"
  ],
  rarityWeights: {
    common: 70,
    uncommon: 23,
    rare: 6,
    evolution: 1
  }
};

export const PLAYER_CLASSES = {
  vanguard: {
    id: "vanguard",
    name: "Vanguard",
    role: "Line-holder",
    color: "#82e9ff",
    starterWeapon: "coffinLid",
    starterPassives: ["coffinNails"],
    progression: {
      weapons: [
        { level: 1, id: "coffinLid" },
        { level: 2, id: "boneSplinter" },
        { level: 4, id: "graveLantern" },
        { level: 6, id: "silverStake" },
        { level: 8, id: "reaperScythe" },
        { level: 10, id: "batSwarm" }
      ],
      passives: [
        { level: 1, id: "coffinNails" },
        { level: 2, id: "graveBoots" },
        { level: 3, id: "blackGarlic" },
        { level: 5, id: "silverRosary" },
        { level: 7, id: "funeralBellClapper" },
        { level: 9, id: "bloodHourglass" }
      ]
    },
    passiveBias: ["defense", "control", "counter"],
    stats: {
      maxHpMultiplier: 1.18,
      armorFlat: 4,
      moveSpeedMultiplier: 0.96,
      knockbackForceMultiplier: 1.08
    },
    perk: "Braces behind coffin iron and wins room when the dead press close."
  },
  tech: {
    id: "tech",
    name: "Tech-Sapper",
    role: "Engineer",
    color: "#ffd36d",
    starterWeapon: "boneSplinter",
    starterPassives: ["funeralBellClapper"],
    progression: {
      weapons: [
        { level: 1, id: "boneSplinter" },
        { level: 2, id: "silverStake" },
        { level: 4, id: "funeralBell" },
        { level: 6, id: "coffinLid" },
        { level: 8, id: "reaperScythe" },
        { level: 10, id: "plagueVial" }
      ],
      passives: [
        { level: 1, id: "funeralBellClapper" },
        { level: 2, id: "silverRosary" },
        { level: 3, id: "graveBoots" },
        { level: 5, id: "blackGarlic" },
        { level: 7, id: "coffinNails" },
        { level: 9, id: "bloodHourglass" }
      ]
    },
    passiveBias: ["tempo", "projectile", "coverage"],
    stats: {
      cooldownMultiplier: 0.94,
      projectileSpeedMultiplier: 1.08,
      pickupRadiusFlat: 0.5
    },
    perk: "Keeps the graveyard measured, then fills lanes before the mob can."
  },
  bio: {
    id: "bio",
    name: "Bio-Reclaimer",
    role: "Support",
    color: "#85ff9a",
    starterWeapon: "plagueVial",
    starterPassives: ["bloodHourglass"],
    progression: {
      weapons: [
        { level: 1, id: "plagueVial" },
        { level: 2, id: "batSwarm" },
        { level: 4, id: "graveLantern" },
        { level: 6, id: "reaperScythe" },
        { level: 8, id: "boneSplinter" },
        { level: 10, id: "funeralBell" }
      ],
      passives: [
        { level: 1, id: "bloodHourglass" },
        { level: 2, id: "blackGarlic" },
        { level: 3, id: "graveBoots" },
        { level: 5, id: "silverRosary" },
        { level: 7, id: "coffinNails" },
        { level: 9, id: "funeralBellClapper" }
      ]
    },
    passiveBias: ["duration", "damage", "utility"],
    stats: {
      regenFlat: 0.18,
      plagueDamageMultiplier: 1.12,
      effectDurationMultiplier: 1.08,
      healMultiplier: 1.12
    },
    perk: "Works ugly medicine from rot glass and stays up after bad trades."
  },
  quantum: {
    id: "quantum",
    name: "Quantum Striker",
    role: "Assassin",
    color: "#b38cff",
    starterWeapon: "batSwarm",
    starterPassives: ["graveBoots"],
    progression: {
      weapons: [
        { level: 1, id: "batSwarm" },
        { level: 2, id: "boneSplinter" },
        { level: 4, id: "reaperScythe" },
        { level: 6, id: "silverStake" },
        { level: 8, id: "funeralBell" },
        { level: 10, id: "plagueVial" }
      ],
      passives: [
        { level: 1, id: "graveBoots" },
        { level: 2, id: "funeralBellClapper" },
        { level: 3, id: "bloodHourglass" },
        { level: 5, id: "silverRosary" },
        { level: 7, id: "blackGarlic" },
        { level: 9, id: "coffinNails" }
      ]
    },
    passiveBias: ["mobility", "tempo", "damage"],
    stats: {
      moveSpeedMultiplier: 1.12,
      critChanceFlat: 0.08,
      knockbackResistFlat: 0.08
    },
    perk: "Lives on clean exits, quick cuts, and punishing the weakest corpse."
  },
  singularity: {
    id: "singularity",
    name: "Singularity Weaver",
    role: "Force mage",
    color: "#ff9de8",
    starterWeapon: "graveLantern",
    starterPassives: ["blackGarlic"],
    progression: {
      weapons: [
        { level: 1, id: "graveLantern" },
        { level: 2, id: "funeralBell" },
        { level: 4, id: "plagueVial" },
        { level: 6, id: "reaperScythe" },
        { level: 8, id: "silverStake" },
        { level: 10, id: "coffinLid" }
      ],
      passives: [
        { level: 1, id: "blackGarlic" },
        { level: 2, id: "bloodHourglass" },
        { level: 3, id: "funeralBellClapper" },
        { level: 5, id: "graveBoots" },
        { level: 7, id: "silverRosary" },
        { level: 9, id: "coffinNails" }
      ]
    },
    passiveBias: ["area", "control", "duration"],
    stats: {
      auraRadiusMultiplier: 1.12,
      fireDamageMultiplier: 1.1,
      cooldownMultiplier: 0.98,
      pickupRadiusFlat: 0.3
    },
    perk: "Bends close space until the dead stumble inside your orbit."
  }
};

export const ARENA_DATA = {
  id: ARENA_ID,
  balance: BALANCE_CONSTANTS,
  damageTypes: DAMAGE_TYPES,
  passiveItems: PASSIVE_ITEMS,
  weapons: WEAPON_DEFINITIONS,
  playerClasses: PLAYER_CLASSES,
  enemies: ENEMY_ARCHETYPES,
  waves: WAVE_PACING,
  pickups: PICKUP_DEFINITIONS,
  hazards: HAZARD_DEFINITIONS,
  mapProps: MAP_PROP_DESCRIPTORS,
  biomes: BIOME_PROP_SETS,
  levelUpPools: LEVEL_UP_POOLS,
  objectives: ARENA_OBJECTIVES
};

export default ARENA_DATA;
