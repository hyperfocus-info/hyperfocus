export type CombatHazard = { entityId: string; activationSurfaceId?: string } & (
  { kind: 'fire'; damage: number; intervalFrames: number } | { kind: 'flood'; groundSpeedScale: number }
);

export function readCombatHazards(value: unknown): CombatHazard[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 32) throw Error('Environment needs at most 32 hazards.');
  const seen = new Set<string>();
  return value.map(row => {
    if (!row || typeof row !== 'object' || typeof row.entityId !== 'string' || !row.entityId || row.entityId.length > 160 || seen.has(row.entityId)) throw Error('Invalid hazard identity.');
    seen.add(row.entityId);
    if (row.activationSurfaceId !== undefined && (typeof row.activationSurfaceId !== 'string' || !row.activationSurfaceId || row.activationSurfaceId.length > 160)) throw Error('Invalid hazard activation surface.');
    const keys = ['entityId', 'activationSurfaceId', 'kind', ...(row.kind === 'fire' ? ['damage', 'intervalFrames'] : ['groundSpeedScale'])];
    if (Object.keys(row).some(key => !keys.includes(key))) throw Error('Unknown hazard field.');
    const base = { entityId: row.entityId, ...(row.activationSurfaceId === undefined ? {} : { activationSurfaceId: row.activationSurfaceId }) };
    if (row.kind === 'fire' && typeof row.damage === 'number' && Number.isFinite(row.damage) && row.damage > 0 && row.damage <= 100 && Number.isSafeInteger(row.intervalFrames) && row.intervalFrames >= 1 && row.intervalFrames <= 3600) return { ...base, kind: 'fire', damage: row.damage, intervalFrames: row.intervalFrames };
    if (row.kind === 'flood' && typeof row.groundSpeedScale === 'number' && Number.isFinite(row.groundSpeedScale) && row.groundSpeedScale > 0 && row.groundSpeedScale <= 1) return { ...base, kind: 'flood', groundSpeedScale: row.groundSpeedScale };
    throw Error('Invalid hazard kind or tuning.');
  });
}
