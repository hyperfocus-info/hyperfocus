import type { AudioEngine, AudioVoiceHandle } from '@hyperfocus/engine/audio';
import type { PlayableAudioCommand } from '@hyperfocus/engine/project/runtime-2d';

type Play = Extract<PlayableAudioCommand, { type: 'play' }>;
type Timers = { now(): number; schedule(callback: () => void, milliseconds: number): unknown; cancel(id: unknown): void };
type Task = { remaining: number; started: number; id?: unknown; sceneId: string; bus: string; run: () => void; cancel?: () => void };
const defaultTimers: Timers = { now: () => performance.now(), schedule: (callback, milliseconds) => { const id = setTimeout(callback, milliseconds);return () => clearTimeout(id); }, cancel: id => { if (typeof id === 'function') id(); } };

/** Owns gain envelopes and their pause/disposal lifecycle; simulation supplies phase intent. */
export function createStandaloneMusic(options: { engine: { setBusGain?: AudioEngine['setBusGain']; fadeBus?: AudioEngine['fadeBus'] }; timers?: Timers }) {
  const timers = options.timers ?? defaultTimers;
  const tracks = new Map<string, { assetId: string; voice: AudioVoiceHandle }>();
  const ducks = new Map<object, number>();
  const tasks = new Set<Task>();
  let volume = 1, paused = false;
  function apply() {
    const gain = volume * Math.min(1, ...ducks.values());
    if (options.engine.fadeBus) options.engine.fadeBus('music', gain, .045);
    else options.engine.setBusGain?.('music', gain);
  }
  function schedule(command: Play, run: () => void, seconds: number, cancel?: () => void) {
    const task: Task = { remaining: seconds * 1_000, started: timers.now(), sceneId: command.sceneId, bus: command.bus, run, cancel };
    tasks.add(task);
    if (!paused) task.id = timers.schedule(() => { tasks.delete(task);run(); }, task.remaining);
  }
  function update(command: Play) {
    if (command.bus !== 'music') return false;
    const current = tracks.get(command.sceneId);
    if (!current?.voice.active || current.assetId !== command.assetId) return false;
    if (command.fadeSeconds) current.voice.fadeTo(command.gain, command.fadeSeconds);
    else current.voice.setGain(command.gain);
    return true;
  }
  function started(command: Play, voice: AudioVoiceHandle) {
    if (command.bus === 'music') {
      const previous = tracks.get(command.sceneId), fade = command.fadeSeconds ?? 0;
      if (previous?.voice.active) {
        if (fade > 0) { previous.voice.fadeTo(0, fade);schedule(command, () => previous.voice.stop(), fade, () => previous.voice.stop()); }
        else previous.voice.stop();
      }
      tracks.set(command.sceneId, { assetId: command.assetId, voice });
      if (fade > 0) voice.fadeTo(command.gain, fade);
    }
    if (command.duckMusic !== undefined && command.duckMusic < 1) {
      const key = {};
      ducks.set(key, Math.max(0, command.duckMusic));apply();
      schedule(command, () => { ducks.delete(key);apply(); }, command.duckSeconds ?? .18, () => { ducks.delete(key); });
    }
  }
  function setPaused(value: boolean) {
    if (paused === value) return;
    paused = value;
    for (const task of tasks) {
      if (value) { timers.cancel(task.id);task.remaining = Math.max(0, task.remaining - (timers.now() - task.started)); }
      else { task.started = timers.now();task.id = timers.schedule(() => { tasks.delete(task);task.run(); }, task.remaining); }
    }
  }
  return { update, started, setPaused,
    setVolume(value: number) { volume = value;apply(); },
    stopScene(sceneId: string, bus?: string) {
      if (bus === undefined || bus === 'music') tracks.delete(sceneId);
      let changed = false;
      for (const task of tasks) if (task.sceneId === sceneId && (bus === undefined || task.bus === bus)) {
        timers.cancel(task.id);tasks.delete(task);task.cancel?.();changed = true;
      }
      if (changed) apply();
    },
    dispose() { for (const task of tasks) timers.cancel(task.id);tasks.clear();tracks.clear();ducks.clear(); },
  };
}
