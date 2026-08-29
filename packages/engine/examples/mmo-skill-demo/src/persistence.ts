import { type PlayerEntity } from "./shared-contracts.ts";

export type SavedCharacter = Omit<
  PlayerEntity,
  "id" | "visibleCount" | "action" | "targetId" | "aimX" | "aimY" | "guardMs" | "berserkMs" | "cooldownMs" | "cooldowns" | "equippedWeaponId" | "activeAbility" | "activeSlot" | "activeMs" | "activeDurationMs" | "chargeMs" | "rushDistance" | "abilityVectorX" | "abilityVectorY" | "abilityTickMs" | "abilityHits" | "combatFlags" | "escortNpcId" | "escortTargetX" | "escortTargetY" | "escortTargetZoneId" | "escortMs"
>;

export const savedCharactersByUserId = new Map<string, SavedCharacter>();

function cloneRecord<TValue>(record: Record<string, TValue> | undefined): Record<string, TValue> {
  return { ...(record ?? {}) };
}

function cloneSavedCharacter(saved: SavedCharacter): SavedCharacter {
  return {
    ...saved,
    gatheringXp: cloneRecord(saved.gatheringXp),
    gatheringLevels: cloneRecord(saved.gatheringLevels),
    inventory: cloneRecord(saved.inventory),
    bank: cloneRecord(saved.bank),
    equipment: cloneRecord(saved.equipment),
    abilitySlots: cloneRecord(saved.abilitySlots),
    questFlags: cloneRecord(saved.questFlags)
  };
}

export function toSavedCharacter(player: PlayerEntity): SavedCharacter {
  const {
    id: _id,
    visibleCount: _visibleCount,
    action: _action,
    targetId: _targetId,
    aimX: _aimX,
    aimY: _aimY,
    guardMs: _guardMs,
    berserkMs: _berserkMs,
    cooldownMs: _cooldownMs,
    cooldowns: _cooldowns,
    equippedWeaponId: _equippedWeaponId,
    activeAbility: _activeAbility,
    activeSlot: _activeSlot,
    activeMs: _activeMs,
    activeDurationMs: _activeDurationMs,
    chargeMs: _chargeMs,
    rushDistance: _rushDistance,
    abilityVectorX: _abilityVectorX,
    abilityVectorY: _abilityVectorY,
    abilityTickMs: _abilityTickMs,
    abilityHits: _abilityHits,
    combatFlags: _combatFlags,
    escortNpcId: _escortNpcId,
    escortTargetX: _escortTargetX,
    escortTargetY: _escortTargetY,
    escortTargetZoneId: _escortTargetZoneId,
    escortMs: _escortMs,
    ...saved
  } = player;
  return cloneSavedCharacter(saved);
}

function isInstanceZone(zoneId: SavedCharacter["zoneId"]) {
  return zoneId === "dungeon" || zoneId === "cottage";
}

export function savedCharacterForUser(userId: string) {
  const saved = savedCharactersByUserId.get(userId);
  return saved ? cloneSavedCharacter(saved) : undefined;
}

export function saveCharacterForUser(
  userId: string,
  player: PlayerEntity,
  options: { preserveWorldPosition?: boolean; fallbackWorldPosition?: Pick<SavedCharacter, "x" | "y" | "zoneId"> } = {}
) {
  const saved = toSavedCharacter(player);
  const previous = savedCharactersByUserId.get(userId);
  if (options.preserveWorldPosition) {
    if (previous && !isInstanceZone(previous.zoneId)) {
      saved.x = previous.x;
      saved.y = previous.y;
      saved.zoneId = previous.zoneId;
    } else if (options.fallbackWorldPosition) {
      saved.x = options.fallbackWorldPosition.x;
      saved.y = options.fallbackWorldPosition.y;
      saved.zoneId = options.fallbackWorldPosition.zoneId;
    }
  }
  const stored = cloneSavedCharacter(saved);
  savedCharactersByUserId.set(userId, stored);
  return cloneSavedCharacter(stored);
}
