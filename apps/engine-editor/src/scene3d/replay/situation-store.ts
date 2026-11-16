import { createSaveProfileStore, normalizeSaveJson, type AtomicSaveStorage, type SaveJsonValue } from '@hyperfocus/engine/save';
import type { createLocalExchangeReview } from './local-exchange';
import type { createOpponentRoutine } from './opponent-routine';

export type SavedSituation = { version: 1; contentId: string; title: string } & (
  { kind: 'exchange'; recording: ReturnType<ReturnType<typeof createLocalExchangeReview>['save']> } |
  { kind: 'routine'; recording: ReturnType<ReturnType<typeof createOpponentRoutine>['save']> }
);
export const situationStorageBytes = 33_554_432;
function record(value: SaveJsonValue | undefined): { [key: string]: SaveJsonValue } {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function createSituationStore(options: { storage: AtomicSaveStorage; projectId: string; contentId: string }) {
  const store = createSaveProfileStore(options.storage, `${options.projectId}:practice-situations`, { limits: { maxSlots: 5, maxBytes: situationStorageBytes, maxNodes: 2_000_000 } });
  return {
    async list() {
      return (await store.loadProfile('local'))?.slots.map(slot => {
        const data = record(slot.data);
        return { id: slot.name, savedAt: slot.savedAt, title: typeof data.title === 'string' ? data.title : 'Unreadable situation', compatible: data.version === 1 && data.contentId === options.contentId && (data.kind === 'exchange' || data.kind === 'routine'), kind: data.kind };
      }) ?? [];
    },
    async save(value: Omit<SavedSituation, 'version' | 'contentId'>) {
      const title = value.title.trim();if (!title || title.length > 80) throw new Error('Name the situation using 1–80 characters.');
      const data = normalizeSaveJson(JSON.parse(JSON.stringify({ ...value, title, version: 1, contentId: options.contentId })), { maxBytes: situationStorageBytes, maxNodes: 2_000_000 });
      if (new TextEncoder().encode(JSON.stringify(data)).length > 8_388_608) throw new Error('This situation exceeds the 8 MiB limit. Try a shorter exchange.');
      if ((await this.list()).length >= 5) throw new Error('All five slots are full. Open Saved situations and delete one before saving.');
      await store.saveSlot('local', crypto.randomUUID(), data);
    },
    async load(id: string) {
      const slot = await store.loadSlot('local', id), data = record(slot?.data);
      if (data.version !== 1 || data.contentId !== options.contentId || (data.kind !== 'exchange' && data.kind !== 'routine')) throw new Error('This situation belongs to a different game version. It cannot be opened in this build.');
      // Each owning controller validates the recording before changing gameplay.
      return { kind: data.kind, recording: data.recording };
    },
    async remove(id: string) { await store.deleteSlot('local', id); },
  };
}
