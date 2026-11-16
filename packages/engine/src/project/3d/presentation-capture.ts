import type { createCombatSimulation } from '../../combat/simulation.ts';
import type { createCombatEnvironment } from './combat-environment/session.ts';
import type { createCombatInteractions } from './combat-interaction/session.ts';
import type { createCombatMatch3D } from './combat-match/index.ts';
import type { createCombatMotion3D } from './combat-motion.ts';
import type { createDefenseFeedback3D } from './combat-visuals/defense-feedback.ts';

/** Detached components owned by one synchronous presentation/read invocation. */
export type CombatPresentationCapture3D = {
  state: ReturnType<ReturnType<typeof createCombatSimulation>['capture']>;
  motion: ReturnType<ReturnType<typeof createCombatMotion3D>['capture']>;
  defenseFeedback: ReturnType<ReturnType<typeof createDefenseFeedback3D>['capture']>;
  interactions?: ReturnType<ReturnType<typeof createCombatInteractions>['capture']>;
  environment?: ReturnType<ReturnType<typeof createCombatEnvironment>['capture']>;
  match?: ReturnType<ReturnType<typeof createCombatMatch3D>['capture']>;
};

export function createPresentationCaptureWork() {
  return { compositeCaptures: 0, simulationCaptures: 0, interactionCaptures: 0,
    motionCaptures: 0, feedbackCaptures: 0, environmentCaptures: 0, matchCaptures: 0,
    sharedApplications: 0, independentApplications: 0, callbackFallbacks: 0, unsupportedFallbacks: 0 };
}
export type PresentationCaptureWork = ReturnType<typeof createPresentationCaptureWork>;
export type PresentationCaptureStrategy = 'independent' | 'shared';
export type PresentationObserverContract = 'read-only';

/** Count actual calls, including a capture which subsequently throws. */
export function capturePresentationComponent<T>(read: () => T, key: keyof PresentationCaptureWork, work?: PresentationCaptureWork): T {
  if (work) work[key]++;
  return read();
}

/** Select outside presentation loops. No object or frame is retained here.
 * A trusted observer may change evaluated frame/camera records, but must not
 * advance, restore or mutate gameplay/runtime state, mutate capture inputs,
 * reenter this operation, or retain a capture input. The ordinary path remains
 * authoritative when an arbitrary callback is supplied.
 */
export function useSharedPresentationCapture(options: {
  capture?: PresentationCaptureStrategy;
  observerContract?: PresentationObserverContract;
  hasCallbacks: boolean;
  supported: boolean;
  work?: PresentationCaptureWork;
}) {
  if (options.capture !== undefined && options.capture !== 'independent' && options.capture !== 'shared') throw Error('Unsupported presentation capture strategy.');
  if (options.observerContract !== undefined && options.observerContract !== 'read-only') throw Error('Unsupported presentation observer contract.');
  const requested = options.capture === 'shared';
  const callbackFallback = requested && options.hasCallbacks && options.observerContract !== 'read-only';
  const shared = requested && !callbackFallback && options.supported;
  if (options.work) {
    options.work.callbackFallbacks += Number(callbackFallback);
    options.work.unsupportedFallbacks += Number(requested && !options.supported);
    options.work.sharedApplications += Number(shared);
    options.work.independentApplications += Number(!shared);
  }
  return shared;
}
