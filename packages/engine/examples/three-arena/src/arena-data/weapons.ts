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
