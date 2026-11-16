import { readInitialProfile, type PublicProfile } from '@hyperfocus/touch-of-death/appearance/profile';
import type { ReplayAppearance } from '@hyperfocus/touch-of-death/replay/appearance';
export { readReplayAppearance, type ReplayAppearance, type ReplayFighterAppearance } from '@hyperfocus/touch-of-death/replay/appearance';

export function captureReplayAppearance(options: {
  seats: readonly string[]; profiles: readonly PublicProfile[];
  profileBindings: readonly { playerId: string; userId: string }[];
}): ReplayAppearance | undefined {
  const fighters = options.seats.map(playerId => {
    const userId = options.profileBindings.find(binding => binding.playerId === playerId)?.userId;
    const profile = options.profiles.find(profile => profile.userId === userId);
    return profile ? readInitialProfile({ name: profile.name, icon: profile.icon, selections: profile.selections }) : null;
  });
  if (fighters.length !== 2 || !fighters.some(Boolean)) return undefined;
  return { version: 1, fighters: [fighters[0]!, fighters[1]!] };
}
