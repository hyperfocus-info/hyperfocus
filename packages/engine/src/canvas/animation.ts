import { type AtlasFrame, type TextureAtlas } from "../atlas.ts";

export type AtlasAnimationFrameRef = string | { name: string; duration?: number };

export type AtlasAnimationOptions = {
  loop?: boolean;
  frameDuration?: number;
};

export type AtlasAnimationFrame = {
  name: string;
  duration: number;
  frame: AtlasFrame;
};

export type AtlasAnimation = {
  readonly atlas: TextureAtlas;
  readonly loop: boolean;
  readonly frameCount: number;
  readonly frameNames: () => string[];
  readonly frameAt: (index: number) => AtlasFrame;
  readonly currentFrame: () => AtlasFrame;
  readonly currentFrameName: () => string;
  readonly reset: () => AtlasFrame;
  readonly advance: (deltaMs: number) => AtlasFrame;
  readonly setTime: (timeMs: number) => AtlasFrame;
  readonly getFrame: (name: string) => AtlasFrame | undefined;
  readonly requireFrame: (name: string) => AtlasFrame;
};

function resolveFrames(atlas: TextureAtlas, frames: readonly AtlasAnimationFrameRef[], defaultDuration: number) {
  return frames.map<AtlasAnimationFrame>((frame, index) => {
    const name = typeof frame === "string" ? frame : frame.name;
    const duration = typeof frame === "string" ? defaultDuration : frame.duration ?? defaultDuration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new RangeError(`frames[${index}].duration must be a positive finite number`);
    }
    return {
      name,
      duration,
      frame: atlas.requireFrame(name)
    };
  });
}

export function createAtlasAnimation(
  atlas: TextureAtlas,
  frames: readonly AtlasAnimationFrameRef[],
  options: AtlasAnimationOptions = {}
): AtlasAnimation {
  const defaultDuration = options.frameDuration ?? 100;
  if (!Number.isFinite(defaultDuration) || defaultDuration <= 0) {
    throw new RangeError("frameDuration must be a positive finite number");
  }
  const resolved = resolveFrames(atlas, frames, defaultDuration);
  if (!resolved.length) {
    throw new Error("Atlas animation needs at least one frame.");
  }
  const totalDuration = resolved.reduce((sum, item) => sum + item.duration, 0);
  if (!Number.isFinite(totalDuration)) throw new RangeError("animation total duration must be finite");

  const loop = options.loop ?? true;
  let timeMs = 0;

  function frameIndexAt(time: number) {
    const normalized = loop ? ((time % totalDuration) + totalDuration) % totalDuration : Math.min(Math.max(time, 0), totalDuration);
    let elapsed = 0;
    for (let index = 0; index < resolved.length; index += 1) {
      elapsed += resolved[index].duration;
      if (normalized < elapsed) return index;
    }
    return resolved.length - 1;
  }

  function current() {
    return resolved[frameIndexAt(timeMs)].frame;
  }

  return {
    atlas,
    loop,
    get frameCount() {
      return resolved.length;
    },
    frameNames() {
      return resolved.map((frame) => frame.name);
    },
    frameAt(index: number) {
      if (!Number.isSafeInteger(index)) throw new RangeError("frame index must be a safe integer");
      const normalized = ((index % resolved.length) + resolved.length) % resolved.length;
      return resolved[normalized].frame;
    },
    currentFrame() {
      return current();
    },
    currentFrameName() {
      return resolved[frameIndexAt(timeMs)].name;
    },
    reset() {
      timeMs = 0;
      return current();
    },
    advance(deltaMs: number) {
      if (!Number.isFinite(deltaMs) || deltaMs < 0) {
        throw new RangeError("deltaMs must be a non-negative finite number");
      }
      const nextTime = timeMs + deltaMs;
      if (!Number.isFinite(nextTime)) throw new RangeError("animation time is too large");
      timeMs = loop ? nextTime % totalDuration : Math.min(nextTime, totalDuration);
      return current();
    },
    setTime(time: number) {
      if (!Number.isFinite(time)) throw new RangeError("time must be finite");
      timeMs = loop ? time % totalDuration : Math.min(Math.max(time, 0), totalDuration);
      return current();
    },
    getFrame(name: string) {
      return atlas.getFrame(name);
    },
    requireFrame(name: string) {
      return atlas.requireFrame(name);
    }
  };
}
