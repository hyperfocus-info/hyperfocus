import { expect, test } from 'bun:test';
import { readProfileMetadata, emptyProfileMetadata, profileCombatSnapshotSchema } from './profile.ts';
import { defineSchema, encodeSnapshot, decodeSnapshot, encodeDelta } from '@hyperfocus/engine/protocol';
import { readProfileCommand, readInitialProfile, readProfiles, profilesDefinition } from './profile.ts';

const command = { type: 'profile-save', requestId: 'one', expectedRevision: 0, name: ' Player ', icon: 'fist', selections: { outfit: 'blue' } };

test('first-visit appearance validates only public look fields and detaches selections', () => {
  const input = { name: ' New fighter ', icon: 'star', selections: { outfit: 'blue' } };
  const look = readInitialProfile(input);
  expect(look.name).toBe('New fighter');input.selections.outfit = 'red';expect(look.selections.outfit).toBe('blue');
  for (const value of [{ ...input, userId: 'other' }, { ...input, revision: 99 }, { ...input, name: '\nBad' }, { ...input, icon: 'unknown' }, { ...input, selections: { outfit: '<script>' } }, null]) expect(() => readInitialProfile(value)).toThrow();
});
test('profile names normalize Unicode and strict intents reject spoofing and hostile objects', () => {
  expect(readProfileCommand({ ...command, name: '  Jose\u0301 ' }).name).toBe('José');
  expect([...readProfileCommand({ ...command, name: '😀'.repeat(24) }).name]).toHaveLength(24);
  for (const invalid of [{ ...command, userId: 'other' }, { ...command, rating: 9999 }, { ...command, name: '\u202Ename' },
    { ...command, name: 'a\nb' }, { ...command, name: '\ud800' }, { ...command, name: '😀'.repeat(25) }, { ...command, name: '  ' },
    { ...command, icon: 'url' }, { ...command, expectedRevision: -1 }, { ...command, selections: JSON.parse('{"__proto__":"bad"}') },
    { ...command, selections: Object.create({ outfit: 'red' }) }, { ...command, selections: { constructor: 'red' } },
    { ...command, selections: Object.fromEntries(Array.from({ length: 25 }, (_, n) => [`s${n}`, 'red'])) },
    { ...command, selections: { outfit: 'x'.repeat(65) } }, Object.assign(Object.create({ userId: 'spoof' }), command)]) {
    expect(() => readProfileCommand(invalid)).toThrow();
  }
  const getter = { ...command };Object.defineProperty(getter, 'name', { enumerable: true, get() { throw new Error('must not execute'); } });
  expect(() => readProfileCommand(getter)).toThrow('Invalid profile fields');
});
test('bounded profiles survive binary roundtrip and unchanged metadata adds no delta payload', () => {
  const schema = defineSchema<{ profiles: ReturnType<typeof readProfiles> }>({ profiles: profilesDefinition });
  const value = { profiles: [{ userId: 'alice', name: 'Player', icon: 'moon', revision: 1, selections: { outfit: 'blue' } }] };
  const bytes = encodeSnapshot(schema, value);
  expect(readProfiles(decodeSnapshot(schema, bytes).profiles)).toEqual(value.profiles);
  const complete = { profiles: [{ ...value.profiles[0]!, selections: Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`slot${index}`, 'classic'])) }] };
  expect(readProfiles(decodeSnapshot(schema, encodeSnapshot(schema, complete)).profiles)).toEqual(complete.profiles);
  const legacy = defineSchema<{ profiles: ReturnType<typeof readProfiles> }>({ profiles: { ...profilesDefinition, item: { ...profilesDefinition.item, selections: { ...profilesDefinition.item.selections, maxEntries: 16 } } } });
  expect(() => decodeSnapshot(legacy, encodeSnapshot(schema, complete))).toThrow('max entries');
  const empty = defineSchema<{ profiles: ReturnType<typeof readProfiles> }>({ profiles: profilesDefinition });
  expect(encodeDelta(schema, value, value).byteLength).toBe(encodeDelta(empty, { profiles: [] }, { profiles: [] }).byteLength);
  expect(() => readProfiles([...value.profiles, ...value.profiles])).toThrow();
  expect(() => readProfiles(Array.from({ length: 33 }, (_, n) => ({ ...value.profiles[0], userId: `${n}` })))).toThrow();
});
test('room image capability defaults only when absent, validates bounds and roundtrips binary metadata', () => {
  expect(readProfileMetadata({}).roomImages).toEqual({ enabled: false, blockedUserIds: [], error: '' });
  const roomImages = { enabled: true, blockedUserIds: ['bob'], error: 'Retry' };
  expect(readProfileMetadata({ ...emptyProfileMetadata(), roomImages }).roomImages).toEqual(roomImages);
  for (const bad of [null, {}, { ...roomImages, enabled: 'yes' }, { ...roomImages, blockedUserIds: ['bob', 'bob'] }, { ...roomImages, blockedUserIds: Array.from({ length: 65 }, (_, n) => `u${n}`) }, { ...roomImages, error: 'x'.repeat(513) }]) expect(() => readProfileMetadata({ roomImages: bad })).toThrow();
  const snapshot = { ...emptyProfileMetadata(), roomImages, matchId: 'm', contentId: 'c', seed: 7, status: 'waiting' as const, seats: [], confirmedFrame: -1, frames: {} };
  expect(decodeSnapshot(profileCombatSnapshotSchema, encodeSnapshot(profileCombatSnapshotSchema, snapshot))).toEqual(snapshot);
});
