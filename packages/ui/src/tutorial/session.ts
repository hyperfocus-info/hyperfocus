export type TutorialStep = { id: string; label: string; instruction: string; input: string; timing: string; success: string };
export type TutorialDefinition = { id: string; title: string; objective: string; steps: readonly TutorialStep[]; completion: string };
export type TutorialFeedback = { id: string; message: string; correction: string };
export type TutorialTiming = { label: string; value: number; total: number; window?: { start: number; end: number }; cue: string };

const meaningful = (values: readonly unknown[]) => values.every(value => typeof value === 'string' && value.trim().length > 0);

/** Shared by the headless model and presentation: neither can bypass lesson quality. */
export function validateTutorialDefinition(definition: TutorialDefinition) {
  if (!meaningful([definition.id, definition.title, definition.objective, definition.completion]) || !definition.steps.length || definition.steps.length > 6) throw Error('A tutorial needs identity, objective, completion and one to six observable steps.');
  if (new Set(definition.steps.map(step => step.id)).size !== definition.steps.length || definition.steps.some(step => !meaningful([step.id, step.label, step.instruction, step.input, step.timing, step.success]))) throw Error('Every tutorial step needs a unique id, label, instruction, input, timing and success criterion.');
}

export function validateTutorialFeedback(feedback: TutorialFeedback) {
  if (!meaningful([feedback.id, feedback.message, feedback.correction])) throw Error('Attempt feedback must explain both the observation and the correction.');
}

export function validateTutorialTiming(timing: TutorialTiming) {
  if (!meaningful([timing.label, timing.cue]) || !Number.isFinite(timing.value) || !Number.isFinite(timing.total) || timing.total <= 0) throw Error('Tutorial timing needs a label, cue and finite values with a positive total.');
  const window = timing.window;
  if (window && (!Number.isFinite(window.start) || !Number.isFinite(window.end) || window.start > window.end)) throw Error('Tutorial timing window must be finite and ordered.');
}

/** Completion is evidence-driven. The host supplies active time, never a wall-clock timeout. */
export function createTutorialSession(options: { definition: TutorialDefinition; settleMs?: number }) {
  const { definition } = options, settleMs = options.settleMs ?? 1600;
  validateTutorialDefinition(definition);
  const ids = new Set(definition.steps.map(step => step.id));
  if (!Number.isFinite(settleMs) || settleMs < 0) throw Error('Invalid tutorial completion hold.');
  let attempt = 0, elapsed = 0, completeAt: number | undefined, feedback: TutorialFeedback | undefined;
  const completed = new Set<string>();
  return {
    get state() { return { attempt, completed: [...completed], complete: completeAt !== undefined, advanceReady: completeAt !== undefined && elapsed - completeAt >= settleMs, feedback }; },
    observe(input: { attempt: number; completed: readonly string[]; feedback?: TutorialFeedback; source: 'player' | 'demonstration'; deltaMs: number; suspended?: boolean }) {
      if (input.attempt !== attempt || input.source !== 'player' || input.suspended) return;
      if (!Number.isFinite(input.deltaMs) || input.deltaMs < 0 || input.completed.some(id => !ids.has(id))) throw Error('Invalid tutorial evidence.');
      if (input.feedback) validateTutorialFeedback(input.feedback);
      // A background tab resuming must not skip the success acknowledgement.
      elapsed += Math.min(100, input.deltaMs);
      if (completeAt !== undefined) return;
      for (const id of input.completed) completed.add(id);
      if (input.feedback) feedback = input.feedback;
      if (completed.size === ids.size) { completeAt = elapsed;feedback = undefined; }
    },
    retry() { attempt++;elapsed = 0;completeAt = undefined;feedback = undefined;completed.clear(); },
  };
}
