import type { PublicProfile } from '@hyperfocus/touch-of-death/appearance/profile';

/** Labels never replace stable identity keys used by room commands. */
export function roomProfileLabel(userId: string, profiles: readonly PublicProfile[] = []) {
  const profile = profiles.find(profile => profile.userId === userId);
  if (!profile) return userId.length > 28 ? `${userId.slice(0, 13)}…${userId.slice(-12)}` : userId;
  return profiles.some(other => other.userId !== userId && other.name === profile.name) ? `${profile.name} · ${userId}` : profile.name;
}
