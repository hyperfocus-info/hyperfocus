export type MmoSkillDefinition = {
  id: string;
  maxLevel?: number;
  xpForLevel?: (level: number) => number;
  levelForXp?: (xp: number) => number;
};

export type MmoSkillProgress = {
  xp: number;
  level: number;
};

export type MmoInventoryState = Record<string, number>;

export type MmoCooldownState = Record<string, number>;

export type MmoLootDrop = {
  itemId: string;
  weight?: number;
  min?: number;
  max?: number;
};

export type MmoLootResult = {
  itemId: string;
  amount: number;
};

export type MmoQuestDefinition = {
  id: string;
  goals: Record<string, number>;
};

export type MmoQuestProgress = {
  status: "active" | "complete";
  goals: Record<string, number>;
};

export type MmoResourceState = {
  hp: number;
  maxHp: number;
  depleted?: boolean;
  respawnMs?: number;
};

export type MmoGameplayKitConfig = {
  skills?: readonly MmoSkillDefinition[];
  lootTables?: Record<string, readonly MmoLootDrop[]>;
  quests?: readonly MmoQuestDefinition[];
};

export type MmoGameplayKit = {
  skills: ReadonlyMap<string, MmoSkillDefinition>;
  lootTables: ReadonlyMap<string, readonly MmoLootDrop[]>;
  quests: ReadonlyMap<string, MmoQuestDefinition>;
  awardXp(progress: Record<string, MmoSkillProgress>, skillId: string, xp: number): MmoSkillProgress;
  addItem(inventory: MmoInventoryState, itemId: string, amount?: number): number;
  removeItem(inventory: MmoInventoryState, itemId: string, amount?: number): boolean;
  startCooldown(cooldowns: MmoCooldownState, id: string, durationMs: number): void;
  cooldownReady(cooldowns: MmoCooldownState, id: string): boolean;
  tickCooldowns(cooldowns: MmoCooldownState, dtMs: number): void;
  rollLoot(tableId: string, rng?: () => number): MmoLootResult | undefined;
  damageResource(resource: MmoResourceState, amount: number): boolean;
  tickResource(resource: MmoResourceState, dtMs: number): void;
  startQuest(state: Record<string, MmoQuestProgress>, questId: string): MmoQuestProgress;
  progressQuest(state: Record<string, MmoQuestProgress>, questId: string, goalId: string, amount?: number): MmoQuestProgress | undefined;
  completeQuest(state: Record<string, MmoQuestProgress>, questId: string): boolean;
};

function defaultLevelForXp(xp: number) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
}

function assertSafeId(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} must not be empty`);
  if (value === "__proto__" || value === "prototype" || value === "constructor") {
    throw new Error(`${label} is reserved`);
  }
}

function assertNonNegativeFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a non-negative finite number`);
  return value;
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer`);
  return value;
}

function assertNonNegativeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative safe integer`);
  return value;
}

function addSafeInteger(left: number, right: number, label: string) {
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) throw new RangeError(`${label} exceeds the safe integer range`);
  return sum;
}

function assertUnitRandom(value: number) {
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError("loot rng must return a number in [0, 1)");
  return value;
}

export function createMmoGameplayKit(config: MmoGameplayKitConfig = {}): MmoGameplayKit {
  const skills = new Map(config.skills?.map((skill) => [skill.id, skill]) ?? []);
  const lootTables = new Map(Object.entries(config.lootTables ?? {}));
  const quests = new Map(config.quests?.map((quest) => [quest.id, quest]) ?? []);

  return {
    skills,
    lootTables,
    quests,
    awardXp(progress, skillId, xp) {
      assertSafeId(skillId, "skill id");
      assertNonNegativeFinite(xp, "xp");
      const definition = skills.get(skillId);
      const current = progress[skillId] ?? { xp: 0, level: 1 };
      assertNonNegativeFinite(current.xp, "current xp");
      const nextXp = current.xp + xp;
      if (!Number.isFinite(nextXp)) throw new RangeError("total xp must be finite");
      const maxLevel = definition?.maxLevel ?? Number.MAX_SAFE_INTEGER;
      if (!Number.isSafeInteger(maxLevel) || maxLevel < 1) throw new RangeError("skill maxLevel must be a positive safe integer");
      const resolvedLevel = definition?.levelForXp?.(nextXp) ?? defaultLevelForXp(nextXp);
      if (!Number.isSafeInteger(resolvedLevel) || resolvedLevel < 1) throw new RangeError("skill levelForXp must return a positive safe integer");
      const nextLevel = Math.min(maxLevel, resolvedLevel);
      const next = { xp: nextXp, level: nextLevel };
      progress[skillId] = next;
      return next;
    },
    addItem(inventory, itemId, amount = 1) {
      assertSafeId(itemId, "item id");
      assertPositiveInteger(amount, "item amount");
      const current = assertNonNegativeInteger(inventory[itemId] ?? 0, "current item count");
      inventory[itemId] = addSafeInteger(current, amount, "item count");
      return inventory[itemId];
    },
    removeItem(inventory, itemId, amount = 1) {
      assertSafeId(itemId, "item id");
      assertPositiveInteger(amount, "item amount");
      const current = assertNonNegativeInteger(inventory[itemId] ?? 0, "current item count");
      if (current < amount) return false;
      const next = current - amount;
      if (next <= 0) delete inventory[itemId];
      else inventory[itemId] = next;
      return true;
    },
    startCooldown(cooldowns, id, durationMs) {
      assertSafeId(id, "cooldown id");
      cooldowns[id] = assertNonNegativeFinite(durationMs, "cooldown duration");
    },
    cooldownReady(cooldowns, id) {
      assertSafeId(id, "cooldown id");
      return assertNonNegativeFinite(cooldowns[id] ?? 0, "cooldown value") <= 0;
    },
    tickCooldowns(cooldowns, dtMs) {
      assertNonNegativeFinite(dtMs, "cooldown delta");
      const entries = Object.keys(cooldowns).map((id) => {
        assertSafeId(id, "cooldown id");
        return [id, assertNonNegativeFinite(cooldowns[id], `cooldown ${id}`)] as const;
      });
      for (const [id, remaining] of entries) cooldowns[id] = Math.max(0, remaining - dtMs);
    },
    rollLoot(tableId, rng = Math.random) {
      assertSafeId(tableId, "loot table id");
      const table = lootTables.get(tableId);
      if (!table?.length) return undefined;
      const prepared = table.map((drop) => {
        assertSafeId(drop.itemId, "loot item id");
        const weight = assertNonNegativeFinite(drop.weight ?? 1, `loot weight for ${drop.itemId}`);
        const min = assertPositiveInteger(drop.min ?? 1, `loot minimum for ${drop.itemId}`);
        const max = assertPositiveInteger(drop.max ?? min, `loot maximum for ${drop.itemId}`);
        if (max < min) throw new RangeError(`loot maximum for ${drop.itemId} must be at least its minimum`);
        return { drop, weight, min, max };
      });
      const total = prepared.reduce((sum, entry) => sum + entry.weight, 0);
      if (!Number.isFinite(total)) throw new RangeError(`loot table ${tableId} total weight must be finite`);
      if (total <= 0) return undefined;
      let cursor = assertUnitRandom(rng()) * total;
      for (const { drop, weight, min, max } of prepared) {
        if (weight <= 0) continue;
        if (cursor >= weight) {
          cursor -= weight;
          continue;
        }
        return { itemId: drop.itemId, amount: min + Math.floor(assertUnitRandom(rng()) * (max - min + 1)) };
      }
      return undefined;
    },
    damageResource(resource, amount) {
      assertNonNegativeFinite(amount, "resource damage");
      assertNonNegativeFinite(resource.maxHp, "resource maxHp");
      assertNonNegativeFinite(resource.hp, "resource hp");
      if (resource.depleted) return true;
      resource.hp = Math.min(resource.maxHp, Math.max(0, resource.hp - amount));
      resource.depleted = resource.hp <= 0;
      return Boolean(resource.depleted);
    },
    tickResource(resource, dtMs) {
      assertNonNegativeFinite(dtMs, "resource delta");
      assertNonNegativeFinite(resource.maxHp, "resource maxHp");
      assertNonNegativeFinite(resource.hp, "resource hp");
      if (!resource.depleted || resource.respawnMs === undefined) return;
      assertNonNegativeFinite(resource.respawnMs, "resource respawnMs");
      resource.respawnMs = Math.max(0, resource.respawnMs - dtMs);
      if (resource.respawnMs > 0) return;
      resource.depleted = false;
      resource.hp = resource.maxHp;
    },
    startQuest(state, questId) {
      assertSafeId(questId, "quest id");
      const definition = quests.get(questId);
      if (!definition) throw new Error(`unknown MMO quest: ${questId}`);
      const progress: MmoQuestProgress = { status: "active", goals: Object.create(null) };
      for (const goalId of Object.keys(definition.goals)) {
        assertSafeId(goalId, "quest goal id");
        assertNonNegativeFinite(definition.goals[goalId], `quest goal ${goalId}`);
        progress.goals[goalId] = 0;
      }
      state[questId] = progress;
      return progress;
    },
    progressQuest(state, questId, goalId, amount = 1) {
      assertSafeId(questId, "quest id");
      assertSafeId(goalId, "quest goal id");
      assertPositiveInteger(amount, "quest progress amount");
      const progress = state[questId];
      const definition = quests.get(questId);
      if (!progress || !definition || progress.status === "complete") return progress;
      const goal = definition.goals[goalId];
      if (goal === undefined) return progress;
      assertNonNegativeFinite(goal, `quest goal ${goalId}`);
      const current = assertNonNegativeFinite(progress.goals[goalId] ?? 0, `quest progress ${goalId}`);
      progress.goals[goalId] = Math.min(goal, current + amount);
      return progress;
    },
    completeQuest(state, questId) {
      assertSafeId(questId, "quest id");
      const progress = state[questId];
      const definition = quests.get(questId);
      if (!progress || !definition) return false;
      for (const [goalId, goal] of Object.entries(definition.goals)) {
        assertSafeId(goalId, "quest goal id");
        assertNonNegativeFinite(goal, `quest goal ${goalId}`);
        const current = assertNonNegativeFinite(progress.goals[goalId] ?? 0, `quest progress ${goalId}`);
        if (current < goal) return false;
      }
      progress.status = "complete";
      return true;
    }
  };
}
