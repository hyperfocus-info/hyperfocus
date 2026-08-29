import {
  createInputMapper,
  createMmoControllerActionFrameMapper,
  type MmoControllerActionFrame,
  type MmoControllerActionFrameOptions,
  type MmoControllerButtonLike,
  type MmoControllerLike,
  type MmoControllerVector
} from "@hyperfocus/engine/mmo";
import { createGamepadSession, forEachRadiusCandidate } from "@hyperfocus/engine";
import { getMmoSkillDemoAnchorTile } from "../data/world.ts";
import { worldLandmarkId, worldLandmarkPlacements } from "../data/world-landmarks.ts";
import { type MmoSkillDemoAction, type MmoSkillDemoInput, type MmoSkillDemoState, type PlayerEntity } from "../shared-contracts.ts";
import { TILE } from "./world.ts";

type Entity = { id: string; x: number; y: number };
type InteractionTarget = Entity & { zoneId: string; depleted?: boolean; hp?: number; role?: string; ownerId?: string };
export type AimPoint = { x: number; y: number };
export type MovementVector = MmoControllerVector;
export type GamepadButtonLike = MmoControllerButtonLike;
export type GamepadLike = MmoControllerLike;
export type ControllerInputFrame = MmoControllerActionFrame;
export type ControllerInputOptions = MmoControllerActionFrameOptions;
type ExtendedAction = MmoSkillDemoAction | "r";
type CurrentInput = MmoSkillDemoInput & { dx: number; dy: number; action: ExtendedAction; targetId: string; aimX: number; aimY: number };
type AbilityAction = "lmb" | "rmb" | "space" | "q" | "e" | "r";

export const CONTROLLER_AIM_RADIUS = 220;
export const DEFAULT_CONTROLLER_DEADZONE = 0.05;
const MAX_CONTROLLER_DEADZONE = 0.5;
const CONTROLLER_BUTTON_PRESS_THRESHOLD = 0.45;
const PEACE_NPC_ROLES = new Set(["quest", "trainer", "bank", "merchant", "travel", "contract", "crafting", "home", "hidden"]);
const targetMapper = createInputMapper();
const ABILITY_BINDINGS = [
  { action: "lmb", keys: ["Mouse0", "Digit1"], aimRadius: 52, fallbackRadius: 120 },
  { action: "rmb", keys: ["Mouse2", "Digit2"], aimRadius: 72, fallbackRadius: 0 },
  { action: "space", keys: ["Space"], aimRadius: 44, fallbackRadius: 130 },
  { action: "q", keys: ["KeyQ"], aimRadius: 0, fallbackRadius: 0 },
  { action: "e", keys: ["KeyE"], aimRadius: 92, fallbackRadius: 0 },
  { action: "r", keys: ["KeyR"], aimRadius: 112, fallbackRadius: 170 }
] as const;
const CONTROLLER_BUTTON_BINDINGS = [
  { button: 6, key: "Mouse0" },
  { button: 7, key: "Mouse2" },
  { button: 0, key: "Space" },
  { button: 2, key: "KeyQ" },
  { button: 3, key: "KeyE" },
  { button: 4, key: "KeyZ" },
  { button: 1, key: "KeyR" },
  { button: 5, key: "KeyR" },
  { button: 12, key: "KeyN" },
  { button: 8, key: "KeyM" }
] as const;
const controllerMapper = createMmoControllerActionFrameMapper({
  buttonBindings: CONTROLLER_BUTTON_BINDINGS,
  aimRadius: CONTROLLER_AIM_RADIUS,
  defaultDeadzone: DEFAULT_CONTROLLER_DEADZONE,
  maxDeadzone: MAX_CONTROLLER_DEADZONE,
  buttonPressThreshold: CONTROLLER_BUTTON_PRESS_THRESHOLD
});
let heldAbilityOrder = 0;
const heldAbilityInputs = new Map<AbilityAction, number>();

function clampAxis(value: number) {
  return Math.max(-1, Math.min(1, value));
}

export function normalizeControllerDeadzone(value: unknown) {
  return controllerMapper.normalizeDeadzone(value);
}

export function controllerInputFromGamepad(gamepad: GamepadLike | undefined, options: ControllerInputOptions = {}): ControllerInputFrame {
  return controllerMapper.map(gamepad, options);
}

export function createMmoSkillControllerSession() {
  return createGamepadSession({ mapper: controllerMapper });
}

export function controllerAimOffset(frame: Pick<ControllerInputFrame, "aimOffset" | "movement">) {
  return controllerMapper.aimOffset(frame);
}

function syncHeldAbilityInputs(keys: Set<string>) {
  for (const binding of ABILITY_BINDINGS) {
    const held = binding.keys.some((key) => keys.has(key));
    if (held && !heldAbilityInputs.has(binding.action)) heldAbilityInputs.set(binding.action, ++heldAbilityOrder);
    else if (!held) heldAbilityInputs.delete(binding.action);
  }
}

function newestHeldAbilityAction(keys: Set<string>) {
  syncHeldAbilityInputs(keys);
  let newest: AbilityAction | undefined;
  let newestOrder = -1;
  for (const [action, order] of heldAbilityInputs) {
    if (order > newestOrder) {
      newest = action;
      newestOrder = order;
    }
  }
  return newest;
}

export function nearest<T extends Entity>(origin: Entity, entities: T[], maxDistance: number) {
  let best: T | undefined;
  let bestDistanceSq = maxDistance * maxDistance;
  forEachRadiusCandidate(origin, entities, { radius: maxDistance }, (entity, distanceSq) => {
    if (distanceSq < bestDistanceSq) {
      best = entity;
      bestDistanceSq = distanceSq;
    }
  });
  return best;
}

function nearestToPoint<T extends Entity>(point: AimPoint, entities: T[], maxDistance: number) {
  const target = targetMapper.selectTarget(point, entities, { radius: maxDistance });
  return target ? entities.find((entity) => entity.id === target.id) : undefined;
}

function isInteractionKey(keys: Set<string>) {
  return keys.has("KeyZ") || (keys.has("KeyP") && (keys.has("AltLeft") || keys.has("AltRight")));
}

function interactionTarget(player: PlayerEntity, state: MmoSkillDemoState) {
  const loots: InteractionTarget[] = Object.values(state.loots ?? {}).filter((loot) => loot.zoneId === player.zoneId && (!loot.ownerId || loot.ownerId === player.id));
  const resources: InteractionTarget[] = Object.values(state.resources ?? {}).filter((node) => node.zoneId === player.zoneId && !node.depleted);
  const npcs: InteractionTarget[] = Object.values(state.npcs ?? {}).filter((npc) => npc.hp > 0 && PEACE_NPC_ROLES.has(npc.role));
  const landmarks: InteractionTarget[] = worldLandmarkPlacements.map((landmark) => {
    const tile = getMmoSkillDemoAnchorTile(landmark.anchorId);
    return {
      id: worldLandmarkId(landmark),
      x: tile.x * TILE + landmark.dx + landmark.width * 0.5,
      y: tile.y * TILE + landmark.dy + landmark.height * 0.5,
      zoneId: player.zoneId
    };
  });
  return nearest(player, [...loots, ...resources, ...npcs, ...landmarks], 96);
}

export function currentInput(keys: Set<string>, player: PlayerEntity | undefined, state: MmoSkillDemoState, aim: AimPoint | undefined, movement: Partial<MovementVector> = {}): MmoSkillDemoInput {
  const input: CurrentInput = { dx: 0, dy: 0, action: "idle", targetId: "", aimX: aim?.x ?? player?.x ?? 0, aimY: aim?.y ?? player?.y ?? 0 };
  if (keys.has("KeyA") || keys.has("ArrowLeft")) input.dx -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) input.dx += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) input.dy -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) input.dy += 1;
  input.dx = clampAxis(input.dx + (movement.dx ?? 0));
  input.dy = clampAxis(input.dy + (movement.dy ?? 0));
  if (!player) return input;
  const hostile = Object.values(state.npcs ?? {}).filter((npc) => npc.zoneId === player.zoneId && npc.hp > 0 && !PEACE_NPC_ROLES.has(npc.role));
  const abilityAction = newestHeldAbilityAction(keys);
  const binding = ABILITY_BINDINGS.find((candidate) => candidate.action === abilityAction);
  if (binding) {
    input.action = binding.action;
    input.targetId = (binding.aimRadius > 0 && aim ? nearestToPoint(aim, hostile, binding.aimRadius) : undefined)?.id
      ?? (binding.fallbackRadius > 0 ? nearest(player, hostile, binding.fallbackRadius)?.id : "")
      ?? "";
  } else if (isInteractionKey(keys)) {
    const target = interactionTarget(player, state);
    input.action = "interact";
    input.targetId = target?.id ?? "";
  }
  return input;
}

export function createHeldNpcInteractionGate() {
  const heldNpcIds = new Set<string>();
  return {
    release() {
      heldNpcIds.clear();
    },
    apply(input: MmoSkillDemoInput, state: MmoSkillDemoState, interactionHeld: boolean): MmoSkillDemoInput {
      if (!interactionHeld) {
        heldNpcIds.clear();
        return input;
      }
      if (input.action !== "interact" && input.action !== "travel") return input;
      const targetId = input.targetId ?? "";
      if (!targetId || !state.npcs?.[targetId]) return input;
      if (!heldNpcIds.has(targetId)) {
        heldNpcIds.add(targetId);
        return input;
      }
      return { ...input, action: "idle", targetId: "" };
    }
  };
}
