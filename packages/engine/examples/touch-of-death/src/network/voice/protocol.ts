
export type VoicePeer = { playerId: string; userId: string; sessionId: string; mic: boolean };
export type VoiceIceServer = { urls: string[]; username: string; credential: string };
export type VoiceIceConfig = { iceServers: VoiceIceServer[]; iceTransportPolicy: 'all' | 'relay' };
export type VoiceSnapshot = VoiceIceConfig & { revision: number; sessionId: string; mic: boolean; peers: VoicePeer[]; requestId: string; error: string; reportingEnabled: boolean };
export type VoiceReportReason = 'harassment' | 'hate' | 'threats' | 'other';
export type VoiceReportCommand = { type: 'voice-report'; requestId: string; sessionId: string; targetPlayerId: string; targetSessionId: string; reason: VoiceReportReason };
export type VoiceReportResult = { type: 'voice-report-result'; requestId: string; error: string };
export type VoiceCommand = { type: 'voice-join'; requestId: string }
  | { type: 'voice-leave'; sessionId: string }
  | { type: 'voice-mic'; sessionId: string; requestId: string; enabled: boolean }
  | { type: 'voice-signal'; sessionId: string; targetPlayerId: string; targetSessionId: string; kind: 'offer' | 'answer' | 'ice'; data: string };
export type VoiceSignal = { type: 'voice-signal'; fromPlayerId: string; fromUserId: string; sessionId: string; targetSessionId: string; kind: 'offer' | 'answer' | 'ice'; data: string };
export const voiceSnapshotDefinition = { revision: 'u32', sessionId: 'string:128', mic: 'bool', requestId: 'string:128', error: 'string:512', reportingEnabled: 'bool',
  peers: { type: 'array', maxLength: 8, item: { playerId: 'string:128', userId: 'string:128', sessionId: 'string:128', mic: 'bool' } },
  iceServers: { type: 'array', maxLength: 4, item: { urls: { type: 'array', maxLength: 4, item: 'string:512' }, username: 'string:256', credential: 'string:512' } }, iceTransportPolicy: 'string:8',
} as const;
export function emptyVoiceSnapshot(): VoiceSnapshot { return { revision: 0, sessionId: '', mic: false, peers: [], requestId: '', error: '', iceServers: [], iceTransportPolicy: 'all', reportingEnabled: false }; }
const encoder = new TextEncoder();
function text(value: unknown, maximum: number, empty = false): value is string { return typeof value === 'string' && (empty || !!value.trim()) && encoder.encode(value).length <= maximum; }
function object(value: unknown, keys?: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !('value' in Object.getOwnPropertyDescriptor(value, key)!))
    || keys && Object.keys(value).sort().join() !== [...keys].sort().join()) throw new Error('Invalid voice fields.');
}
function session(value: unknown): asserts value is string { if (!text(value, 128)) throw new Error('Invalid voice session identity.'); }
export function readVoiceIceConfig(value: unknown = {}): VoiceIceConfig {
  object(value);if (Object.keys(value).some(key => key !== 'iceServers' && key !== 'iceTransportPolicy')) throw new Error('Invalid voice ICE configuration.');
  const raw = value.iceServers ?? [], policy = value.iceTransportPolicy ?? 'all';
  if (!Array.isArray(raw) || raw.length > 4 || policy !== 'all' && policy !== 'relay') throw new Error('Invalid voice ICE bounds or policy.');
  const iceServers = raw.map(value => {
    object(value);if (Object.keys(value).some(key => !['urls', 'username', 'credential'].includes(key)) || !Array.isArray(value.urls) || value.urls.length < 1 || value.urls.length > 4) throw new Error('Invalid voice ICE server.');
    const urls = value.urls.map(url => {
      if (!text(url, 512)) throw new Error('Invalid voice ICE URL.');
      const match = /^(stun|turn|turns):(?:\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+)(?::([0-9]{1,5}))?(?:\?transport=(udp|tcp))?$/.exec(url);
      if (!match || match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535)) throw new Error('Voice ICE requires a valid stun:, turn: or turns: URL.');return url;
    });
    const username = value.username ?? '', credential = value.credential ?? '';
    if (!text(username, 256, true) || !text(credential, 512, true) || /[\p{Cc}]/u.test(username + credential)) throw new Error('Invalid voice ICE credentials.');
    return { urls, username, credential };
  });
  if (policy === 'relay' && !iceServers.some(server => server.urls.some(url => /^turns?:/.test(url)))) throw new Error('Relay-only voice requires a TURN server.');
  return { iceServers, iceTransportPolicy: policy };
}
function signal(value: Record<string, unknown>): { kind: VoiceSignal['kind']; data: string } {
  if (value.kind !== 'offer' && value.kind !== 'answer' && value.kind !== 'ice' || !text(value.data, value.kind === 'ice' ? 2048 : 16384, value.kind === 'ice')) throw new Error('Invalid or oversized voice signal.');
  return { kind: value.kind, data: value.data };
}
export function readVoiceCommand(value: unknown): VoiceCommand {
  object(value);
  if (value.type === 'voice-join') { object(value, ['type', 'requestId']);session(value.requestId);return { type: value.type, requestId: value.requestId }; }
  session(value.sessionId);
  if (value.type === 'voice-leave') { object(value, ['type', 'sessionId']);return { type: value.type, sessionId: value.sessionId }; }
  if (value.type === 'voice-mic') {
    object(value, ['type', 'sessionId', 'requestId', 'enabled']);session(value.requestId);if (typeof value.enabled !== 'boolean') throw new Error('Invalid microphone state.');
    return { type: value.type, sessionId: value.sessionId, requestId: value.requestId, enabled: value.enabled };
  }
  object(value, ['type', 'sessionId', 'targetPlayerId', 'targetSessionId', 'kind', 'data']);
  if (value.type !== 'voice-signal') throw new Error('Invalid voice action.');session(value.targetPlayerId);session(value.targetSessionId);
  return { type: value.type, sessionId: value.sessionId, targetPlayerId: value.targetPlayerId, targetSessionId: value.targetSessionId, ...signal(value) };
}
export function readVoiceSignal(value: unknown): VoiceSignal {
  object(value, ['type', 'fromPlayerId', 'fromUserId', 'sessionId', 'targetSessionId', 'kind', 'data']);
  if (value.type !== 'voice-signal') throw new Error('Invalid private voice signal.');
  session(value.fromPlayerId);session(value.fromUserId);session(value.sessionId);session(value.targetSessionId);
  return { type: value.type, fromPlayerId: value.fromPlayerId, fromUserId: value.fromUserId, sessionId: value.sessionId, targetSessionId: value.targetSessionId, ...signal(value) };
}
export function readVoiceReportCommand(value: unknown): VoiceReportCommand {
  object(value, ['type', 'requestId', 'sessionId', 'targetPlayerId', 'targetSessionId', 'reason']);
  if (value.type !== 'voice-report' || value.reason !== 'harassment' && value.reason !== 'hate' && value.reason !== 'threats' && value.reason !== 'other') throw new Error('Invalid voice report.');
  session(value.requestId);session(value.sessionId);session(value.targetPlayerId);session(value.targetSessionId);
  return { type: value.type, requestId: value.requestId, sessionId: value.sessionId, targetPlayerId: value.targetPlayerId, targetSessionId: value.targetSessionId, reason: value.reason };
}
export function readVoiceReportResult(value: unknown): VoiceReportResult {
  object(value, ['type', 'requestId', 'error']);session(value.requestId);
  if (value.type !== 'voice-report-result' || !text(value.error, 512, true)) throw new Error('Invalid voice report receipt.');
  return { type: value.type, requestId: value.requestId, error: value.error };
}
export function readVoiceSnapshot(value: unknown): VoiceSnapshot {
  object(value, ['revision', 'sessionId', 'mic', 'peers', 'requestId', 'error', 'iceServers', 'iceTransportPolicy', 'reportingEnabled']);
  if (typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0 || value.revision > 0xffffffff || !text(value.sessionId, 128, true)
    || typeof value.reportingEnabled !== 'boolean' || typeof value.mic !== 'boolean' || !text(value.requestId, 128, true) || !text(value.error, 512, true) || !Array.isArray(value.peers) || value.peers.length > 8) throw new Error('Invalid voice metadata.');
  const peers = value.peers.map(value => { object(value, ['playerId', 'userId', 'sessionId', 'mic']);session(value.playerId);session(value.userId);session(value.sessionId);
    if (typeof value.mic !== 'boolean') throw new Error('Invalid voice peer state.');return { playerId: value.playerId, userId: value.userId, sessionId: value.sessionId, mic: value.mic }; });
  if (new Set(peers.map(peer => peer.playerId)).size !== peers.length || new Set(peers.map(peer => peer.userId)).size !== peers.length || new Set(peers.map(peer => peer.sessionId)).size !== peers.length
    || (value.sessionId ? !peers.some(peer => peer.sessionId === value.sessionId && peer.mic === value.mic) : peers.length > 0 || value.mic)) throw new Error('Inconsistent voice membership.');
  const ice = readVoiceIceConfig({ iceServers: value.iceServers, iceTransportPolicy: value.iceTransportPolicy });
  if (!value.sessionId && (ice.iceServers.length || ice.iceTransportPolicy !== 'all')) throw new Error('Voice credentials require opted-in membership.');
  return { revision: value.revision, sessionId: value.sessionId, mic: value.mic, peers, requestId: value.requestId, error: value.error, reportingEnabled: value.reportingEnabled, ...ice };
}
