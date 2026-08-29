import {
  createGamepadActionFrameMapper,
  type GamepadActionButtonBinding,
  type GamepadActionButtonLike,
  type GamepadActionFrame,
  type GamepadActionFrameMapper,
  type GamepadActionFrameMapperConfig,
  type GamepadActionFrameOptions,
  type GamepadActionGamepadLike,
  type GamepadActionVector
} from "../input/gamepad.ts";
import type { MmoVec2 } from "./types.ts";

export type MmoInputTarget = MmoVec2 & {
  id: string;
  type?: string;
  radius?: number;
  priority?: number;
};

export type MmoMappedInput = {
  dx: number;
  dy: number;
  action: string;
  targetId: string;
  aimX: number;
  aimY: number;
};

export type MmoInputPointer = MmoVec2 & {
  primaryDown?: boolean;
  secondaryDown?: boolean;
};

export type MmoInputMapperContext = {
  keys?: ReadonlySet<string> | readonly string[];
  pointer?: MmoInputPointer;
  actor?: MmoVec2;
  candidates?: readonly MmoInputTarget[];
};

export type MmoInputMapperConfig<TInput extends MmoMappedInput = MmoMappedInput> = {
  keyBindings?: Record<string, string>;
  axisBindings?: {
    up?: string;
    down?: string;
    left?: string;
    right?: string;
  };
  pointerActions?: {
    primary?: string;
    secondary?: string;
  };
  targetRadius?: number;
  targetTypes?: readonly string[];
  makeInput?: (mapped: MmoMappedInput, context: MmoInputMapperContext) => TInput;
};

export type MmoInputMapper<TInput extends MmoMappedInput = MmoMappedInput> = {
  map(context: MmoInputMapperContext): TInput;
  selectTarget(point: MmoVec2, candidates: readonly MmoInputTarget[], options?: { radius?: number; types?: readonly string[] }): MmoInputTarget | undefined;
};

export type MmoControllerButtonLike = GamepadActionButtonLike;
export type MmoControllerLike = GamepadActionGamepadLike;
export type MmoControllerVector = GamepadActionVector;
export type MmoControllerActionFrame = GamepadActionFrame;
export type MmoControllerButtonBinding = GamepadActionButtonBinding;
export type MmoControllerActionFrameOptions = GamepadActionFrameOptions;
export type MmoControllerActionFrameMapperConfig = GamepadActionFrameMapperConfig;
export type MmoControllerActionFrameMapper = GamepadActionFrameMapper;

function keyIsDown(keys: MmoInputMapperContext["keys"], code: string | undefined) {
  if (!keys || !code) return false;
  return isKeyArray(keys) ? keys.includes(code) : keys.has(code);
}

function isKeyArray(keys: NonNullable<MmoInputMapperContext["keys"]>): keys is readonly string[] {
  return Array.isArray(keys);
}

function distanceSq(a: MmoVec2, b: MmoVec2) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function createMmoControllerActionFrameMapper(config: MmoControllerActionFrameMapperConfig = {}): MmoControllerActionFrameMapper {
  return createGamepadActionFrameMapper(config);
}

export function createInputMapper<TInput extends MmoMappedInput>(
  config: MmoInputMapperConfig<TInput> & { makeInput: (mapped: MmoMappedInput, context: MmoInputMapperContext) => TInput },
): MmoInputMapper<TInput>;
export function createInputMapper(config?: MmoInputMapperConfig<MmoMappedInput>): MmoInputMapper<MmoMappedInput>;
export function createInputMapper(config: MmoInputMapperConfig<MmoMappedInput> = {}): MmoInputMapper<MmoMappedInput> {
  const axis = {
    up: "KeyW",
    down: "KeyS",
    left: "KeyA",
    right: "KeyD",
    ...config.axisBindings
  };
  const targetRadius = config.targetRadius ?? 48;
  const targetTypes = config.targetTypes;

  function selectTarget(point: MmoVec2, candidates: readonly MmoInputTarget[], options: { radius?: number; types?: readonly string[] } = {}) {
    const radius = options.radius ?? targetRadius;
    const allowedTypes = options.types ?? targetTypes;
    let selected: MmoInputTarget | undefined;
    let selectedDistance = Number.POSITIVE_INFINITY;
    let selectedPriority = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      if (allowedTypes && candidate.type && !allowedTypes.includes(candidate.type)) continue;
      const reach = radius + (candidate.radius ?? 0);
      const candidateDistance = distanceSq(point, candidate);
      if (candidateDistance > reach * reach) continue;
      const priority = candidate.priority ?? 0;
      if (priority < selectedPriority) continue;
      if (priority === selectedPriority && candidateDistance >= selectedDistance) continue;
      selected = candidate;
      selectedDistance = candidateDistance;
      selectedPriority = priority;
    }
    return selected;
  }

  return {
    selectTarget,
    map(context) {
      const pointer = context.pointer;
      const actor = context.actor ?? pointer ?? { x: 0, y: 0 };
      const dx = (keyIsDown(context.keys, axis.right) ? 1 : 0) - (keyIsDown(context.keys, axis.left) ? 1 : 0);
      const dy = (keyIsDown(context.keys, axis.down) ? 1 : 0) - (keyIsDown(context.keys, axis.up) ? 1 : 0);
      let action = "idle";
      for (const [code, mappedAction] of Object.entries(config.keyBindings ?? {})) {
        if (keyIsDown(context.keys, code)) {
          action = mappedAction;
          break;
        }
      }
      if (pointer?.primaryDown && config.pointerActions?.primary) action = config.pointerActions.primary;
      if (pointer?.secondaryDown && config.pointerActions?.secondary) action = config.pointerActions.secondary;
      const aim = pointer ?? actor;
      const target = pointer ? selectTarget(pointer, context.candidates ?? []) : undefined;
      const mapped: MmoMappedInput = {
        dx,
        dy,
        action,
        targetId: target?.id ?? "",
        aimX: aim.x,
        aimY: aim.y
      };
      return config.makeInput ? config.makeInput(mapped, context) : mapped;
    }
  };
}
