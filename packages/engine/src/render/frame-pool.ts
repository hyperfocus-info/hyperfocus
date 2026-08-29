import type { PathCommand, Renderable } from "./draw-data.ts";

type PooledRecord = Record<string, unknown>;
export type PooledRenderPoint = { x: number; y: number };
export type PooledRenderRecord = PooledRecord & { kind: string };
export type PooledRenderCommand = PooledRenderRecord;
export type RenderRecordStrategy = "clear" | "fresh" | "overwrite";

export type RenderFramePoolOptions = {
  /**
   * `clear` preserves safe reuse, `fresh` lets the runtime allocate records, and
   * `overwrite` reuses without clearing when callers fully assign every field.
   */
  recordStrategy?: RenderRecordStrategy;
};

function isFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function isObjectValue(value: unknown) {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPointBuffer(value: unknown) {
  return isObjectValue(value) && "length" in value && isFiniteNumber(value.length);
}

function isPathCommand(value: unknown): value is PathCommand {
  if (!isRecordValue(value)) return false;
  switch (value.kind) {
    case "moveTo":
    case "lineTo":
      return isFiniteNumber(value.x) && isFiniteNumber(value.y);
    case "quadraticCurveTo":
      return isFiniteNumber(value.cpx) && isFiniteNumber(value.cpy)
        && isFiniteNumber(value.x) && isFiniteNumber(value.y);
    case "bezierCurveTo":
      return isFiniteNumber(value.cp1x) && isFiniteNumber(value.cp1y)
        && isFiniteNumber(value.cp2x) && isFiniteNumber(value.cp2y)
        && isFiniteNumber(value.x) && isFiniteNumber(value.y);
    case "arc":
      return isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.radius)
        && isFiniteNumber(value.startAngle) && isFiniteNumber(value.endAngle);
    case "ellipse":
      return isFiniteNumber(value.x) && isFiniteNumber(value.y)
        && isFiniteNumber(value.radiusX) && isFiniteNumber(value.radiusY)
        && isFiniteNumber(value.startAngle) && isFiniteNumber(value.endAngle);
    case "closePath":
      return true;
    default:
      return false;
  }
}

export function isRenderableRecord(record: PooledRenderRecord): record is PooledRenderRecord & Renderable {
  switch (record.kind) {
    case "sprite":
      return isObjectValue(record.image);
    case "rect":
    case "outline":
      return isFiniteNumber(record.width) && isFiniteNumber(record.height);
    case "circle":
      return isFiniteNumber(record.radius);
    case "ellipse":
      return isFiniteNumber(record.radiusX) && isFiniteNumber(record.radiusY);
    case "line":
      return isFiniteNumber(record.x1) && isFiniteNumber(record.y1)
        && isFiniteNumber(record.x2) && isFiniteNumber(record.y2);
    case "polyline":
    case "polygon":
      return isPointBuffer(record.points);
    case "path":
      return Array.isArray(record.commands) && record.commands.every(isPathCommand);
    case "text":
    case "label":
      return typeof record.text === "string";
    case "text-block":
      return typeof record.text === "string" && isFiniteNumber(record.maxWidth);
    case "bar":
      return isFiniteNumber(record.width) && isFiniteNumber(record.height) && isFiniteNumber(record.value);
    case "group":
      return Array.isArray(record.calls);
    case "custom":
      return typeof record.draw === "function";
    default:
      return false;
  }
}

export function renderableRecord(record: PooledRenderRecord): PooledRenderRecord & Renderable {
  if (!isRenderableRecord(record)) {
    throw new Error(`Pooled render record "${record.kind}" is incomplete or unsupported.`);
  }
  return record;
}

export function renderablePathCommand(command: PooledRenderCommand): PooledRenderCommand & PathCommand {
  if (!isPathCommand(command)) throw new Error(`Pooled path command "${command.kind}" is incomplete or unsupported.`);
  return command;
}

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
  commands(): PathCommand[];
};

export function createRenderFramePool(options: RenderFramePoolOptions = {}): RenderFramePool {
  const recordStrategy = options.recordStrategy ?? "clear";
  if (recordStrategy !== "clear" && recordStrategy !== "fresh" && recordStrategy !== "overwrite") {
    throw new RangeError(`Unsupported render record strategy "${String(recordStrategy)}".`);
  }
  const arrays: Renderable[][] = [];
  const recordPools: Record<string, PooledRenderRecord[]> = Object.create(null);
  const recordCursors: Record<string, number> = Object.create(null);
  const recordKinds: string[] = [];
  const pointArrays: PooledRenderPoint[][] = [];
  const points: PooledRenderPoint[] = [];
  const commandArrays: PathCommand[][] = [];
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
      if (recordStrategy === "fresh") return { kind };
      let pool = recordPools[kind];
      if (!pool) {
        pool = [];
        recordPools[kind] = pool;
        recordKinds.push(kind);
      }
      const cursor = recordCursors[kind] ?? 0;
      const record: PooledRenderRecord = pool[cursor] ?? { kind };
      pool[cursor] = record;
      recordCursors[kind] = cursor + 1;
      if (recordStrategy === "overwrite") {
        record.kind = kind;
        return record;
      }
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
      const command: PooledRenderCommand = commands[commandCursor] ?? { kind };
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
  return pool ? pool.record(kind) : { kind };
}
