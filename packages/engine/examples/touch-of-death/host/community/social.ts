import { readSocialCommand, type SocialSnapshot } from '../../src/network/social-protocol.ts';
import type { DurableChatMessage, DurableMmoServices } from '@hyperfocus/engine/server';
import type { PersistenceAdapter } from '@hyperfocus/engine/server';
import { communityId, communityRoomId, communityTime } from './validation.ts';
import { readSocialRecord, type SocialRecord } from './social-record.ts';

/** One host owner shared across rooms. Never accepts a client-supplied sender identity.
 * Keeps 64 send/edit receipts per person; retries beyond that window still use
 * engine message idempotency but may reserve a new rate slot. Reports are capped,
 * never evicted, and written atomically with immutable evidence in the user record.
 * Configure injected chat services for 32 retained messages and 280 characters.
 */
export function createRoomSocialService(options: {
  services: Pick<DurableMmoServices, 'chat'>; persistence: Pick<PersistenceAdapter, 'loadPlayer' | 'savePlayer'>; now?: () => number;
}) {
  const people = new Map<string, SocialRecord>(), rooms = new Map<string, DurableChatMessage[]>(), joined = new Map<string, Set<string>>();
  const feedback = new Map<string, Pick<SocialSnapshot, 'requestId' | 'error' | 'notice'>>();
  let tail = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>) { const result = tail.then(operation);tail = result.then(() => undefined, () => undefined);return result; }
  function identity(roomId: string, userId: string) { communityRoomId(roomId);communityId(userId); }
  async function load(userId: string) {
    if (!people.has(userId)) {
      if (people.size >= 4096) throw new Error('Social user cache is full.');
      people.set(userId, readSocialRecord(await options.persistence.loadPlayer(`tod-social:${userId}`), userId));
    }
    return people.get(userId)!;
  }
  async function save(userId: string, value: SocialRecord) {
    const valid = readSocialRecord(value, userId);
    await options.persistence.savePlayer(`tod-social:${userId}`, valid);people.set(userId, valid);
  }
  function view({ roomId, userId }: { roomId: string; userId: string }): SocialSnapshot {
    identity(roomId, userId);const person = people.get(userId);
    if (!person || !joined.get(roomId)?.has(userId)) throw new Error('Join this room before using chat.');
    const messages = (rooms.get(roomId) ?? []).filter(message => !person.muted.includes(message.senderId) && !person.blocked.includes(message.senderId)
      && !people.get(message.senderId)?.blocked.includes(userId)).map(({ id, senderId, text, createdAt }) => ({ id, senderId, text, createdAt }));
    return structuredClone({ messages, muted: person.muted, blocked: person.blocked, reported: person.reports.map(report => report.messageId),
      ...(feedback.get(userId) ?? { requestId: '', error: '', notice: '' }) });
  }
  return {
    join({ roomId, userId }: { roomId: string; userId: string }) {
      identity(roomId, userId);
      return serialize(async () => {
        if (!rooms.has(roomId) && rooms.size >= 128) throw new Error('Social room cache is full.');
        await load(userId);
        const history = (await options.services.chat.history(`tod-chat:${roomId}`, { limit: 32 })).items;
        for (const message of history) await load(message.senderId);
        rooms.set(roomId, history.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)));
        const members = joined.get(roomId) ?? new Set<string>();members.add(userId);joined.set(roomId, members);
        return view({ roomId, userId });
      });
    },
    leave({ roomId, userId }: { roomId: string; userId: string }) {
      identity(roomId, userId);
      return serialize(async () => {
        const members = joined.get(roomId);members?.delete(userId);
        if (!members?.size) { joined.delete(roomId);rooms.delete(roomId); }
        if (![...joined.values()].some(value => value.has(userId))) feedback.delete(userId);
      });
    },
    dispose({ roomId }: { roomId: string }) {
      communityRoomId(roomId);
      return serialize(async () => {
        const members = joined.get(roomId);joined.delete(roomId);rooms.delete(roomId);
        for (const userId of members ?? []) if (![...joined.values()].some(value => value.has(userId))) feedback.delete(userId);
      });
    },
    handle({ roomId, userId, command: raw }: { roomId: string; userId: string; command: unknown }) {
      identity(roomId, userId);const command = readSocialCommand(raw);
      return serialize(async () => {
        if (!joined.get(roomId)?.has(userId)) throw new Error('Join this room before using chat.');
        let problem = '';
        try {
          const before = await load(userId), next = structuredClone(before), now = (options.now ?? Date.now)();communityTime(now);
          const fail = (message: string): never => { problem = message;throw new Error(message); };
          const send = before.sends.find(value => value.requestId === command.requestId), report = before.reports.find(value => value.requestId === command.requestId), edit = before.edits.find(value => value.requestId === command.requestId);
          if (command.type === 'social-send') {
            if (report || edit || send && (send.roomId !== roomId || send.text !== command.text)) fail('That request ID was already used for another action.');
            if (!send) {
              if (before.sends.filter(value => value.at > now - 10000).length >= 4) fail('Chat is moving too quickly. Wait a few seconds and try again.');
              // Reservation commits first. Uncertain sends retain one rate slot; the same request can retry immediately.
              next.sends.push({ requestId: command.requestId, roomId, text: command.text, at: now });next.sends = next.sends.slice(-64);await save(userId, next);
            }
            const message = await options.services.chat.send(`tod-chat:${roomId}`, userId, command.text, command.requestId);
            const history = [...(rooms.get(roomId) ?? []).filter(value => value.id !== message.id), message];
            history.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));rooms.set(roomId, history.slice(-32));
          } else if (command.type === 'social-report') {
            if (send || edit || report && (report.roomId !== roomId || report.messageId !== command.messageId || report.reason !== command.reason)) fail('That request ID was already used for another action.');
            const previous = before.reports.find(value => value.messageId === command.messageId);
            if (previous) {
              if (previous.roomId !== roomId || previous.reason !== command.reason) fail('This message already has a saved report.');
            } else {
              if (before.reports.length >= 64) fail('Your saved report limit has been reached.');
              const message = rooms.get(roomId)?.find(value => value.id === command.messageId);
              if (!message || message.senderId === userId) fail('Select a retained message from another person to report.');
              next.reports.push({ requestId: command.requestId, roomId, messageId: message!.id, senderId: message!.senderId, reporterId: userId,
                text: message!.text, createdAt: message!.createdAt, reportedAt: now, reason: command.reason });await save(userId, next);
            }
          } else {
            const fingerprint = JSON.stringify({ type: command.type, targetId: command.targetId, enabled: command.enabled });
            if (send || report || edit && edit.fingerprint !== fingerprint) fail('That request ID was already used for another action.');
            if (!edit) {
              communityId(command.targetId);if (command.targetId === userId) fail('Choose another person.');await load(command.targetId);
              const field = command.type === 'social-mute' ? 'muted' : 'blocked';
              next[field] = next[field].filter(id => id !== command.targetId);
              if (command.enabled) { if (next[field].length >= 64) fail('Your communication preference limit has been reached.');next[field].push(command.targetId); }
              next.edits.push({ requestId: command.requestId, fingerprint });next.edits = next.edits.slice(-64);await save(userId, next);
            }
          }
          feedback.set(userId, { requestId: command.requestId, error: '', notice: command.type === 'social-report' ? 'Report saved on this host. It has not been reviewed.' : command.type === 'social-send' ? 'Message sent.' : 'Communication preference saved.' });
        } catch (cause) {
          const moderated = cause instanceof Error && cause.message.includes('banned or muted');
          feedback.set(userId, { requestId: command.requestId, error: problem || (moderated ? 'Chat is unavailable because this account is muted.' : 'Could not save that action. Try again with the same request.'), notice: '' });
        }
        return view({ roomId, userId });
      });
    },
    view,
    /** Loaded authenticated room members only. Local mute is not a bilateral block. */
    allowCommunication({ roomId, userId, otherUserId }: { roomId: string; userId: string; otherUserId: string }): boolean {
      identity(roomId, userId);communityId(otherUserId);
      const first = people.get(userId), second = people.get(otherUserId), members = joined.get(roomId);
      return !!first && !!second && !!members?.has(userId) && members.has(otherUserId)
        && !first.blocked.includes(otherUserId) && !second.blocked.includes(userId);
    },
  };
}
