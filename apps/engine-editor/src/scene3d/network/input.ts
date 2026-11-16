import { readInitialProfile, type PublicProfile } from '@hyperfocus/touch-of-death/appearance/profile';
import { combatInputDirection } from '../input/combat-direction.ts';

/** Resolve a local camera-relative stick before transmission; peers never use our camera. */
export function networkCombatInput(options: {
  actions: ReadonlySet<string>; prefix: string; allowed: ReadonlySet<string>;
  eye: readonly number[]; target: readonly number[]; enabled: boolean;
  direction?: { x: number; y: number; z: number };
}) {
  if (!options.enabled) { const actions: string[] = []; return { actions, direction: { x: 0, y: 0, z: 0 } }; }
  const actions = [...options.actions].filter(action => action.startsWith(options.prefix))
    .map(action => action.slice(options.prefix.length)).filter(action => options.allowed.has(action));
  return { actions, direction: options.direction ? { ...options.direction } : combatInputDirection(options) };
}

export function readCombatConnection(options: { endpoint: string; roomId: string; matchId: string; contentId: string; token: string; getToken?: () => Promise<string>; role?: 'fighter' | 'spectator'; roomType?: 'combat-relay' | 'tod-community' | 'tod-quick-play' | 'tod-training'; initialProfile?: Pick<PublicProfile, 'name' | 'icon' | 'selections'> }) {
  const role = options.role ?? 'fighter';
  const roomType = options.roomType ?? 'combat-relay';
  if (roomType !== 'combat-relay' && roomType !== 'tod-community' && roomType !== 'tod-quick-play' && roomType !== 'tod-training') throw new Error('Choose a supported room type.');
  if (role !== 'fighter' && role !== 'spectator') throw new Error('Choose Fight or Watch before joining.');
  if ((roomType === 'tod-quick-play' || roomType === 'tod-training') && role !== 'fighter') throw new Error('Quick Play and shared training require a fighter seat.');
  const endpoint = new URL(options.endpoint.trim());
  if (!['ws:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash) throw new Error('Use a ws:// or wss:// server address without embedded credentials.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
  if (endpoint.protocol === 'ws:' && endpoint.hostname === '[::1]') throw new Error('Use ws://127.0.0.1 for a local server; insecure IPv6 endpoints are not supported by this export.');
  if (!local && endpoint.protocol !== 'wss:') throw new Error('Remote servers require a secure wss:// address.');
  if (options.getToken !== undefined && typeof options.getToken !== 'function') throw new Error('Invalid guest credential provider.');
  const token = options.token.trim();
  if ((!token && !options.getToken) || token.length > 8192) throw new Error('Enter the access token supplied by your host.');
  if (token.startsWith('dev:') && !local) throw new Error('Development tokens are only allowed on a loopback server.');
  const field = (value: string, label: string, max: number) => {
    const text = value.trim();if (!text || new TextEncoder().encode(text).length > max) throw new Error(`Enter a valid ${label}.`);return text;
  };
  return { endpoint: endpoint.href, token, ...(options.getToken ? { getToken: options.getToken } : {}), ...(options.initialProfile !== undefined ? { initialProfile: readInitialProfile(options.initialProfile) } : {}), roomId: field(options.roomId, 'room ID', (roomType === 'tod-community' || roomType === 'tod-training') ? 64 : 96), matchId: field(options.matchId, 'match ID', 96), contentId: field(options.contentId, 'content ID', 128), role, roomType };
}
