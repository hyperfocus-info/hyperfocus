import type { GameplaySnapshot3D, createGameplay3D } from '@hyperfocus/engine/project/runtime-3d';
import { createLocalExchangeReview } from '../../scene3d/replay/local-exchange.ts';
import { createLiveCombatLearning } from '../../scene3d/bulk-training/adaptation/live.ts';

type Game = ReturnType<typeof createGameplay3D>;
export type LearningStore = Parameters<typeof createLiveCombatLearning>[0]['store'];
export type SessionCommand = { type: 'snapshot' | 'reset' } | { type: 'restore'; snapshot: GameplaySnapshot3D }
  | { type: 'review'; action: 'open' | 'practice' | 'retry' | 'watch' | 'toggle' | 'leave' }
  | { type: 'review-load'; exchange: unknown }
  | { type: 'policies'; policies: Parameters<Game['queueCombatAiPolicies']>[0]['policies'] }
  | { type: 'learning'; models: Parameters<Game['queueCombatAiLearning']>[0]['models'] };

/** Local game services belong to the same world in either realm. Only storage is injected. */
export function createLocalWorldSession(options: { game: Game; review: boolean; store?: LearningStore; diagnostic?: boolean }) {
  const { game } = options;
  let coreMs = 0, hookMs = 0, ticks = 0, disposed = false;
  const measured = { ...game, advance(input: Parameters<Game['advance']>[0]) {
    if (!options.diagnostic) { game.advance(input);return; }
    const start = performance.now();game.advance(input);coreMs += performance.now() - start;
  } };
  let review = options.review ? createLocalExchangeReview({ game: measured, clear() {} }) : undefined;
  const learning = options.store ? createLiveCombatLearning({ game, store: options.store }) : undefined;
  let policies: Extract<SessionCommand, { type: 'policies' }> | undefined;
  let models: Extract<SessionCommand, { type: 'learning' }> | undefined;
  function reapply() {
    if (policies) game.queueCombatAiPolicies(policies);
    if (models) game.queueCombatAiLearning(models);
  }
  return {
    advance(actions: Iterable<string>, direction?: Parameters<Game['step']>[2]) {
      if (disposed) throw Error('Local world session is disposed');
      const start = options.diagnostic ? performance.now() : 0, beforeCore = coreMs;
      const excluded = review?.state.active ?? false;
      learning?.before({ excluded, actions });
      if (review) review.step(actions, direction);else measured.advance({ actions, localDirection: direction });
      learning?.after({ excluded });ticks++;
      if (options.diagnostic) hookMs += performance.now() - start - (coreMs - beforeCore);
    },
    command(command: SessionCommand) {
      if (disposed) throw Error('Local world session is disposed');
      if (command.type === 'snapshot') return game.snapshot();
      if (command.type === 'policies') { game.queueCombatAiPolicies(command);policies = structuredClone(command); }
      else if (command.type === 'learning') { game.queueCombatAiLearning(command);models = structuredClone(command); }
      else if (command.type === 'review' || command.type === 'review-load') {
        if (!review) throw Error('Replay recording is disabled for this experiment');
        if (command.type === 'review-load') review.load(command.exchange);
        else if (command.action === 'practice') review.state.active ? review.retry() : review.open(true);
        else review[command.action]();
        learning?.invalidate();if (!review.state.active) reapply();
      } else {
        if (command.type === 'restore') game.restore(command.snapshot);
        else { learning?.before({ actions: ['match:quit'] });game.reset(); }
        learning?.invalidate();
        review = options.review ? createLocalExchangeReview({ game: measured, clear() {} }) : undefined;
        if (command.type === 'restore') reapply();
      }
      return game.snapshot();
    },
    saveReview() {
      if (disposed) throw Error('Local world session is disposed');
      if (!review) throw Error('Replay recording is disabled for this experiment');
      return review.save();
    },
    stats() { return { ticks, coreMs, hookMs, review: review?.state, learning: learning?.snapshot() }; },
    async flush() { await learning?.retry(); },
    async dispose() { if (disposed) return;disposed = true;review = undefined;await learning?.dispose(); },
  };
}
