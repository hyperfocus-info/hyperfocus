import type { PersistenceAdapter } from '@hyperfocus/engine/server';
import { readAppearanceCatalog3D, resolveAppearance3D, type AppearanceCatalog3D } from '@hyperfocus/engine/project/runtime-3d';
import { profileId, profileObject, readInitialProfile, readProfileCommand, readPublicProfile, type ProfileCommand, type PublicProfile } from '../../src/appearance/profile.ts';
import { canEquipRewardOption, type RewardItem } from '../../src/rewards/model.ts';

type Receipt = { command: ProfileCommand; profile: PublicProfile };
type RecordData = { version: 1; profile: PublicProfile; receipts: Receipt[] };

/** One shared host owner. This never changes project data, fighter identity or combat state. */
export function createProfileService(options: {
  persistence: Pick<PersistenceAdapter, 'loadPlayer' | 'savePlayer'>;
  catalog: AppearanceCatalog3D;
  rewards?: { read(options: { userId: string }): { collection: RewardItem[] } | Promise<{ collection: RewardItem[] }> };
}) {
  const parsed = readAppearanceCatalog3D(options.catalog);
  if (!parsed) throw new Error('Profile service requires an appearance catalog.');
  const catalog: AppearanceCatalog3D = parsed;
  // Verify catalog identifiers also fit this application's bounded wire contract.
  for (const slot of catalog.slots) for (const option of slot.options) readPublicProfile({ userId: 'catalog', name: 'Player', icon: 'fist', revision: 0, selections: { [slot.id]: option.id } });
  if (catalog.slots.length > 24) throw new Error('Profiles support at most 24 appearance slots.');
  let lane: Promise<unknown> = Promise.resolve();
  function serial<T>(run: () => Promise<T>): Promise<T> {
    const task = lane.then(run);lane = task.catch(() => undefined);return task;
  }
  function validate(profile: PublicProfile, userId: string) {
    if (profile.userId !== userId) throw new Error('Stored profile identity mismatch.');
    resolveAppearance3D({ catalog, actorId: catalog.actors[0]!.entityId, selections: profile.selections });
  }
  async function load(userId: string): Promise<RecordData> {
    const raw = await options.persistence.loadPlayer(`tod-profile:${userId}`);
    if (raw === null) {
      const guest = /^guest:([0-9a-f]{8})-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.exec(userId);
      const name = guest ? `Guest ${guest[1]!.toUpperCase()}` : 'Player';
      return { version: 1, profile: { userId, name, icon: 'fist', revision: 0, selections: {} }, receipts: [] };
    }
    profileObject(raw, ['version', 'profile', 'receipts']);
    if (raw.version !== 1 || !Array.isArray(raw.receipts) || raw.receipts.length > 64) throw new Error('Invalid stored profile record.');
    const profile = readPublicProfile(raw.profile);validate(profile, userId);
    const seen = new Set<string>();
    const receipts = raw.receipts.map(value => {
      profileObject(value, ['command', 'profile']);
      const command = readProfileCommand(value.command), saved = readPublicProfile(value.profile);validate(saved, userId);
      if (seen.has(command.requestId) || saved.revision !== command.expectedRevision + 1 || saved.revision > profile.revision
        || saved.name !== command.name || saved.icon !== command.icon || JSON.stringify(saved.selections) !== JSON.stringify(command.selections)) throw new Error('Invalid stored profile receipt.');
      seen.add(command.requestId);return { command, profile: saved };
    });
    return { version: 1, profile, receipts };
  }
  return {
    initialize({ userId, appearance }: { userId: string; appearance: unknown }): Promise<PublicProfile> {
      profileId(userId);const initial = readInitialProfile(appearance);
      const profile: PublicProfile = { ...initial, userId, revision: 1 };validate(profile, userId);
      return serial(async () => {
        const record = await load(userId);
        if (record.profile.revision >= 1) return structuredClone(record.profile);
        const collection = (await options.rewards?.read({ userId }))?.collection ?? [];
        // Device collection does not grant host ownership. New account profiles
        // keep identity choices and use starter equipment until earned here.
        for (const slot of catalog.slots) {
          const selected = profile.selections[slot.id];
          if (selected && !canEquipRewardOption(slot.id, selected, collection)) profile.selections[slot.id] = slot.defaultOptionId;
        }
        await options.persistence.savePlayer(`tod-profile:${userId}`, structuredClone({ ...record, profile }));
        return structuredClone(profile);
      });
    },
    read({ userId }: { userId: string }): Promise<PublicProfile> {
      profileId(userId);return serial(async () => structuredClone((await load(userId)).profile));
    },
    save({ userId, command: raw }: { userId: string; command: unknown }): Promise<PublicProfile> {
      profileId(userId);const command = readProfileCommand(raw);
      return serial(async () => {
        const record = await load(userId), prior = record.receipts.find(receipt => receipt.command.requestId === command.requestId);
        if (prior) {
          if (JSON.stringify(prior.command) !== JSON.stringify(command)) throw new Error('That profile request ID was already used for another change.');
          return structuredClone(prior.profile);
        }
        if (command.expectedRevision !== record.profile.revision) throw new Error('Your profile changed. Reload it before saving again.');
        if (record.profile.revision === 0xffffffff) throw new Error('Profile revision limit reached.');
        const profile = { userId, name: command.name, icon: command.icon, selections: command.selections, revision: record.profile.revision + 1 };
        validate(profile, userId);
        const collection = (await options.rewards?.read({ userId }))?.collection ?? [];
        if (Object.entries(profile.selections).some(([slot, option]) => !canEquipRewardOption(slot, option, collection) && record.profile.selections[slot] !== option)) throw new Error('Unlock this style in this host’s Rewards before equipping it. Device and account collections are separate.');
        const next: RecordData = { version: 1, profile, receipts: [...record.receipts, { command, profile }].slice(-64) };
        await options.persistence.savePlayer(`tod-profile:${userId}`, structuredClone(next));
        return structuredClone(profile);
      });
    },
  };
}
