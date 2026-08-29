
export const texturePaths = {
  skybox: "assets/usable/textures/skybox/three-arena-skybox.png",
  survivor: [
    "assets/usable/characters/craftpix/survivor-girl/walk-gun/walk-gun-000.png",
    "assets/usable/characters/kenney/skins/survivor-female-a.png"
  ],
  ally: [
    "assets/usable/characters/kenney/skins/survivor-male-b.png",
    "assets/usable/characters/kenney/skins/retro-human-male-a.png"
  ],
  zombieA: [
    "assets/usable/characters/craftpix/zombie-female/walk/walk-000.png",
    "assets/usable/characters/kenney/skins/zombie-a.png"
  ],
  zombieB: [
    "assets/usable/characters/craftpix/zombie-female/walk/walk-003.png",
    "assets/usable/characters/kenney/skins/retro-zombie-male-a.png"
  ],
  brute: [
    "assets/usable/characters/craftpix/icons/zombie5-icon-no-bg.png",
    "assets/usable/characters/kenney/skins/zombie-c.png"
  ],
  shade: [
    "assets/usable/characters/kenney/skins/retro-zombie-female-a.png",
    "assets/usable/characters/craftpix/icons/zombie1-icon-no-bg.png"
  ],
  ground: [
    "assets/usable/textures/craftpix/soil-stones-tilelist-1.png",
    "assets/usable/textures/craftpix/soil-stones-tilelist-2.png",
    "assets/usable/textures/kenney/graveyard-colormap.png"
  ]
};

export const ARCHITECT_UI_ROOT = "assets/usable/architect-ui";
export const CLASS_WEAPON_ICON_BY_ID: Record<string, string> = {
  vanguard: "weapons/vanguard-repulser.png",
  tech: "weapons/tech-rivet-smg.png",
  bio: "weapons/bio-catalyst-grenadier.png",
  quantum: "weapons/quantum-blink-dagger-shotgun.png",
  singularity: "weapons/singularity-crucible.png"
};
export const WEAPON_ICON_BY_ID: Record<string, string> = {
  boneSplinter: "weapons/quantum-needle-rail.png",
  graveLantern: "weapons/singularity-crucible.png",
  silverStake: "weapons/vanguard-lance-gun.png",
  plagueVial: "weapons/bio-catalyst-grenadier.png",
  coffinLid: "weapons/vanguard-repulser.png",
  batSwarm: "weapons/quantum-blink-dagger-shotgun.png",
  funeralBell: "weapons/singularity-mass-driver.png",
  reaperScythe: "weapons/quantum-event-horizon-knuckles.png",
  pistol: "weapons/quantum-phase-pistols.png",
  shotgun: "weapons/vanguard-repulser.png",
  smg: "weapons/tech-rivet-smg.png",
  rifle: "weapons/vanguard-slugger.png",
  flame: "weapons/bio-chem-sprayer.png"
};
export const EVOLUTION_ICON_BY_WEAPON_ID: Record<string, string> = {
  boneSplinter: "weapons/singularity-orbiting-shards.png",
  graveLantern: "weapons/singularity-crucible.png",
  silverStake: "weapons/vanguard-lance-gun.png",
  plagueVial: "weapons/bio-symbiote-siphon.png",
  coffinLid: "weapons/vanguard-repulser.png",
  batSwarm: "weapons/quantum-blink-dagger-shotgun.png",
  funeralBell: "weapons/singularity-mass-driver.png",
  reaperScythe: "weapons/quantum-event-horizon-knuckles.png"
};
export const PASSIVE_ICON_BY_ID: Record<string, string> = {
  blackGarlic: "status/debuff-38.png",
  silverRosary: "status/debuff-33.png",
  graveBoots: "status/debuff-24.png",
  funeralBellClapper: "status/debuff-27.png",
  bloodHourglass: "status/debuff-10.png",
  coffinNails: "status/debuff-32.png"
};


export const animatedCharacterPaths = {
  model: "assets/usable/characters/kenney/models/character-medium.fbx",
  rig: "assets/usable/characters/kenney/models/character-medium.t3rig",
  animations: {
    idle: "assets/usable/characters/kenney/animations/idle.fbx",
    run: "assets/usable/characters/kenney/animations/run.fbx",
    jump: "assets/usable/characters/kenney/animations/jump.fbx"
  },
  skins: {
    survivor: "assets/usable/characters/kenney/skins/survivor-female-a.png",
    ally: "assets/usable/characters/kenney/skins/survivor-male-b.png",
    zombieA: "assets/usable/characters/kenney/skins/zombie-a.png",
    zombieB: "assets/usable/characters/kenney/skins/retro-zombie-male-a.png",
    brute: "assets/usable/characters/kenney/skins/zombie-c.png",
    shade: "assets/usable/characters/kenney/skins/retro-zombie-female-a.png"
  }
};

export const modelPaths = {
  "gravestone-a": ["assets/usable/environment/kenney/gravestone-cross.glb", "assets/usable/environment/kenney/gravestone-round.glb"],
  "gravestone-b": ["assets/usable/environment/kenney/gravestone-broken.glb", "assets/usable/environment/kenney/grave.glb"],
  grave: ["assets/usable/environment/kenney/grave.glb"],
  crypt: ["assets/usable/environment/kenney/crypt.glb"],
  "ruin-arch": ["assets/usable/scenery/ruin-low-poly/fbx/_ruin_9.fbx", "assets/usable/scenery/ruin-low-poly/fbx/_ruin_5.fbx"],
  "ruin-column": ["assets/usable/scenery/ruin-low-poly/fbx/_ruin_14.fbx", "assets/usable/scenery/ruin-low-poly/fbx/_ruin_15.fbx"],
  "ruin-wall": ["assets/usable/scenery/ruin-low-poly/fbx/_ruin_10.fbx", "assets/usable/scenery/ruin-low-poly/fbx/_ruin_11.fbx"],
  coffin: ["assets/usable/props/kenney/coffin.glb", "assets/usable/props/kenney/coffin-old.glb"],
  shovel: ["assets/usable/props/kenney/shovel.glb"],
  pine: ["assets/usable/environment/kenney/pine.glb", "assets/usable/environment/kenney/tree.glb"],
  "tree-log": ["assets/usable/environment/kenney/tree-log.glb"],
  "rock-a": ["assets/usable/environment/kenney/rock-a.glb"],
  "rock-b": ["assets/usable/environment/kenney/rock-b.glb"],
  rocks: ["assets/usable/environment/kenney/rocks.glb"],
  grass: ["assets/usable/environment/kenney/grass.glb"],
  "grass-large": ["assets/usable/environment/kenney/grass-large.glb"],
  barrel: ["assets/usable/props/kenney/barrel.glb"],
  cross: ["assets/usable/environment/kenney/pillar-obelisk.glb", "assets/usable/props/kenney/lantern-candle.glb"],
  lantern: ["assets/usable/props/kenney/lantern-candle.glb"],
  campfire: ["assets/usable/props/kenney/campfire-pit.glb"],
  pumpkin: ["assets/usable/props/kenney/pumpkin-carved.glb", "assets/usable/props/kenney/pumpkin.glb"],
  fence: ["assets/usable/environment/kenney/iron-fence.glb", "assets/usable/environment/kenney/fence.glb"],
  "stone-wall": ["assets/usable/environment/kenney/stone-wall.glb"],
  "fence-doorway": ["assets/usable/environment/kenney/fence-doorway.glb"],
  floor: ["assets/usable/environment/kenney/floor-old.glb", "assets/usable/environment/kenney/floor.glb"]
};

export const weaponModelPaths = {
  boneSplinter: ["assets/usable/weapons/kaykit/gltf/arrow_A.gltf", "assets/usable/weapons/kaykit/gltf/dagger_A.gltf"],
  graveLantern: ["assets/usable/weapons/kaykit/gltf/wand_A.gltf", "assets/usable/weapons/kaykit/gltf/staff_B.gltf"],
  silverStake: ["assets/usable/weapons/kaykit/gltf/spear_A.gltf", "assets/usable/weapons/kaykit/gltf/arrow_B.gltf"],
  plagueVial: ["assets/usable/weapons/kaykit/gltf/dagger_B.gltf", "assets/usable/weapons/kaykit/gltf/wand_A.gltf"],
  coffinLid: ["assets/usable/weapons/kaykit/gltf/shield_C.gltf", "assets/usable/weapons/kaykit/gltf/shield_B.gltf"],
  batSwarm: ["assets/usable/weapons/kaykit/gltf/fistweapon_B.gltf", "assets/usable/weapons/kaykit/gltf/dagger_B.gltf"],
  funeralBell: ["assets/usable/weapons/kaykit/gltf/hammer_C.gltf", "assets/usable/weapons/kaykit/gltf/staff_A.gltf"],
  reaperScythe: ["assets/usable/weapons/kaykit/gltf/halberd.gltf", "assets/usable/weapons/kaykit/gltf/sword_E.gltf"],
  pistol: ["assets/usable/weapons/kaykit/gltf/wand_A.gltf", "assets/usable/weapons/kaykit/gltf/dagger_A.gltf"],
  shotgun: ["assets/usable/weapons/kaykit/gltf/hammer_B.gltf", "assets/usable/weapons/kaykit/gltf/axe_B.gltf"],
  smg: ["assets/usable/weapons/kaykit/gltf/bow_B_withString.gltf", "assets/usable/weapons/kaykit/gltf/bow_A_withString.gltf"],
  rifle: ["assets/usable/weapons/kaykit/gltf/staff_A.gltf", "assets/usable/weapons/kaykit/gltf/spear_A.gltf"],
  flame: ["assets/usable/weapons/kaykit/gltf/staff_B.gltf", "assets/usable/weapons/kaykit/gltf/wand_A.gltf"]
};

export type WeaponVisualProfile = {
  equippedScale: number;
  pickupScale: number;
  rotationZ: number;
  offsetX: number;
  glowX: number;
};

export const weaponVisualProfiles: Record<string, WeaponVisualProfile> = {
  boneSplinter: { equippedScale: 1.45, pickupScale: 0.9, rotationZ: Math.PI / 2, offsetX: 0.62, glowX: 1.18 },
  graveLantern: { equippedScale: 1.1, pickupScale: 0.78, rotationZ: Math.PI / 2, offsetX: 0.5, glowX: 0.96 },
  silverStake: { equippedScale: 1.7, pickupScale: 1.0, rotationZ: Math.PI / 2, offsetX: 0.68, glowX: 1.28 },
  plagueVial: { equippedScale: 1.18, pickupScale: 0.82, rotationZ: Math.PI / 2, offsetX: 0.48, glowX: 0.98 },
  coffinLid: { equippedScale: 1.05, pickupScale: 0.82, rotationZ: Math.PI / 2, offsetX: 0.5, glowX: 0.92 },
  batSwarm: { equippedScale: 1.16, pickupScale: 0.86, rotationZ: Math.PI / 2, offsetX: 0.52, glowX: 1.02 },
  funeralBell: { equippedScale: 1.18, pickupScale: 0.86, rotationZ: Math.PI / 2, offsetX: 0.5, glowX: 1.02 },
  reaperScythe: { equippedScale: 1.55, pickupScale: 0.96, rotationZ: Math.PI / 2, offsetX: 0.62, glowX: 1.2 },
  default: { equippedScale: 1.35, pickupScale: 0.88, rotationZ: Math.PI / 2, offsetX: 0.58, glowX: 1.12 }
};

export const pickupModelPaths = {
  xp: ["assets/usable/collectibles/treasure-low-poly/fbx/_coin.fbx", "assets/usable/collectibles/treasure-low-poly/fbx/_coins.fbx"],
  heal: ["assets/usable/collectibles/treasure-low-poly/fbx/_jewerly_06.fbx", "assets/usable/collectibles/treasure-low-poly/fbx/_jewerly_09.fbx"],
  weapon: ["assets/usable/props/kenney/chest.glb", "assets/usable/collectibles/treasure-low-poly/fbx/_key_08.fbx"]
};

export const universalAnimationPaths = [
  "assets/usable/animations/universal/UAL1_Standard.glb",
  "assets/usable/animations/universal/UAL2_Standard.glb"
];
export const UNIVERSAL_ANIMATION_RETARGET_FPS = 24;
export const UNIVERSAL_ANIMATION_CLIP_ALIASES: Record<string, string | string[]> = {
  Hit_Chest: "hit",
  Hit_Head: "hitHead",
  Death01: "death",
  Idle_Loop: "ualIdle",
  Idle_Talking_Loop: ["fabricatorShopIdle", "blackHoleChoirRootedChant"],
  Idle_FoldArms_Loop: "idleFoldArms",
  Idle_Shield_Break: "shieldBreak",
  Idle_Shield_Loop: "shieldIdle",
  Zombie_Idle_Loop: ["downed", "enemyStunned", "enemySlowed", "enemyPulled", "enemyTethered", "enemyPoisoned", "enemyBleeding", "enemyMarked"],
  Zombie_Walk_Fwd_Loop: "zombieWalk",
  Zombie_Scratch: "zombieScratch",
  Jog_Fwd_Loop: "jog",
  Sprint_Loop: ["dash", "run8Dir"],
  Walk_Loop: "walk",
  Crouch_Idle_Loop: "crouchIdle",
  Crouch_Fwd_Loop: "crouchMove",
  Jump_Loop: "fall",
  Jump_Land: "land",
  Jump_Start: ["blinkStart", "jumpStart"],
  NinjaJump_Start: "ninjaJumpStart",
  NinjaJump_Idle_Loop: "ninjaJumpIdle",
  NinjaJump_Land: ["blinkEnd", "ninjaJumpLand"],
  Roll: ["roll", "returnSnap"],
  Roll_RM: "rollRootMotion",
  Slide_Start: "slideStart",
  Slide_Loop: ["afterimageDecay", "slideLoop"],
  Slide_Exit: "slideExit",
  Interact: "interact",
  PickUp_Table: "interactPickup",
  Fixing_Kneeling: ["reviveAlly", "patchDroneRepair", "slurryPurification"],
  Farm_Harvest: "fabricationPauseTransition",
  Farm_PlantSeed: ["turretDeploy", "mineArm"],
  Farm_Watering: ["chemSprayLoop", "cleansePulse"],
  Consume: "overclockActivation",
  Pistol_Aim_Neutral: ["aimUpperBody8Dir", "turretAiming"],
  Pistol_Aim_Down: "aimDown",
  Pistol_Aim_Up: "aimUp",
  Pistol_Idle_Loop: "weaponIdle",
  Pistol_Reload: ["reload", "pistolReload"],
  Pistol_Shoot: ["fireWeapon", "turretFiring", "projectileInterception"],
  OverhandThrow: ["grenadeThrow", "microDroneSpawn"],
  Spell_Simple_Enter: ["singularityChannelStart", "overchannelStart"],
  Spell_Simple_Idle_Loop: ["siphonBeamChannel", "singularityChannel", "orbitingShardLoop"],
  Spell_Simple_Shoot: ["shardRelease", "chemicalZonePulse", "cleansePulseCast", "mineDetonate"],
  Spell_Simple_Exit: ["gravityWellCollapse", "overchannelCollapse"],
  Push_Loop: ["gravityWellExpansion", "fenceNodeActivation"],
  Shield_Dash_RM: "shieldDash",
  Shield_OneShot: "shieldOneShot",
  Sword_Block: "swordBlock",
  Sword_Dash_RM: "swordDash",
  Sword_Regular_A: ["melee", "meleeShotgunStrike", "perfectBreachTimingHit"],
  Sword_Regular_B: "swordRegularB",
  Sword_Regular_C: "swordRegularC",
  Sword_Regular_Combo: "swordCombo",
  Sword_Attack: "swordAttack",
  Melee_Hook: "meleeHook",
  Punch_Cross: "punchCross",
  Punch_Jab: "punchJab",
  Chest_Open: ["eliteKeyDrop", "tierUpgradeAnimation"],
  TreeChopping_Loop: "turretDamagedDestroyed",
  Sitting_Idle_Loop: "fabricatorShopSittingIdle",
  Sitting_Enter: "sitEnter",
  Sitting_Exit: "sitExit",
  Dance_Loop: "victoryExtractPose",
  Yes: "celebrate",
  Walk_Carry_Loop: "carryWalk",
  Walk_Formal_Loop: "formalWalk"
};
// UAL upper-body shoot clips over-rotate this Kenney rig. Keep those as local overlays.
export const PROCEDURAL_ACTION_ANIMATION_NAMES = new Set(["shoot", "cast", "aim"]);
export const KENNEY_TO_UNIVERSAL_BONE_NAMES = {
  Hips: "pelvis",
  Spine: "spine_02",
  Head: "Head",
  LeftArm: "upperarm_l",
  LeftForeArm: "lowerarm_l",
  LeftHand: "hand_l",
  LeftHandIndex1: "index_01_l",
  LeftHandIndex2: "index_02_l",
  LeftHandIndex3: "index_03_l",
  LeftHandThumb1: "thumb_01_l",
  LeftHandThumb2: "thumb_02_l",
  RightArm: "upperarm_r",
  RightForeArm: "lowerarm_r",
  RightHand: "hand_r",
  RightHandIndex1: "index_01_r",
  RightHandIndex2: "index_02_r",
  RightHandIndex3: "index_03_r",
  RightHandThumb1: "thumb_01_r",
  RightHandThumb2: "thumb_02_r",
  LeftUpLeg: "thigh_l",
  LeftLeg: "calf_l",
  LeftFoot: "foot_l",
  RightUpLeg: "thigh_r",
  RightLeg: "calf_r",
  RightFoot: "foot_r"
};
