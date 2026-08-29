import { EPSILON } from "./runtime-2d-contracts.ts";
import type {
  Bounds,
  DefinedPlayableBehavior2D,
  PlatformerState,
  PlayableAudioCommand,
  PlayableBehavior2D,
  PlayableBehaviorCommand2D,
  PlayableBehaviorCommandRecord2D,
  PlayableBehaviorDefinition2D,
  PlayableBehaviorEvent2D,
  PlayableBehaviorEventDefinition2D,
  PlayableBehaviorField2D,
  PlayableBehaviorRegistry2D,
  PlayableComponent2D,
  PlayableDiagnostic,
  PlayableEntity2D,
  PlayableEntitySnapshot,
  PlayablePlatformerSnapshot,
  PlayableProject2D,
  PlayableValue2D,
  PlayableWorldSnapshot,
  RuntimeEntity
} from "./runtime-2d-contracts.ts";

export const BUILTIN_PLAYABLE_BEHAVIOR_DEFINITIONS_2D: readonly Readonly<PlayableBehaviorDefinition2D>[] = Object.freeze([
  builtinDefinition("builtin:player", "Player controller", "Movement supplied by the entity Input component.", []),
  builtinDefinition("builtin:patrol", "Patrol", "Moves between two points on one axis.", [
    selectField("axis", "Axis", "x", [["x", "Horizontal"], ["y", "Vertical"]]),
    numberField("speed", "Speed", 60, 0, 10_000, "px/s"),
    numberField("distance", "Distance", 96, 0, 100_000, "px"),
  ]),
  builtinDefinition("builtin:platformer", "Platformer controller", "Runs, jumps, and resolves deterministic platform collisions.", [
    actionField("leftAction", "Move left action", "move-left", "Input"),
    actionField("rightAction", "Move right action", "move-right", "Input"),
    actionField("jumpAction", "Jump action", "jump", "Input"),
    numberField("runSpeed", "Run speed", 220, 0, 10_000, "px/s", "Movement"),
    numberField("gravity", "Gravity", 1_800, 0, 10_000, "px/sÂ²", "Movement"),
    numberField("jumpSpeed", "Jump speed", 650, 0.000_001, 10_000, "px/s", "Movement"),
    numberField("maxFallSpeed", "Maximum fall speed", 900, 0.000_001, 10_000, "px/s", "Movement"),
    numberField("coyoteMs", "Coyote time", 100, 0, 1_000, "ms", "Feel", true),
    numberField("jumpBufferMs", "Jump buffer", 100, 0, 1_000, "ms", "Feel", true),
    numberField("jumpCutMultiplier", "Jump release multiplier", 0.5, 0, 1, undefined, "Feel", true),
  ]),
  builtinDefinition("builtin:pong-paddle", "Pong paddle", "Moves a player paddle between authored vertical limits.", [
    actionField("upAction", "Move up action", "move-up", "Input"),
    actionField("downAction", "Move down action", "move-down", "Input"),
    numberField("speed", "Speed", 360, 0, 10_000, "px/s", "Movement"),
    numberField("minimumY", "Top limit", 64, -100_000, 100_000, "px", "Bounds", true),
    numberField("maximumY", "Bottom limit", 416, -100_000, 100_000, "px", "Bounds", true),
  ]),
  builtinDefinition("builtin:pong-ai", "Pong opponent", "Follows a target ball with a configurable reaction dead zone.", [
    referenceField("entity", "ballId", "Ball", "ball", "Target"),
    numberField("speed", "Speed", 295, 0, 10_000, "px/s", "Movement"),
    numberField("deadZone", "Reaction dead zone", 12, 0, 10_000, "px", "Movement"),
    numberField("minimumY", "Top limit", 64, -100_000, 100_000, "px", "Bounds", true),
    numberField("maximumY", "Bottom limit", 416, -100_000, 100_000, "px", "Bounds", true),
  ]),
  builtinDefinition("builtin:pong-ball", "Pong ball", "Bounces, records scores, emits pong:score, and serves toward the player who conceded.", [
    numberField("velocityX", "Horizontal speed", 285, -10_000, 10_000, "px/s", "Movement"),
    numberField("velocityY", "Vertical speed", 185, -10_000, 10_000, "px/s", "Movement"),
    numberField("maximumSpeed", "Maximum speed", 520, 0, 10_000, "px/s", "Movement"),
    referenceField("state-key", "leftScoreKey", "Left score state", "score.left", "Scoring"),
    referenceField("state-key", "rightScoreKey", "Right score state", "score.right", "Scoring"),
  ], [{ name: "pong:score", label: "Scored", description: "Emitted with side, scoreKey, and score after the ball crosses a goal." }]),
]);

const BUILTIN_BEHAVIORS = new Set(BUILTIN_PLAYABLE_BEHAVIOR_DEFINITIONS_2D.map((definition) => definition.module));

/** Decorates a behavior function without changing its callable shape or existing registries. */
export function definePlayableBehavior2D(definition: PlayableBehaviorDefinition2D, behavior: PlayableBehavior2D): DefinedPlayableBehavior2D {
  validateBehaviorDefinition(definition);
  const frozen = freezeBehaviorDefinition(definition);
  Object.defineProperty(behavior, "definition", { value: frozen, enumerable: true, configurable: false, writable: false });
  if (!isDefinedPlayableBehavior2D(behavior)) throw new Error("Playable behavior metadata attachment failed.");
  return behavior;
}

/** Resolves built-in metadata or metadata attached to a statically registered custom behavior. */
export function playableBehaviorDefinition2D(
  component: Pick<PlayableComponent2D, "values">,
  behaviors: PlayableBehaviorRegistry2D = {},
): Readonly<PlayableBehaviorDefinition2D> | undefined {
  const moduleName = component.values.module;
  if (typeof moduleName !== "string") return undefined;
  const builtin = BUILTIN_PLAYABLE_BEHAVIOR_DEFINITIONS_2D.find((definition) => definition.module === moduleName);
  if (builtin) return builtin;
  const key = playableBehaviorKey(component);
  const behavior = key ? behaviors[key] : undefined;
  const definition = behavior && isDefinedPlayableBehavior2D(behavior) ? behavior.definition : undefined;
  if (!definition || definition.module !== moduleName || definition.exportName !== (component.values.export ?? "update")) return undefined;
  validateBehaviorDefinition(definition);
  return freezeBehaviorDefinition(definition);
}

/** Creates portable component values from public-field defaults plus validated overrides. */
export function createPlayableBehaviorComponentValues2D(
  definition: PlayableBehaviorDefinition2D,
  overrides: Readonly<Record<string, PlayableValue2D>> = {},
): Record<string, PlayableValue2D> {
  validateBehaviorDefinition(definition);
  const fields = new Map(definition.fields.map((field) => [field.key, field]));
  for (const key of Object.keys(overrides)) if (!fields.has(key)) throw new Error(`Playable behavior ${definition.id} has no public field ${key}.`);
  const result: Record<string, PlayableValue2D> = { module: definition.module, export: definition.exportName };
  for (const field of definition.fields) {
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, field.key);
    if (field.optional && !hasOverride && field.default === "") continue;
    const value = hasOverride ? overrides[field.key]! : field.default;
    validateBehaviorFieldValue(field, value, definition.id);
    result[field.key] = value;
  }
  return result;
}

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
export function playableBehaviorKey(component: Pick<PlayableComponent2D, "values">) {
  const moduleName = component.values.module;
  const exportName = component.values.export ?? "update";
  return typeof moduleName === "string" && moduleName && typeof exportName === "string" && exportName
    ? `${moduleName}#${exportName}`
    : undefined;
}

export function snapshotEntity(entity: PlayableEntity2D | PlayableEntitySnapshot | RuntimeEntity): PlayableEntitySnapshot {
  const components = "source" in entity ? entity.source.components : entity.components ?? [];
  return {
    id: entity.id,
    label: entity.label,
    x: entity.x,
    y: entity.y,
    width: entity.width,
    height: entity.height,
    scale: entity.scale,
    ...(entity.rotation !== undefined ? { rotation: entity.rotation } : {}),
    ...(entity.opacity !== undefined ? { opacity: entity.opacity } : {}),
    layer: entity.layer,
    color: entity.color,
    accent: entity.accent,
    kind: entity.kind,
    ...(entity.parentId ? { parentId: entity.parentId } : {}),
    components: components.map(cloneComponent),
  };
}

export function entityFromSnapshot(snapshot: PlayableEntitySnapshot): PlayableEntity2D {
  if (!snapshot.components) throw new Error(`Playable snapshot entity ${snapshot.id} is missing components.`);
  return {
    id: snapshot.id,
    label: snapshot.label,
    x: snapshot.x,
    y: snapshot.y,
    width: snapshot.width,
    height: snapshot.height,
    scale: snapshot.scale,
    ...(snapshot.rotation !== undefined ? { rotation: snapshot.rotation } : {}),
    ...(snapshot.opacity !== undefined ? { opacity: snapshot.opacity } : {}),
    layer: snapshot.layer,
    color: snapshot.color,
    accent: snapshot.accent,
    kind: snapshot.kind,
    ...(snapshot.parentId ? { parentId: snapshot.parentId } : {}),
    components: snapshot.components.map(cloneComponent),
  };
}

export function parsePlayableWorldSnapshot(value: unknown): PlayableWorldSnapshot {
  if (!isSnapshotRecord(value)) throw new Error("Playable snapshot must be an object.");
  if (value.version !== 1) throw new Error(`Unsupported playable snapshot version: ${String(value.version)}`);
  if (!Array.isArray(value.entities) || value.entities.length > 10_000) throw new Error("Playable snapshot entities are invalid.");
  const state = value.state === undefined ? undefined : validateStateRecord(value.state, "Playable snapshot state");
  const platformers = value.platformers === undefined ? undefined : parsePlatformerSnapshots(value.platformers);
  const previousActions = value.previousActions === undefined ? undefined : parsePreviousActions(value.previousActions);
  const previousEvents = value.previousEvents === undefined ? undefined : validateBehaviorEvents(value.previousEvents, "Playable snapshot previous events");
  return {
    version: 1,
    sceneId: snapshotText(value.sceneId, "Playable snapshot sceneId", 128),
    tick: snapshotInteger(value.tick, "Playable snapshot tick"),
    simulationTimeSeconds: snapshotNumber(value.simulationTimeSeconds, "Playable snapshot simulation time", true),
    entities: value.entities.map(parseSnapshotEntity),
    ...(state === undefined ? {} : { state }),
    ...(platformers === undefined ? {} : { platformers }),
    ...(previousActions === undefined ? {} : { previousActions }),
    ...(previousEvents === undefined ? {} : { previousEvents }),
  };
}

function parseSnapshotEntity(value: unknown, index: number): PlayableEntitySnapshot {
  if (!isSnapshotRecord(value)) throw new Error(`Playable snapshot entity ${index} must be an object.`);
  const rotation = value.rotation === undefined ? undefined : snapshotNumber(value.rotation, `Playable snapshot entity ${index} rotation`);
  const opacity = value.opacity === undefined ? undefined : snapshotNumber(value.opacity, `Playable snapshot entity ${index} opacity`);
  const parentId = value.parentId === undefined ? undefined : snapshotText(value.parentId, `Playable snapshot entity ${index} parentId`, 128);
  const components = value.components === undefined ? undefined : parseSnapshotComponents(value.components, index);
  return {
    id: snapshotText(value.id, `Playable snapshot entity ${index} id`, 128),
    label: snapshotText(value.label, `Playable snapshot entity ${index} label`, 256),
    x: snapshotNumber(value.x, `Playable snapshot entity ${index} x`),
    y: snapshotNumber(value.y, `Playable snapshot entity ${index} y`),
    width: snapshotNumber(value.width, `Playable snapshot entity ${index} width`),
    height: snapshotNumber(value.height, `Playable snapshot entity ${index} height`),
    scale: snapshotNumber(value.scale, `Playable snapshot entity ${index} scale`),
    ...(rotation === undefined ? {} : { rotation }),
    ...(opacity === undefined ? {} : { opacity }),
    layer: snapshotInteger(value.layer, `Playable snapshot entity ${index} layer`, false),
    color: snapshotText(value.color, `Playable snapshot entity ${index} color`, 128),
    accent: snapshotText(value.accent, `Playable snapshot entity ${index} accent`, 128),
    kind: snapshotText(value.kind, `Playable snapshot entity ${index} kind`, 128),
    ...(parentId === undefined ? {} : { parentId }),
    ...(components === undefined ? {} : { components }),
  };
}

function parseSnapshotComponents(value: unknown, entityIndex: number): PlayableComponent2D[] {
  if (!Array.isArray(value) || value.length > 1_024) throw new Error(`Playable snapshot entity ${entityIndex} components are invalid.`);
  return value.map((candidate, componentIndex) => {
    if (!isSnapshotRecord(candidate) || typeof candidate.enabled !== "boolean") {
      throw new Error(`Playable snapshot entity ${entityIndex} component ${componentIndex} is invalid.`);
    }
    return {
      id: snapshotText(candidate.id, `Playable snapshot entity ${entityIndex} component ${componentIndex} id`, 128),
      type: snapshotText(candidate.type, `Playable snapshot entity ${entityIndex} component ${componentIndex} type`, 128),
      enabled: candidate.enabled,
      values: parseComponentValues(candidate.values, `Playable snapshot entity ${entityIndex} component ${componentIndex}`),
    };
  });
}

function parseComponentValues(value: unknown, label: string): Record<string, PlayableValue2D> {
  if (!isSnapshotRecord(value)) throw new Error(`${label} values must be an object.`);
  const result: Record<string, PlayableValue2D> = {};
  for (const [key, item] of Object.entries(value)) {
    validateRecordKey(key, `${label} value key`);
    validatePlayableValue(item, `${label} value ${key}`);
    result[key] = item;
  }
  return result;
}

function parsePlatformerSnapshots(value: unknown): PlayablePlatformerSnapshot[] {
  if (!Array.isArray(value) || value.length > 10_000) throw new Error("Playable snapshot platformers are invalid.");
  return value.map((candidate, index) => {
    if (!isSnapshotRecord(candidate) || typeof candidate.grounded !== "boolean") throw new Error(`Playable snapshot platformer ${index} is invalid.`);
    return {
      entityId: snapshotText(candidate.entityId, `Playable snapshot platformer ${index} entityId`, 128),
      componentId: snapshotText(candidate.componentId, `Playable snapshot platformer ${index} componentId`, 128),
      verticalVelocity: snapshotNumber(candidate.verticalVelocity, `Playable snapshot platformer ${index} verticalVelocity`),
      grounded: candidate.grounded,
      coyoteSeconds: snapshotNumber(candidate.coyoteSeconds, `Playable snapshot platformer ${index} coyoteSeconds`, true),
      jumpBufferSeconds: snapshotNumber(candidate.jumpBufferSeconds, `Playable snapshot platformer ${index} jumpBufferSeconds`, true),
    };
  });
}

function parsePreviousActions(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 1_024) throw new Error("Playable snapshot previous actions are invalid.");
  return value.map((action, index) => snapshotText(action, `Playable snapshot previous action ${index}`, 128));
}

function snapshotText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || !value || value.length > maximum) throw new Error(`${label} must be bounded non-empty text.`);
  return value;
}

function snapshotNumber(value: unknown, label: string, nonNegative = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || (nonNegative && value < 0)) throw new Error(`${label} must be ${nonNegative ? "non-negative " : ""}finite.`);
  return value;
}

function snapshotInteger(value: unknown, label: string, nonNegative = true): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || (nonNegative && value < 0)) throw new Error(`${label} must be ${nonNegative ? "non-negative " : ""}a safe integer.`);
  return value;
}

function isSnapshotRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function audioPlayCommand(sceneId: string, entityId: string, component: PlayableComponent2D, tick: number): PlayableAudioCommand {
  const assetIdValue = typeof component.values.assetId === "string" ? component.values.assetId : component.values.asset;
  if (typeof assetIdValue !== "string") throw new Error(`Playable audio component ${component.id} has no asset id.`);
  const volume = typeof component.values.gain === "number"
    ? component.values.gain
    : typeof component.values.volume === "number" ? component.values.volume : 1;
  return {
    type: "play",
    commandId: `play:${sceneId}:${entityId}:${component.id}:${tick}`,
    sceneId,
    entityId,
    componentId: component.id,
    assetId: assetIdValue,
    bus: playableAudioBus(component.values.bus),
    gain: volume,
    pan: typeof component.values.pan === "number" ? component.values.pan : 0,
    loop: component.values.loop === true,
    priority: typeof component.values.priority === "number" ? component.values.priority : 0,
  };
}

function playableAudioBus(value: PlayableValue2D | undefined): "music" | "sfx" | "voice" | "ambient" {
  if (value === undefined) return "sfx";
  if (value === "music" || value === "sfx" || value === "voice" || value === "ambient") return value;
  throw new Error(`Unsupported playable audio bus: ${String(value)}`);
}

export function cloneAudioCommand(command: PlayableAudioCommand): PlayableAudioCommand {
  return { ...command };
}

function cloneComponent(component: PlayableComponent2D): PlayableComponent2D {
  return { ...component, values: { ...component.values } };
}

export function cloneBehaviorCommand(command: PlayableBehaviorCommand2D): PlayableBehaviorCommand2D {
  return structuredClone(command);
}

export function cloneBehaviorCommandRecord(record: PlayableBehaviorCommandRecord2D): PlayableBehaviorCommandRecord2D {
  return { ...record, command: cloneBehaviorCommand(record.command) };
}

export function cloneBehaviorEvent(event: PlayableBehaviorEvent2D): PlayableBehaviorEvent2D {
  return { ...event, ...(event.data ? { data: { ...event.data } } : {}) };
}

export function validateBehaviorCommandPlan(
  records: readonly PlayableBehaviorCommandRecord2D[],
  entities: readonly RuntimeEntity[],
  project: PlayableProject2D,
  state: Readonly<Record<string, PlayableValue2D>>,
) {
  const known = new Map(entities.map((entity) => [entity.id, entity.source]));
  const plannedState = { ...state };
  for (const [index, record] of records.entries()) {
    const command = record.command;
    if (!command || typeof command !== "object") throw new Error(`Playable behavior command ${index} is invalid.`);
    if (command.type === "set-state") {
      validateStateKey(command.key, `Playable behavior command ${index}`);
      validatePlayableValue(command.value, `Playable behavior command ${index} value`);
      plannedState[command.key] = command.value;
      if (Object.keys(plannedState).length > 4_096) throw new Error("Playable behavior state exceeds 4,096 entries.");
    } else if (command.type === "increment-state") {
      validateStateKey(command.key, `Playable behavior command ${index}`);
      if (command.amount !== undefined && !Number.isFinite(command.amount)) throw new Error(`Playable behavior command ${index} increment must be finite.`);
      const current = plannedState[command.key] ?? 0;
      if (typeof current !== "number" || !Number.isFinite(current + (command.amount ?? 1))) throw new Error(`Playable behavior command ${index} cannot increment non-numeric state ${command.key}.`);
      plannedState[command.key] = current + (command.amount ?? 1);
      if (Object.keys(plannedState).length > 4_096) throw new Error("Playable behavior state exceeds 4,096 entries.");
    } else if (command.type === "spawn-entity") {
      validateRuntimeEntityDefinition(command.entity, project);
      if (known.has(command.entity.id)) throw new Error(`Playable behavior cannot spawn duplicate entity ${command.entity.id}.`);
      if (known.size >= 10_000) throw new Error("Playable behavior cannot exceed the 10,000 entity limit.");
      if (command.entity.parentId && !known.has(command.entity.parentId)) throw new Error(`Playable spawned entity ${command.entity.id} references missing parent ${command.entity.parentId}.`);
      known.set(command.entity.id, command.entity);
    } else if (command.type === "destroy-entity") {
      const targetId = command.entityId ?? record.sourceEntityId;
      if (!known.has(targetId)) throw new Error(`Playable behavior cannot destroy missing entity ${targetId}.`);
      removeEntityAndDescendants(known, targetId);
    } else if (command.type === "set-component-value") {
      const targetId = command.entityId ?? record.sourceEntityId;
      const target = known.get(targetId);
      if (!target) throw new Error(`Playable behavior cannot update missing entity ${targetId}.`);
      if (!target.components.some((component) => component.id === command.componentId)) throw new Error(`Playable behavior cannot update missing component ${targetId}/${command.componentId}.`);
      validateRecordKey(command.key, `Playable behavior command ${index} component key`);
      validatePlayableValue(command.value, `Playable behavior command ${index} component value`);
    } else if (command.type === "set-ui-text") {
      const target = known.get(command.entityId);
      if (!target) throw new Error(`Playable behavior cannot update UI on missing entity ${command.entityId}.`);
      const components = target.components.filter((component) => component.enabled && component.type === "ui");
      if (command.componentId ? !components.some((component) => component.id === command.componentId) : components.length !== 1) {
        throw new Error(`Playable behavior UI command must resolve exactly one enabled UI component on ${command.entityId}.`);
      }
      if (typeof command.text !== "string" || command.text.length > 4_096) throw new Error(`Playable behavior command ${index} UI text is invalid.`);
    } else if (command.type === "play-audio") {
      validateAudioBehaviorCommand(command, project, index);
    } else if (command.type === "switch-scene") {
      if (index !== records.length - 1) throw new Error("Playable behavior switch-scene must be the final command in a tick.");
      if (!project.scenes.some((scene) => scene.id === command.sceneId)) throw new Error(`Playable behavior cannot switch to missing scene ${command.sceneId}.`);
    } else if (command.type === "emit-event") {
      validateEventName(command.name, `Playable behavior command ${index}`);
      if (command.data) validateStateRecord(command.data, `Playable behavior command ${index} event data`, 32);
    } else {
      throw new Error(`Playable behavior command ${index} has unsupported type ${String(Reflect.get(command, "type"))}.`);
    }
  }
}

function removeEntityAndDescendants(entities: Map<string, PlayableEntity2D>, entityId: string) {
  const pending = [entityId];
  while (pending.length) {
    const id = pending.shift()!;
    for (const entity of entities.values()) if (entity.parentId === id) pending.push(entity.id);
    entities.delete(id);
  }
}

function validateAudioBehaviorCommand(command: Extract<PlayableBehaviorCommand2D, { type: "play-audio" }>, project: PlayableProject2D, index: number) {
  if (typeof command.assetId !== "string" || !command.assetId || command.assetId.length > 128) throw new Error(`Playable behavior command ${index} audio asset is invalid.`);
  if (project.assets && !project.assets.some((asset) => asset.id === command.assetId && (asset.kind === undefined || asset.kind === "audio") && (asset.mimeType === undefined || asset.mimeType.startsWith("audio/")))) {
    throw new Error(`Playable behavior command ${index} references missing or non-audio asset ${command.assetId}.`);
  }
  if (command.bus !== undefined && !["music", "sfx", "voice", "ambient"].includes(command.bus)) throw new Error(`Playable behavior command ${index} audio bus is invalid.`);
  if (command.gain !== undefined && (!Number.isFinite(command.gain) || command.gain < 0 || command.gain > 4)) throw new Error(`Playable behavior command ${index} audio gain must be between 0 and 4.`);
  if (command.pan !== undefined && (!Number.isFinite(command.pan) || command.pan < -1 || command.pan > 1)) throw new Error(`Playable behavior command ${index} audio pan must be between -1 and 1.`);
  if (command.priority !== undefined && !Number.isFinite(command.priority)) throw new Error(`Playable behavior command ${index} audio priority must be finite.`);
  if (command.loop !== undefined && typeof command.loop !== "boolean") throw new Error(`Playable behavior command ${index} audio loop must be boolean.`);
}

function validateRuntimeEntityDefinition(entity: PlayableEntity2D, project: PlayableProject2D) {
  if (!entity || typeof entity !== "object" || typeof entity.id !== "string" || !entity.id || entity.id.length > 128 || !Array.isArray(entity.components) || entity.components.length > 64) {
    throw new Error("Playable spawned entity is invalid.");
  }
  if (typeof entity.label !== "string" || entity.label.length > 256 || typeof entity.color !== "string" || entity.color.length > 128 || typeof entity.accent !== "string" || entity.accent.length > 128 || typeof entity.kind !== "string" || entity.kind.length > 128 || !Number.isSafeInteger(entity.layer)) {
    throw new Error(`Playable spawned entity ${entity.id} presentation is invalid.`);
  }
  if (entity.parentId !== undefined && (typeof entity.parentId !== "string" || !entity.parentId || entity.parentId.length > 128)) throw new Error(`Playable spawned entity ${entity.id} parent is invalid.`);
  for (const key of ["x", "y", "width", "height", "scale"] as const) {
    if (!Number.isFinite(entity[key]) || ((key === "width" || key === "height" || key === "scale") && entity[key] <= 0)) throw new Error(`Playable spawned entity ${entity.id} has an invalid ${key}.`);
  }
  if (entity.rotation !== undefined && !Number.isFinite(entity.rotation)) throw new Error(`Playable spawned entity ${entity.id} has an invalid rotation.`);
  if (entity.opacity !== undefined && (!Number.isFinite(entity.opacity) || entity.opacity < 0 || entity.opacity > 1)) throw new Error(`Playable spawned entity ${entity.id} has an invalid opacity.`);
  const componentIds = new Set<string>();
  for (const component of entity.components) {
    if (!component || typeof component.id !== "string" || !component.id || component.id.length > 128 || componentIds.has(component.id) || typeof component.type !== "string" || typeof component.enabled !== "boolean" || !component.values || typeof component.values !== "object" || Array.isArray(component.values)) {
      throw new Error(`Playable spawned entity ${entity.id} has an invalid component.`);
    }
    componentIds.add(component.id);
    for (const [key, value] of Object.entries(component.values)) {
      validateRecordKey(key, `Playable spawned component ${component.id} key`);
      validatePlayableValue(value, `Playable spawned component ${component.id} value`);
    }
    if (component.enabled && component.type === "audio") validateAudioComponent(component, project.assets, new Set(project.assets?.map((asset) => asset.id) ?? []));
  }
  const platformer = entity.components.find((component) => component.enabled && component.type === "behavior" && component.values.module === "builtin:platformer");
  if (platformer) validatePlatformerComponent(entity, platformer, project);
}

export function validateSnapshotEntities(entities: readonly PlayableEntitySnapshot[], project: PlayableProject2D) {
  if (entities.length > 10_000) throw new Error("Playable snapshot exceeds the 10,000 entity limit.");
  const ids = new Set<string>();
  for (const snapshot of entities) {
    const entity = entityFromSnapshot(snapshot);
    if (ids.has(entity.id)) throw new Error(`Playable snapshot entity count is invalid because it contains duplicate entity ${entity.id}.`);
    ids.add(entity.id);
    validateRuntimeEntityDefinition(entity, project);
  }
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  for (const snapshot of entities) {
    if (snapshot.parentId && !ids.has(snapshot.parentId)) throw new Error(`Playable snapshot entity ${snapshot.id} references missing parent ${snapshot.parentId}.`);
    const ancestry = new Set([snapshot.id]);
    let parentId = snapshot.parentId;
    while (parentId) {
      if (ancestry.has(parentId)) throw new Error(`Playable snapshot parenting cycle includes ${snapshot.id}.`);
      ancestry.add(parentId);
      parentId = byId.get(parentId)?.parentId;
    }
  }
}

function validatePlayableValue(value: unknown, label: string): asserts value is PlayableValue2D {
  if ((typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") || (typeof value === "number" && !Number.isFinite(value)) || (typeof value === "string" && value.length > 4_096)) throw new Error(`${label} must be a finite number, bounded string, or boolean.`);
}

export function validateStateRecord(value: unknown, label: string, maximumEntries = 4_096): Record<string, PlayableValue2D> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const entries = Object.entries(value);
  if (entries.length > maximumEntries) throw new Error(`${label} exceeds ${maximumEntries} entries.`);
  const result: Record<string, PlayableValue2D> = {};
  for (const [key, item] of entries) {
    validateStateKey(key, label);
    validatePlayableValue(item, `${label} ${key}`);
    result[key] = item;
  }
  return result;
}

export function validateBehaviorEvents(events: unknown, label: string): PlayableBehaviorEvent2D[] {
  if (!Array.isArray(events) || events.length > 1_024) throw new Error(`${label} are invalid.`);
  return events.map((event, index) => {
    if (!event || typeof event !== "object" || typeof event.sourceEntityId !== "string" || typeof event.sourceComponentId !== "string") throw new Error(`${label} ${index} is invalid.`);
    validateEventName(event.name, `${label} ${index}`);
    if (event.data) validateStateRecord(event.data, `${label} ${index} data`, 32);
    return cloneBehaviorEvent(event);
  });
}

function validateStateKey(key: string, label: string) {
  if (typeof key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(key)) throw new Error(`${label} state key is invalid: ${String(key)}.`);
}

function validateRecordKey(key: string, label: string) {
  if (!/^[A-Za-z_$][A-Za-z0-9_$.-]{0,127}$/.test(key)) throw new Error(`${label} is invalid: ${key}.`);
}

function validateEventName(name: string, label: string) {
  if (typeof name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(name)) throw new Error(`${label} event name is invalid: ${String(name)}.`);
}

export function enabledComponents(entity: PlayableEntity2D, type: string) {
  return entity.components.filter((component) => component.enabled && component.type === type);
}

export function solidCollider(entity: PlayableEntity2D) {
  return enabledComponents(entity, "collider").some((component) => {
    const shape = component.values.shape;
    return component.values.solid === true && (shape === undefined || shape === "box" || shape === "aabb");
  });
}

export function entityBounds(entity: PlayableEntitySnapshot): Bounds {
  const halfWidth = entity.width * entity.scale / 2;
  const halfHeight = entity.height * entity.scale / 2;
  return { left: entity.x - halfWidth, right: entity.x + halfWidth, top: entity.y - halfHeight, bottom: entity.y + halfHeight };
}

export function intervalsOverlap(aMin: number, aMax: number, bMin: number, bMax: number) {
  return aMin < bMax - EPSILON && aMax > bMin + EPSILON;
}

export function collisionGap(moving: Bounds, obstacle: Bounds, axis: "x" | "y", delta: number): number | undefined {
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

function builtinDefinition(
  module: string,
  label: string,
  description: string,
  fields: readonly PlayableBehaviorField2D[],
  events?: readonly PlayableBehaviorEventDefinition2D[],
): Readonly<PlayableBehaviorDefinition2D> {
  return freezeBehaviorDefinition({
    version: 1,
    id: module.slice("builtin:".length),
    module,
    exportName: "update",
    label,
    description,
    category: "Built-in",
    builtIn: true,
    fields,
    ...(events ? { events } : {}),
  });
}

function numberField(
  key: string,
  label: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
  unit?: string,
  group?: string,
  advanced?: boolean,
): PlayableBehaviorField2D {
  return { key, label, type: "number", default: defaultValue, minimum, maximum, ...(unit ? { unit } : {}), ...(group ? { group } : {}), ...(advanced ? { advanced } : {}) };
}

function selectField(key: string, label: string, defaultValue: string, options: readonly (readonly [string, string])[]): PlayableBehaviorField2D {
  return { key, label, type: "select", default: defaultValue, options: options.map(([value, optionLabel]) => ({ value, label: optionLabel })) };
}

function actionField(key: string, label: string, defaultValue: string, group?: string): PlayableBehaviorField2D {
  return { key, label, type: "action", default: defaultValue, ...(group ? { group } : {}) };
}

function referenceField(type: "entity" | "asset" | "scene" | "state-key", key: string, label: string, defaultValue: string, group?: string): PlayableBehaviorField2D {
  return { key, label, type, default: defaultValue, ...(group ? { group } : {}) };
}

function freezeBehaviorDefinition(definition: PlayableBehaviorDefinition2D): Readonly<PlayableBehaviorDefinition2D> {
  const fields = definition.fields.map(freezeBehaviorField);
  const events = definition.events?.map((event) => Object.freeze({ ...event }));
  return Object.freeze({ ...definition, fields: Object.freeze(fields), ...(events ? { events: Object.freeze(events) } : {}) });
}

function freezeBehaviorField(field: PlayableBehaviorField2D): PlayableBehaviorField2D {
  if (field.type === "select") {
    return Object.freeze({ ...field, options: Object.freeze(field.options.map((option) => Object.freeze({ ...option }))) });
  }
  return Object.freeze({ ...field });
}

function isDefinedPlayableBehavior2D(behavior: PlayableBehavior2D): behavior is DefinedPlayableBehavior2D {
  const definition = Reflect.get(behavior, "definition");
  if (typeof definition !== "object" || definition === null) return false;
  try {
    validateBehaviorDefinitionFromUnknown(definition);
    return true;
  } catch {
    return false;
  }
}

function validateBehaviorDefinitionFromUnknown(value: object): asserts value is PlayableBehaviorDefinition2D {
  if (!isPlayableBehaviorDefinition(value)) throw new Error("Playable behavior definition metadata is invalid.");
  validateBehaviorDefinition(value);
}

function isPlayableBehaviorDefinition(value: object): value is PlayableBehaviorDefinition2D {
  const fields = Reflect.get(value, "fields");
  const events = Reflect.get(value, "events");
  return Reflect.get(value, "version") === 1
    && typeof Reflect.get(value, "id") === "string"
    && typeof Reflect.get(value, "module") === "string"
    && typeof Reflect.get(value, "exportName") === "string"
    && typeof Reflect.get(value, "label") === "string"
    && typeof Reflect.get(value, "description") === "string"
    && isUnknownArray(fields)
    && (events === undefined || isUnknownArray(events));
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function validateBehaviorDefinition(definition: PlayableBehaviorDefinition2D) {
  if (!definition || typeof definition !== "object" || definition.version !== 1) throw new Error("Playable behavior definition must use version 1.");
  for (const [label, value] of [["id", definition.id], ["module", definition.module], ["exportName", definition.exportName], ["label", definition.label], ["description", definition.description]] as const) {
    if (typeof value !== "string" || !value || value.length > (label === "description" ? 1_024 : 128)) throw new Error(`Playable behavior definition ${label} is invalid.`);
  }
  if (!isUnknownArray(definition.fields) || definition.fields.length > 128) throw new Error("Playable behavior definition fields are invalid.");
  const fieldKeys = new Set<string>();
  for (const field of definition.fields) {
    validateRecordKey(field.key, "Playable behavior field key");
    if (fieldKeys.has(field.key)) throw new Error(`Playable behavior definition contains duplicate field ${field.key}.`);
    fieldKeys.add(field.key);
    if (typeof field.label !== "string" || !field.label || field.label.length > 128) throw new Error(`Playable behavior field ${field.key} label is invalid.`);
    if (field.type === "number") {
      if (!Number.isFinite(field.default) || (field.minimum !== undefined && !Number.isFinite(field.minimum)) || (field.maximum !== undefined && !Number.isFinite(field.maximum)) || (field.minimum !== undefined && field.default < field.minimum) || (field.maximum !== undefined && field.default > field.maximum)) throw new Error(`Playable behavior number field ${field.key} has invalid bounds.`);
    } else if (field.type === "select") {
      const options = field.options;
      if (!options.length || !options.some((option) => option.value === field.default) || new Set(options.map((option) => option.value)).size !== options.length) throw new Error(`Playable behavior select field ${field.key} has invalid options.`);
    } else if (typeof field.default !== (field.type === "boolean" ? "boolean" : "string")) {
      throw new Error(`Playable behavior field ${field.key} has an invalid default.`);
    }
  }
  if (definition.events !== undefined) {
    if (!isUnknownArray(definition.events) || definition.events.length > 128) throw new Error("Playable behavior definition events are invalid.");
    const names = new Set<string>();
    for (const event of definition.events) {
      validateEventName(event.name, "Playable behavior definition");
      if (names.has(event.name)) throw new Error(`Playable behavior definition contains duplicate event ${event.name}.`);
      names.add(event.name);
    }
  }
}

function validateBehaviorFieldValue(field: PlayableBehaviorField2D, value: PlayableValue2D, behaviorId: string) {
  if (field.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value) || (field.minimum !== undefined && value < field.minimum) || (field.maximum !== undefined && value > field.maximum)) throw new Error(`Playable behavior ${behaviorId} field ${field.key} is outside its numeric bounds.`);
  } else if (field.type === "boolean") {
    if (typeof value !== "boolean") throw new Error(`Playable behavior ${behaviorId} field ${field.key} must be boolean.`);
  } else {
    if (typeof value !== "string") throw new Error(`Playable behavior ${behaviorId} field ${field.key} must be a string.`);
    if (field.type === "select" && !field.options.some((option: { value: string }) => option.value === value)) throw new Error(`Playable behavior ${behaviorId} field ${field.key} is not an available option.`);
    if (field.type === "state-key" && value) validateStateKey(value, `Playable behavior ${behaviorId} field ${field.key}`);
  }
}

export function actionName(component: PlayableComponent2D, key: string, fallback: string) {
  const value = component.values[key];
  return typeof value === "string" && value ? value : fallback;
}

export function stateKey(component: PlayableComponent2D, key: string, fallback: string) {
  const value = component.values[key];
  const result = typeof value === "string" && value ? value : fallback;
  validateStateKey(result, `Playable component ${component.id}`);
  return result;
}

export function actionActive(actions: ReadonlySet<string>, action: string, mapping: string) {
  return actions.has(action)
    || Boolean(mapping && (actions.has(`${mapping}.${action}`) || actions.has(`${mapping}:${action}`) || actions.has(`${mapping}-${action}`)));
}

export function finiteNumber(value: string | number | boolean | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function positiveFinite(value: number | undefined, fallback: number, label: string) {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result <= 0) throw new Error(`${label} must be a finite positive number.`);
  return result;
}

export function positiveInteger(value: number | undefined, fallback: number, label: string) {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error(`${label} must be a positive integer.`);
  return result;
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function validatePlayableProject(project: PlayableProject2D) {
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
      if (entity.rotation !== undefined && !Number.isFinite(entity.rotation)) throw new Error(`Playable entity ${entity.id} has an invalid rotation.`);
      if (entity.opacity !== undefined && (!Number.isFinite(entity.opacity) || entity.opacity < 0 || entity.opacity > 1)) throw new Error(`Playable entity ${entity.id} has an invalid opacity.`);
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

export function controllerKey(entityId: string, componentId: string) {
  return `${entityId}\0${componentId}`;
}

export function platformerSnapshot(entityId: string, componentId: string, state: PlatformerState): PlayablePlatformerSnapshot {
  return { entityId, componentId, verticalVelocity: state.verticalVelocity, grounded: state.grounded, coyoteSeconds: state.coyoteSeconds, jumpBufferSeconds: state.jumpBufferSeconds };
}

export function platformerNumber(component: PlayableComponent2D, key: string, fallback: number) {
  const value = component.values[key];
  return typeof value === "number" ? value : fallback;
}
