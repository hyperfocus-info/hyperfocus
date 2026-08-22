import { MAP_HEIGHT, MAP_WIDTH, TILE } from "../world.ts";
import type { Camera, ImpactActorVisual, ImpactSignal, ImpactSignalSink, ImpactWeight } from "./types.ts";

type ActorHold = {
  id: string;
  x: number;
  y: number;
  directionX: number;
  directionY: number;
  startedMs: number;
  untilMs: number;
  amplitude: number;
  weight: ImpactWeight;
};

type CameraImpulse = {
  x: number;
  y: number;
  directionX: number;
  directionY: number;
  startedMs: number;
  untilMs: number;
  amplitude: number;
};

export type ImpactFeedbackController = ImpactSignalSink & {
  actorVisual(id: string, timeMs: number): ImpactActorVisual | undefined;
  camera(base: Camera, timeMs: number, width: number, height: number): Camera;
  activeCount(timeMs: number): number;
};

const MAX_SHAKE_PX = 4;
const MAX_HOLD_AMPLITUDE = 3.2;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function normalize(dx: number, dy: number) {
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

function cleanExpiredMap<T extends { untilMs: number }>(map: Map<string, T>, timeMs: number) {
  for (const [id, value] of map) if (timeMs >= value.untilMs) map.delete(id);
}

function cleanExpiredList<T extends { untilMs: number }>(list: T[], timeMs: number) {
  let write = 0;
  for (let read = 0; read < list.length; read += 1) {
    if (timeMs >= list[read]!.untilMs) continue;
    list[write] = list[read]!;
    write += 1;
  }
  list.length = write;
}

function holdAmplitude(weight: ImpactWeight, shakePx: number) {
  const bonus = weight === "ultimate" ? 1.1 : weight === "heavy" ? 0.75 : weight === "medium" ? 0.35 : 0.1;
  return clamp(shakePx + bonus, 0.4, MAX_HOLD_AMPLITUDE);
}

function makeHold(id: string, x: number, y: number, signal: ImpactSignal, holdMs: number, sourceScale = 1): ActorHold {
  const fromSource = normalize(x - (signal.sourceX ?? signal.x), y - (signal.sourceY ?? signal.y));
  const directed = signal.directionX !== undefined || signal.directionY !== undefined
    ? normalize(signal.directionX ?? fromSource.x, signal.directionY ?? fromSource.y)
    : fromSource;
  return {
    id,
    x,
    y,
    directionX: directed.x,
    directionY: directed.y,
    startedMs: signal.startedMs,
    untilMs: signal.startedMs + Math.max(0, holdMs),
    amplitude: holdAmplitude(signal.weight, signal.shakePx) * sourceScale,
    weight: signal.weight
  };
}

export function createImpactFeedbackController(): ImpactFeedbackController {
  const holds = new Map<string, ActorHold>();
  const cameraImpulses: CameraImpulse[] = [];

  function push(signal: ImpactSignal) {
    cleanExpiredMap(holds, signal.startedMs);
    cleanExpiredList(cameraImpulses, signal.startedMs);
    if (signal.targetHoldMs > 0) {
      holds.set(signal.actorId, makeHold(signal.actorId, signal.x, signal.y, signal, signal.targetHoldMs));
    }
    if (signal.sourceId && signal.attackerHoldMs > 0) {
      holds.set(signal.sourceId, makeHold(signal.sourceId, signal.sourceX ?? signal.x, signal.sourceY ?? signal.y, signal, signal.attackerHoldMs, 0.55));
    }
    if (signal.shakeMs > 0 && signal.shakePx > 0) {
      const direction = normalize(signal.directionX ?? 1, signal.directionY ?? 0);
      cameraImpulses.push({
        x: signal.x,
        y: signal.y,
        directionX: direction.x,
        directionY: direction.y,
        startedMs: signal.startedMs,
        untilMs: signal.startedMs + signal.shakeMs,
        amplitude: clamp(signal.shakePx, 0, MAX_SHAKE_PX)
      });
      while (cameraImpulses.length > 8) cameraImpulses.shift();
    }
  }

  function actorVisual(id: string, timeMs: number): ImpactActorVisual | undefined {
    cleanExpiredMap(holds, timeMs);
    const hold = holds.get(id);
    if (!hold) return undefined;
    const duration = Math.max(1, hold.untilMs - hold.startedMs);
    const progress = clamp01((timeMs - hold.startedMs) / duration);
    const envelope = 1 - progress;
    const sideX = -hold.directionY;
    const sideY = hold.directionX;
    const wave = Math.sin(timeMs * 0.33 + hold.x * 0.07 + hold.y * 0.03);
    return {
      x: hold.x,
      y: hold.y,
      offsetX: sideX * wave * hold.amplitude * envelope,
      offsetY: sideY * wave * hold.amplitude * envelope,
      weight: hold.weight,
      progress
    };
  }

  function camera(base: Camera, timeMs: number, width: number, height: number): Camera {
    cleanExpiredList(cameraImpulses, timeMs);
    if (cameraImpulses.length === 0) return base;
    let x = 0;
    let y = 0;
    for (const impulse of cameraImpulses) {
      if (impulse.x < base.x - 96 || impulse.x > base.x + width + 96 || impulse.y < base.y - 96 || impulse.y > base.y + height + 96) continue;
      const duration = Math.max(1, impulse.untilMs - impulse.startedMs);
      const progress = clamp01((timeMs - impulse.startedMs) / duration);
      const envelope = (1 - progress) ** 1.6;
      const cross = Math.sin(timeMs * 0.17 + impulse.x * 0.01);
      x += (impulse.directionX * 0.55 + -impulse.directionY * cross) * impulse.amplitude * envelope;
      y += (impulse.directionY * 0.55 + impulse.directionX * cross) * impulse.amplitude * envelope;
    }
    const maxX = Math.max(0, MAP_WIDTH * TILE - width);
    const maxY = Math.max(0, MAP_HEIGHT * TILE - height);
    return {
      x: clamp(base.x + x, 0, maxX),
      y: clamp(base.y + y, 0, maxY)
    };
  }

  function activeCount(timeMs: number) {
    cleanExpiredMap(holds, timeMs);
    cleanExpiredList(cameraImpulses, timeMs);
    return holds.size + cameraImpulses.length;
  }

  return { push, actorVisual, camera, activeCount };
}
