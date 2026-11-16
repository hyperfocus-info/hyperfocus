import { isRecord } from '@hyperfocus/utilities/records';
import { readCombatConnection } from './input.ts';

export type CombatInvite = { endpoint: string; roomId: string; matchId: string; contentId: string; roomType?: 'combat-relay' | 'tod-community' | 'tod-training' };
const prefix = 'tod-room:1:';

function validate(invite: CombatInvite): CombatInvite {
  const { endpoint, roomId, matchId, contentId, roomType } = readCombatConnection({ ...invite, token: 'invite-validation' });
  if (new URL(endpoint).search) throw new Error('Invitations cannot include server query parameters. Ask your host for a credential-free server address.');
  return { endpoint, roomId, matchId, contentId, ...(roomType === 'tod-community' || roomType === 'tod-training' ? { roomType } : {}) };
}

/** Explicit allowlist: access credentials must never enter an invitation. */
export function createCombatInvite(options: CombatInvite): string {
  const code = prefix + encodeURIComponent(JSON.stringify(validate(options)));
  if (code.length > 4096) throw new Error('These room details are too long for an invitation.');
  return code;
}

export function readCombatInvite(options: { code: string; contentId: string }): CombatInvite {
  let code = options.code.trim();
  if (/^https?:\/\//i.test(code)) {
    const link = new URL(code);
    if (link.username || link.password || link.search) throw new Error('Use a room invitation without credentials or query parameters.');
    code = link.hash.slice(1);
  }
  if (code.length > 4096 || !code.startsWith(prefix)) throw new Error('Paste a supported Touch of Death room invitation.');
  let parsed: unknown;
  try { parsed = JSON.parse(decodeURIComponent(code.slice(prefix.length))); }
  catch { throw new Error('This invitation is incomplete or damaged. Ask your friend to copy it again.'); }
  if (!isRecord(parsed)) throw new Error('Invalid room invitation.');
  const fields = ['endpoint', 'roomId', 'matchId', 'contentId'];
  if (Object.keys(parsed).some(key => ![...fields, 'roomType'].includes(key)) || typeof parsed.endpoint !== 'string' || typeof parsed.roomId !== 'string' || typeof parsed.matchId !== 'string' || typeof parsed.contentId !== 'string'
    || (parsed.roomType !== undefined && parsed.roomType !== 'combat-relay' && parsed.roomType !== 'tod-community' && parsed.roomType !== 'tod-training')) throw new Error('Invalid room invitation fields.');
  const invite = validate({ endpoint: parsed.endpoint, roomId: parsed.roomId, matchId: parsed.matchId, contentId: parsed.contentId, ...(parsed.roomType === undefined ? {} : { roomType: parsed.roomType }) });
  if (invite.contentId !== options.contentId) throw new Error('This invitation uses a different game version. Both players need the same export.');
  return invite;
}
