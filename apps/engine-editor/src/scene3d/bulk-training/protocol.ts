import type { CombatAiPolicy, GameplayProject3D, PortableAsset3D } from '@hyperfocus/engine/project/runtime-3d';
import type { createPolicyExperiment } from '@hyperfocus/touch-of-death/learning/experiment';
import type { TrialEvidence } from '@hyperfocus/touch-of-death/trial-evidence';
import type { PolicyResult, PolicyTrial } from '@hyperfocus/touch-of-death/learning/trials';
import type { ContextualTrialInput, ContextualTrialResult, ContextualTrainingReport } from './adaptation/session.ts';
import type { ScenarioRequest, ScenarioResponse } from './scenario/worker.ts';

export type BulkSimulationOptions = {
  project: GameplayProject3D;
  assets: readonly PortableAsset3D[];
  seed: number;
  seedStride?: number;
  maxMatchTicks?: number;
  learning?: { active?: CombatAiPolicy; previous?: CombatAiPolicy };
  /** A main-thread coordinator supplies fixed jobs; the runtime is reused between them. */
  externalTrials?: boolean;
  /** Search/ordinary sets inherit evidence; held-out offset comparisons stay independent. */
  contextual?: ContextualTrialInput;
};
export type BulkProgress = {
  fights: number;
  p1Wins: number;
  p2Wins: number;
  draws: number;
  capped: number;
  ticks: number;
  /** Evicted/omitted aggregate rows, not lost hits. Absent means legacy coverage is unknown. */
  droppedMoveSummaries?: number;
  seed: number;
  learning?: ReturnType<ReturnType<typeof createPolicyExperiment>['snapshot']>;
  /** Completed out-of-order jobs for inspection; never part of policy approval. */
  pendingTrialResults?: NonNullable<BulkProgress['learning']>['trials'];
  /** Continuous experiments; completed retention is bounded, live evidence remains exact. */
  experiments?: {
    started: number; completed: number; canceled: number; omitted: number; pendingOmitted?: number;
    recent: NonNullable<BulkProgress['learning']>[];
    pending: { sequence: number; learning: NonNullable<BulkProgress['learning']>; pendingTrialResults: NonNullable<BulkProgress['learning']>['trials'] }[];
  };
  trials?: TrialEvidence[];
  insights: string[];
  moves: { moveId: string; hits: number; damage: number; whiffs: number; blocked: number; parried: number }[];
  current?: { seed: number; ticks: number; phase: string; p1Rounds: number; p2Rounds: number };
  contextual?: ContextualTrainingReport;
  contextualResult?: ContextualTrialResult;
  /** Frozen saved model against a cold model, alternating seats on paired seeds. */
  benchmark?: { sets: number; points: number; capped: number };
};
export type BulkWorkerRequest =
  | ScenarioRequest
  | ({ type: 'init'; effort: number } & BulkSimulationOptions)
  | { type: 'effort'; effort: number }
  | { type: 'trial'; trial: PolicyTrial; contextual?: ContextualTrialInput }
  | { type: 'pause' | 'resume' | 'stop' };
export type BulkWorkerResponse =
  | ScenarioResponse
  | { type: 'ready' | 'stopped' }
  | { type: 'progress'; progress: BulkProgress }
  | { type: 'trial-result'; result: PolicyResult; progress: BulkProgress }
  | { type: 'error'; message: string };
