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
