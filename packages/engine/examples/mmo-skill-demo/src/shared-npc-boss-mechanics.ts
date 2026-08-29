import { bestiaryFor } from "./data/bestiary.ts";
import { MACE_WEAPON_ID, MAX_ENERGY } from "./shared-ability-catalog.ts";
import { GOLEM_OVERDRIVE_COOLDOWN_MS, GOLEM_OVERDRIVE_PLAYER_RADIUS, GOLEM_OVERDRIVE_RADIAL_COUNT, activePowerNodesForGolem, powerNodesForGolem } from "./shared-combat-resolution.ts";
import { addCombatFlag, hasCombatFlag } from "./shared-combat-state.ts";
import { type HazardEntity, type MmoSkillDemoState, type NpcEntity } from "./shared-contracts.ts";
import { acquireNpcEntity, entitiesOfType } from "./shared-entity-registry.ts";
import { addSummonedNpc, damagePlayer, spawnHazard } from "./shared-hazards.ts";
import { stableHash } from "./shared-quests.ts";
import { clamp } from "./shared-replication-projection.ts";
import { applyKnockback } from "./shared-world-physics.ts";
import { mmoSkillDemoMap, roleForKind } from "./shared-world-runtime.ts";

function spawnRadialHazards(state: MmoSkillDemoState, owner: NpcEntity, count: number, damage: number, radius = 150, options: Partial<Pick<HazardEntity, "knockbackModifier" | "isHeavyImpact" | "armorPierce" | "effectKind">> = {}) {
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count;
    const target = {
      id: `radial-${i}`,
      entityType: "player" as const,
      name: "",
      x: owner.x + Math.cos(angle) * radius,
      y: owner.y + Math.sin(angle) * radius,
      hp: 1,
      maxHp: 1,
      mana: 0,
      maxMana: 0,
      energy: 0,
      maxEnergy: MAX_ENERGY,
      combatXp: 0,
      combatLevel: 1,
      miningXp: 0,
      miningLevel: 1,
      woodcuttingXp: 0,
      woodcuttingLevel: 1,
      zoneId: owner.zoneId,
      gold: 0,
      renown: 0,
      masteryRank: 1,
      contractId: "",
      contractKills: 0,
      contractStreak: 0,
      contractCooldownMs: 0,
      inventory: {},
      bank: {},
      equipment: {},
      abilitySlots: {},
      cooldowns: {},
      questFlags: {},
      activeQuestId: "",
      dailyQuestDate: "",
      dailyQuestStep: 0,
      dailyQuestProgress: 0,
      dailyQuestCompleted: false,
      dailyQuestResult: "",
      wolfKills: 0,
      batKills: 0,
      bazaarSurvivalMs: 0,
      dungeonBossKills: 0,
      homeZoneId: owner.zoneId,
      escortNpcId: "",
      escortTargetX: 0,
      escortTargetY: 0,
      escortTargetZoneId: owner.zoneId,
      escortMs: 0,
      instanceId: "",
      prestigeTitle: "",
      action: "idle" as const,
      targetId: "",
      aimX: owner.x,
      aimY: owner.y,
      guardMs: 0,
      berserkMs: 0,
      cooldownMs: 0,
      equippedWeaponId: MACE_WEAPON_ID,
      activeAbility: "",
      activeSlot: "",
      activeMs: 0,
      activeDurationMs: 0,
      chargeMs: 0,
      rushDistance: 0,
      abilityVectorX: 1,
      abilityVectorY: 0,
      abilityTickMs: 0,
      abilityHits: "",
      knockbackX: 0,
      knockbackY: 0,
      knockbackMs: 0,
      knockbackHeavy: false,
      stunMs: 0,
      slowMs: 0,
      iframeMs: 0,
      castMs: 0,
      damageAmpMs: 0,
      combatFlags: "",
      lastAttackStyle: "",
      visibleCount: 0
    };
    spawnHazard(state, owner, target, "line", damage, options);
  }
}

function addBossNode(state: MmoSkillDemoState, owner: NpcEntity, kind: "spore-pod" | "power-node" | "glass-clone", index: number, x: number, y: number, hp: number, combatState = "") {
  const id = `${owner.id}-${kind}-${index}`.slice(0, 32);
  if (state.npcs[id]) return state.npcs[id];
  const bestiary = bestiaryFor(kind);
  const node = acquireNpcEntity();
  node.id = id;
  node.kind = kind;
  node.role = roleForKind(kind);
  node.zoneId = owner.zoneId;
  node.elite = false;
  node.personality = bestiary.personality;
  node.impactType = bestiary.combat.impactType;
  node.knockbackModifier = bestiary.combat.knockbackModifier;
  node.x = x;
  node.y = y;
  node.spawnX = x;
  node.spawnY = y;
  node.hp = hp;
  node.maxHp = hp;
  node.respawnMs = 0;
  node.attackCooldownMs = 0;
  node.projectileCooldownMs = 0;
  node.phaseMs = 0;
  node.summonedBy = owner.id;
  node.knockbackX = 0;
  node.knockbackY = 0;
  node.knockbackMs = 0;
  node.knockbackHeavy = false;
  node.stunMs = 0;
  node.slowMs = 0;
  node.iframeMs = 0;
  node.castMs = 0;
  node.damageAmpMs = 0;
  node.combatState = combatState;
  node.combatFlags = "";
  node.lastAttackStyle = "";
  state.npcs[id] = node;
  return node;
}

function bossNodes(state: MmoSkillDemoState, owner: NpcEntity, kind: string) {
  return Array.from(entitiesOfType(state, "npc")).filter((npc) => npc.summonedBy === owner.id && npc.kind === kind && npc.hp > 0);
}

function spawnAshLordPods(state: MmoSkillDemoState, boss: NpcEntity) {
  const offsets = [
    [-112, -82],
    [112, -82],
    [-112, 82],
    [112, 82]
  ];
  offsets.forEach(([dx, dy], index) => addBossNode(state, boss, "spore-pod", index + 1, clamp(boss.x + dx, 32, mmoSkillDemoMap.pixelWidth - 32), clamp(boss.y + dy, 32, mmoSkillDemoMap.pixelHeight - 32), 36));
}

function spawnMirrorClones(state: MmoSkillDemoState, boss: NpcEntity) {
  const realIndex = (stableHash(boss.id) % 4) + 1;
  const offsets = [
    [-96, -64],
    [96, -64],
    [-96, 64],
    [96, 64]
  ];
  offsets.forEach(([dx, dy], index) => addBossNode(state, boss, "glass-clone", index + 1, clamp(boss.x + dx, 32, mmoSkillDemoMap.pixelWidth - 32), clamp(boss.y + dy, 32, mmoSkillDemoMap.pixelHeight - 32), 28, index + 1 === realIndex ? "real" : "fake"));
}

function updateBossMinigames(state: MmoSkillDemoState, npc: NpcEntity, dt: number) {
  if (npc.kind === "great-ash-lord") {
    const ratio = npc.hp / Math.max(1, npc.maxHp);
    const threshold = ratio <= 0.33 ? "ash33" : ratio <= 0.66 ? "ash66" : "";
    if (threshold && !hasCombatFlag(npc, threshold)) {
      addCombatFlag(npc, threshold);
      npc.combatState = "spore-shield";
      npc.iframeMs = 15000;
      npc.castMs = 900;
      spawnAshLordPods(state, npc);
    }
    const pods = bossNodes(state, npc, "spore-pod");
    if (npc.combatState === "spore-shield" && pods.length === 0) {
      npc.iframeMs = 0;
      npc.combatState = "";
      npc.stunMs = Math.max(npc.stunMs, 1200);
    } else if (npc.combatState === "spore-shield") {
      npc.iframeMs = Math.max(npc.iframeMs, 120);
      if (npc.projectileCooldownMs <= 0) {
        const target = Array.from(entitiesOfType(state, "player")).find((player) => player.hp > 0 && player.zoneId === npc.zoneId);
        if (target) spawnHazard(state, npc, target, "aoe", 12, { knockbackModifier: 1.2, isHeavyImpact: true, effectKind: "spore" });
        npc.projectileCooldownMs = 900;
      }
      if (npc.iframeMs <= 140) {
        for (const [index, pod] of pods.entries()) {
          pod.hp = 0;
          addSummonedNpc(state, npc, index + 1, "alpha-timberwolf");
        }
        npc.combatState = "";
      }
    }
  } else if (npc.kind === "iron-core-golem") {
    const nodes = powerNodesForGolem(state, npc);
    if (nodes.length < 3) {
      addBossNode(state, npc, "power-node", 3, npc.x - 78, npc.y + 86, 42, "lit");
    }
    const activeNodes = activePowerNodesForGolem(state, npc);
    if (activeNodes.length > 0) {
      npc.combatState = "overdrive";
      npc.iframeMs = Math.max(npc.iframeMs, 120);
      const engagedTarget = Array.from(entitiesOfType(state, "player")).find((player) => player.hp > 0 && player.zoneId === npc.zoneId && Math.hypot(player.x - npc.x, player.y - npc.y) <= GOLEM_OVERDRIVE_PLAYER_RADIUS);
      if (engagedTarget && npc.projectileCooldownMs <= 0) {
        spawnRadialHazards(state, npc, GOLEM_OVERDRIVE_RADIAL_COUNT, 8, 168, { knockbackModifier: 0.8, effectKind: "spark" });
        npc.projectileCooldownMs = GOLEM_OVERDRIVE_COOLDOWN_MS;
      }
      for (const node of activeNodes) {
        let standing = false;
        for (const player of entitiesOfType(state, "player")) {
          if (player.hp > 0 && player.zoneId === node.zoneId && Math.hypot(player.x - node.x, player.y - node.y) < 24) {
            standing = true;
            break;
          }
        }
        if (standing) node.hp = Math.max(0, node.hp - dt * 14);
      }
    } else if (npc.combatState === "overdrive") {
      npc.combatState = "overloaded";
      npc.iframeMs = 0;
      npc.stunMs = Math.max(npc.stunMs, 8000);
      npc.damageAmpMs = Math.max(npc.damageAmpMs, 8000);
      npc.projectileCooldownMs = 2500;
    } else if (npc.damageAmpMs <= 0 && npc.combatState === "overloaded") {
      npc.combatState = "";
    }
  } else if (npc.kind === "mirror-king") {
    const ratio = npc.hp / Math.max(1, npc.maxHp);
    if (ratio <= 0.5 && !hasCombatFlag(npc, "mirror50")) {
      addCombatFlag(npc, "mirror50");
      npc.combatState = "gravity-well";
      npc.iframeMs = 15000;
      npc.castMs = 900;
      spawnMirrorClones(state, npc);
    }
    const clones = bossNodes(state, npc, "glass-clone");
    if (npc.combatState === "gravity-well" && clones.length > 0) {
      npc.iframeMs = Math.max(npc.iframeMs, 120);
      for (const player of entitiesOfType(state, "player")) {
        if (player.hp <= 0 || player.zoneId !== npc.zoneId) continue;
        applyKnockback(player, npc, -0.32, 6, false);
        if (Math.hypot(player.x - npc.x, player.y - npc.y) < 26) damagePlayer(player, player.maxHp, { armorPierce: true });
      }
    } else if (npc.combatState === "gravity-well") {
      npc.iframeMs = 0;
      npc.combatState = "";
      npc.stunMs = Math.max(npc.stunMs, 1800);
    }
  }
}

export {
  addBossNode,
  bossNodes,
  spawnAshLordPods,
  spawnMirrorClones,
  spawnRadialHazards,
  updateBossMinigames
};
