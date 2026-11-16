import type { createGameplay3D } from '@hyperfocus/engine/project/runtime-3d';
import type { createLocalExchangeReview } from './local-exchange.ts';

export function localExchangePresentation(options: { presentation: ReturnType<typeof createGameplay3D>['presentation']; review?: ReturnType<typeof createLocalExchangeReview>['state'] }) {
  const { presentation, review } = options;
  if (review?.active) return review.playing ? {
    layout: 'fight' as const, title: review.takeover ? 'Retry this exchange' : 'Final exchange',
    hint: review.takeover ? 'Same arena and AI. Pause for retry or return to result. No rewards are earned here.' : 'Recorded local inputs and AI. Pause to retry this exchange yourself.', actions: [],
  } : {
    layout: 'menu' as const, title: 'Final exchange', overlay: { title: 'Final exchange', body: 'Retry the recorded opening with the same damaged arena and opponent. The AI responds to your new choices. Only the latest 16 seconds are kept; longer exchanges start at the earliest retained moment.' },
    actions: [{ action: 'review:practice', label: 'Retry this exchange' }, { action: 'review:watch', label: 'Watch original exchange' }, ...(review.frame > 0 && review.frame < review.length ? [{ action: 'review:resume', label: 'Resume' }] : []), { action: 'review:save', label: 'Save situation' }, { action: 'review:leave', label: review.fromLibrary ? 'Return to local play' : 'Return to match result' }],
  };
  if (review?.available && presentation?.layout === 'result') return { ...presentation, actions: [
    ...(presentation.actions ?? []).filter(action => action.action !== 'match:learn-defense').slice(0, 1),
    { action: 'review:practice', label: 'Retry this exchange' }, { action: 'review:open', label: 'Review final exchange' },
    ...(presentation.actions ?? []).filter(action => action.action !== 'match:learn-defense').slice(1),
  ] };
  return presentation;
}
