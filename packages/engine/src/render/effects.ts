import {
  drawRenderable,
  type BaseRenderData,
  type Renderable,
  type RenderDrawFunction
} from "./draw-data.ts";
import type { RenderStage } from "./stage.ts";

export type EffectRenderData = BaseRenderData & {
  ttl: number;
  elapsed?: number;
  draw: RenderDrawFunction | Renderable;
  update?: (effect: EffectRenderData, delta: number) => void;
};

export type EffectQueueConfig = {
  maxEffects?: number;
};

type StagePushTarget = Pick<RenderStage, "push"> & Partial<Pick<RenderStage, "pushMany">>;

export type TimedEffectUpdateContext<TEffect> = {
  effect: TEffect;
  delta: number;
  elapsed: number;
  lifetime: number;
  progress: number;
};

export type TimedEffectQueueUpdateOptions<TEffect> = {
  getElapsed?: (effect: TEffect) => number;
  setElapsed?: (effect: TEffect, elapsed: number) => void;
  getLifetime?: (effect: TEffect) => number;
  onUpdate?: (context: TimedEffectUpdateContext<TEffect>) => void;
  onExpire?: (effect: TEffect) => void;
};

export type TimedEffectQueuePruneOptions<TEffect> = {
  getStarted?: (effect: TEffect) => number;
  getLifetime?: (effect: TEffect) => number;
  onUpdate?: (context: TimedEffectUpdateContext<TEffect>) => void;
  onExpire?: (effect: TEffect) => void;
};

export type BoundedEffectPushOptions<TEffect> = {
  maxEffects?: number;
  onDrop?: (effect: TEffect) => void;
};

function nonNegativeFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a non-negative finite number`);
  return value;
}

function normalizeMaxEffects(value: number | undefined) {
  if (value === undefined || value === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(value)) throw new RangeError("maxEffects must be a non-negative finite number or Infinity");
  return Math.max(0, Math.floor(value));
}

function optionalEffectNumber(effect: object, key: string, label: string): number {
  const value = Reflect.get(effect, key);
  if (value === undefined) return 0;
  if (typeof value !== "number") throw new TypeError(`${label} must be a number`);
  return value;
}

function setEffectNumber(effect: object, key: string, value: number): void {
  if (!Reflect.set(effect, key, value)) throw new TypeError(`effect ${key} is not writable`);
}

export function updateTimedEffectQueue<TEffect extends object>(
  effects: TEffect[],
  delta: number,
  options: TimedEffectQueueUpdateOptions<TEffect> = {}
) {
  nonNegativeFinite(delta, "effect delta");
  const getElapsed = options.getElapsed ?? ((effect: TEffect) => optionalEffectNumber(effect, "elapsed", "effect elapsed"));
  const setElapsed = options.setElapsed ?? ((effect: TEffect, elapsed: number) => setEffectNumber(effect, "elapsed", elapsed));
  const getLifetime = options.getLifetime ?? ((effect: TEffect) => optionalEffectNumber(effect, "ttl", "effect ttl"));
  const pending = effects.slice();
  for (let pendingIndex = pending.length - 1; pendingIndex >= 0; pendingIndex -= 1) {
    const effect = pending[pendingIndex];
    if (!effects.includes(effect)) continue;
    const currentElapsed = nonNegativeFinite(getElapsed(effect), "effect elapsed");
    const lifetime = nonNegativeFinite(getLifetime(effect), "effect lifetime");
    const elapsed = currentElapsed + delta;
    if (!Number.isFinite(elapsed)) throw new RangeError("effect elapsed time overflowed");
    setElapsed(effect, elapsed);
    const progress = lifetime <= 0 ? 1 : Math.max(0, Math.min(1, elapsed / lifetime));
    options.onUpdate?.({ effect, delta, elapsed, lifetime, progress });
    if (elapsed >= lifetime) {
      options.onExpire?.(effect);
      const index = effects.indexOf(effect);
      if (index >= 0) effects.splice(index, 1);
    }
  }
  return effects.length;
}

export function pruneExpiredTimedEffectQueue<TEffect extends object>(
  effects: TEffect[],
  time: number,
  options: TimedEffectQueuePruneOptions<TEffect> = {}
) {
  if (!Number.isFinite(time)) throw new RangeError("effect time must be finite");
  const getStarted = options.getStarted ?? ((effect: TEffect) => optionalEffectNumber(effect, "startedMs", "effect start time"));
  const getLifetime = options.getLifetime ?? ((effect: TEffect) => optionalEffectNumber(effect, "lifetimeMs", "effect lifetime"));
  const pending = effects.slice();
  for (const effect of pending) {
    if (!effects.includes(effect)) continue;
    const started = getStarted(effect);
    if (!Number.isFinite(started)) throw new RangeError("effect start time must be finite");
    const elapsed = Math.max(0, time - started);
    const lifetime = nonNegativeFinite(getLifetime(effect), "effect lifetime");
    const progress = lifetime <= 0 ? 1 : Math.max(0, Math.min(1, elapsed / lifetime));
    options.onUpdate?.({ effect, delta: 0, elapsed, lifetime, progress });
    if (elapsed >= lifetime) {
      options.onExpire?.(effect);
      const index = effects.indexOf(effect);
      if (index >= 0) effects.splice(index, 1);
    }
  }
  return effects.length;
}

export function pushBoundedEffect<TEffect>(
  effects: TEffect[],
  effect: TEffect,
  options: BoundedEffectPushOptions<TEffect> = {}
) {
  const maxEffects = normalizeMaxEffects(options.maxEffects);
  if (maxEffects <= 0) {
    options.onDrop?.(effect);
    return effects.length;
  }
  effects.push(effect);
  while (effects.length > maxEffects) {
    const dropped = effects.shift();
    if (dropped !== undefined) options.onDrop?.(dropped);
  }
  return effects.length;
}

export function createEffectQueue(config: EffectQueueConfig = {}) {
  const effects: EffectRenderData[] = [];
  const maxEffects = normalizeMaxEffects(config.maxEffects);

  function push(effect: EffectRenderData) {
    nonNegativeFinite(effect.ttl, "effect ttl");
    nonNegativeFinite(effect.elapsed ?? 0, "effect elapsed");
    pushBoundedEffect(effects, { ...effect, elapsed: effect.elapsed ?? 0 }, { maxEffects });
    return effect;
  }

  function update(delta: number) {
    return updateTimedEffectQueue(effects, delta, {
      getLifetime: (effect) => effect.ttl,
      onUpdate: ({ effect, delta }) => effect.update?.(effect, delta)
    });
  }

  function toDrawCalls(): Renderable[] {
    return effects.map((effect) => ({
      kind: "custom",
      x: effect.x,
      y: effect.y,
      z: effect.z,
      ySort: effect.ySort ?? effect.sortY ?? effect.y,
      alpha: effect.alpha,
      visible: effect.visible,
      draw(ctx, state) {
        const progress = effect.ttl <= 0 ? 1 : Math.max(0, Math.min(1, (effect.elapsed ?? 0) / effect.ttl));
        const nextState = { ...state, progress };
        if (typeof effect.draw === "function") {
          effect.draw(ctx, nextState);
        } else {
          drawRenderable(ctx, effect.draw, nextState);
        }
      }
    }));
  }

  return {
    push,
    update,
    toDrawCalls,
    pushToStage(stage: StagePushTarget, layer: string) {
      const calls = toDrawCalls();
      if (stage.pushMany) return stage.pushMany(layer, calls);
      for (const call of calls) stage.push(layer, call);
      return calls.length;
    },
    clear() {
      effects.length = 0;
    },
    active() {
      return effects.slice();
    },
    size() {
      return effects.length;
    }
  };
}
