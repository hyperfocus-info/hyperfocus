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
