import {
  DEFAULT_FIXED_STEP_SECONDS,
  DEFAULT_MAX_BEHAVIOR_COMMANDS_PER_STEP,
  DEFAULT_MAX_PENDING_AUDIO_COMMANDS,
  DEFAULT_MAX_SUB_STEPS,
  EPSILON
} from "./runtime-2d-contracts.ts";
import type {
  Bounds,
  Obstacle,
  PatrolState,
  PlatformerState,
  PlayableAdvanceResult,
  PlayableAudioCommand,
  PlayableBehaviorCommand2D,
  PlayableBehaviorCommandRecord2D,
  PlayableBehaviorEvent2D,
  PlayableBehaviorRegistry2D,
  PlayableCollision,
  PlayableComponent2D,
  PlayableDiagnostic,
  PlayableEntity2D,
  PlayableEntitySnapshot,
  PlayableInputFrame,
  PlayablePlatformerSnapshot,
  PlayableProject2D,
  PlayableStepResult,
  PlayableValue2D,
  PlayableWorldOptions,
  PlayableWorldSnapshot,
  PongBallState,
  QueuedBehaviorCommand,
  RuntimeEntity
} from "./runtime-2d-contracts.ts";
import {
  actionActive,
  actionName,
  audioPlayCommand,
  auditPlayableProject,
  clamp,
  cloneAudioCommand,
  cloneBehaviorCommand,
  cloneBehaviorCommandRecord,
  cloneBehaviorEvent,
  collisionGap,
  controllerKey,
  enabledComponents,
  entityBounds,
  entityFromSnapshot,
  finiteNumber,
  intervalsOverlap,
  playableBehaviorKey,
  platformerNumber,
  platformerSnapshot,
  parsePlayableWorldSnapshot,
  positiveFinite,
  positiveInteger,
  snapshotEntity,
  solidCollider,
  stateKey,
  validateBehaviorCommandPlan,
  validateBehaviorEvents,
  validatePlayableProject,
  validateSnapshotEntities,
  validateStateRecord
} from "./runtime-2d-support.ts";

export type PlayableWorld = {
  readonly fixedStepSeconds: number;
  readonly maxSubSteps: number;
  readonly maxPendingAudioCommands: number;
  readonly maxBehaviorCommandsPerStep: number;
  readonly diagnostics: readonly PlayableDiagnostic[];
  readonly sceneId: string;
  readonly tick: number;
  readonly simulationTimeSeconds: number;
  getState(key: string): PlayableValue2D | undefined;
  getEntity(id: string): PlayableEntitySnapshot | undefined;
  getPlatformerState(entityId: string): PlayablePlatformerSnapshot | undefined;
  snapshot(): PlayableWorldSnapshot;
  drainAudioCommands(): PlayableAudioCommand[];
  switchScene(sceneId: string): PlayableWorldSnapshot;
  restore(snapshot: unknown): PlayableWorldSnapshot;
  step(input?: PlayableInputFrame): PlayableStepResult;
  advance(elapsedSeconds: number, input?: PlayableInputFrame): PlayableAdvanceResult;
};

type PlayableWorldState = {
  readonly project: PlayableProject2D;
  readonly behaviors: PlayableBehaviorRegistry2D;
  readonly fixedStepSeconds: number;
  readonly maxSubSteps: number;
  readonly maxPendingAudioCommands: number;
  readonly maxBehaviorCommandsPerStep: number;
  readonly diagnostics: readonly PlayableDiagnostic[];
  entities: RuntimeEntity[];
  entityById: Map<string, RuntimeEntity>;
  patrols: Map<string, PatrolState>;
  platformers: Map<string, PlatformerState>;
  pongBalls: Map<string, PongBallState>;
  audioQueue: PlayableAudioCommand[];
  worldState: Record<string, PlayableValue2D>;
  previousEvents: PlayableBehaviorEvent2D[];
  queuedBehaviorCommands: QueuedBehaviorCommand[];
  previousActions: Set<string>;
  accumulatorSeconds: number;
  currentSceneId: string;
  currentTick: number;
  currentSimulationTimeSeconds: number;
};

export function createPlayableWorld(project: PlayableProject2D, options: PlayableWorldOptions = {}): PlayableWorld {
  validatePlayableProject(project);
  const clonedProject = structuredClone(project);
  const behaviors: PlayableBehaviorRegistry2D = Object.freeze({ ...(options.behaviors ?? {}) });
  const world: PlayableWorldState = {
    project: clonedProject,
    behaviors,
    fixedStepSeconds: positiveFinite(options.fixedStepSeconds, DEFAULT_FIXED_STEP_SECONDS, "fixedStepSeconds"),
    maxSubSteps: positiveInteger(options.maxSubSteps, DEFAULT_MAX_SUB_STEPS, "maxSubSteps"),
    maxPendingAudioCommands: positiveInteger(options.maxPendingAudioCommands, DEFAULT_MAX_PENDING_AUDIO_COMMANDS, "maxPendingAudioCommands"),
    maxBehaviorCommandsPerStep: positiveInteger(options.maxBehaviorCommandsPerStep, DEFAULT_MAX_BEHAVIOR_COMMANDS_PER_STEP, "maxBehaviorCommandsPerStep"),
    diagnostics: Object.freeze(auditPlayableProject(clonedProject, Object.keys(behaviors)).map((item) => Object.freeze({ ...item }))),
    entities: [],
    entityById: new Map(),
    patrols: new Map(),
    platformers: new Map(),
    pongBalls: new Map(),
    audioQueue: [],
    worldState: {},
    previousEvents: [],
    queuedBehaviorCommands: [],
    previousActions: new Set(),
    accumulatorSeconds: 0,
    currentSceneId: clonedProject.activeSceneId,
    currentTick: 0,
    currentSimulationTimeSeconds: 0,
  };
  loadScene(world, world.currentSceneId);
  return {
    fixedStepSeconds: world.fixedStepSeconds,
    maxSubSteps: world.maxSubSteps,
    maxPendingAudioCommands: world.maxPendingAudioCommands,
    maxBehaviorCommandsPerStep: world.maxBehaviorCommandsPerStep,
    diagnostics: world.diagnostics,
    get sceneId() { return world.currentSceneId; },
    get tick() { return world.currentTick; },
    get simulationTimeSeconds() { return world.currentSimulationTimeSeconds; },
    getState: (key) => getState(world, key),
    getEntity: (id) => getEntity(world, id),
    getPlatformerState: (entityId) => getPlatformerState(world, entityId),
    snapshot: () => createWorldSnapshot(world),
    drainAudioCommands: () => drainAudioCommands(world),
    switchScene: (sceneId) => switchScene(world, sceneId),
    restore: (nextSnapshot) => restore(world, nextSnapshot),
    step: (input) => step(world, input),
    advance: (elapsedSeconds, input) => advance(world, elapsedSeconds, input),
  };
}

function getState(world: PlayableWorldState, key: string): PlayableValue2D | undefined {
    return world.worldState[key];
  }

function getEntity(world: PlayableWorldState, id: string): PlayableEntitySnapshot | undefined {
    const entity = world.entityById.get(id);
    return entity ? snapshotEntity(entity) : undefined;
  }

function getPlatformerState(world: PlayableWorldState, entityId: string): PlayablePlatformerSnapshot | undefined {
    const entity = world.entityById.get(entityId);
    const component = entity && enabledComponents(entity.source, "behavior").find((candidate) => candidate.values.module === "builtin:platformer");
    const state = component && world.platformers.get(controllerKey(entityId, component.id));
    return component && state ? platformerSnapshot(entityId, component.id, state) : undefined;
  }

function createWorldSnapshot(world: PlayableWorldState): PlayableWorldSnapshot {
    return {
      version: 1,
      sceneId: world.currentSceneId,
      tick: world.currentTick,
      simulationTimeSeconds: world.currentSimulationTimeSeconds,
      entities: world.entities.map(snapshotEntity),
      ...(Object.keys(world.worldState).length ? { state: { ...world.worldState } } : {}),
      ...(world.platformers.size ? { platformers: platformerSnapshots(world) } : {}),
      ...(world.previousActions.size ? { previousActions: [...world.previousActions].sort() } : {}),
      ...(world.previousEvents.length ? { previousEvents: world.previousEvents.map(cloneBehaviorEvent) } : {}),
    };
  }

function drainAudioCommands(world: PlayableWorldState): PlayableAudioCommand[] {
    const commands = world.audioQueue.map(cloneAudioCommand);
    world.audioQueue.length = 0;
    return commands;
  }

function switchScene(world: PlayableWorldState, sceneId: string): PlayableWorldSnapshot {
    loadScene(world, sceneId);
    return createWorldSnapshot(world);
  }

function restore(world: PlayableWorldState, value: unknown): PlayableWorldSnapshot {
    const snapshot = parsePlayableWorldSnapshot(value);
    loadScene(world, snapshot.sceneId);
    const hasEntitySources = snapshot.entities.every((entity) => Array.isArray(entity.components));
    if (hasEntitySources) {
      validateSnapshotEntities(snapshot.entities, world.project);
      world.entities = snapshot.entities.map((entity) => ({ ...snapshotEntity(entity), source: entityFromSnapshot(entity) }));
      world.entityById = new Map(world.entities.map((entity) => [entity.id, entity]));
    } else {
      const expectedIds = new Set(world.entities.map((entity) => entity.id));
      if (snapshot.entities.length !== expectedIds.size) throw new Error("Playable snapshot entity count does not match its scene.");
      for (const state of snapshot.entities) {
        const entity = world.entityById.get(state.id);
        if (!entity || !expectedIds.delete(state.id)) throw new Error(`Playable snapshot contains an unknown or duplicate entity: ${state.id}`);
        if (!Number.isFinite(state.x) || !Number.isFinite(state.y)) throw new Error(`Playable snapshot has an invalid transform for entity: ${state.id}`);
        entity.x = state.x;
        entity.y = state.y;
      }
      if (expectedIds.size) throw new Error("Playable snapshot is missing scene entities.");
    }
    if (!Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0 || !Number.isFinite(snapshot.simulationTimeSeconds) || snapshot.simulationTimeSeconds < 0) {
      throw new Error("Playable snapshot clock is invalid.");
    }
    world.currentTick = snapshot.tick;
    world.currentSimulationTimeSeconds = snapshot.simulationTimeSeconds;
    world.accumulatorSeconds = 0;
    world.worldState = validateStateRecord(snapshot.state ?? {}, "Playable snapshot state");
    resetPatrolOrigins(world);
    restorePlatformers(world, snapshot.platformers);
    resetPongBalls(world);
    ensurePongScoreState(world);
    if (snapshot.previousActions !== undefined && (!Array.isArray(snapshot.previousActions) || snapshot.previousActions.some((action) => typeof action !== "string"))) throw new Error("Playable snapshot previous actions are invalid.");
    world.previousActions = new Set(snapshot.previousActions ?? []);
    world.previousEvents = validateBehaviorEvents(snapshot.previousEvents ?? [], "Playable snapshot previous events");
    return createWorldSnapshot(world);
  }

function step(world: PlayableWorldState, input: PlayableInputFrame = {}): PlayableStepResult {
    const actions = resolveActions(world, input);
    const collisions: PlayableCollision[] = [];
    const audioCommands = enqueueActionAudio(world, actions);
    world.queuedBehaviorCommands = [];
    for (const entity of [...world.entities]) {
      const velocity = velocityFor(world, entity, actions);
      if (velocity.x === 0 && velocity.y === 0) continue;
      const excludedIds = new Set([entity.id, ...descendantIds(world, entity.id)]);
      const movedX = moveOnAxis(world, entity, "x", velocity.x * world.fixedStepSeconds, excludedIds, collisions);
      if (Math.abs(movedX - velocity.x * world.fixedStepSeconds) > EPSILON) pongBallCollision(world, entity, "x");
      if (movedX !== 0) translateDescendants(world, entity.id, movedX, 0);
      const requestedY = velocity.y * world.fixedStepSeconds;
      const movedY = moveOnAxis(world, entity, "y", requestedY, excludedIds, collisions);
      if (Math.abs(movedY - requestedY) > EPSILON) pongBallCollision(world, entity, "y");
      if (Math.abs(movedY - requestedY) > EPSILON) platformerVerticalCollision(world, entity, requestedY);
      if (movedY !== 0) translateDescendants(world, entity.id, 0, movedY);
      resetPongBallAfterScore(world, entity);
    }
    world.currentTick += 1;
    world.currentSimulationTimeSeconds = world.currentTick * world.fixedStepSeconds;
    const commandRecords = world.queuedBehaviorCommands.map(cloneBehaviorCommandRecord);
    const applied = applyBehaviorCommands(world, commandRecords);
    if (!applied.switchedScene) {
      world.previousActions = actions;
      world.previousEvents = applied.events.map(cloneBehaviorEvent);
    }
    return {
      tick: world.currentTick,
      simulationTimeSeconds: world.currentSimulationTimeSeconds,
      collisions,
      audioCommands: [...audioCommands, ...applied.audioCommands].map(cloneAudioCommand),
      commands: commandRecords,
      events: applied.events.map(cloneBehaviorEvent),
    };
  }

function advance(world: PlayableWorldState, elapsedSeconds: number, input: PlayableInputFrame = {}): PlayableAdvanceResult {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) throw new Error("elapsedSeconds must be a finite non-negative number.");
    world.accumulatorSeconds += elapsedSeconds;
    let steps = 0;
    let droppedSeconds = 0;
    let last: PlayableStepResult = { tick: world.currentTick, simulationTimeSeconds: world.currentSimulationTimeSeconds, collisions: [], audioCommands: [], commands: [], events: [] };
    const audioCommands: PlayableAudioCommand[] = [];
    const commands: PlayableBehaviorCommandRecord2D[] = [];
    const events: PlayableBehaviorEvent2D[] = [];
    while (world.accumulatorSeconds + EPSILON >= world.fixedStepSeconds && steps < world.maxSubSteps) {
      last = step(world, input);
      audioCommands.push(...last.audioCommands);
      commands.push(...last.commands);
      events.push(...last.events);
      world.accumulatorSeconds -= world.fixedStepSeconds;
      if (world.accumulatorSeconds < EPSILON) world.accumulatorSeconds = 0;
      steps += 1;
    }
    if (world.accumulatorSeconds + EPSILON >= world.fixedStepSeconds) {
      const retained = world.accumulatorSeconds % world.fixedStepSeconds;
      droppedSeconds = world.accumulatorSeconds - retained;
      world.accumulatorSeconds = retained;
    }
    return {
      ...last,
      collisions: last.collisions.map((collision) => ({ ...collision })),
      audioCommands: audioCommands.map(cloneAudioCommand),
      commands: commands.map(cloneBehaviorCommandRecord),
      events: events.map(cloneBehaviorEvent),
      steps,
      alpha: world.accumulatorSeconds / world.fixedStepSeconds,
      droppedSeconds,
    };
  }

function loadScene(world: PlayableWorldState, sceneId: string) {
    const scene = world.project.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) throw new Error(`Unknown playable scene: ${sceneId}`);
    if (world.entityById.size || world.currentTick > 0) {
      enqueueAudio(world, [{ type: "stop-scene", commandId: `stop:${world.currentSceneId}:${world.currentTick}`, sceneId: world.currentSceneId }]);
    }
    world.currentSceneId = sceneId;
    world.entities = scene.entities.map((entity) => ({ ...snapshotEntity(entity), source: structuredClone(entity) }));
    world.entityById = new Map(world.entities.map((entity) => [entity.id, entity]));
    world.currentTick = 0;
    world.currentSimulationTimeSeconds = 0;
    world.accumulatorSeconds = 0;
    world.previousActions.clear();
    world.previousEvents = [];
    world.queuedBehaviorCommands = [];
    resetPatrolOrigins(world);
    resetPlatformers(world);
    resetPongBalls(world);
    ensurePongScoreState(world);
    enqueueAudio(world, sceneStartAudio(world, sceneId));
  }

function ensurePongScoreState(world: PlayableWorldState) {
    for (const entity of world.entities) {
      for (const component of enabledComponents(entity.source, "behavior")) {
        if (component.values.module !== "builtin:pong-ball") continue;
        for (const key of [stateKey(component, "leftScoreKey", "score.left"), stateKey(component, "rightScoreKey", "score.right")]) {
          if (world.worldState[key] === undefined) world.worldState[key] = 0;
          syncUiStateBindings(world, key);
        }
      }
    }
  }

function sceneStartAudio(world: PlayableWorldState, sceneId: string): PlayableAudioCommand[] {
    const scene = world.project.scenes.find((candidate) => candidate.id === sceneId)!;
    const commands: PlayableAudioCommand[] = [];
    for (const entity of scene.entities) {
      for (const component of enabledComponents(entity, "audio")) {
        if (component.values.autoplay === true || component.values.trigger === "start") commands.push(audioPlayCommand(sceneId, entity.id, component, world.currentTick));
      }
    }
    return commands;
  }

function enqueueActionAudio(world: PlayableWorldState, actions: ReadonlySet<string>): PlayableAudioCommand[] {
    const scene = world.project.scenes.find((candidate) => candidate.id === world.currentSceneId)!;
    const commands: PlayableAudioCommand[] = [];
    for (const entity of scene.entities) {
      for (const component of enabledComponents(entity, "audio")) {
        const trigger = component.values.trigger;
        if (typeof trigger !== "string" || !trigger.startsWith("action:")) continue;
        const action = trigger.slice("action:".length);
        if (actions.has(action) && !world.previousActions.has(action)) commands.push(audioPlayCommand(scene.id, entity.id, component, world.currentTick));
      }
    }
    enqueueAudio(world, commands);
    return commands;
  }

function enqueueAudio(world: PlayableWorldState, commands: readonly PlayableAudioCommand[]) {
    if (world.audioQueue.length + commands.length > world.maxPendingAudioCommands) {
      throw new Error(`Playable audio command queue exceeds the limit of ${world.maxPendingAudioCommands}; the host must drain commands regularly.`);
    }
    world.audioQueue.push(...commands.map(cloneAudioCommand));
  }

function resetPatrolOrigins(world: PlayableWorldState) {
    world.patrols.clear();
    for (const entity of world.entities) {
      for (const component of enabledComponents(entity.source, "behavior")) {
        if (component.values.module === "builtin:patrol") {
          world.patrols.set(`${entity.id}\0${component.id}`, { originX: entity.x, originY: entity.y, direction: 1 });
        }
      }
    }
  }

function resetPlatformers(world: PlayableWorldState) {
    world.platformers.clear();
    for (const entity of world.entities) {
      for (const component of enabledComponents(entity.source, "behavior")) {
        if (component.values.module !== "builtin:platformer") continue;
        world.platformers.set(controllerKey(entity.id, component.id), {
          verticalVelocity: 0,
          grounded: isGrounded(world, entity, platformerNumber(component, "groundProbe", 0.05)),
          coyoteSeconds: 0,
          jumpBufferSeconds: 0,
        });
      }
    }
  }

function resetPongBalls(world: PlayableWorldState) {
    world.pongBalls.clear();
    for (const entity of world.entities) {
      for (const component of enabledComponents(entity.source, "behavior")) {
        if (component.values.module !== "builtin:pong-ball") continue;
        const velocityX = finiteNumber(component.values.velocityX, 285);
        const velocityY = finiteNumber(component.values.velocityY, 185);
        world.pongBalls.set(controllerKey(entity.id, component.id), {
          originX: entity.x,
          originY: entity.y,
          velocityX,
          velocityY,
          maximumSpeed: Math.max(Math.abs(velocityX), Math.abs(velocityY), finiteNumber(component.values.maximumSpeed, 520)),
        });
      }
    }
  }

function pongBallCollision(world: PlayableWorldState, entity: RuntimeEntity, axis: "x" | "y") {
    for (const component of enabledComponents(entity.source, "behavior")) {
      if (component.values.module !== "builtin:pong-ball") continue;
      const state = world.pongBalls.get(controllerKey(entity.id, component.id));
      if (!state) continue;
      if (axis === "x") state.velocityX = clamp(-state.velocityX * 1.025, -state.maximumSpeed, state.maximumSpeed);
      else state.velocityY = clamp(-state.velocityY, -state.maximumSpeed, state.maximumSpeed);
    }
  }

function resetPongBallAfterScore(world: PlayableWorldState, entity: RuntimeEntity) {
    const width = world.project.tilemap.columns * world.project.tilemap.tileSize;
    if (entity.x >= -entity.width && entity.x <= width + entity.width) return;
    for (const component of enabledComponents(entity.source, "behavior")) {
      if (component.values.module !== "builtin:pong-ball") continue;
      const state = world.pongBalls.get(controllerKey(entity.id, component.id));
      if (!state) continue;
      const servedRight = entity.x < 0;
      const side = servedRight ? "right" : "left";
      const scoreKey = stateKey(component, servedRight ? "rightScoreKey" : "leftScoreKey", servedRight ? "score.right" : "score.left");
      const currentScore = world.worldState[scoreKey] ?? 0;
      if (typeof currentScore !== "number" || !Number.isFinite(currentScore)) throw new Error(`Pong score state ${scoreKey} must be numeric.`);
      queueBehaviorCommand(world, entity.id, component.id, { type: "increment-state", key: scoreKey, amount: 1 });
      queueBehaviorCommand(world, entity.id, component.id, {
        type: "emit-event",
        name: "pong:score",
        data: { side, scoreKey, score: currentScore + 1 },
      });
      entity.x = state.originX;
      entity.y = state.originY;
      state.velocityX = Math.abs(finiteNumber(component.values.velocityX, 285)) * (servedRight ? 1 : -1);
      state.velocityY = finiteNumber(component.values.velocityY, 185) * (world.currentTick % 2 ? 1 : -1);
    }
  }

function queueBehaviorCommand(world: PlayableWorldState, sourceEntityId: string, sourceComponentId: string, command: PlayableBehaviorCommand2D) {
    if (world.queuedBehaviorCommands.length >= world.maxBehaviorCommandsPerStep) {
      throw new Error(`Playable behavior command count exceeds the per-step limit of ${world.maxBehaviorCommandsPerStep}.`);
    }
    world.queuedBehaviorCommands.push({ sourceEntityId, sourceComponentId, command: cloneBehaviorCommand(command) });
  }

function platformerSnapshots(world: PlayableWorldState) {
    const snapshots: PlayablePlatformerSnapshot[] = [];
    for (const entity of world.entities) {
      for (const component of enabledComponents(entity.source, "behavior")) {
        if (component.values.module !== "builtin:platformer") continue;
        const state = world.platformers.get(controllerKey(entity.id, component.id));
        if (state) snapshots.push(platformerSnapshot(entity.id, component.id, state));
      }
    }
    return snapshots;
  }

function restorePlatformers(world: PlayableWorldState, snapshots: readonly PlayablePlatformerSnapshot[] | undefined) {
    if (snapshots === undefined) return;
    const expected = new Set(world.platformers.keys());
    if (snapshots.length !== expected.size) throw new Error("Playable snapshot platformer controller count does not match its scene.");
    for (const snapshot of snapshots) {
      const key = controllerKey(snapshot.entityId, snapshot.componentId);
      if (!expected.delete(key)) throw new Error(`Playable snapshot contains an unknown or duplicate platformer controller: ${snapshot.entityId}/${snapshot.componentId}`);
      if (!Number.isFinite(snapshot.verticalVelocity) || !Number.isFinite(snapshot.coyoteSeconds) || snapshot.coyoteSeconds < 0 || !Number.isFinite(snapshot.jumpBufferSeconds) || snapshot.jumpBufferSeconds < 0 || typeof snapshot.grounded !== "boolean") {
        throw new Error(`Playable snapshot has invalid platformer state: ${snapshot.entityId}/${snapshot.componentId}`);
      }
      world.platformers.set(key, {
        verticalVelocity: snapshot.verticalVelocity,
        grounded: snapshot.grounded,
        coyoteSeconds: snapshot.coyoteSeconds,
        jumpBufferSeconds: snapshot.jumpBufferSeconds,
      });
    }
  }

function platformerVelocity(world: PlayableWorldState, entity: RuntimeEntity, component: PlayableComponent2D, actions: ReadonlySet<string>) {
    const state = world.platformers.get(controllerKey(entity.id, component.id));
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
    const grounded = isGrounded(world, entity, platformerNumber(component, "groundProbe", 0.05));
    state.grounded = grounded;
    state.coyoteSeconds = grounded ? coyoteDuration : Math.max(0, state.coyoteSeconds - world.fixedStepSeconds);
    state.jumpBufferSeconds = Math.max(0, state.jumpBufferSeconds - world.fixedStepSeconds);
    const jumpActive = actions.has(jumpAction);
    const jumpWasActive = world.previousActions.has(jumpAction);
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
    state.verticalVelocity = Math.min(maxFallSpeed, state.verticalVelocity + gravity * world.fixedStepSeconds);
    const horizontal = Number(actions.has(rightAction)) - Number(actions.has(leftAction));
    return { x: horizontal * runSpeed, y: state.verticalVelocity };
  }

function platformerVerticalCollision(world: PlayableWorldState, entity: RuntimeEntity, requestedY: number) {
    for (const component of enabledComponents(entity.source, "behavior")) {
      if (component.values.module !== "builtin:platformer") continue;
      const state = world.platformers.get(controllerKey(entity.id, component.id));
      if (!state) continue;
      state.verticalVelocity = 0;
      if (requestedY > 0) {
        state.grounded = true;
        state.coyoteSeconds = platformerNumber(component, "coyoteMs", 100) / 1_000;
      }
    }
  }

function isGrounded(world: PlayableWorldState, entity: RuntimeEntity, probeDistance: number) {
    if (!solidCollider(entity.source)) return false;
    const bounds = entityBounds(entity);
    const excluded = new Set([entity.id, ...descendantIds(world, entity.id)]);
    for (const obstacle of obstacles(world, excluded, bounds, "y", probeDistance)) {
      if (!intervalsOverlap(bounds.left, bounds.right, obstacle.left, obstacle.right)) continue;
      const gap = collisionGap(bounds, obstacle, "y", probeDistance);
      if (gap !== undefined && gap >= -EPSILON && gap <= probeDistance + EPSILON) return true;
    }
    return false;
  }

function resolveActions(world: PlayableWorldState, input: PlayableInputFrame): Set<string> {
    const actions = new Set(input.actions ?? []);
    const bindings = new Set(input.bindings ?? []);
    if (bindings.size) {
      for (const mapping of world.project.settings.input) {
        if (mapping.bindings.some((binding) => bindings.has(binding))) actions.add(mapping.action);
      }
    }
    return actions;
  }

function velocityFor(world: PlayableWorldState, entity: RuntimeEntity, actions: ReadonlySet<string>) {
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
        const velocity = platformerVelocity(world, entity, component, actions);
        x += velocity.x;
        y += velocity.y;
        continue;
      }
      if (component.values.module === "builtin:pong-paddle") {
        const speed = Math.abs(finiteNumber(component.values.speed, 360));
        const up = actions.has(actionName(component, "upAction", "move-up"));
        const down = actions.has(actionName(component, "downAction", "move-down"));
        const minimum = finiteNumber(component.values.minimumY, 0);
        const maximum = finiteNumber(component.values.maximumY, world.project.tilemap.rows * world.project.tilemap.tileSize);
        if ((up && entity.y > minimum) || (down && entity.y < maximum)) y += (Number(down) - Number(up)) * speed;
        continue;
      }
      if (component.values.module === "builtin:pong-ai") {
        const ballId = typeof component.values.ballId === "string" ? component.values.ballId : "ball";
        const ball = world.entityById.get(ballId);
        if (!ball) continue;
        const speed = Math.abs(finiteNumber(component.values.speed, 295));
        const deadZone = Math.abs(finiteNumber(component.values.deadZone, 12));
        const delta = ball.y - entity.y;
        if (Math.abs(delta) > deadZone) y += Math.sign(delta) * speed;
        continue;
      }
      if (component.values.module === "builtin:pong-ball") {
        const state = world.pongBalls.get(controllerKey(entity.id, component.id));
        if (state) { x += state.velocityX; y += state.velocityY; }
        continue;
      }
      if (component.values.module !== "builtin:patrol") {
        if (component.values.module === "builtin:player") continue;
        const key = playableBehaviorKey(component);
        const behavior = key ? world.behaviors[key] : undefined;
        if (!behavior) continue;
        const result = behavior({
          entity: Object.freeze(snapshotEntity(entity)),
          component: Object.freeze({ ...component, values: Object.freeze({ ...component.values }) }),
          actions: Object.freeze([...actions].sort()),
          state: Object.freeze({ ...world.worldState }),
          events: Object.freeze(world.previousEvents.map((event) => Object.freeze(cloneBehaviorEvent(event)))),
          deltaSeconds: world.fixedStepSeconds,
          tick: world.currentTick,
          simulationTimeSeconds: world.currentSimulationTimeSeconds,
        });
        if (result !== undefined) {
          const velocityX = result.velocityX ?? 0;
          const velocityY = result.velocityY ?? 0;
          if (!Number.isFinite(velocityX) || !Number.isFinite(velocityY)) throw new Error(`Playable behavior ${key} returned a non-finite velocity.`);
          x += velocityX;
          y += velocityY;
          if (result.commands !== undefined) {
            if (!Array.isArray(result.commands)) throw new Error(`Playable behavior ${key} commands must be an array.`);
            for (const command of result.commands) queueBehaviorCommand(world, entity.id, component.id, command);
          }
        }
        continue;
      }
      const state = world.patrols.get(`${entity.id}\0${component.id}`);
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

function moveOnAxis(world: PlayableWorldState, entity: RuntimeEntity, axis: "x" | "y", requestedDelta: number, excludedIds: ReadonlySet<string>, collisions: PlayableCollision[]) {
    if (requestedDelta === 0) return 0;
    if (!solidCollider(entity.source)) {
      entity[axis] += requestedDelta;
      return requestedDelta;
    }
    const bounds = entityBounds(entity);
    let allowedDelta = requestedDelta;
    let hit: Obstacle | undefined;
    for (const obstacle of obstacles(world, excludedIds, bounds, axis, requestedDelta)) {
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

function obstacles(world: PlayableWorldState, excludedIds: ReadonlySet<string>, bounds: Bounds, axis: "x" | "y", delta: number): Obstacle[] {
    const obstacles: Obstacle[] = [];
    for (const candidate of world.entities) {
      if (excludedIds.has(candidate.id) || !solidCollider(candidate.source)) continue;
      obstacles.push({ ...entityBounds(candidate), kind: "entity", targetId: candidate.id });
    }
    const tilemap = world.project.tilemap;
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

function applyBehaviorCommands(world: PlayableWorldState, records: readonly PlayableBehaviorCommandRecord2D[]) {
    validateBehaviorCommandPlan(records, world.entities, world.project, world.worldState);
    const audioCommands: PlayableAudioCommand[] = [];
    const events: PlayableBehaviorEvent2D[] = [];
    let switchedScene = false;
    for (const [index, record] of records.entries()) {
      const command = record.command;
      if (command.type === "set-state") {
        world.worldState[command.key] = command.value;
        syncUiStateBindings(world, command.key);
      } else if (command.type === "increment-state") {
        const current = world.worldState[command.key] ?? 0;
        if (typeof current !== "number") throw new Error(`Playable state ${command.key} is not numeric.`);
        world.worldState[command.key] = current + (command.amount ?? 1);
        syncUiStateBindings(world, command.key);
      } else if (command.type === "spawn-entity") {
        spawnRuntimeEntity(world, command.entity);
      } else if (command.type === "destroy-entity") {
        destroyRuntimeEntity(world, command.entityId ?? record.sourceEntityId);
      } else if (command.type === "set-component-value") {
        const target = world.entityById.get(command.entityId ?? record.sourceEntityId)!;
        const component = target.source.components.find((candidate) => candidate.id === command.componentId)!;
        component.values[command.key] = command.value;
        if (component.type === "ui" && command.key === "stateKey" && typeof command.value === "string") syncUiStateBindings(world, command.value);
      } else if (command.type === "set-ui-text") {
        const target = world.entityById.get(command.entityId)!;
        const component = command.componentId
          ? target.source.components.find((candidate) => candidate.id === command.componentId)!
          : enabledComponents(target.source, "ui")[0];
        component.values.text = command.text;
      } else if (command.type === "play-audio") {
        const audio: PlayableAudioCommand = {
          type: "play",
          commandId: `behavior:${world.currentSceneId}:${record.sourceEntityId}:${record.sourceComponentId}:${world.currentTick}:${index}`,
          sceneId: world.currentSceneId,
          entityId: record.sourceEntityId,
          componentId: record.sourceComponentId,
          assetId: command.assetId,
          bus: command.bus ?? "sfx",
          gain: command.gain ?? 1,
          pan: command.pan ?? 0,
          loop: command.loop ?? false,
          priority: command.priority ?? 0,
        };
        enqueueAudio(world, [audio]);
        audioCommands.push(audio);
      } else if (command.type === "emit-event") {
        events.push({
          name: command.name,
          sourceEntityId: record.sourceEntityId,
          sourceComponentId: record.sourceComponentId,
          ...(command.data ? { data: { ...command.data } } : {}),
        });
      } else if (command.type === "switch-scene") {
        loadScene(world, command.sceneId);
        switchedScene = true;
      }
    }
    return { audioCommands, events, switchedScene };
  }

function syncUiStateBindings(world: PlayableWorldState, key: string) {
    const value = world.worldState[key];
    for (const entity of world.entities) {
      for (const component of enabledComponents(entity.source, "ui")) {
        if (component.values.stateKey !== key) continue;
        const prefix = typeof component.values.prefix === "string" ? component.values.prefix : "";
        const suffix = typeof component.values.suffix === "string" ? component.values.suffix : "";
        component.values.text = `${prefix}${String(value ?? "")}${suffix}`;
      }
    }
  }

function spawnRuntimeEntity(world: PlayableWorldState, entity: PlayableEntity2D) {
    const source = structuredClone(entity);
    const runtime: RuntimeEntity = { ...snapshotEntity(source), source };
    world.entities.push(runtime);
    world.entityById.set(runtime.id, runtime);
    initializeRuntimeControllers(world, runtime);
    for (const key of Object.keys(world.worldState)) syncUiStateBindings(world, key);
  }

function initializeRuntimeControllers(world: PlayableWorldState, entity: RuntimeEntity) {
    for (const component of enabledComponents(entity.source, "behavior")) {
      if (component.values.module === "builtin:patrol") {
        world.patrols.set(controllerKey(entity.id, component.id), { originX: entity.x, originY: entity.y, direction: 1 });
      } else if (component.values.module === "builtin:platformer") {
        world.platformers.set(controllerKey(entity.id, component.id), {
          verticalVelocity: 0,
          grounded: isGrounded(world, entity, platformerNumber(component, "groundProbe", 0.05)),
          coyoteSeconds: 0,
          jumpBufferSeconds: 0,
        });
      } else if (component.values.module === "builtin:pong-ball") {
        const velocityX = finiteNumber(component.values.velocityX, 285);
        const velocityY = finiteNumber(component.values.velocityY, 185);
        world.pongBalls.set(controllerKey(entity.id, component.id), {
          originX: entity.x,
          originY: entity.y,
          velocityX,
          velocityY,
          maximumSpeed: Math.max(Math.abs(velocityX), Math.abs(velocityY), finiteNumber(component.values.maximumSpeed, 520)),
        });
      }
    }
    ensurePongScoreState(world);
  }

function destroyRuntimeEntity(world: PlayableWorldState, entityId: string) {
    const removed = new Set([entityId, ...descendantIds(world, entityId)]);
    world.entities = world.entities.filter((entity) => !removed.has(entity.id));
    for (const id of removed) world.entityById.delete(id);
    for (const map of [world.patrols, world.platformers, world.pongBalls]) {
      for (const key of map.keys()) if (removed.has(key.split("\0", 1)[0])) map.delete(key);
    }
  }

function descendantIds(world: PlayableWorldState, parentId: string): string[] {
    const ids: string[] = [];
    const pending = [parentId];
    while (pending.length) {
      const current = pending.shift()!;
      for (const candidate of world.entities) {
        if (candidate.parentId !== current) continue;
        ids.push(candidate.id);
        pending.push(candidate.id);
      }
    }
    return ids;
  }

function translateDescendants(world: PlayableWorldState, parentId: string, dx: number, dy: number) {
    for (const id of descendantIds(world, parentId)) {
      const child = world.entityById.get(id)!;
      child.x += dx;
      child.y += dy;
    }
  }
