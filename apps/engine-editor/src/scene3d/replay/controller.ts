import type { createCombatReplay3D } from '@hyperfocus/engine/project/runtime-3d';
import { replayMaxBytes } from '@hyperfocus/touch-of-death/replay/limits';
import { readReplayAppearance, type ReplayAppearance } from './appearance.ts';

type Replay = ReturnType<typeof createCombatReplay3D>;
export type ReplayArchive = { recording: unknown; stoppedReason: string; appearance?: ReplayAppearance; startFrame?: number };
/** Session-only playback ownership. Long seeks advance in bounded batches between renders. */
export function createCombatReplayController(options: {
  create(recording: unknown, appearance?: ReplayAppearance): Replay;
  changed(replay: Replay | undefined, appearance?: ReplayAppearance): void;
  clear(): void;
  /** Runs inside file-open generation ownership, so cancel also cancels activation. */
  prepare?(): Promise<void>;
}) {
  let replay: Replay | undefined, playing = false, target: number | undefined, generation = 0, partial = false;
  let recent: ReplayArchive | undefined;
  let findingDamage = false, notice: string | undefined;
  function activate(parsed: unknown) {
    const value = parsed && typeof parsed === 'object' && 'recording' in parsed ? parsed.recording : parsed;
    const appearance = readReplayAppearance(parsed && typeof parsed === 'object' && 'appearance' in parsed ? parsed.appearance : undefined);
    const next = options.create(value, appearance);
    partial = Boolean(parsed && typeof parsed === 'object' && 'stoppedReason' in parsed && parsed.stoppedReason);
    const start = parsed && typeof parsed === 'object' && 'startFrame' in parsed ? parsed.startFrame : undefined;
    if (start !== undefined && (typeof start !== 'number' || !Number.isSafeInteger(start) || start < 0 || start > next.length)) throw Error('Invalid replay start frame.');
    replay = next;target = typeof start === 'number' && start > 0 ? start : undefined;findingDamage = false;notice = target !== undefined ? 'Opening the decisive exchange.' : undefined;playing = false;options.clear();options.changed(replay, appearance);
  }
  return {
    get active() { return Boolean(replay); },
    get state() { return { active: Boolean(replay), hasRecent: recent !== undefined, playing, seeking: target !== undefined || findingDamage, findingDamage, notice, frame: replay?.frame ?? 0, length: replay?.length ?? 0, controlledSeat: replay?.controlledSeat, error: partial ? 'This is a partial recording; playback ends at the last saved frame.' : undefined }; },
    /** One detached, engine-bounded online archive for this page session only. */
    remember(value: ReplayArchive) { recent = structuredClone(value); },
    exportRecent(): ReplayArchive {
      if (!recent) throw new Error('No online replay is available yet.');
      return structuredClone(recent);
    },
    openRecent() {
      generation++;
      if (recent === undefined) throw new Error('No online replay is available yet.');
      activate(structuredClone(recent));
    },
    async open(file: Pick<File, 'size' | 'arrayBuffer'>) {
      if (file.size > replayMaxBytes) throw new Error('Replay files must be no larger than 20 MB.');
      const attempt = ++generation, source = await file.arrayBuffer();
      if (attempt !== generation) return;
      const { readReplayFile } = await import('@hyperfocus/touch-of-death/replay');
      if (attempt !== generation) return;
      const parsed = readReplayFile({ bytes: new Uint8Array(source) });
      await options.prepare?.();
      if (attempt !== generation) return;
      activate(parsed);
    },
    toggle() { if (findingDamage) { findingDamage = false;notice = undefined;options.clear();return; }if (!replay || target !== undefined) return;notice = undefined;if (replay.ended) replay.seek({ frame: 0 });playing = !playing;options.clear(); },
    findNextDamage() {
      if (!replay) throw new Error('Open a replay first.');
      if (replay.controlledSeat !== undefined) throw new Error('Return to the recorded replay before finding damage.');
      if (target !== undefined || findingDamage) throw new Error('Finish the current replay search first.');
      playing = false;findingDamage = true;notice = undefined;options.clear();replay.game.drainAudio();
    },
    seek(frame: number) {
      if (!replay || !Number.isSafeInteger(frame) || frame < 0 || frame > replay.length) throw new Error('Choose a frame within this recording.');
      playing = false;findingDamage = false;notice = undefined;options.clear();replay.seek({ frame: 0 });target = frame;
    },
    advanceSeek() {
      if (!replay || target === undefined && !findingDamage) return;
      const end = Math.min(target ?? replay.length, replay.frame + 120), deadline = performance.now() + 6;
      do {
        if (replay.frame >= end) break;
        const before = findingDamage ? replay.game.snapshot().combat?.state.fighters.map(fighter => ({ id: fighter.id, health: fighter.health })) : undefined;
        const advanced = replay.tick();replay.game.drainAudio();
        if (!advanced) break;
        if (before && replay.game.snapshot().combat?.state.fighters.some(fighter => { const prior = before.find(value => value.id === fighter.id);return prior !== undefined && fighter.health < prior.health; })) {
          findingDamage = false;notice = `Damage at frame ${replay.frame}.`;return;
        }
      } while (performance.now() < deadline);
      if (findingDamage && replay.ended) { findingDamage = false;notice = 'No more damage in this recording.'; }
      if (replay.frame === target) target = undefined;
    },
    takeOver(seat: 0 | 1) { if (!replay || target !== undefined || findingDamage) return;notice = undefined;replay.takeOver({ seat });playing = true;options.clear(); },
    tick(input: Parameters<Replay['tick']>[0]) {
      if (!replay || !playing || target !== undefined || findingDamage) return false;
      const advanced = replay.tick(input);if (replay.ended) playing = false;return advanced;
    },
    leave() { generation++;replay = undefined;playing = false;target = undefined;findingDamage = false;notice = undefined;partial = false;options.clear();options.changed(undefined); },
  };
}
