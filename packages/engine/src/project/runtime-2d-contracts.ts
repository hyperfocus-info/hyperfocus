export const DEFAULT_FIXED_STEP_SECONDS = 1 / 60;
export const DEFAULT_MAX_SUB_STEPS = 8;
export const DEFAULT_MAX_PENDING_AUDIO_COMMANDS = 4_096;
export const DEFAULT_MAX_BEHAVIOR_COMMANDS_PER_STEP = 1_024;
export const EPSILON = 1e-9;

export type PlayableValue2D = string | number | boolean;

export type PlayableBehaviorField2D = {
  key: string;
  label: string;
  description?: string;
  group?: string;
  advanced?: boolean;
  optional?: boolean;
} & (
  | { type: "number"; default: number; minimum?: number; maximum?: number; step?: number; unit?: string }
  | { type: "boolean"; default: boolean }
  | { type: "text"; default: string; placeholder?: string }
  | { type: "select"; default: string; options: ReadonlyArray<{ value: string; label: string }> }
  | { type: "action" | "entity" | "asset" | "scene" | "state-key"; default: string }
);

export type PlayableBehaviorEventDefinition2D = {
  name: string;
  label: string;
  description?: string;
};

/** Framework-neutral metadata used by inspectors, documentation, and validation. */
export type PlayableBehaviorDefinition2D = {
  version: 1;
  id: string;
  module: string;
  exportName: string;
  label: string;
  description: string;
  category?: string;
  builtIn?: boolean;
  fields: readonly PlayableBehaviorField2D[];
  events?: readonly PlayableBehaviorEventDefinition2D[];
};

export type PlayableState2D = Readonly<Record<string, PlayableValue2D>>;

export type PlayableBehaviorEvent2D = {
  name: string;
  sourceEntityId: string;
  sourceComponentId: string;
  data?: Readonly<Record<string, PlayableValue2D>>;
};

export type PlayableInputFrame = {
  /** Engine-neutral action names, for example `move-left`. */
  actions?: Iterable<string>;
  /** Physical binding names from project settings, for example `KeyA`. */
  bindings?: Iterable<string>;
};

export type PlayableComponent2D = {
  id: string;
  type: string;
  enabled: boolean;
  values: Record<string, string | number | boolean>;
};

export type PlayableEntity2D = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  /** Optional authored rotation in clockwise Canvas 2D radians. */
  rotation?: number;
  /** Optional authored rendering alpha. */
  opacity?: number;
  layer: number;
  color: string;
  accent: string;
  kind: string;
  parentId?: string;
  components: PlayableComponent2D[];
};

export type PlayableProject2D = {
  activeSceneId: string;
  scenes: Array<{ id: string; entities: PlayableEntity2D[] }>;
  assets?: Array<{ id: string; kind?: string; mimeType?: string }>;
  tilemap: { columns: number; rows: number; tileSize: number; values: number[]; solidValues?: number[] };
  settings: { input: Array<{ action: string; bindings: string[] }> };
};

export type PlayableDiagnostic = {
  severity: "warning";
  code: "unsupported-behavior" | "unsupported-collider-shape";
  sceneId: string;
  entityId: string;
  componentId: string;
  message: string;
};

export type PlayableEntitySnapshot = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation?: number;
  opacity?: number;
  layer: number;
  color: string;
  accent: string;
  kind: string;
  parentId?: string;
  /** Present on snapshots created by current runtimes so spawned entities can be restored. */
  components?: PlayableComponent2D[];
};

export type PlayableWorldSnapshot = {
  version: 1;
  sceneId: string;
  tick: number;
  simulationTimeSeconds: number;
  entities: PlayableEntitySnapshot[];
  state?: Record<string, PlayableValue2D>;
  platformers?: PlayablePlatformerSnapshot[];
  previousActions?: string[];
  previousEvents?: PlayableBehaviorEvent2D[];
};

export type PlayablePlatformerSnapshot = {
  entityId: string;
  componentId: string;
  verticalVelocity: number;
  grounded: boolean;
  coyoteSeconds: number;
  jumpBufferSeconds: number;
};

export type PlayableCollision = {
  entityId: string;
  axis: "x" | "y";
  kind: "entity" | "tile";
  targetId?: string;
  tileColumn?: number;
  tileRow?: number;
};

export type PlayableAudioCommand =
  | {
    type: "play";
    commandId: string;
    sceneId: string;
    entityId: string;
    componentId: string;
    assetId: string;
    bus: "music" | "sfx" | "voice" | "ambient";
    gain: number;
    pan: number;
    loop: boolean;
    priority: number;
  }
  | { type: "stop-scene"; commandId: string; sceneId: string };

export type PlayableBehaviorCommand2D =
  | { type: "set-state"; key: string; value: PlayableValue2D }
  | { type: "increment-state"; key: string; amount?: number }
  | { type: "spawn-entity"; entity: PlayableEntity2D }
  | { type: "destroy-entity"; entityId?: string }
  | { type: "set-component-value"; entityId?: string; componentId: string; key: string; value: PlayableValue2D }
  | { type: "set-ui-text"; entityId: string; componentId?: string; text: string }
  | {
    type: "play-audio";
    assetId: string;
    bus?: "music" | "sfx" | "voice" | "ambient";
    gain?: number;
    pan?: number;
    loop?: boolean;
    priority?: number;
  }
  | { type: "switch-scene"; sceneId: string }
  | { type: "emit-event"; name: string; data?: Readonly<Record<string, PlayableValue2D>> };

export type PlayableBehaviorCommandRecord2D = {
  sourceEntityId: string;
  sourceComponentId: string;
  command: PlayableBehaviorCommand2D;
};

export type PlayableStepResult = {
  tick: number;
  simulationTimeSeconds: number;
  collisions: PlayableCollision[];
  audioCommands: PlayableAudioCommand[];
  commands: PlayableBehaviorCommandRecord2D[];
  events: PlayableBehaviorEvent2D[];
};

export type PlayableAdvanceResult = PlayableStepResult & {
  steps: number;
  /** Fraction of a fixed tick left in the accumulator, useful for rendering interpolation. */
  alpha: number;
  droppedSeconds: number;
};

export type PlayableWorldOptions = {
  fixedStepSeconds?: number;
  maxSubSteps?: number;
  maxPendingAudioCommands?: number;
  maxBehaviorCommandsPerStep?: number;
  /** Statically bundled host behaviors keyed by `module#export`. */
  behaviors?: PlayableBehaviorRegistry2D;
};

export type PlayableBehaviorResult2D = {
  velocityX?: number;
  velocityY?: number;
  commands?: readonly PlayableBehaviorCommand2D[];
};

export type PlayableBehaviorContext2D = {
  entity: Readonly<PlayableEntitySnapshot>;
  component: Readonly<PlayableComponent2D>;
  actions: readonly string[];
  /** World state from the beginning of the fixed tick. Update it with explicit commands. */
  state: PlayableState2D;
  /** Events emitted during the previous fixed tick. */
  events: readonly PlayableBehaviorEvent2D[];
  deltaSeconds: number;
  tick: number;
  simulationTimeSeconds: number;
};

export type PlayableBehavior2D = (context: PlayableBehaviorContext2D) => PlayableBehaviorResult2D | void;
export type PlayableBehaviorRegistry2D = Readonly<Record<string, PlayableBehavior2D>>;
export type DefinedPlayableBehavior2D = PlayableBehavior2D & { readonly definition: Readonly<PlayableBehaviorDefinition2D> };

export type RuntimeEntity = PlayableEntitySnapshot & {
  source: PlayableEntity2D;
};

export type Bounds = { left: number; top: number; right: number; bottom: number };

export type Obstacle = Bounds & {
  kind: "entity" | "tile";
  targetId?: string;
  tileColumn?: number;
  tileRow?: number;
};

export type PatrolState = { originX: number; originY: number; direction: 1 | -1 };
export type PongBallState = { originX: number; originY: number; velocityX: number; velocityY: number; maximumSpeed: number };
export type PlatformerState = {
  verticalVelocity: number;
  grounded: boolean;
  coyoteSeconds: number;
  jumpBufferSeconds: number;
};

export type QueuedBehaviorCommand = PlayableBehaviorCommandRecord2D;
