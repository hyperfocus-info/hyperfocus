
import { isRecord as object } from '@hyperfocus/utilities/records';

export type SocialSnapshot = {
  messages: Array<{ id: string; senderId: string; text: string; createdAt: number }>;
  muted: string[]; blocked: string[]; reported: string[]; requestId: string; error: string; notice: string;
};
export type SocialReportReason = 'harassment' | 'spam' | 'inappropriate' | 'other';
export type SocialCommand = { type: 'social-send'; requestId: string; text: string }
  | { type: 'social-mute' | 'social-block'; requestId: string; targetId: string; enabled: boolean }
  | { type: 'social-report'; requestId: string; messageId: string; reason: SocialReportReason };

const identifiers = { type: 'array', item: 'string:128', maxLength: 64 } as const;
/** Nested in the owning room schema; chat does not introduce a separate transport. */
export const socialSnapshotDefinition = {
  messages: { type: 'array', maxLength: 32, item: { id: 'string:128', senderId: 'string:128', text: 'string:512', createdAt: 'f64' } },
  muted: identifiers, blocked: identifiers, reported: identifiers, requestId: 'string:128', error: 'string:512', notice: 'string:512',
} as const;

export function emptySocialSnapshot(): SocialSnapshot {
  return { messages: [], muted: [], blocked: [], reported: [], requestId: '', error: '', notice: '' };
}
const encoder = new TextEncoder();
function text(value: unknown, bytes: number, empty = false): value is string {
  return typeof value === 'string' && (empty || value.trim().length > 0) && encoder.encode(value).length <= bytes;
}
function messageText(value: unknown): value is string { return text(value, 512) && value.length <= 280; }
function idList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 64 && value.every(id => text(id, 128)) && new Set(value).size === value.length;
}

/** Accepts user intent, never client-supplied authorship, timestamps or room outcomes. */
export function readSocialCommand(value: unknown): SocialCommand {
  if (!object(value) || !text(value.requestId, 128)) throw new Error('Invalid social command request.');
  const keys = Object.keys(value).sort().join(','), requestId = value.requestId;
  if (value.type === 'social-send' && keys === 'requestId,text,type' && typeof value.text === 'string') {
    const trimmed = value.text.trim();
    if (messageText(trimmed)) return { type: value.type, requestId, text: trimmed };
  }
  if ((value.type === 'social-mute' || value.type === 'social-block') && keys === 'enabled,requestId,targetId,type'
    && text(value.targetId, 128) && typeof value.enabled === 'boolean') return { type: value.type, requestId, targetId: value.targetId, enabled: value.enabled };
  if (value.type === 'social-report' && keys === 'messageId,reason,requestId,type' && text(value.messageId, 128)
    && (value.reason === 'harassment' || value.reason === 'spam' || value.reason === 'inappropriate' || value.reason === 'other')) {
    return { type: value.type, requestId, messageId: value.messageId, reason: value.reason };
  }
  throw new Error('Invalid social command.');
}

export function readSocialSnapshot(value: unknown): SocialSnapshot {
  if (!object(value) || !Array.isArray(value.messages) || value.messages.length > 32
    || !idList(value.muted) || !idList(value.blocked) || !idList(value.reported)
    || !text(value.requestId, 128, true) || !text(value.error, 512, true) || !text(value.notice, 512, true)) throw new Error('Invalid social snapshot.');
  const messages = value.messages.map(message => {
    if (!object(message) || !text(message.id, 128) || !text(message.senderId, 128) || !messageText(message.text)
      || typeof message.createdAt !== 'number' || !Number.isFinite(message.createdAt) || message.createdAt < 0) throw new Error('Invalid social snapshot.');
    return { id: message.id, senderId: message.senderId, text: message.text, createdAt: message.createdAt };
  });
  if (new Set(messages.map(message => message.id)).size !== messages.length) throw new Error('Duplicate social message identity.');
  return { messages: messages.map(({ id, senderId, text, createdAt }) => ({ id, senderId, text, createdAt })),
    muted: [...value.muted], blocked: [...value.blocked], reported: [...value.reported], requestId: value.requestId, error: value.error, notice: value.notice };
}
