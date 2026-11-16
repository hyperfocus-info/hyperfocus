import type { createGameplay3D } from '@hyperfocus/engine/project/runtime-3d';
import { retainedCheckpointBytes } from './retained-size.ts';

type Game = ReturnType<typeof createGameplay3D>;
type Direction = NonNullable<Parameters<Game['step']>[2]>;
export type LocalExchangeInput = { actions: string[]; direction?: Direction };
type Input = LocalExchangeInput;
type Chunk = { checkpoint: ReturnType<Game['checkpoint']>; inputs: Input[]; bytes: number; first: number; combatFrame: number };

/** Session-only rolling local replay. Checkpoints include the real AI, physics and damaged arena. */
export function createLocalExchangeReview(options: { game: Game; clear(): void }) {
  const game = options.game, maxBytes = 16777216;
  let chunks: Chunk[] = [], bytes = 0, frame = 0, lethal = 0, phase = '', retryFrame: number | undefined;
  let active = false, playing = false, takeover = false, cursor = 0;
  let selected: Chunk | undefined, inputs: Input[] = [], returnTo: ReturnType<Game['checkpoint']> | undefined;
  let available = false, fromLibrary = false;
  function rewind() {
    selected?.checkpoint.restore();game.drainAudio();cursor = 0;options.clear();
  }
  return {
    discard() { if (active) return;chunks = [];bytes = frame = lethal = 0;retryFrame = undefined;available = false; },
    get state() { return { active, playing, takeover, available, fromLibrary, frame: cursor, length: inputs.length, retainedFrames: chunks.reduce((sum, chunk) => sum + chunk.inputs.length, 0), retainedBytes: bytes }; },
    save() {
      if (!active || !selected) throw new Error('Open an exchange before saving it.');
      const current = game.checkpoint();
      try { selected.checkpoint.restore();return { snapshot: game.snapshot(), inputs: structuredClone(inputs) }; }
      finally { current.restore(); }
    },
    load(saved: unknown) {
      if (active) throw new Error('Leave the current review before opening another situation.');
      if (!saved || typeof saved !== 'object' || !('snapshot' in saved) || !('inputs' in saved)) throw new Error('Invalid saved exchange.');
      if (!Array.isArray(saved.inputs) || !saved.inputs.length || saved.inputs.length > 960 || saved.inputs.some(input => !input || !Array.isArray(input.actions) || input.actions.length > 64 || input.actions.some((action: unknown) => typeof action !== 'string' || action.length > 256 || action.startsWith('match:') || action.startsWith('practice:')) || input.direction && (!Number.isFinite(input.direction.x) || input.direction.y !== 0 || !Number.isFinite(input.direction.z) || Math.hypot(input.direction.x, input.direction.z) > 1.000001))) throw new Error('Invalid saved exchange inputs.');
      const current = game.checkpoint();
      try {
        game.restore(saved.snapshot);
        if (!['fighting', 'round-result'].includes(game.combatMatch()?.phase ?? '')) throw new Error('This situation is not a recorded local fight.');
        selected = { checkpoint: game.checkpoint(), inputs: [], bytes: 0, first: 0, combatFrame: 0 };
      } catch (cause) { current.restore();throw cause; }
      returnTo = current;inputs = structuredClone(saved.inputs);active = fromLibrary = true;takeover = playing = false;rewind();
    },
    step(actions: Iterable<string>, direction?: Direction) {
      if (active) {
        if (!playing) return;
        const input = takeover ? { actions: [...actions].filter(action => !action.startsWith('match:') && !action.startsWith('practice:')), direction } : inputs[cursor];
        if (!input) { playing = false;return; }
        game.advance({ actions: input.actions, localDirection: input.direction });cursor++;
        if (takeover ? (game.combatMatch()?.phase === 'round-result' || cursor >= 1800) && !game.snapshot().combat?.hitstop.remaining : cursor >= inputs.length) playing = false;
        return;
      }
      const recording = phase === 'fighting' || phase === 'round-result';
      if (recording) {
        if (!chunks.length || chunks[chunks.length - 1]!.inputs.length >= 120) {
          const checkpoint = game.checkpoint(), size = retainedCheckpointBytes(checkpoint.state, maxBytes);
          while (chunks.length && (chunks.length >= 8 || bytes + size > maxBytes)) bytes -= chunks.shift()!.bytes;
          if (size <= maxBytes) { chunks.push({ checkpoint, inputs: [], bytes: size, first: frame, combatFrame: checkpoint.state.combat?.combat.frame ?? 0 });bytes += size; }
        }
        const chunk = chunks[chunks.length - 1];
        if (chunk) {
          const input = { actions: [...actions].slice(0, 64), ...(direction ? { direction: { ...direction } } : {}) };
          const size = retainedCheckpointBytes(input, maxBytes);
          if (!Number.isFinite(size) || size > maxBytes) { chunks = [];bytes = 0;available = false; }
          else {
            chunk.inputs.push(input);chunk.bytes += size;bytes += size;
            while (chunks.length && bytes > maxBytes) bytes -= chunks.shift()!.bytes;
          }
        }
        frame++;
      }
      game.advance({ actions, localDirection: direction });const next = game.combatMatch()?.phase ?? '';
      if (phase === 'fighting' && next === 'round-result') {
        lethal = frame;
        const entries = game.snapshot().combat?.exchange ?? [];
        let opening: typeof entries[number] | undefined;
        for (const entry of entries) if (entry.decisive) opening = entry;
        const seen = new Set<string>();
        while (opening?.previousId && !seen.has(opening.id)) {
          seen.add(opening.id);const previous = entries.find(entry => entry.id === opening!.previousId);
          if (!previous) break;opening = previous;
        }
        retryFrame = opening ? Math.max(0, opening.frame - 60) : undefined;
      }
      if (next === 'match-result' && chunks.length) available = true;
      if (next === 'fighting' && phase !== 'fighting') { chunks = [];bytes = 0;frame = 0;lethal = 0;retryFrame = undefined;available = false; }
      if (next === 'menu' || next === 'practice' || next === 'countdown') { chunks = [];bytes = 0;available = false; }
      phase = next;
    },
    open(practice = false) {
      if (!available || active) return;
      returnTo = game.checkpoint();
      selected = chunks[0];
      for (const chunk of chunks) if (retryFrame === undefined ? chunk.first <= Math.max(0, lethal - 180) : chunk.combatFrame <= retryFrame) selected = chunk;
      inputs = chunks.slice(chunks.indexOf(selected!)).flatMap(chunk => chunk.inputs);
      active = true;fromLibrary = false;takeover = practice;playing = practice;rewind();
    },
    retry() { if (!active) return;rewind();takeover = true;playing = true; },
    watch() { if (!active) return;rewind();takeover = false;playing = true; },
    toggle() { if (!active) return;playing = !playing;options.clear(); },
    leave() { if (!active) return;returnTo!.restore();game.drainAudio();active = false;playing = false;takeover = false;fromLibrary = false;returnTo = undefined;inputs = [];options.clear(); },
  };
}
