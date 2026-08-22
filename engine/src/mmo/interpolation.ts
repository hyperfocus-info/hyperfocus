import type { MmoEntityData, MmoReplicatedEntity } from "./types.ts";

export type EntityInterpolationMode = "hold" | "interpolate" | "snap";

export type InterpolatedEntity<TPublic extends MmoEntityData = MmoEntityData, TOwner extends MmoEntityData = MmoEntityData> =
  MmoReplicatedEntity<TPublic, TOwner> & {
    interpolationMode: EntityInterpolationMode;
  };

export type EntityInterpolatorConfig = {
  delayMs?: number;
  snapDistance?: number;
  holdMs?: number;
  maxSamples?: number;
};

export type EntityInterpolator<TPublic extends MmoEntityData = MmoEntityData, TOwner extends MmoEntityData = MmoEntityData> = {
  pushSnapshot(snapshot: { entities: Record<string, MmoReplicatedEntity<TPublic, TOwner>> }, receivedAtMs?: number): void;
  sample(nowMs?: number): Record<string, InterpolatedEntity<TPublic, TOwner>>;
  get(id: string, nowMs?: number): InterpolatedEntity<TPublic, TOwner> | undefined;
  clear(): void;
};

type TimedEntity<TPublic extends MmoEntityData, TOwner extends MmoEntityData> = {
  time: number;
  entity: MmoReplicatedEntity<TPublic, TOwner>;
};

function distance(a: MmoReplicatedEntity, b: MmoReplicatedEntity) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function cloneEntity<TPublic extends MmoEntityData, TOwner extends MmoEntityData>(entity: MmoReplicatedEntity<TPublic, TOwner>): MmoReplicatedEntity<TPublic, TOwner> {
  return {
    ...entity,
    tags: entity.tags ? [...entity.tags] : undefined,
    publicData: { ...entity.publicData },
    ownerData: entity.ownerData ? { ...entity.ownerData } : undefined
  };
}

function withMode<TPublic extends MmoEntityData, TOwner extends MmoEntityData>(
  entity: MmoReplicatedEntity<TPublic, TOwner>,
  interpolationMode: EntityInterpolationMode
): InterpolatedEntity<TPublic, TOwner> {
  return { ...cloneEntity(entity), interpolationMode };
}

function interpolateEntity<TPublic extends MmoEntityData, TOwner extends MmoEntityData>(
  from: MmoReplicatedEntity<TPublic, TOwner>,
  to: MmoReplicatedEntity<TPublic, TOwner>,
  alpha: number
): MmoReplicatedEntity<TPublic, TOwner> {
  return {
    ...cloneEntity(to),
    x: from.x + (to.x - from.x) * alpha,
    y: from.y + (to.y - from.y) * alpha
  };
}

function nonNegativeFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a non-negative finite number`);
  return value;
}

function finiteTime(value: number, label: string) {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

export function createEntityInterpolator<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData
>(config: EntityInterpolatorConfig = {}): EntityInterpolator<TPublic, TOwner> {
  const delayMs = nonNegativeFinite(config.delayMs ?? 100, "interpolation delayMs");
  const snapDistance = nonNegativeFinite(config.snapDistance ?? 192, "interpolation snapDistance");
  const holdMs = nonNegativeFinite(config.holdMs ?? 250, "interpolation holdMs");
  const maxSamples = config.maxSamples ?? 4;
  if (!Number.isSafeInteger(maxSamples) || maxSamples < 1) {
    throw new RangeError("interpolation maxSamples must be a positive safe integer");
  }
  const timelines = new Map<string, Array<TimedEntity<TPublic, TOwner>>>();

  function sampleOne(id: string, nowMs: number) {
    finiteTime(nowMs, "interpolation sample time");
    const timeline = timelines.get(id);
    if (!timeline?.length) return undefined;
    const targetTime = nowMs - delayMs;
    if (timeline.length >= 2 && targetTime >= timeline[timeline.length - 1].time) {
      const newest = timeline[timeline.length - 1];
      const previous = timeline[timeline.length - 2];
      return withMode(newest.entity, distance(previous.entity, newest.entity) > snapDistance ? "snap" : "hold");
    }
    let older = timeline[0];
    let newer: TimedEntity<TPublic, TOwner> | undefined;
    for (const sample of timeline) {
      if (sample.time <= targetTime) older = sample;
      if (sample.time >= targetTime) {
        newer = sample;
        break;
      }
    }
    if (!newer || newer === older) {
      const index = timeline.indexOf(older);
      const previous = index > 0 ? timeline[index - 1] : undefined;
      return withMode(older.entity, previous && distance(previous.entity, older.entity) > snapDistance ? "snap" : "hold");
    }
    if (targetTime > older.time + holdMs && newer.time > targetTime) return withMode(older.entity, "hold");
    if (distance(older.entity, newer.entity) > snapDistance) return withMode(newer.entity, "snap");
    const span = Math.max(1, newer.time - older.time);
    return withMode(interpolateEntity(older.entity, newer.entity, (targetTime - older.time) / span), "interpolate");
  }

  return {
    pushSnapshot(snapshot, receivedAtMs = performance.now()) {
      finiteTime(receivedAtMs, "interpolation snapshot time");
      for (const entity of Object.values(snapshot.entities)) {
        const timeline = timelines.get(entity.id) ?? [];
        timeline.push({ time: receivedAtMs, entity: cloneEntity(entity) });
        timeline.sort((a, b) => a.time - b.time);
        while (timeline.length > maxSamples) timeline.shift();
        timelines.set(entity.id, timeline);
      }
      const visible = new Set(Object.keys(snapshot.entities));
      for (const id of timelines.keys()) {
        if (!visible.has(id)) timelines.delete(id);
      }
    },
    sample(nowMs = performance.now()) {
      finiteTime(nowMs, "interpolation sample time");
      const result: Record<string, InterpolatedEntity<TPublic, TOwner>> = {};
      for (const id of timelines.keys()) {
        const entity = sampleOne(id, nowMs);
        if (entity) result[id] = entity;
      }
      return result;
    },
    get(id, nowMs = performance.now()) {
      return sampleOne(id, nowMs);
    },
    clear() {
      timelines.clear();
    }
  };
}
