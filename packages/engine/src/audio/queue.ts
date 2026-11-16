import type { AudioEngine, AudioVoiceHandle, PlayBufferOptions } from './index.ts';
import { createAudioShuffle } from './shuffle.ts';

export type AudioQueueEngine = Pick<AudioEngine, 'isUnlocked' | 'hasBuffer' | 'playBuffer'> & { context?: () => { readonly currentTime: number } | undefined };

export function createAudioQueue(options: { engine: AudioQueueEngine; load?: (assetId: string) => Promise<void>; now?: () => number; capacity?: number; concurrency?: number; seed?: number; maxWaitSeconds?: number; categoryLimits?: Readonly<Record<string, number>>; onStart?: (request: { id: number; assetId: string; category?: string; voice: AudioVoiceHandle }) => void; onError?: (assetId: string, cause: unknown) => void }) {
  const { engine } = options, capacity = options.capacity ?? 128, concurrency = options.concurrency ?? 4, maxWait = options.maxWaitSeconds ?? .18;
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 4096 || !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 64 || !Number.isFinite(maxWait) || maxWait < 0) throw new RangeError('Invalid audio queue bounds.');
  const categoryLimits = new Map(Object.entries(options.categoryLimits ?? {}));
  if (categoryLimits.size > 64 || [...categoryLimits].some(([name, limit]) => !name || name.length > 128 || !Number.isSafeInteger(limit) || limit < 1 || limit > 64)) throw new RangeError('Invalid audio queue category limits.');
  const shuffle = createAudioShuffle(options.seed), requests = new Map<number, { assetId: string; play: PlayBufferOptions; at: number; category?: string; coalesceKey?: string; status: 'waiting' | 'loading' | 'playing'; voice?: AudioVoiceHandle }>();
  let nextId = 1, paused = false, disposed = false, loads = 0, pausedAt = 0;
  const now = () => options.now?.() ?? engine.context?.()?.currentTime ?? 0;
  function pump() {
    if (paused || disposed || !engine.isUnlocked()) return;
    const pending = [...requests].sort(([aId, a], [bId, b]) => (b.play.priority ?? 0) - (a.play.priority ?? 0) || aId - bId);
    for (const [id, request] of pending) {
      if (request.status !== 'waiting') continue;
      if (now() - request.at > maxWait) { requests.delete(id);continue; }
      if (loads + [...requests.values()].filter(item => item.status === 'playing').length >= concurrency) break;
      const categoryLimit = request.category ? categoryLimits.get(request.category) : undefined;
      if (categoryLimit !== undefined && [...requests.values()].filter(item => item.category === request.category && item.status !== 'waiting').length >= categoryLimit) continue;
      request.status = 'loading';loads++;
      const begin = async () => {
        try {
          if (!engine.hasBuffer(request.assetId)) await options.load?.(request.assetId);
          if (requests.get(id) !== request || disposed) return;
          if (paused || !engine.isUnlocked()) { request.status = 'waiting';return; }
          if (now() - request.at > maxWait) { requests.delete(id);return; }
          const result = engine.playBuffer(request.assetId, { ...request.play, onEnded(reason) { if (requests.get(id) !== request) return;requests.delete(id);request.play.onEnded?.(reason);pump(); } });
          if (result.ok) {
            request.voice = result.voice;request.status = 'playing';
            try { options.onStart?.({ id, assetId: request.assetId, category: request.category, voice: result.voice }); } catch (cause) { options.onError?.(request.assetId, cause); }
          }
          else { requests.delete(id);options.onError?.(request.assetId, result); }
        } catch (cause) { requests.delete(id);options.onError?.(request.assetId, cause); }
        finally { loads--;pump(); }
      };
      void begin();
    }
  }
  function cancel(id: number) { const request = requests.get(id);if (!request) return false;requests.delete(id);request.voice?.stop();return true; }
  return {
    enqueue(input: { assetId?: string; assetIds?: readonly string[]; play?: PlayBufferOptions; category?: string; coalesceKey?: string }) {
      if (disposed) throw new Error('Audio queue has been disposed.');
      const ids = input.assetIds ?? (input.assetId ? [input.assetId] : []);
      if (!ids.length || ids.length > 64 || new Set(ids).size !== ids.length || ids.some(id => !id || id.length > 160)) throw new Error('Audio queue needs one to sixty-four distinct asset IDs.');
      if (input.category !== undefined && (!input.category || input.category.length > 128) || input.coalesceKey !== undefined && (!input.coalesceKey || input.coalesceKey.length > 160) || !Number.isFinite(input.play?.priority ?? 0)) throw new RangeError('Invalid audio queue request.');
      if (input.coalesceKey) {
        const found = [...requests].find(([, item]) => item.coalesceKey === input.coalesceKey && item.category === input.category);
        if (found) {
          const [id, request] = found;
          if (request.status === 'waiting' && (input.play?.priority ?? 0) >= (request.play.priority ?? 0)) { request.assetId = ids[shuffle.next(JSON.stringify(ids), ids.length)]!;request.play = { ...input.play };request.at = paused ? pausedAt : now(); }
          return id;
        }
      }
      if (requests.size >= capacity) return undefined;
      const assetId = ids[shuffle.next(JSON.stringify(ids), ids.length)]!, id = nextId++;
      requests.set(id, { assetId, play: { ...input.play }, category: input.category, coalesceKey: input.coalesceKey, at: paused ? pausedAt : now(), status: 'waiting' });pump();return id;
    },
    cancel(input: { id: number }) { const result = cancel(input.id);pump();return result; },
    update: pump,
    setPaused(input: { paused: boolean }) {
      if (paused === input.paused) return;
      if (input.paused) pausedAt = now();
      else for (const request of requests.values()) request.at += now() - pausedAt;
      paused = input.paused;if (!paused) pump();
    },
    reset() { for (const id of [...requests.keys()]) cancel(id);shuffle.reset(); },
    snapshot() { return { paused, disposed, loading: loads, capacity, pending: [...requests].map(([id, item]) => ({ id, assetId: item.assetId, category: item.category, coalesceKey: item.coalesceKey, priority: item.play.priority ?? 0, status: item.status })) }; },
    dispose() { if (disposed) return;disposed = true;for (const id of [...requests.keys()]) cancel(id); },
  };
}

export type AudioQueue = ReturnType<typeof createAudioQueue>;
