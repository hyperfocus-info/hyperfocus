import { isPlainRecord as isRecord } from "@hyperfocus/utilities/records";
export type TextureAtlasRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type AtlasApiStatus = "stable" | "candidate";
export type AtlasApiProof = "engine-contract" | "candidate";
export type AtlasApiExposure = "root";

export type AtlasApiProfile = {
  status: AtlasApiStatus;
  proof: AtlasApiProof;
  exposure: AtlasApiExposure;
};

export const atlasApiProfileNames = [
  "createTextureAtlas",
  "createTexturePackerAtlas",
  "parseTexturePackerAtlas"
] as const;

export type AtlasApiProfileName = (typeof atlasApiProfileNames)[number];

const stableProfile = (proof: AtlasApiProof = "engine-contract"): AtlasApiProfile => ({
  status: "stable",
  proof,
  exposure: "root"
});

export const atlasApiProfiles = {
  createTextureAtlas: stableProfile(),
  createTexturePackerAtlas: stableProfile(),
  parseTexturePackerAtlas: stableProfile()
} as const;

export type TexturePackerRect = TextureAtlasRect;

export type TextureAtlasFrameData = {
  frame: TextureAtlasRect;
  rotated?: boolean;
  trimmed?: boolean;
  spriteSourceSize?: TextureAtlasRect;
  sourceSize?: { w: number; h: number };
  pivot?: { x: number; y: number };
};

export type TexturePackerSize = { w: number; h: number };
export type TexturePackerPivot = { x: number; y: number };
export type TexturePackerFrameData = TextureAtlasFrameData;
export type TexturePackerFrameRecord = Record<string, TextureAtlasFrameData>;
export type TexturePackerMeta = {
  image?: string;
  size?: TexturePackerSize;
  scale?: string | number;
  app?: string;
  version?: string;
};

export type TextureAtlasFrameInput = TextureAtlasFrameData & {
  filename?: string;
  name?: string;
};

export type TextureAtlasJson = {
  frames: TexturePackerFrameRecord | TextureAtlasFrameInput[];
  meta?: TexturePackerMeta;
};

export type TexturePackerAtlasJson = TextureAtlasJson;
export type TextureAtlasMetadata = TexturePackerMeta;
export type TextureAtlasOptions = {
  image?: CanvasImageSource;
};

export type AtlasFrame = TextureAtlasFrame;

export type TextureAtlasFrame = {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  frame: TextureAtlasRect;
  rotated: boolean;
  trimmed: boolean;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  pivotX: number;
  pivotY: number;
};

export type TextureAtlas = {
  image?: CanvasImageSource;
  meta?: TextureAtlasJson["meta"];
  getFrame(name: string): TextureAtlasFrame | undefined;
  requireFrame(name: string): TextureAtlasFrame;
  hasFrame(name: string): boolean;
  frameNames(): string[];
  frames(): TextureAtlasFrame[];
};

function normalizeFrame(
  name: string,
  data: unknown,
): TextureAtlasFrame {
  assertNonEmptyString(name, "texture atlas frame name");
  const raw = requireRecord(data, `texture atlas frame ${name}`);
  const frame = normalizeRect(raw.frame, `texture atlas frame ${name}.frame`);
  const sourceSize = raw.sourceSize === undefined
    ? { w: frame.w, h: frame.h }
    : normalizeSize(raw.sourceSize, `texture atlas frame ${name}.sourceSize`);
  const sourceRect = raw.spriteSourceSize === undefined
    ? { x: 0, y: 0, w: sourceSize.w, h: sourceSize.h }
    : normalizeRect(raw.spriteSourceSize, `texture atlas frame ${name}.spriteSourceSize`);
  if (sourceRect.x + sourceRect.w > sourceSize.w || sourceRect.y + sourceRect.h > sourceSize.h) {
    throw new RangeError(`texture atlas frame ${name}.spriteSourceSize must fit inside sourceSize`);
  }
  const pivot = raw.pivot === undefined
    ? undefined
    : normalizePivot(raw.pivot, `texture atlas frame ${name}.pivot`);
  const rotated = optionalBoolean(raw.rotated, `texture atlas frame ${name}.rotated`) ?? false;
  const trimmed = optionalBoolean(raw.trimmed, `texture atlas frame ${name}.trimmed`) ?? false;

  const normalized = {
    name,
    x: frame.x,
    y: frame.y,
    w: frame.w,
    h: frame.h,
    frame,
    rotated,
    trimmed,
    sourceX: sourceRect.x,
    sourceY: sourceRect.y,
    sourceWidth: sourceSize.w,
    sourceHeight: sourceSize.h,
    pivotX: pivot?.x ?? 0.5,
    pivotY: pivot?.y ?? 0.5
  };

  Object.defineProperty(normalized, "frame", {
    value: frame,
    enumerable: false,
    configurable: false,
    writable: false
  });

  return normalized;
}

export function createTextureAtlas(json: unknown, image?: CanvasImageSource): TextureAtlas {
  const input = requireRecord(json, "texture atlas");
  const frameInput = input.frames;
  if (!Array.isArray(frameInput) && !isRecord(frameInput)) {
    throw new TypeError("texture atlas frames must be an array or plain object");
  }
  const frames = new Map<string, TextureAtlasFrame>();

  if (Array.isArray(frameInput)) {
    for (let index = 0; index < frameInput.length; index += 1) {
      const entry = requireRecord(frameInput[index], `texture atlas frames[${index}]`);
      const rawName = entry.filename ?? entry.name;
      const name = assertNonEmptyString(rawName, `texture atlas frames[${index}] name`);
      if (frames.has(name)) throw new Error(`Duplicate texture atlas frame: ${name}`);
      frames.set(name, normalizeFrame(name, entry));
    }
  } else {
    for (const [rawName, entry] of Object.entries(frameInput)) {
      const name = assertNonEmptyString(rawName, "texture atlas frame name");
      frames.set(name, normalizeFrame(name, entry));
    }
  }

  const meta = input.meta === undefined ? undefined : normalizeMeta(input.meta);

  return {
    image,
    meta,
    getFrame(name: string) {
      return frames.get(name);
    },
    requireFrame(name: string) {
      const frame = frames.get(name);
      if (!frame) throw new Error(`Texture atlas frame not found: ${name}`);
      return frame;
    },
    hasFrame(name: string) {
      return frames.has(name);
    },
    frameNames() {
      return [...frames.keys()];
    },
    frames() {
      return [...frames.values()];
    }
  };
}



function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${label} must be a plain object`);
  return value;
}

function assertNonEmptyString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function nonNegativeSafeInteger(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function positiveSafeInteger(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

function normalizeRect(value: unknown, label: string): TextureAtlasRect {
  const rect = requireRecord(value, label);
  const x = nonNegativeSafeInteger(rect.x, `${label}.x`);
  const y = nonNegativeSafeInteger(rect.y, `${label}.y`);
  const w = positiveSafeInteger(rect.w, `${label}.w`);
  const h = positiveSafeInteger(rect.h, `${label}.h`);
  if (!Number.isSafeInteger(x + w) || !Number.isSafeInteger(y + h)) {
    throw new RangeError(`${label} extent must be a safe integer`);
  }
  return { x, y, w, h };
}

function normalizeSize(value: unknown, label: string): TexturePackerSize {
  const size = requireRecord(value, label);
  return {
    w: positiveSafeInteger(size.w, `${label}.w`),
    h: positiveSafeInteger(size.h, `${label}.h`)
  };
}

function normalizePivot(value: unknown, label: string): TexturePackerPivot {
  const pivot = requireRecord(value, label);
  return {
    x: finiteNumber(pivot.x, `${label}.x`),
    y: finiteNumber(pivot.y, `${label}.y`)
  };
}

function optionalBoolean(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`);
  return value;
}

function normalizeMeta(value: unknown): TexturePackerMeta {
  const raw = requireRecord(value, "texture atlas meta");
  for (const key of ["image", "app", "version"] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== "string") {
      throw new TypeError(`texture atlas meta.${key} must be a string`);
    }
  }
  if (raw.scale !== undefined) {
    const numericScale = typeof raw.scale === "number"
      ? raw.scale
      : typeof raw.scale === "string" && raw.scale.trim() ? Number(raw.scale) : Number.NaN;
    if (!Number.isFinite(numericScale) || numericScale <= 0) {
      throw new RangeError("texture atlas meta.scale must be a positive number or numeric string");
    }
  }
  const meta: TexturePackerMeta = {};
  if (typeof raw.image === "string") meta.image = raw.image;
  if (raw.size !== undefined) meta.size = normalizeSize(raw.size, "texture atlas meta.size");
  if (typeof raw.scale === "string" || typeof raw.scale === "number") meta.scale = raw.scale;
  if (typeof raw.app === "string") meta.app = raw.app;
  if (typeof raw.version === "string") meta.version = raw.version;
  return meta;
}

export function parseTexturePackerAtlas(json: unknown, image?: CanvasImageSource) {
  return createTextureAtlas(json, image);
}

export type TexturePackerAtlas = TextureAtlas;
export type TexturePackerAtlasFrame = TextureAtlasFrame;
export type TexturePackerAtlasMetadata = TextureAtlasMetadata;
export type TexturePackerAtlasOptions = TextureAtlasOptions;

export function createTexturePackerAtlas(json: unknown, image?: CanvasImageSource) {
  return createTextureAtlas(json, image);
}
