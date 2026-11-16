import { readCombatHazards, type CombatHazard } from './hazards/config.ts';
export type CombatEnvironment = { surfaces: Array<{
  entityId: string;
  acousticProfile?: 'masonry' | 'wood' | 'metal' | 'glass';
  trigger: { kind: 'impact'; minSpeed: number } | { kind: 'scheduled'; warningFrame: number; removeFrame: number };
  revealIds?: string[]; debrisIds?: string[]; warningIds?: string[]; hideIds?: string[]; toolIds?: string[];
  /** Final impact disables motion but retains the wreck's solid body. Linked parts share its authored motion. */
  stopMotionIds?: string[];
}>; traffic?: Array<{ entityId: string; moveId: string; minSpeed: number }>; hazards?: CombatHazard[] };

export function readCombatEnvironment(value: unknown): CombatEnvironment | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || !('surfaces' in value) || !Array.isArray(value.surfaces) || value.surfaces.length > 512) throw new Error('Environment needs at most 512 surfaces.');
  rejectUnknown(value, ['surfaces', 'traffic', 'hazards']);
  const seen = new Set<string>();
  const id = (value: unknown): string => { if (typeof value !== 'string' || !value || value.length > 160) throw new Error('Invalid environment entity ID.');return value; };
  const surfaces = value.surfaces.map((raw: unknown): CombatEnvironment['surfaces'][number] => {
    if (!raw || typeof raw !== 'object' || !('entityId' in raw) || !('trigger' in raw)) throw new Error('Invalid environment surface.');
    rejectUnknown(raw, ['entityId', 'trigger', 'acousticProfile', 'revealIds', 'debrisIds', 'warningIds', 'hideIds', 'toolIds', 'stopMotionIds']);
    const entityId = id(raw.entityId), trigger = raw.trigger;
    if (seen.has(entityId)) throw new Error('Duplicate environment surface.');seen.add(entityId);
    if (!trigger || typeof trigger !== 'object' || !('kind' in trigger)) throw new Error('Invalid environment trigger.');
    rejectUnknown(trigger, trigger.kind === 'impact' ? ['kind', 'minSpeed'] : ['kind', 'warningFrame', 'removeFrame']);
    let parsed: CombatEnvironment['surfaces'][number]['trigger'];
    if (trigger.kind === 'impact' && 'minSpeed' in trigger && typeof trigger.minSpeed === 'number' && Number.isFinite(trigger.minSpeed) && trigger.minSpeed > 0 && trigger.minSpeed <= 100) parsed = { kind: 'impact', minSpeed: trigger.minSpeed };
    else if (trigger.kind === 'scheduled' && 'warningFrame' in trigger && 'removeFrame' in trigger && typeof trigger.warningFrame === 'number' && typeof trigger.removeFrame === 'number' && Number.isSafeInteger(trigger.warningFrame) && Number.isSafeInteger(trigger.removeFrame) && trigger.warningFrame >= 0 && trigger.removeFrame > trigger.warningFrame && trigger.removeFrame <= 216000) parsed = { kind: 'scheduled', warningFrame: trigger.warningFrame, removeFrame: trigger.removeFrame };
    else throw new Error('Invalid environment trigger timing or impact speed.');
    const result: CombatEnvironment['surfaces'][number] = { entityId, trigger: parsed };
    if ('acousticProfile' in raw && raw.acousticProfile !== undefined) {
      const profile = raw.acousticProfile;
      if (profile !== 'masonry' && profile !== 'wood' && profile !== 'metal' && profile !== 'glass') throw Error('Invalid environment acoustic profile.');
      result.acousticProfile = profile;
    }
    for (const key of ['revealIds', 'debrisIds', 'warningIds', 'hideIds', 'toolIds', 'stopMotionIds'] as const) {
      if (!(key in raw)) continue;
      const ids: unknown = Reflect.get(raw, key);
      if (!Array.isArray(ids) || ids.length > 32) throw new Error('Invalid environment feedback IDs.');
      result[key] = ids.map(id);if (key === 'stopMotionIds' && (parsed.kind !== 'impact' || new Set(result[key]).size !== ids.length || result[key].includes(entityId))) throw new Error('Vehicle stop needs unique linked parts and an impact trigger.');
    }
    return result;
  });
  const hazards = readCombatHazards('hazards' in value ? value.hazards : undefined);
  if (!('traffic' in value)) return { surfaces, ...(hazards ? { hazards } : {}) };
  if (!Array.isArray(value.traffic) || value.traffic.length > 128) throw new Error('Environment needs at most 128 traffic bodies.');
  const trafficSeen = new Set<string>();
  const traffic = value.traffic.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || !('entityId' in raw) || !('moveId' in raw) || !('minSpeed' in raw)) throw new Error('Invalid environment traffic.');
    rejectUnknown(raw, ['entityId', 'moveId', 'minSpeed']);
    const entityId = id(raw.entityId), moveId = id(raw.moveId), minSpeed = raw.minSpeed;
    if (trafficSeen.has(entityId) || seen.has(entityId) && !surfaces.some(surface => surface.entityId === entityId && surface.stopMotionIds) || typeof minSpeed !== 'number' || !Number.isFinite(minSpeed) || minSpeed <= 0 || minSpeed > 1000) throw new Error('Invalid traffic identity or speed.');
    trafficSeen.add(entityId);seen.add(entityId);return { entityId, moveId, minSpeed };
  });
  return { surfaces, traffic, ...(hazards ? { hazards } : {}) };
}

function rejectUnknown(value: object, keys: readonly string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error('Unknown environment field.');
}
