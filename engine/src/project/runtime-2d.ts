const DEFAULT_FIXED_STEP_SECONDS = 1 / 60;
const DEFAULT_MAX_SUB_STEPS = 8;
const DEFAULT_MAX_PENDING_AUDIO_COMMANDS = 4_096;
const EPSILON = 1e-9;
const BUILTIN_BEHAVIORS = new Set([
  "builtin:player",
  "builtin:patrol",
  "builtin:platformer",
  "builtin:pong-paddle",
  "builtin:pong-ai",
  "builtin:pong-ball",
]);

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
  layer: number;
  color: string;
  accent: string;
  kind: string;
  parentId?: string;
};

export type PlayableWorldSnapshot = {
  version: 1;
  sceneId: string;
  tick: number;
  simulationTimeSeconds: number;
  entities: PlayableEntitySnapshot[];
  platformers?: PlayablePlatformerSnapshot[];
  previousActions?: string[];
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

export type PlayableStepResult = {
  tick: number;
  simulationTimeSeconds: number;
  collisions: PlayableCollision[];
  audioCommands: PlayableAudioCommand[];
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
  /** Statically bundled host behaviors keyed by `module#export`. */
  behaviors?: PlayableBehaviorRegistry2D;
};

export type PlayableBehaviorResult2D = {
  velocityX?: number;
  velocityY?: number;
};

export type PlayableBehaviorContext2D = {
  entity: Readonly<PlayableEntitySnapshot>;
  component: Readonly<PlayableComponent2D>;
  actions: readonly string[];
  deltaSeconds: number;
  tick: number;
  simulationTimeSeconds: number;
};

export type PlayableBehavior2D = (context: PlayableBehaviorContext2D) => PlayableBehaviorResult2D | void;
export type PlayableBehaviorRegistry2D = Readonly<Record<string, PlayableBehavior2D>>;

type RuntimeEntity = PlayableEntitySnapshot & {
  source: PlayableEntity2D;
};

type Bounds = { left: number; top: number; right: number; bottom: number };

type Obstacle = Bounds & {
  kind: "entity" | "tile";
  targetId?: string;
  tileColumn?: number;
  tileRow?: number;
};

type PatrolState = { originX: number; originY: number; direction: 1 | -1 };
type PongBallState = { originX: number; originY: number; velocityX: number; velocityY: number; maximumSpeed: number };
type PlatformerState = {
  verticalVelocity: number;
  grounded: boolean;
  coyoteSeconds: number;
  jumpBufferSeconds: number;
};

/**
 * Returns every feature that a generated playable cannot execute faithfully.
 * Diagnostics are stable in project/scene/entity/component order.
 */
export function auditPlayableProject(project: PlayableProject2D, supportedBehaviors: Iterable<string> = []): PlayableDiagnostic[] {
  validatePlayableProject(project);
  const supported = new Set(supportedBehaviors);
  const diagnostics: PlayableDiagnostic[] = [];
  for (const scene of project.scenes) {
    for (const entity of scene.entities) {
      for (const component of entity.components) {
        if (!component.enabled) continue;
        const behaviorKey = component.type === "behavior" ? playableBehaviorKey(component) : undefined;
        if (component.type === "behavior" && !BUILTIN_BEHAVIORS.has(String(component.values.module)) && (!behaviorKey || !supported.has(behaviorKey))) {
          const moduleName = typeof component.values.module === "string" ? component.values.module : "(missing module)";
          diagnostics.push({
            severity: "warning",
            code: "unsupported-behavior",
            sceneId: scene.id,
            entityId: entity.id,
            componentId: component.id,
            message: `Behavior ${moduleName} is not executed by the portable runtime. Use an explicit built-in behavior or a host build pipeline.`,
          });
        }
        if (component.type === "collider") {
          const shape = component.values.shape;
          if (shape !== undefined && shape !== "box" && shape !== "aabb") {
            diagnostics.push({
              severity: "warning",
              code: "unsupported-collider-shape",
              sceneId: scene.id,
              entityId: entity.id,
              componentId: component.id,
              message: `Collider shape ${String(shape)} is not executed by the portable runtime; supported shapes are box and aabb.`,
            });
          }
        }
      }
    }
  }
  return diagnostics;
}

/** A deterministic, DOM-free simulation for portable editor projects. */
export class PlayableWorld {
  readonly fixedStepSeconds: number;
  readonly maxSubSteps: number;
  readonly maxPendingAudioCommands: number;
  readonly diagnostics: readonly PlayableDiagnostic[];

  private readonly project: PlayableProject2D;
  private readonly behaviors: PlayableBehaviorRegistry2D;
  private entities: RuntimeEntity[] = [];
  private entityById = new Map<string, RuntimeEntity>();
  private patrols = new Map<string, PatrolState>();
  private platformers = new Map<string, PlatformerState>();
  private pongBalls = new Map<string, PongBallState>();
  private audioQueue: PlayableAudioCommand[] = [];
  private previousActions = new Set<string>();
  private accumulatorSeconds = 0;
  private currentSceneId: string;
  private currentTick = 0;
  private currentSimulationTimeSeconds = 0;

  constructor(project: PlayableProject2D, options: PlayableWorldOptions = {}) {
    validatePlayableProject(project);
    this.project = structuredClone(project);
    this.fixedStepSeconds = positiveFinite(options.fixedStepSeconds, DEFAULT_FIXED_STEP_SECONDS, "fixedStepSeconds");
    this.maxSubSteps = positiveInteger(options.maxSubSteps, DEFAULT_MAX_SUB_STEPS, "maxSubSteps");
    this.maxPendingAudioCommands = positiveInteger(options.maxPendingAudioCommands, DEFAULT_MAX_PENDING_AUDIO_COMMANDS, "maxPendingAudioCommands");
    this.behaviors = Object.freeze({ ...(options.behaviors ?? {}) });
    this.diagnostics = Object.freeze(auditPlayableProject(this.project, Object.keys(this.behaviors)).map((item) => Object.freeze({ ...item })));
    this.currentSceneId = this.project.activeSceneId;
    this.loadScene(this.currentSceneId);
  }

  get sceneId() { return this.currentSceneId; }
  get tick() { return this.currentTick; }
  get simulationTimeSeconds() { return this.currentSimulationTimeSeconds; }

  getEntity(id: string): PlayableEntitySnapshot | undefined {
    const entity = this.entityById.get(id);
    return entity ? snapshotEntity(entity) : undefined;
  }

  getPlatformerState(entityId: string): PlayablePlatformerSnapshot | undefined {
    const entity = this.entityById.get(entityId);
    const component = entity && enabledComponents(entity.source, "behavior").find((candidate) => candidate.values.module === "builtin:platformer");
    const state = component && this.platformers.get(controllerKey(entityId, component.id));
    return component && state ? platformerSnapshot(entityId, component.id, state) : undefined;
  }

  snapshot(): PlayableWorldSnapshot {
    return {
      version: 1,
      sceneId: this.currentSceneId,
      tick: this.currentTick,
      simulationTimeSeconds: this.currentSimulationTimeSeconds,
      entities: this.entities.map(snapshotEntity),
      ...(this.platformers.size ? { platformers: this.platformerSnapshots() } : {}),
      ...(this.previousActions.size ? { previousActions: [...this.previousActions].sort() } : {}),
    };
  }

  /** Returns pending host-side audio work exactly once, in authored order. */
  drainAudioCommands(): PlayableAudioCommand[] {
    const commands = this.audioQueue.map(cloneAudioCommand);
    this.audioQueue.length = 0;
    return commands;
  }

  /** Loads a scene from its authored state and resets its simulation clock. */
  switchScene(sceneId: string): PlayableWorldSnapshot {
    this.loadScene(sceneId);
    return this.snapshot();
  }

  /** Restores an explicit state without mutating the authored project. */
  restore(snapshot: PlayableWorldSnapshot): PlayableWorldSnapshot {
    if (snapshot.version !== 1) throw new Error(`Unsupported playable snapshot version: ${String(snapshot.version)}`);
    this.loadScene(snapshot.sceneId);
    const expectedIds = new Set(this.entities.map((entity) => entity.id));
    if (snapshot.entities.length !== expectedIds.size) throw new Error("Playable snapshot entity count does not match its scene.");
    for (const state of snapshot.entities) {
      const entity = this.entityById.get(state.id);
      if (!entity || !expectedIds.delete(state.id)) throw new Error(`Playable snapshot contains an unknown or duplicate entity: ${state.id}`);
      if (!Number.isFinite(state.x) || !Number.isFinite(state.y)) throw new Error(`Playable snapshot has an invalid transform for entity: ${state.id}`);
      entity.x = state.x;
      entity.y = state.y;
    }
    if (expectedIds.size) throw new Error("Playable snapshot is missing scene entities.");
    if (!Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0 || !Number.isFinite(snapshot.simulationTimeSeconds) || snapshot.simulationTimeSeconds < 0) {
      throw new Error("Playable snapshot clock is invalid.");
    }
    this.currentTick = snapshot.tick;
    this.currentSimulationTimeSeconds = snapshot.simulationTimeSeconds;
    this.accumulatorSeconds = 0;
    this.resetPatrolOrigins();
    this.restorePlatformers(snapshot.platformers);
    this.resetPongBalls();
    if (snapshot.previousActions !== undefined && (!Array.isArray(snapshot.previousActions) || snapshot.previousActions.some((action) => typeof action !== "string"))) throw new Error("Playable snapshot previous actions are invalid.");
    this.previousActions = new Set(snapshot.previousActions ?? []);
    return this.snapshot();
  }

  /** Runs exactly one fixed simulation tick. */
  step(input: PlayableInputFrame = {}): PlayableStepResult {
    const actions = this.resolveActions(input);
    const collisions: PlayableCollision[] = [];
    const audioCommands = this.enqueueActionAudio(actions);
    for (const entity of this.entities) {
      const velocity = this.velocityFor(entity, actions);
      if (velocity.x === 0 && velocity.y === 0) continue;
      const excludedIds = new Set([entity.id, ...this.descendantIds(entity.id)]);
      const movedX = this.moveOnAxis(entity, "x", velocity.x * this.fixedStepSeconds, excludedIds, collisions);
      if (Math.abs(movedX - velocity.x * this.fixedStepSeconds) > EPSILON) this.pongBallCollision(entity, "x");
      if (movedX !== 0) this.translateDescendants(entity.id, movedX, 0);
      const requestedY = velocity.y * this.fixedStepSeconds;
      const movedY = this.moveOnAxis(entity, "y", requestedY, excludedIds, collisions);
      if (Math.abs(movedY - requestedY) > EPSILON) this.pongBallCollision(entity, "y");
      if (Math.abs(movedY - requestedY) > EPSILON) this.platformerVerticalCollision(entity, requestedY);
      if (movedY !== 0) this.translateDescendants(entity.id, 0, movedY);
      this.resetPongBallAfterScore(entity);
    }
    this.currentTick += 1;
    this.currentSimulationTimeSeconds = this.currentTick * this.fixedStepSeconds;
    this.previousActions = actions;
    return { tick: this.currentTick, simulationTimeSeconds: this.currentSimulationTimeSeconds, collisions, audioCommands: audioCommands.map(cloneAudioCommand) };
  }

  /**
   * Advances wall-clock time through bounded fixed ticks. Excess time is reported,
   * not simulated, so a suspended tab cannot create an unbounded catch-up loop.
   */
  advance(elapsedSeconds: number, input: PlayableInputFrame = {}): PlayableAdvanceResult {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) throw new Error("elapsedSeconds must be a finite non-negative number.");
    this.accumulatorSeconds += elapsedSeconds;
    let steps = 0;
    let droppedSeconds = 0;
    let last: PlayableStepResult = { tick: this.currentTick, simulationTimeSeconds: this.currentSimulationTimeSeconds, collisions: [], audioCommands: [] };
    const audioCommands: PlayableAudioCommand[] = [];
    while (this.accumulatorSeconds + EPSILON >= this.fixedStepSeconds && steps < this.maxSubSteps) {
      last = this.step(input);
      audioCommands.push(...last.audioCommands);
      this.accumulatorSeconds -= this.fixedStepSeconds;
      if (this.accumulatorSeconds < EPSILON) this.accumulatorSeconds = 0;
      steps += 1;
    }
    if (this.accumulatorSeconds + EPSILON >= this.fixedStepSeconds) {
      const retained = this.accumulatorSeconds % this.fixedStepSeconds;
      droppedSeconds = this.accumulatorSeconds - retained;
      this.accumulatorSeconds = retained;
    }
    return {
      ...last,
      collisions: last.collisions.map((collision) => ({ ...collision })),
      audioCommands: audioCommands.map(cloneAudioCommand),
      steps,
      alpha: this.accumulatorSeconds / this.fixedStepSeconds,
      droppedSeconds,
    };
  }

  private loadScene(sceneId: string) {
    const scene = this.project.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) throw new Error(`Unknown playable scene: ${sceneId}`);
    if (this.entityById.size || this.currentTick > 0) {
      this.enqueueAudio([{ type: "stop-scene", commandId: `stop:${this.currentSceneId}:${this.currentTick}`, sceneId: this.currentSceneId }]);
    }
    this.currentSceneId = sceneId;
    this.entities = scene.entities.map((entity) => ({ ...snapshotEntity(entity), source: structuredClone(entity) }));
    this.entityById = new Map(this.entities.map((entity) => [entity.id, entity]));
    this.currentTick = 0;
    this.currentSimulationTimeSeconds = 0;
    this.accumulatorSeconds = 0;
    this.previousActions.clear();
    this.resetPatrolOrigins();
    this.resetPlatformers();
    this.resetPongBalls();
    this.enqueueAudio(this.sceneStartAudio(sceneId));
  }

  private sceneStartAudio(sceneId: string): PlayableAudioCommand[] {
    const scene = this.project.scenes.find((candidate) => candidate.id === sceneId)!;
    const commands: PlayableAudioCommand[] = [];
    for (const entity of scene.entities) {
      for (const component of enabledComponents(entity, "audio")) {
        if (component.values.autoplay === true || component.values.trigger === "start") commands.push(audioPlayCommand(sceneId, entity.id, component, this.currentTick));
      }
    }
    return commands;
  }

  private enqueueActionAudio(actions: ReadonlySet<string>): PlayableAudioCommand[] {
    const scene = this.project.scenes.find((candidate) => candidate.id === this.currentSceneId)!;
    const commands: PlayableAudioCommand[] = [];
    for (const entity of scene.entities) {
      for (const component of enabledComponents(entity, "audio")) {
        const trigger = component.values.trigger;
        if (typeof trigger !== "string" || !trigger.startsWith("action:")) continue;
        const action = trigger.slice("action:".length);
        if (actions.has(action) && !this.previousActions.has(action)) commands.push(audioPlayCommand(scene.id, entity.id, component, this.currentTick));
      }
    }
    this.enqueueAudio(commands);
    return commands;
  }

  private enqueueAudio(commands: readonly PlayableAudioCommand[]) {
    if (this.audioQueue.length + commands.length > this.maxPendingAudioCommands) {
      throw new Error(`Playable audio command queue exceeds the limit of ${this.maxPendingAudioCommands}; the host must drain commands regularly.`);
    }
    this.audioQueue.push(...commands.map(cloneAudioCommand));
  }

  private resetPatrolOrigins() {
    this.patrols.clear();
    for (const entity of this.entities) {
      for (const component of enabledComponents(entity.source, "behavior")) {
        if (component.values.module === "builtin:patrol") {
          this.patrols.set(`${entity.id}\0${component.id}`, { originX: entity.x, originY: entity.y, direction: 1 });
        }
      }
    }
  }

  private resetPlatformers() {
    this.platformers.clear();
    for (const entity of this.entities) {
      for (const component of enabledComponents(entity.source, "behavior")) {
        if (component.values.module !== "builtin:platformer") continue;
        this.platformers.set(controllerKey(entity.id, component.id), {
          verticalVelocity: 0,
          grounded: this.isGrounded(entity, platformerNumber(component, "groundProbe", 0.05)),
          coyoteSeconds: 0,
          jumpBufferSeconds: 0,
        });
      }
    }
  }

  private resetPongBalls() {
    this.pongBalls.clear();
    for (const entity of this.entities) {
      for (const component of enabledComponents(entity.source, "behavior")) {
        if (component.values.module !== "builtin:pong-ball") continue;
        const velocityX = finiteNumber(component.values.velocityX, 285);
        const velocityY = finiteNumber(component.values.velocityY, 185);
        this.pongBalls.set(controllerKey(entity.id, component.id), {
          originX: entity.x,
          originY: entity.y,
          velocityX,
          velocityY,
          maximumSpeed: Math.max(Math.abs(velocityX), Math.abs(velocityY), finiteNumber(component.values.maximumSpeed, 520)),
        });
      }
    }
  }

  private pongBallCollision(entity: RuntimeEntity, axis: "x" | "y") {
    for (const component of enabledComponents(entity.source, "behavior")) {
      if (component.values.module !== "builtin:pong-ball") continue;
      const state = this.pongBalls.get(controllerKey(entity.id, component.id));
      if (!state) continue;
      if (axis === "x") state.velocityX = clamp(-state.velocityX * 1.025, -state.maximumSpeed, state.maximumSpeed);
      else state.velocityY = clamp(-state.velocityY, -state.maximumSpeed, state.maximumSpeed);
    }
  }

  private resetPongBallAfterScore(entity: RuntimeEntity) {
    const width = this.project.tilemap.columns * this.project.tilemap.tileSize;
    if (entity.x >= -entity.width && entity.x <= width + entity.width) return;
    for (const component of enabledComponents(entity.source, "behavior")) {
      if (component.values.module !== "builtin:pong-ball") continue;
      const state = this.pongBalls.get(controllerKey(entity.id, component.id));
      if (!state) continue;
      const servedRight = entity.x < 0;
      entity.x = state.originX;
      entity.y = state.originY;
      state.velocityX = Math.abs(finiteNumber(component.values.velocityX, 285)) * (servedRight ? 1 : -1);
      state.velocityY = finiteNumber(component.values.velocityY, 185) * (this.currentTick % 2 ? 1 : -1);
    }
  }

  private platformerSnapshots() {
    const snapshots: PlayablePlatformerSnapshot[] = [];
    for (const entity of this.entities) {
      for (const component of enabledComponents(entity.source, "behavior")) {
        if (component.values.module !== "builtin:platformer") continue;
        const state = this.platformers.get(controllerKey(entity.id, component.id));
        if (state) snapshots.push(platformerSnapshot(entity.id, component.id, state));
      }
    }
    return snapshots;
  }

  private restorePlatformers(snapshots: readonly PlayablePlatformerSnapshot[] | undefined) {
    if (snapshots === undefined) return;
    const expected = new Set(this.platformers.keys());
    if (snapshots.length !== expected.size) throw new Error("Playable snapshot platformer controller count does not match its scene.");
    for (const snapshot of snapshots) {
      const key = controllerKey(snapshot.entityId, snapshot.componentId);
      if (!expected.delete(key)) throw new Error(`Playable snapshot contains an unknown or duplicate platformer controller: ${snapshot.entityId}/${snapshot.componentId}`);
      if (!Number.isFinite(snapshot.verticalVelocity) || !Number.isFinite(snapshot.coyoteSeconds) || snapshot.coyoteSeconds < 0 || !Number.isFinite(snapshot.jumpBufferSeconds) || snapshot.jumpBufferSeconds < 0 || typeof snapshot.grounded !== "boolean") {
        throw new Error(`Playable snapshot has invalid platformer state: ${snapshot.entityId}/${snapshot.componentId}`);
      }
      this.platformers.set(key, {
        verticalVelocity: snapshot.verticalVelocity,
        grounded: snapshot.grounded,
        coyoteSeconds: snapshot.coyoteSeconds,
        jumpBufferSeconds: snapshot.jumpBufferSeconds,
      });
    }
  }

  private platformerVelocity(entity: RuntimeEntity, component: PlayableComponent2D, actions: ReadonlySet<string>) {
    const state = this.platformers.get(controllerKey(entity.id, component.id));
    if (!state) return { x: 0, y: 0 };
    const leftAction = actionName(component, "leftAction", "move-left");
    const rightAction = actionName(component, "rightAction", "move-right");
    const jumpAction = actionName(component, "jumpAction", "jump");
    const runSpeed = platformerNumber(component, "runSpeed", 220);
    const gravity = platformerNumber(component, "gravity", 1_800);
    const jumpSpeed = platformerNumber(component, "jumpSpeed", 650);
    const maxFallSpeed = platformerNumber(component, "maxFallSpeed", 900);
    const coyoteDuration = platformerNumber(component, "coyoteMs", 100) / 1_000;
    const bufferDuration = platformerNumber(component, "jumpBufferMs", 100) / 1_000;
    const jumpCutMultiplier = platformerNumber(component, "jumpCutMultiplier", 0.5);
    const grounded = this.isGrounded(entity, platformerNumber(component, "groundProbe", 0.05));
    state.grounded = grounded;
    state.coyoteSeconds = grounded ? coyoteDuration : Math.max(0, state.coyoteSeconds - this.fixedStepSeconds);
    state.jumpBufferSeconds = Math.max(0, state.jumpBufferSeconds - this.fixedStepSeconds);
    const jumpActive = actions.has(jumpAction);
    const jumpWasActive = this.previousActions.has(jumpAction);
    const jumpPressed = jumpActive && !jumpWasActive;
    if (jumpPressed) state.jumpBufferSeconds = bufferDuration;
    if ((jumpPressed || state.jumpBufferSeconds > 0) && (grounded || state.coyoteSeconds > 0)) {
      state.verticalVelocity = -jumpSpeed;
      state.grounded = false;
      state.coyoteSeconds = 0;
      state.jumpBufferSeconds = 0;
    } else if (!jumpActive && jumpWasActive && state.verticalVelocity < 0) {
      state.verticalVelocity *= jumpCutMultiplier;
    }
    state.verticalVelocity = Math.min(maxFallSpeed, state.verticalVelocity + gravity * this.fixedStepSeconds);
    const horizontal = Number(actions.has(rightAction)) - Number(actions.has(leftAction));
    return { x: horizontal * runSpeed, y: state.verticalVelocity };
  }

  private platformerVerticalCollision(entity: RuntimeEntity, requestedY: number) {
    for (const component of enabledComponents(entity.source, "behavior")) {
      if (component.values.module !== "builtin:platformer") continue;
      const state = this.platformers.get(controllerKey(entity.id, component.id));
      if (!state) continue;
      state.verticalVelocity = 0;
      if (requestedY > 0) {
        state.grounded = true;
        state.coyoteSeconds = platformerNumber(component, "coyoteMs", 100) / 1_000;
      }
    }
  }

  private isGrounded(entity: RuntimeEntity, probeDistance: number) {
    if (!solidCollider(entity.source)) return false;
    const bounds = entityBounds(entity);
    const excluded = new Set([entity.id, ...this.descendantIds(entity.id)]);
    for (const obstacle of this.obstacles(excluded, bounds, "y", probeDistance)) {
      if (!intervalsOverlap(bounds.left, bounds.right, obstacle.left, obstacle.right)) continue;
      const gap = collisionGap(bounds, obstacle, "y", probeDistance);
      if (gap !== undefined && gap >= -EPSILON && gap <= probeDistance + EPSILON) return true;
    }
    return false;
  }

  private resolveActions(input: PlayableInputFrame): Set<string> {
    const actions = new Set(input.actions ?? []);
    const bindings = new Set(input.bindings ?? []);
    if (bindings.size) {
      for (const mapping of this.project.settings.input) {
        if (mapping.bindings.some((binding) => bindings.has(binding))) actions.add(mapping.action);
      }
    }
    return actions;
  }

  private velocityFor(entity: RuntimeEntity, actions: ReadonlySet<string>) {
    let x = 0;
    let y = 0;
    for (const component of enabledComponents(entity.source, "input")) {
      const speed = finiteNumber(component.values.speed, 180);
      const mapping = typeof component.values.mapping === "string" ? component.values.mapping : "";
      const left = actionActive(actions, actionName(component, "leftAction", "move-left"), mapping);
      const right = actionActive(actions, actionName(component, "rightAction", "move-right"), mapping);
      const up = actionActive(actions, actionName(component, "upAction", "move-up"), mapping);
      const down = actionActive(actions, actionName(component, "downAction", "move-down"), mapping);
      let inputX = Number(right) - Number(left);
      let inputY = Number(down) - Number(up);
      if (inputX && inputY) {
        inputX *= Math.SQRT1_2;
        inputY *= Math.SQRT1_2;
      }
      x += inputX * speed;
      y += inputY * speed;
    }
    for (const component of enabledComponents(entity.source, "behavior")) {
      if (component.values.module === "builtin:platformer") {
        const velocity = this.platformerVelocity(entity, component, actions);
        x += velocity.x;
        y += velocity.y;
        continue;
      }
      if (component.values.module === "builtin:pong-paddle") {
        const speed = Math.abs(finiteNumber(component.values.speed, 360));
        const up = actions.has(actionName(component, "upAction", "move-up"));
        const down = actions.has(actionName(component, "downAction", "move-down"));
        const minimum = finiteNumber(component.values.minimumY, 0);
        const maximum = finiteNumber(component.values.maximumY, this.project.tilemap.rows * this.project.tilemap.tileSize);
        if ((up && entity.y > minimum) || (down && entity.y < maximum)) y += (Number(down) - Number(up)) * speed;
        continue;
      }
      if (component.values.module === "builtin:pong-ai") {
        const ballId = typeof component.values.ballId === "string" ? component.values.ballId : "ball";
        const ball = this.entityById.get(ballId);
        if (!ball) continue;
        const speed = Math.abs(finiteNumber(component.values.speed, 295));
        const deadZone = Math.abs(finiteNumber(component.values.deadZone, 12));
        const delta = ball.y - entity.y;
        if (Math.abs(delta) > deadZone) y += Math.sign(delta) * speed;
        continue;
      }
      if (component.values.module === "builtin:pong-ball") {
        const state = this.pongBalls.get(controllerKey(entity.id, component.id));
        if (state) { x += state.velocityX; y += state.velocityY; }
        continue;
      }
      if (component.values.module !== "builtin:patrol") {
        if (component.values.module === "builtin:player") continue;
        const key = playableBehaviorKey(component);
        const behavior = key ? this.behaviors[key] : undefined;
        if (!behavior) continue;
        const result = behavior({
          entity: Object.freeze(snapshotEntity(entity)),
          component: Object.freeze({ ...component, values: Object.freeze({ ...component.values }) }),
          actions: Object.freeze([...actions].sort()),
          deltaSeconds: this.fixedStepSeconds,
          tick: this.currentTick,
          simulationTimeSeconds: this.currentSimulationTimeSeconds,
        });
        if (result !== undefined) {
          const velocityX = result.velocityX ?? 0;
          const velocityY = result.velocityY ?? 0;
          if (!Number.isFinite(velocityX) || !Number.isFinite(velocityY)) throw new Error(`Playable behavior ${key} returned a non-finite velocity.`);
          x += velocityX;
          y += velocityY;
        }
        continue;
      }
      const state = this.patrols.get(`${entity.id}\0${component.id}`);
      if (!state) continue;
      const axis = component.values.axis === "y" ? "y" : "x";
      const speed = Math.abs(finiteNumber(component.values.speed, 60));
      const distance = Math.abs(finiteNumber(component.values.distance, 96));
      const position = axis === "x" ? entity.x : entity.y;
      const origin = axis === "x" ? state.originX : state.originY;
      if (position >= origin + distance - EPSILON) state.direction = -1;
      else if (position <= origin - distance + EPSILON) state.direction = 1;
      if (axis === "x") x += state.direction * speed;
      else y += state.direction * speed;
    }
    return { x, y };
  }

  private moveOnAxis(entity: RuntimeEntity, axis: "x" | "y", requestedDelta: number, excludedIds: ReadonlySet<string>, collisions: PlayableCollision[]) {
    if (requestedDelta === 0) return 0;
    if (!solidCollider(entity.source)) {
      entity[axis] += requestedDelta;
      return requestedDelta;
    }
    const bounds = entityBounds(entity);
    let allowedDelta = requestedDelta;
    let hit: Obstacle | undefined;
    for (const obstacle of this.obstacles(excludedIds, bounds, axis, requestedDelta)) {
      if (axis === "x" && !intervalsOverlap(bounds.top, bounds.bottom, obstacle.top, obstacle.bottom)) continue;
      if (axis === "y" && !intervalsOverlap(bounds.left, bounds.right, obstacle.left, obstacle.right)) continue;
      const gap = collisionGap(bounds, obstacle, axis, requestedDelta);
      if (gap === undefined) continue;
      if ((requestedDelta > 0 && gap < allowedDelta) || (requestedDelta < 0 && gap > allowedDelta)) {
        allowedDelta = gap;
        hit = obstacle;
      }
    }
    entity[axis] += allowedDelta;
    if (hit) collisions.push({
      entityId: entity.id,
      axis,
      kind: hit.kind,
      ...(hit.targetId ? { targetId: hit.targetId } : {}),
      ...(hit.tileColumn !== undefined ? { tileColumn: hit.tileColumn, tileRow: hit.tileRow } : {}),
    });
    return allowedDelta;
  }

  private obstacles(excludedIds: ReadonlySet<string>, bounds: Bounds, axis: "x" | "y", delta: number): Obstacle[] {
    const obstacles: Obstacle[] = [];
    for (const candidate of this.entities) {
      if (excludedIds.has(candidate.id) || !solidCollider(candidate.source)) continue;
      obstacles.push({ ...entityBounds(candidate), kind: "entity", targetId: candidate.id });
    }
    const tilemap = this.project.tilemap;
    const swept: Bounds = axis === "x"
      ? { left: Math.min(bounds.left, bounds.left + delta), right: Math.max(bounds.right, bounds.right + delta), top: bounds.top, bottom: bounds.bottom }
      : { left: bounds.left, right: bounds.right, top: Math.min(bounds.top, bounds.top + delta), bottom: Math.max(bounds.bottom, bounds.bottom + delta) };
    const firstColumn = clamp(Math.floor(swept.left / tilemap.tileSize), 0, tilemap.columns - 1);
    const lastColumn = clamp(Math.floor((swept.right - EPSILON) / tilemap.tileSize), 0, tilemap.columns - 1);
    const firstRow = clamp(Math.floor(swept.top / tilemap.tileSize), 0, tilemap.rows - 1);
    const lastRow = clamp(Math.floor((swept.bottom - EPSILON) / tilemap.tileSize), 0, tilemap.rows - 1);
    if (swept.right > 0 && swept.bottom > 0 && swept.left < tilemap.columns * tilemap.tileSize && swept.top < tilemap.rows * tilemap.tileSize) {
      for (let row = firstRow; row <= lastRow; row += 1) {
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          const tileValue = tilemap.values[row * tilemap.columns + column];
          if (tilemap.solidValues ? !tilemap.solidValues.includes(tileValue) : tileValue === 0) continue;
          obstacles.push({
            kind: "tile",
            tileColumn: column,
            tileRow: row,
            left: column * tilemap.tileSize,
            right: (column + 1) * tilemap.tileSize,
            top: row * tilemap.tileSize,
            bottom: (row + 1) * tilemap.tileSize,
          });
        }
      }
    }
    return obstacles;
  }

  private descendantIds(parentId: string): string[] {
    const ids: string[] = [];
    const pending = [parentId];
    while (pending.length) {
      const current = pending.shift()!;
      for (const candidate of this.entities) {
        if (candidate.parentId !== current) continue;
        ids.push(candidate.id);
        pending.push(candidate.id);
      }
    }
    return ids;
  }

  private translateDescendants(parentId: string, dx: number, dy: number) {
    for (const id of this.descendantIds(parentId)) {
      const child = this.entityById.get(id)!;
      child.x += dx;
      child.y += dy;
    }
  }
}

export function createPlayableWorld(project: PlayableProject2D, options?: PlayableWorldOptions) {
  return new PlayableWorld(project, options);
}

export function playableBehaviorKey(component: Pick<PlayableComponent2D, "values">) {
  const moduleName = component.values.module;
  const exportName = component.values.export ?? "update";
  return typeof moduleName === "string" && moduleName && typeof exportName === "string" && exportName
    ? `${moduleName}#${exportName}`
    : undefined;
}

function snapshotEntity(entity: PlayableEntity2D | RuntimeEntity): PlayableEntitySnapshot {
  return {
    id: entity.id,
    label: entity.label,
    x: entity.x,
    y: entity.y,
    width: entity.width,
    height: entity.height,
    scale: entity.scale,
    layer: entity.layer,
    color: entity.color,
    accent: entity.accent,
    kind: entity.kind,
    ...(entity.parentId ? { parentId: entity.parentId } : {}),
  };
}

function audioPlayCommand(sceneId: string, entityId: string, component: PlayableComponent2D, tick: number): PlayableAudioCommand {
  const assetId = typeof component.values.assetId === "string" ? component.values.assetId : component.values.asset as string;
  const volume = typeof component.values.gain === "number"
    ? component.values.gain
    : typeof component.values.volume === "number" ? component.values.volume : 1;
  return {
    type: "play",
    commandId: `play:${sceneId}:${entityId}:${component.id}:${tick}`,
    sceneId,
    entityId,
    componentId: component.id,
    assetId,
    bus: (component.values.bus ?? "sfx") as "music" | "sfx" | "voice" | "ambient",
    gain: volume,
    pan: typeof component.values.pan === "number" ? component.values.pan : 0,
    loop: component.values.loop === true,
    priority: typeof component.values.priority === "number" ? component.values.priority : 0,
  };
}

function cloneAudioCommand(command: PlayableAudioCommand): PlayableAudioCommand {
  return { ...command };
}

function enabledComponents(entity: PlayableEntity2D, type: string) {
  return entity.components.filter((component) => component.enabled && component.type === type);
}

function solidCollider(entity: PlayableEntity2D) {
  return enabledComponents(entity, "collider").some((component) => {
    const shape = component.values.shape;
    return component.values.solid === true && (shape === undefined || shape === "box" || shape === "aabb");
  });
}

function entityBounds(entity: PlayableEntitySnapshot): Bounds {
  const halfWidth = entity.width * entity.scale / 2;
  const halfHeight = entity.height * entity.scale / 2;
  return { left: entity.x - halfWidth, right: entity.x + halfWidth, top: entity.y - halfHeight, bottom: entity.y + halfHeight };
}

function intervalsOverlap(aMin: number, aMax: number, bMin: number, bMax: number) {
  return aMin < bMax - EPSILON && aMax > bMin + EPSILON;
}

function collisionGap(moving: Bounds, obstacle: Bounds, axis: "x" | "y", delta: number): number | undefined {
  const movingMin = axis === "x" ? moving.left : moving.top;
  const movingMax = axis === "x" ? moving.right : moving.bottom;
  const obstacleMin = axis === "x" ? obstacle.left : obstacle.top;
  const obstacleMax = axis === "x" ? obstacle.right : obstacle.bottom;
  if (delta > 0) {
    if (movingMax <= obstacleMin + EPSILON && movingMax + delta > obstacleMin) return Math.max(0, obstacleMin - movingMax);
    if (movingMin < obstacleMax && movingMax > obstacleMin && movingMax <= (obstacleMin + obstacleMax) / 2) return 0;
  } else {
    if (movingMin >= obstacleMax - EPSILON && movingMin + delta < obstacleMax) return Math.min(0, obstacleMax - movingMin);
    if (movingMin < obstacleMax && movingMax > obstacleMin && movingMin >= (obstacleMin + obstacleMax) / 2) return 0;
  }
  return undefined;
}

function actionName(component: PlayableComponent2D, key: string, fallback: string) {
  const value = component.values[key];
  return typeof value === "string" && value ? value : fallback;
}

function actionActive(actions: ReadonlySet<string>, action: string, mapping: string) {
  return actions.has(action)
    || Boolean(mapping && (actions.has(`${mapping}.${action}`) || actions.has(`${mapping}:${action}`) || actions.has(`${mapping}-${action}`)));
}

function finiteNumber(value: string | number | boolean | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveFinite(value: number | undefined, fallback: number, label: string) {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result <= 0) throw new Error(`${label} must be a finite positive number.`);
  return result;
}

function positiveInteger(value: number | undefined, fallback: number, label: string) {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error(`${label} must be a positive integer.`);
  return result;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function validatePlayableProject(project: PlayableProject2D) {
  if (!project || typeof project !== "object") throw new Error("Playable project must be an object.");
  if (!Array.isArray(project.scenes) || project.scenes.length === 0 || project.scenes.length > 128) throw new Error("Playable project must contain between 1 and 128 scenes.");
  if (typeof project.activeSceneId !== "string" || !project.scenes.some((scene) => scene.id === project.activeSceneId)) throw new Error("Playable project active scene does not exist.");
  if (!project.tilemap || !Number.isSafeInteger(project.tilemap.columns) || project.tilemap.columns <= 0 || !Number.isSafeInteger(project.tilemap.rows) || project.tilemap.rows <= 0 || !Number.isFinite(project.tilemap.tileSize) || project.tilemap.tileSize <= 0) {
    throw new Error("Playable project tilemap dimensions are invalid.");
  }
  const tileCellCount = project.tilemap.columns * project.tilemap.rows;
  if (!Number.isSafeInteger(tileCellCount) || tileCellCount > 1_048_576 || !Array.isArray(project.tilemap.values) || project.tilemap.values.length !== tileCellCount || project.tilemap.values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("Playable project tilemap values are invalid.");
  }
  if (project.tilemap.solidValues !== undefined && (!Array.isArray(project.tilemap.solidValues) || new Set(project.tilemap.solidValues).size !== project.tilemap.solidValues.length || project.tilemap.solidValues.some((value) => !Number.isSafeInteger(value) || value < 0))) {
    throw new Error("Playable project solid tile values are invalid.");
  }
  if (!project.settings || !Array.isArray(project.settings.input) || project.settings.input.length > 256) throw new Error("Playable project input settings are invalid.");
  const assetIds = new Set<string>();
  if (project.assets !== undefined) {
    if (!Array.isArray(project.assets) || project.assets.length > 5_000) throw new Error("Playable project asset catalog is invalid or too large.");
    for (const asset of project.assets) {
      if (!asset || typeof asset.id !== "string" || !asset.id || asset.id.length > 128 || assetIds.has(asset.id)) throw new Error(`Playable project contains an invalid or duplicate asset: ${String(asset?.id)}`);
      assetIds.add(asset.id);
    }
  }
  const sceneIds = new Set<string>();
  let totalEntities = 0;
  for (const scene of project.scenes) {
    if (!scene || typeof scene.id !== "string" || !scene.id || sceneIds.has(scene.id) || !Array.isArray(scene.entities)) throw new Error("Playable project scene data is invalid.");
    sceneIds.add(scene.id);
    totalEntities += scene.entities.length;
    if (totalEntities > 10_000) throw new Error("Playable project exceeds the 10,000 entity limit.");
    const entityIds = new Set<string>();
    for (const entity of scene.entities) {
      if (!entity || typeof entity.id !== "string" || !entity.id || entityIds.has(entity.id) || !Array.isArray(entity.components)) throw new Error(`Playable project contains an invalid or duplicate entity in scene: ${scene.id}`);
      entityIds.add(entity.id);
      for (const key of ["x", "y", "width", "height", "scale"] as const) {
        if (!Number.isFinite(entity[key]) || ((key === "width" || key === "height" || key === "scale") && entity[key] <= 0)) throw new Error(`Playable entity ${entity.id} has an invalid ${key}.`);
      }
      if (entity.components.length > 64) throw new Error(`Playable entity ${entity.id} exceeds the 64 component limit.`);
      const componentIds = new Set<string>();
      for (const component of entity.components) {
        if (!component || typeof component.id !== "string" || typeof component.type !== "string" || typeof component.enabled !== "boolean" || !component.values || typeof component.values !== "object" || Array.isArray(component.values)) {
          throw new Error(`Playable entity ${entity.id} has an invalid component.`);
        }
        if (!component.id || component.id.length > 128 || componentIds.has(component.id)) throw new Error(`Playable entity ${entity.id} has an invalid or duplicate component id: ${component.id}`);
        componentIds.add(component.id);
        for (const value of Object.values(component.values)) {
          if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`Playable component ${component.id} contains a non-finite value.`);
        }
        if (component.enabled && component.type === "audio") validateAudioComponent(component, project.assets, assetIds);
      }
    }
    for (const entity of scene.entities) {
      if (entity.parentId !== undefined && !entityIds.has(entity.parentId)) throw new Error(`Playable entity ${entity.id} references a missing parent.`);
      const ancestry = new Set([entity.id]);
      let parentId = entity.parentId;
      while (parentId) {
        if (ancestry.has(parentId)) throw new Error(`Playable entity parenting cycle includes ${entity.id}.`);
        ancestry.add(parentId);
        parentId = scene.entities.find((candidate) => candidate.id === parentId)?.parentId;
      }
    }
  }
  for (const mapping of project.settings.input) {
    if (!mapping || typeof mapping.action !== "string" || !Array.isArray(mapping.bindings) || mapping.bindings.some((binding) => typeof binding !== "string")) throw new Error("Playable project input mapping is invalid.");
  }
  validatePlayablePlatformers2D(project);
}

/** Validates the authored contract for every built-in platformer controller. */
export function validatePlayablePlatformers2D(project: PlayableProject2D) {
  for (const scene of project.scenes) {
    for (const entity of scene.entities) {
      const platformers = entity.components.filter((component) => component.enabled && component.type === "behavior" && component.values.module === "builtin:platformer");
      if (platformers.length > 1) throw new Error(`Playable entity ${entity.id} has more than one platformer controller.`);
      if (platformers[0]) validatePlatformerComponent(entity, platformers[0], project);
    }
  }
}

function validateAudioComponent(component: PlayableComponent2D, assets: PlayableProject2D["assets"], assetIds: ReadonlySet<string>) {
  const assetId = typeof component.values.assetId === "string" ? component.values.assetId : component.values.asset;
  if (typeof assetId !== "string" || !assetId || assetId.length > 128) throw new Error(`Playable audio component ${component.id} must reference a non-empty asset or assetId.`);
  if (assets !== undefined) {
    if (!assetIds.has(assetId)) throw new Error(`Playable audio component ${component.id} references missing asset ${assetId}.`);
    const asset = assets.find((candidate) => candidate.id === assetId)!;
    if ((asset.kind !== undefined && asset.kind !== "audio") || (asset.mimeType !== undefined && !asset.mimeType.startsWith("audio/"))) {
      throw new Error(`Playable audio component ${component.id} references non-audio asset ${assetId}.`);
    }
  }
  const trigger = component.values.autoplay === true ? (component.values.trigger ?? "start") : component.values.trigger;
  if (trigger !== "start" && !(typeof trigger === "string" && /^action:[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(trigger))) {
    throw new Error(`Playable audio component ${component.id} trigger must be start, action:<name>, or autoplay=true.`);
  }
  if (component.values.autoplay !== undefined && typeof component.values.autoplay !== "boolean") throw new Error(`Playable audio component ${component.id} autoplay must be boolean.`);
  if (component.values.loop !== undefined && typeof component.values.loop !== "boolean") throw new Error(`Playable audio component ${component.id} loop must be boolean.`);
  const gain = component.values.gain ?? component.values.volume;
  if (gain !== undefined && (typeof gain !== "number" || gain < 0 || gain > 4)) throw new Error(`Playable audio component ${component.id} gain must be between 0 and 4.`);
  const pan = component.values.pan;
  if (pan !== undefined && (typeof pan !== "number" || pan < -1 || pan > 1)) throw new Error(`Playable audio component ${component.id} pan must be between -1 and 1.`);
  const priority = component.values.priority;
  if (priority !== undefined && typeof priority !== "number") throw new Error(`Playable audio component ${component.id} priority must be finite.`);
  const bus = component.values.bus ?? "sfx";
  if (bus !== "music" && bus !== "sfx" && bus !== "voice" && bus !== "ambient") throw new Error(`Playable audio component ${component.id} bus is unsupported: ${String(bus)}`);
}

function validatePlatformerComponent(entity: PlayableEntity2D, component: PlayableComponent2D, project: PlayableProject2D) {
  if (!solidCollider(entity)) throw new Error(`Playable platformer entity ${entity.id} requires an enabled solid box collider.`);
  if (enabledComponents(entity, "input").length) throw new Error(`Playable platformer entity ${entity.id} must not also use an input component; the controller owns horizontal input.`);
  const ranges = {
    runSpeed: [0, 10_000, 220],
    gravity: [0, 10_000, 1_800],
    jumpSpeed: [0.000_001, 10_000, 650],
    maxFallSpeed: [0.000_001, 10_000, 900],
    coyoteMs: [0, 1_000, 100],
    jumpBufferMs: [0, 1_000, 100],
    jumpCutMultiplier: [0, 1, 0.5],
    groundProbe: [0.000_001, project.tilemap.tileSize, 0.05],
  } as const;
  for (const [key, [minimum, maximum, fallback]] of Object.entries(ranges)) {
    const value = component.values[key] ?? fallback;
    if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`Playable platformer component ${component.id} ${key} must be between ${minimum} and ${maximum}.`);
  }
  for (const [key, fallback] of [["leftAction", "move-left"], ["rightAction", "move-right"], ["jumpAction", "jump"]] as const) {
    const action = component.values[key] ?? fallback;
    if (typeof action !== "string" || !action || action.length > 128 || !project.settings.input.some((mapping) => mapping.action === action)) throw new Error(`Playable platformer component ${component.id} references unmapped action ${String(action)}.`);
  }
}

function controllerKey(entityId: string, componentId: string) {
  return `${entityId}\0${componentId}`;
}

function platformerSnapshot(entityId: string, componentId: string, state: PlatformerState): PlayablePlatformerSnapshot {
  return { entityId, componentId, verticalVelocity: state.verticalVelocity, grounded: state.grounded, coyoteSeconds: state.coyoteSeconds, jumpBufferSeconds: state.jumpBufferSeconds };
}

function platformerNumber(component: PlayableComponent2D, key: string, fallback: number) {
  const value = component.values[key];
  return typeof value === "number" ? value : fallback;
}
