import { profileObject, readInitialProfile } from '../appearance/profile.ts';

export type ReplayFighterAppearance = ReturnType<typeof readInitialProfile>;
export type ReplayAppearance = { version: 1; fighters: [ReplayFighterAppearance | null, ReplayFighterAppearance | null] };

/** Presentation only, in recording seat order. Never account IDs or uploaded images. */
export function readReplayAppearance(value: unknown): ReplayAppearance | undefined {
  if (value === undefined) return undefined;
  profileObject(value, ['version', 'fighters']);
  if (value.version !== 1 || !Array.isArray(value.fighters) || value.fighters.length !== 2) throw new Error('Invalid replay fighter appearance.');
  const read = (look: unknown) => look === null ? null : readInitialProfile(look);
  return { version: 1, fighters: [read(value.fighters[0]), read(value.fighters[1])] };
}
