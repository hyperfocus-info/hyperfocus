import { combatInputActions3D, type CombatProject3D, type createGameplay3D } from '@hyperfocus/engine/project/runtime-3d';

type Game = ReturnType<typeof createGameplay3D>;
type Input = { actions: string[]; direction: { x: number; y: number; z: number } };
export type OpponentSequence = { steps: { action: string; frame: number }[]; length: number };
export const defaultOpponentSequence: OpponentSequence = { steps: [{ action: 'heavy', frame: 0 }, { action: 'guard', frame: 50 }], length: 180 };

/** A local Practice controller. Every loop restores physics, damage, spacing and input buffers. */
export function createOpponentRoutine(options: { game: Game; definition: CombatProject3D; clear(): void; requireWorld?(): void }) {
  const { game, definition } = options, allowed = new Set(combatInputActions3D({ definition }));
  const playerIndex = definition.fighters.findIndex(fighter => fighter.control === 'player');
  let start: ReturnType<Game['checkpoint']> | undefined, snapshot: ReturnType<Game['snapshot']> | undefined;
  let sequence = structuredClone(defaultOpponentSequence), running = false, frame = 0, loops = 0;
  function validate(value: unknown): OpponentSequence {
    if (!value || typeof value !== 'object' || !('length' in value) || !('steps' in value) || typeof value.length !== 'number' || !Number.isInteger(value.length) || value.length < 60 || value.length > 600 || !Array.isArray(value.steps) || !value.steps.length || value.steps.length > 3) throw new Error('Choose one to three actions at increasing frames, within a 60–600 frame loop.');
    const length = value.length;let previous = -1;
    const steps = value.steps.map(step => {
      if (!step || typeof step.action !== 'string' || !allowed.has(step.action) || typeof step.frame !== 'number' || !Number.isInteger(step.frame) || step.frame <= previous || step.frame >= length) throw new Error('Choose valid actions at increasing frames inside the loop.');
      previous = step.frame;return { action: step.action, frame: step.frame };
    });
    return { length, steps };
  }
  function reset(clearInput = true) { options.requireWorld?.();start?.restore();game.drainAudio();frame = 0;if (clearInput) options.clear(); }
  return {
    get state() { return { available: !!start, running, frame, loops, sequence: structuredClone(sequence) }; },
    get actions() { return [...allowed].filter(action => !['jump-tap', 'lockon'].includes(action)); },
    start(value: OpponentSequence) {
      options.requireWorld?.();
      const next = validate(value);
      if (game.combatMatch()?.phase !== 'practice') throw new Error('Enter Free practice before creating an opponent routine.');
      if (running) reset();
      sequence = next;snapshot = game.snapshot();start = game.checkpoint();frame = loops = 0;running = true;options.clear();
    },
    stop() { if (running) { reset();running = false; } },
    reset,
    save() { options.requireWorld?.();if (!snapshot) throw new Error('Start a routine before saving it.');return { snapshot: structuredClone(snapshot), sequence: structuredClone(sequence) }; },
    load(value: unknown) {
      options.requireWorld?.();
      if (!value || typeof value !== 'object' || !('snapshot' in value) || !('sequence' in value)) throw new Error('Invalid saved opponent routine.');
      const next = validate(value.sequence), previous = game.checkpoint();
      try { game.restore(value.snapshot);if (game.combatMatch()?.phase !== 'practice') throw new Error('This is not a saved Practice routine.'); }
      catch (cause) { previous.restore();throw cause; }
      sequence = next;snapshot = game.snapshot();start = game.checkpoint();frame = loops = 0;running = true;options.clear();
    },
    step(input: Input) {
      if (!running) return;
      if (game.combatMatch()?.phase !== 'practice') { running = false;return; }
      if (frame >= sequence.length) { reset(false);loops++; }
      let step: OpponentSequence['steps'][number] | undefined;
      for (const candidate of sequence.steps) if (candidate.frame <= frame) step = candidate;
      const dummy = new Set<string>();
      if (step && (step.frame === frame || ['guard', 'drive', 'jump'].includes(step.action))) dummy.add(step.action);
      game.advance({ fighterInputs: definition.fighters.map((_, index) => ({ actions: index === playerIndex ? new Set(input.actions) : dummy, direction: index === playerIndex ? input.direction : { x: 0, y: 0, z: 0 } })) });frame++;
    },
  };
}
