import { expect, test } from 'bun:test';
import { defineSchema, encodeSnapshot, decodeSnapshot, encodeDelta } from '@hyperfocus/engine/protocol';
import { emptyVoiceSnapshot, readVoiceCommand, readVoiceReportCommand, readVoiceReportResult, readVoiceSignal, readVoiceSnapshot, readVoiceIceConfig, voiceSnapshotDefinition, type VoiceSnapshot } from './protocol.ts';

test('voice incident controls carry only bounded session evidence and separate receipts', () => {
  const command = { type: 'voice-report', requestId: 'r', sessionId: 's', targetPlayerId: 'p', targetSessionId: 't', reason: 'harassment' } as const;
  expect(readVoiceReportCommand(command)).toEqual(command);
  for (const value of [{ ...command, audio: 'forbidden' }, { ...command, reporterId: 'spoof' }, { ...command, reason: 'unknown' }, { ...command, requestId: 'x'.repeat(129) }]) expect(() => readVoiceReportCommand(value)).toThrow();
  expect(() => readVoiceCommand(command)).toThrow();
  expect(readVoiceReportResult({ type: 'voice-report-result', requestId: 'r', error: '' }).error).toBe('');
  expect(() => readVoiceReportResult({ type: 'voice-report-result', requestId: 'r', error: 'x'.repeat(513) })).toThrow();
  expect(emptyVoiceSnapshot().reportingEnabled).toBe(false);
  expect(() => readVoiceSnapshot({ ...emptyVoiceSnapshot(), reportingEnabled: 'true' })).toThrow();
});

test('voice admits only bounded signaling and explicit microphone intent', () => {
  const command = { type: 'voice-signal', sessionId: 's', targetPlayerId: 'p', targetSessionId: 't', kind: 'offer', data: 'x'.repeat(16384) };
  expect(readVoiceCommand(command).type).toBe('voice-signal');
  expect(readVoiceCommand({ type: 'voice-mic', sessionId: 's', requestId: 'mic', enabled: true })).toMatchObject({ requestId: 'mic' });
  for (const invalid of [{ ...command, data: 'x'.repeat(16385) }, { ...command, kind: 'ice', data: 'x'.repeat(2049) }, { ...command, fromUserId: 'spoof' }, { ...command, targetSessionId: '' },
    { type: 'voice-join', requestId: 'x'.repeat(129) }, { type: 'voice-mic', sessionId: 's', enabled: true }]) expect(() => readVoiceCommand(invalid)).toThrow();
  expect(readVoiceSignal({ type: 'voice-signal', fromPlayerId: 'p', fromUserId: 'u', sessionId: 's', targetSessionId: 't', kind: 'ice', data: '' }).data).toBe('');
});
test('portable ICE configuration validates schemes, limits and relay-only requirements', () => {
  expect(readVoiceIceConfig()).toEqual({ iceServers: [], iceTransportPolicy: 'all' });
  expect(readVoiceIceConfig({ iceServers: [{ urls: ['turn:localhost:3478'] }], iceTransportPolicy: 'relay' }).iceServers[0]?.credential).toBe('');
  for (const invalid of [{ iceTransportPolicy: 'relay' }, { iceServers: [{ urls: ['https://example.com'] }] }, { iceServers: [{ urls: ['turn:host:99999'] }] },
    { iceServers: [{ urls: ['turn:user:pass@host'] }] }, { iceServers: [{ urls: ['stun:host'], credential: 'x'.repeat(513) }] }, { iceServers: Array.from({ length: 5 }, () => ({ urls: ['stun:host'] })) }]) expect(() => readVoiceIceConfig(invalid)).toThrow();
});
test('voice metadata roundtrips as bounded binary and rejects contradictory membership', () => {
  const schema = defineSchema<{ voice: VoiceSnapshot }>({ voice: voiceSnapshotDefinition });
  const value = { voice: emptyVoiceSnapshot() };expect(decodeSnapshot(schema, encodeSnapshot(schema, value))).toEqual(value);
  expect(encodeDelta(schema, value, value).byteLength).toBe(3);
  expect(() => readVoiceSnapshot({ ...value.voice, mic: true })).toThrow();
  expect(() => readVoiceSnapshot({ ...value.voice, iceServers: [{ urls: ['turn:host'], username: 'u', credential: 'c' }] })).toThrow();
  expect(() => readVoiceSnapshot({ ...value.voice, sessionId: 's', peers: [] })).toThrow();
});
