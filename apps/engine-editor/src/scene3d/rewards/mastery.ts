import { createSaveProfileStore, type AtomicSaveStorage } from '@hyperfocus/engine/save';
import { z } from 'zod';

export const masteryLessons = [
  { id: 'combo-lesson', label: 'Launch, chase, follow up' }, { id: 'parry-drill', label: 'Timed parry' },
  { id: 'tech-drill', label: 'Recover from a launch' }, { id: 'di-drill', label: 'Steer a launch' },
  { id: 'arena-lesson', label: 'Use the arena' },
] as const;
const schema = z.object({ version: z.literal(1), clears: z.record(z.string(), z.number().int().min(0).max(1000000)) }).strict();

/** Device practice records have no currency, rating or account authority. */
export function createMasteryJournal(storage: AtomicSaveStorage, projectId: string) {
  const store = createSaveProfileStore(storage, `${projectId}:mastery`, { limits: { maxSlots: 1, maxBytes: 16384 } });
  let clears: Record<string, number> = {}, error = '';
  let lane: Promise<unknown> = store.loadSlot('local', 'mastery').then(saved => { if (saved) clears = schema.parse(saved.data).clears; }).catch(() => { error = 'Practice records could not be loaded. Reopen the game to retry.'; });
  return {
    get state() { return { clears, error }; },
    record(id: string) {
      if (!masteryLessons.some(lesson => lesson.id === id)) return Promise.resolve('');
      const work = lane.then(async () => {
        if (error) return error;
        const next = { ...clears, [id]: Math.min(1000000, (clears[id] ?? 0) + 1) };
        await store.saveSlot('local', 'mastery', { version: 1, clears: next });clears = next;
        const count = clears[id]!;
        return `${count} successful ${count === 1 ? 'clear' : 'clears'} saved. ${count < 5 ? `${5 - count} to five successful completions.` : count < 20 ? `${20 - count} to twenty completions.` : 'Keep this technique sharp or choose another challenge.'}`;
      });
      lane = work.catch(() => {});return work.catch(() => 'Practice record could not be saved. First-clear coins are tracked separately.');
    },
  };
}
