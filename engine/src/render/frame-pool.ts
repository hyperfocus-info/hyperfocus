import type { Renderable } from "./draw-data.ts";

type PooledRecord = Record<string, unknown>;
export type PooledRenderPoint = { x: number; y: number };
export type PooledRenderRecord = PooledRecord & { kind: string };
export type PooledRenderCommand = PooledRenderRecord;

const COMMAND_RESET_KEYS = [
  "x",
  "y",
  "cpx",
  "cpy",
  "cp1x",
  "cp1y",
  "cp2x",
  "cp2y",
  "radius",
  "radiusX",
  "radiusY",
  "rotation",
  "startAngle",
  "endAngle",
  "counterclockwise"
] as const;

const COMMON_RECORD_RESET_KEYS = [
  "id",
  "visible",
  "alpha",
  "composite",
  "blendMode",
  "shadowColor",
  "shadowBlur",
  "shadowOffsetX",
  "shadowOffsetY",
  "x",
  "y",
  "z",
  "ySort",
  "sortY",
  "order",
  "fill",
  "stroke",
  "lineWidth",
  "cap",
  "join"
] as const;

const RECORD_RESET_KEYS_BY_KIND: Record<string, readonly string[]> = {
  sprite: [
    "image",
    "width",
    "height",
    "sourceX",
    "sourceY",
    "sourceWidth",
    "sourceHeight",
    "rotation",
    "scale",
    "anchor",
    "flipX",
    "flipY"
  ],
  rect: ["width", "height"],
  circle: ["radius"],
  ellipse: ["radiusX", "radiusY", "rotation", "startAngle", "endAngle", "counterclockwise"],
  line: ["x1", "y1", "x2", "y2", "lineDash", "dash", "lineDashOffset", "dashOffset"],
  polyline: ["points", "lineDash", "dash", "lineDashOffset", "dashOffset"],
  polygon: ["points"],
  path: ["commands", "lineDash", "dash", "lineDashOffset", "dashOffset"],
  text: ["text", "font", "size", "family", "weight", "align", "baseline", "maxWidth"],
  "text-block": ["text", "font", "size", "family", "weight", "align", "baseline", "maxWidth", "lineHeight", "maxLines", "ellipsis"],
  label: ["text", "font", "size", "family", "weight", "background", "padding", "maxWidth"],
  bar: ["width", "height", "value", "max", "vertical", "background"],
  outline: ["width", "height", "inset", "shape"],
  group: ["calls"],
  custom: ["draw"],
  "linear-gradient": ["x0", "y0", "x1", "y1", "stops"],
  "radial-gradient": ["x0", "y0", "r0", "x1", "y1", "r1", "stops"]
};

export type RenderFramePool = {
  beginFrame(): void;
  array(): Renderable[];
  record(kind: string): PooledRenderRecord;
  point(x: number, y: number): PooledRenderPoint;
  points(count: number): PooledRenderPoint[];
  command(kind: string): PooledRenderCommand;
  commands(): PooledRenderCommand[];
};

export function createRenderFramePool(): RenderFramePool {
  const arrays: Renderable[][] = [];
  const recordPools: Record<string, PooledRenderRecord[]> = Object.create(null);
  const recordCursors: Record<string, number> = Object.create(null);
  const recordKinds: string[] = [];
  const pointArrays: PooledRenderPoint[][] = [];
  const points: PooledRenderPoint[] = [];
  const commandArrays: PooledRenderCommand[][] = [];
  const commands: PooledRenderCommand[] = [];
  let arrayCursor = 0;
  let pointArrayCursor = 0;
  let pointCursor = 0;
  let commandArrayCursor = 0;
  let commandCursor = 0;

  function resetRecord(record: PooledRenderRecord, kind: string) {
    for (const key of COMMON_RECORD_RESET_KEYS) record[key] = undefined;
    for (const key of RECORD_RESET_KEYS_BY_KIND[kind] ?? []) record[key] = undefined;
    record.kind = kind;
    return record;
  }

  function resetCommand(command: PooledRenderCommand, kind: string) {
    for (const key of COMMAND_RESET_KEYS) {
      if (key in command) command[key] = undefined;
    }
    command.kind = kind;
    return command;
  }

  return {
    beginFrame() {
      arrayCursor = 0;
      for (const kind of recordKinds) recordCursors[kind] = 0;
      pointArrayCursor = 0;
      pointCursor = 0;
      commandArrayCursor = 0;
      commandCursor = 0;
    },
    array() {
      const array = arrays[arrayCursor] ?? [];
      arrays[arrayCursor] = array;
      arrayCursor += 1;
      array.length = 0;
      return array;
    },
    record(kind) {
      let pool = recordPools[kind];
      if (!pool) {
        pool = [];
        recordPools[kind] = pool;
        recordKinds.push(kind);
      }
      const cursor = recordCursors[kind] ?? 0;
      const record = pool[cursor] ?? ({ kind } as PooledRenderRecord);
      pool[cursor] = record;
      recordCursors[kind] = cursor + 1;
      return resetRecord(record, kind);
    },
    point(x, y) {
      const point = points[pointCursor] ?? { x: 0, y: 0 };
      points[pointCursor] = point;
      pointCursor += 1;
      point.x = x;
      point.y = y;
      return point;
    },
    points(count) {
      const array = pointArrays[pointArrayCursor] ?? [];
      pointArrays[pointArrayCursor] = array;
      pointArrayCursor += 1;
      array.length = count;
      return array;
    },
    command(kind) {
      const command = commands[commandCursor] ?? ({ kind } as PooledRenderCommand);
      commands[commandCursor] = command;
      commandCursor += 1;
      return resetCommand(command, kind);
    },
    commands() {
      const array = commandArrays[commandArrayCursor] ?? [];
      commandArrays[commandArrayCursor] = array;
      commandArrayCursor += 1;
      array.length = 0;
      return array;
    }
  };
}

export function renderArray(pool: RenderFramePool | undefined): Renderable[] {
  return pool ? pool.array() : [];
}

export function renderRecord(pool: RenderFramePool | undefined, kind: string): PooledRenderRecord {
  return pool ? pool.record(kind) : ({ kind } as PooledRenderRecord);
}
