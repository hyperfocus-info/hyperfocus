import { defineSchema } from '@hyperfocus/engine/protocol';
import { combatRoomSnapshotDefinition, type CombatRoomSnapshot } from '@hyperfocus/engine/combat/net';
import { isObject } from '@hyperfocus/utilities/records';

export const profileIcons = ['fist', 'spark', 'wave', 'leaf', 'star', 'moon'] as const;
export type PublicProfile = { userId: string; name: string; icon: string; revision: number; selections: Record<string, string> };
export type ProfileCommand = { type: 'profile-save'; requestId: string; expectedRevision: number; name: string; icon: string; selections: Record<string, string> };
export const publicProfileDefinition = {
  userId: 'string:128', name: 'string:96', icon: 'string:16', revision: 'u32',
  selections: { type: 'map', key: 'string', value: 'string:64', maxEntries: 24 },
} as const;
export const profilesDefinition = { type: 'array', item: publicProfileDefinition, maxLength: 32 } as const;
export const profileProtocolVersion = 5;
export type ProfileMetadata = { roomImages: { enabled: boolean; blockedUserIds: string[]; error: string }; profiles: PublicProfile[]; profileBindings: Array<{ playerId: string; userId: string }>; profileResult: { requestId: string; error: string } };
export const profileMetadataDefinition = { profiles: profilesDefinition,
  profileBindings: { type: 'array', maxLength: 32, item: { playerId: 'string:128', userId: 'string:128' } },
  profileResult: { requestId: 'string:128', error: 'string:512' },
  roomImages: { error: 'string:512', enabled: 'bool', blockedUserIds: { type: 'array', item: 'string:128', maxLength: 64 } },
} as const;
export const profileCombatSnapshotSchema = defineSchema<CombatRoomSnapshot & ProfileMetadata>({
  ...combatRoomSnapshotDefinition, ...profileMetadataDefinition,
});
export function emptyProfileMetadata(): ProfileMetadata { return { roomImages: { enabled: false, blockedUserIds: [], error: '' }, profiles: [], profileBindings: [], profileResult: { requestId: '', error: '' } }; }
export function readProfileMetadata(value: unknown): ProfileMetadata {
  if (!isObject(value)) throw new Error('Invalid profile metadata.');
  const raw = value;
  const roomImages: ProfileMetadata['roomImages'] = { enabled: false, blockedUserIds: [], error: '' };
  if ('roomImages' in raw) {
    profileObject(raw.roomImages, ['enabled', 'blockedUserIds', 'error']);
    if (typeof raw.roomImages.error !== 'string' || encoder.encode(raw.roomImages.error).length > 512) throw new Error('Invalid room image error.');roomImages.error = raw.roomImages.error;
    if (typeof raw.roomImages.enabled !== 'boolean' || !Array.isArray(raw.roomImages.blockedUserIds) || raw.roomImages.blockedUserIds.length > 64) throw new Error('Invalid room image capability.');
    const ids = raw.roomImages.blockedUserIds.map(value => { profileId(value);return value; });
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate image block identity.');roomImages.enabled = raw.roomImages.enabled;roomImages.blockedUserIds = ids;
  }
  if (!('profiles' in raw) && !('profileBindings' in raw) && !('profileResult' in raw)) return { ...emptyProfileMetadata(), roomImages };
  const profiles = readProfiles(raw.profiles);
  if (!Array.isArray(raw.profileBindings) || raw.profileBindings.length > 32) throw new Error('Invalid profile bindings.');
  const profileBindings = raw.profileBindings.map(value => {
    profileObject(value, ['playerId', 'userId']);profileId(value.playerId);profileId(value.userId);
    if (!profiles.some(profile => profile.userId === value.userId)) throw new Error('Profile binding has no profile.');
    return { playerId: value.playerId, userId: value.userId };
  });
  if (new Set(profileBindings.map(binding => binding.playerId)).size !== profileBindings.length) throw new Error('Duplicate profile binding.');
  profileObject(raw.profileResult, ['requestId', 'error']);
  const { requestId, error } = raw.profileResult;
  if (typeof requestId !== 'string' || encoder.encode(requestId).length > 128 || typeof error !== 'string' || encoder.encode(error).length > 512) throw new Error('Invalid profile receipt.');
  return { roomImages, profiles, profileBindings, profileResult: { requestId, error } };
}
const encoder = new TextEncoder();
export function profileObject(value: unknown, keys?: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).some(key => typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)
      || !Object.getOwnPropertyDescriptor(value, key)?.enumerable || !('value' in Object.getOwnPropertyDescriptor(value, key)!))
    || (keys && Object.keys(value).sort().join() !== [...keys].sort().join())) throw new Error('Invalid profile fields.');
}
export function profileId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || encoder.encode(value).length > 128 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) throw new Error('Invalid profile identity.');
}
function revision(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new Error('Invalid profile revision.');
}
function name(value: unknown): string {
  if (typeof value !== 'string' || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) throw new Error('Names cannot contain control characters.');
  const result = value.trim().normalize('NFC');
  if (!result || [...result].length > 24) throw new Error('Choose a name of 1–24 characters.');
  return result;
}
function appearance(value: Record<string, unknown>) {
  const icon = profileIcons.find(icon => icon === value.icon);
  if (icon === undefined) throw new Error('Choose an available profile icon.');
  profileObject(value.selections);
  if (Object.keys(value.selections).length > 24) throw new Error('Too many appearance selections.');
  const selections: Record<string, string> = {};
  for (const key of Object.keys(value.selections).sort()) {
    const selected = value.selections[key];
    if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,63}$/.test(key) || typeof selected !== 'string'
      || !/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,63}$/.test(selected)) throw new Error('Invalid appearance selection.');
    selections[key] = selected;
  }
  return { name: name(value.name), icon, selections };
}
export function readInitialProfile(value: unknown): Pick<PublicProfile, 'name' | 'icon' | 'selections'> {
  profileObject(value, ['name', 'icon', 'selections']);
  return appearance(value);
}
export function readProfileCommand(value: unknown): ProfileCommand {
  profileObject(value, ['type', 'requestId', 'expectedRevision', 'name', 'icon', 'selections']);
  if (value.type !== 'profile-save') throw new Error('Invalid profile command.');
  profileId(value.requestId);revision(value.expectedRevision);
  return { type: 'profile-save', requestId: value.requestId, expectedRevision: value.expectedRevision, ...appearance(value) };
}
export function readPublicProfile(value: unknown): PublicProfile {
  profileObject(value, ['userId', 'name', 'icon', 'revision', 'selections']);
  profileId(value.userId);revision(value.revision);
  const look = appearance(value);
  if (look.name !== value.name) throw new Error('Profile name is not normalized.');
  return { userId: value.userId, revision: value.revision, ...look };
}
export function readProfiles(value: unknown): PublicProfile[] {
  if (!Array.isArray(value) || value.length > 32) throw new Error('Invalid profile list.');
  const profiles = value.map(readPublicProfile);
  if (new Set(profiles.map(profile => profile.userId)).size !== profiles.length) throw new Error('Duplicate profile identity.');
  return profiles;
}
