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
