import { createAudioQueue, type AudioQueueEngine, type AudioVoiceHandle } from '@hyperfocus/engine/audio';
import type { PlayableAudioCommand } from '@hyperfocus/engine/project/runtime-2d';

type Play = Extract<PlayableAudioCommand, { type: 'play' }>;
type Entry = { command: Play; voice?: AudioVoiceHandle; coalesceKey?: string };
const categoryLimits = { movement: 4, ambient: 2, voice: 4, impact: 16, critical: 4, other: 8 };
const START_HISTORY_CAPACITY = 128;
type StartedEffect = { sequence: number; timeMs: number; requestId: number; voiceId: number; commandId: string; assetId: string; sceneId: string; entityId: string; category?: string; bus: string; gain: number; pan: number; playbackRate: number; priority: number };

/** Already decoded effects share bounded scheduling; music and loops keep their own lifecycle. */
export function createStandaloneEffectsQueue(options: {
  engine: Pick<AudioQueueEngine, 'hasBuffer' | 'playBuffer' | 'context'>;
  now: () => number; isUnlocked: () => boolean;
  onStarted: (command: Play, voice: AudioVoiceHandle) => void;
  onError?: (error: Error) => void;
  saturation?: (strength: number | undefined) => number;
}) {
  const commands = new Map<number, Entry>(), coalesces = new Map<string, { key: string; id?: number }>();
  const recentStarts: StartedEffect[] = [];
  let totalStarted = 0;
  let disposed = false, nextKey = 0;
  const report = (cause: unknown) => options.onError?.(cause instanceof Error ? cause : new Error(typeof cause === 'object' && cause && 'message' in cause ? String(cause.message) : String(cause)));
  const queue = createAudioQueue({ engine: { hasBuffer: id => options.engine.hasBuffer(id), playBuffer: (id, play) => options.engine.playBuffer(id, play), context: () => options.engine.context?.(), isUnlocked: options.isUnlocked }, now: () => options.now() / 1000,
    capacity: 128, concurrency: 64, maxWaitSeconds: .18, categoryLimits,
    onError(_assetId, cause) {
      if (typeof cause === 'object' && cause && 'code' in cause && cause.code === 'voice-capacity') return;
      report(cause);
    },
    onStart({ id, voice, category }) {
      // Cached requests may start inside enqueue, before its returned ID is recorded.
      queueMicrotask(() => {
        const entry = commands.get(id);
        if (!entry || disposed || !voice.active || !queue.snapshot().pending.some(request => request.id === id)) { queue.cancel({ id });prune();return; }
        entry.voice = voice;
        const command = entry.command;
        recentStarts.push({ sequence: ++totalStarted, timeMs: options.now(), requestId: id, voiceId: voice.id, commandId: command.commandId,
          assetId: command.assetId, sceneId: command.sceneId, entityId: command.entityId, category, bus: command.bus,
          gain: command.gain, pan: command.pan, playbackRate: command.playbackRate ?? 1, priority: command.priority });
        if (recentStarts.length > START_HISTORY_CAPACITY) recentStarts.shift();
        try { options.onStarted(entry.command, voice); } catch (cause) { report(cause); }
        prune();
      });
    },
  });
  function prune() {
    const live = new Set(queue.snapshot().pending.map(request => request.id));
    for (const [id, entry] of commands) {
      if (entry.voice && !entry.voice.active) { queue.cancel({ id });live.delete(id); }
      if (live.has(id)) continue;
      commands.delete(id);if (entry.coalesceKey && coalesces.get(entry.coalesceKey)?.id === id) coalesces.delete(entry.coalesceKey);
    }
  }
  return {
    enqueue(command: Play) {
      if (disposed || command.loop || command.bus === 'music' || !options.engine.hasBuffer(command.assetId)) return false;
      prune();
      const category = command.priority >= 100 ? 'critical' : command.category === 'voice' || command.bus === 'voice' ? 'voice' : command.priority >= 80 ? 'critical' : command.bus === 'ambient' ? 'ambient' : command.bus === 'sfx' ? command.priority <= 15 ? 'movement' : 'impact' : 'other';
      const coalesceKey = category === 'movement' || category === 'ambient' ? JSON.stringify([category, command.sceneId, command.assetId]) : undefined;
      const pending = queue.snapshot().pending;
      if (category === 'critical' && pending.length >= 128) {
        const replace = pending.filter(request => request.status === 'waiting' && request.priority < command.priority).sort((a, b) => a.priority - b.priority || a.id - b.id)[0];
        if (replace) queue.cancel({ id: replace.id });
      }
      let coalesce = coalesceKey ? coalesces.get(coalesceKey) : undefined;
      if (coalesceKey && !coalesce) { coalesce = { key: `effect:${++nextKey}` };coalesces.set(coalesceKey, coalesce); }
      const saturation = options.saturation?.(command.impactStrength) ?? 0;
      const id = queue.enqueue({ assetId: command.assetId, category, coalesceKey: coalesce?.key,
        play: { bus: command.bus, gain: command.gain, pan: command.pan, loop: false, priority: command.priority,
          ...(command.playbackRate === undefined ? {} : { playbackRate: command.playbackRate }), ...(saturation > 0 ? { saturation } : {}) } });
      if (id === undefined) { if (coalesceKey) coalesces.delete(coalesceKey);return false; }
      const entry = commands.get(id);
      if (!entry || queue.snapshot().pending.find(request => request.id === id)?.status === 'waiting') commands.set(id, { command, coalesceKey });
      if (coalesce) coalesce.id = id;
      prune();return true;
    },
    stopScene(sceneId: string, bus?: string) {
      const stopped = new Set<AudioVoiceHandle>();
      for (const [id, entry] of commands) if (entry.command.sceneId === sceneId && (bus === undefined || entry.command.bus === bus || bus === 'voice' && entry.command.category === 'voice')) {
        if (entry.voice) stopped.add(entry.voice);queue.cancel({ id });
      }
      prune();return stopped;
    },
    setPaused(paused: boolean) { queue.setPaused({ paused });prune(); },
    update() { prune();queue.update();prune(); },
    pendingCount() { prune();return queue.snapshot().pending.filter(request => request.status !== 'playing').length; },
    snapshot() { prune();return { ...queue.snapshot(), trackedCommands: commands.size, coalescedKeys: coalesces.size, totalStarted, startHistoryCapacity: START_HISTORY_CAPACITY, recentStarts: recentStarts.map(start => ({ ...start })) }; },
    dispose() { if (disposed) return;disposed = true;queue.dispose();commands.clear();coalesces.clear();recentStarts.length = 0; },
  };
}
