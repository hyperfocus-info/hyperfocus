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
