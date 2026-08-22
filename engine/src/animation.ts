import type { TextureAtlas, TextureAtlasFrame } from "./atlas.ts";

export type AnimationApiStatus = "stable" | "candidate";
export type AnimationApiProof = "engine-contract" | "candidate";
export type AnimationApiExposure = "root";

export type AnimationApiProfile = {
  status: AnimationApiStatus;
  proof: AnimationApiProof;
  exposure: AnimationApiExposure;
};

export const animationApiProfileNames = [
  "createAnimationClip",
  "createAnimationPlayer",
  "createAtlasClip"
] as const;

export type AnimationApiProfileName = (typeof animationApiProfileNames)[number];

const stableProfile = (proof: AnimationApiProof = "engine-contract"): AnimationApiProfile => ({
  status: "stable",
  proof,
  exposure: "root"
});

export const animationApiProfiles = {
  createAnimationClip: stableProfile(),
  createAnimationPlayer: stableProfile(),
  createAtlasClip: stableProfile()
} as const satisfies Record<AnimationApiProfileName, AnimationApiProfile>;

export type AnimationFrameRef = {
  frame: string;
  durationMs?: number;
};

export type AnimationPlaybackOptions = {
  id: string;
  frames: Array<string | AnimationFrameRef>;
  fps?: number;
  frameDurationMs?: number;
  loop?: "once" | "loop";
  pingPong?: boolean;
};

export type AnimationClip = {
  id: string;
  frames: AnimationFrameRef[];
  playbackFrames: AnimationPlaybackFrame[];
  fps: number;
  frameDurationMs: number;
  loop: "once" | "loop";
  pingPong: boolean;
  totalDurationMs: number;
};

export type AnimationState = {
  clipId: string;
  frameIndex: number;
  frameName?: string;
  elapsedMs: number;
  speed: number;
  playing: boolean;
  finished: boolean;
  loopCount: number;
};

export type AnimationPlayer = {
  play(): AnimationPlayer;
  pause(): AnimationPlayer;
  stop(): AnimationPlayer;
  reset(): AnimationPlayer;
  setClip(clip: AnimationClip): AnimationPlayer;
  setSpeed(speed: number): AnimationPlayer;
  update(deltaMs: number): AnimationPlayer;
  getCurrentFrame(): AnimationFrameRef | undefined;
  getCurrentAtlasFrame(atlas?: TextureAtlas): TextureAtlasFrame | undefined;
  isFinished(): boolean;
  state(): AnimationState;
};

type PlaybackFrame = AnimationFrameRef & {
  durationMs: number;
};

export type AnimationPlaybackFrame = PlaybackFrame;

const DEFAULT_FRAME_DURATION_MS = 100;

function requirePositiveFinite(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive finite number`);
  return value;
}

function requireNonNegativeFinite(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a non-negative finite number`);
  return value;
}

function normalizeFrameRef(frame: string | AnimationFrameRef): AnimationFrameRef {
  return typeof frame === "string" ? { frame } : { frame: frame.frame, durationMs: frame.durationMs };
}

function resolveFrameDurationMs(options: AnimationPlaybackOptions) {
  if (options.frameDurationMs !== undefined) requirePositiveFinite(options.frameDurationMs, "frameDurationMs");
  if (options.fps !== undefined) requirePositiveFinite(options.fps, "fps");
  if (options.frameDurationMs !== undefined) return options.frameDurationMs;
  if (options.fps !== undefined) return requirePositiveFinite(1000 / options.fps, "resolved frame duration");
  return DEFAULT_FRAME_DURATION_MS;
}

function buildPlaybackFrames(frames: AnimationFrameRef[], pingPong: boolean, defaultDurationMs: number): PlaybackFrame[] {
  const forward = frames.map((frame, index) => ({
    frame: frame.frame,
    durationMs: requirePositiveFinite(frame.durationMs ?? defaultDurationMs, `frames[${index}].durationMs`)
  }));

  if (!pingPong || forward.length < 2) return forward;

  const reverse = forward.slice().reverse().slice(1).map((frame) => ({
    frame: frame.frame,
    durationMs: frame.durationMs
  }));

  return [...forward, ...reverse];
}

function sumDurations(frames: PlaybackFrame[]) {
  return frames.reduce((total, frame) => total + frame.durationMs, 0);
}

function resolveFrameIndex(frames: AnimationPlaybackFrame[], elapsedMs: number) {
  if (frames.length === 0) return -1;
  const totalDurationMs = sumDurations(frames);
  if (totalDurationMs <= 0) return 0;
  if (elapsedMs >= totalDurationMs) return frames.length - 1;

  let remaining = elapsedMs;
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    if (remaining < frame.durationMs) return index;
    remaining -= frame.durationMs;
  }

  return frames.length - 1;
}

export function createAnimationClip(options: AnimationPlaybackOptions): AnimationClip {
  if (!Array.isArray(options.frames) || options.frames.length === 0) throw new Error("Animation clip needs at least one frame");
  if (options.loop !== undefined && options.loop !== "once" && options.loop !== "loop") throw new Error("animation loop mode must be once or loop");
  const frames = options.frames.map(normalizeFrameRef);
  const frameDurationMs = resolveFrameDurationMs(options);
  const playbackFrames = buildPlaybackFrames(frames, options.pingPong ?? false, frameDurationMs);
  const totalDurationMs = sumDurations(playbackFrames);
  if (!Number.isFinite(totalDurationMs)) throw new RangeError("animation total duration must be finite");

  return {
    id: options.id,
    frames,
    playbackFrames,
    fps: options.fps && options.fps > 0 ? options.fps : requirePositiveFinite(1000 / frameDurationMs, "resolved fps"),
    frameDurationMs,
    loop: options.loop ?? "loop",
    pingPong: options.pingPong ?? false,
    totalDurationMs
  };
}

export function createAnimationPlayer(clip: AnimationClip, atlas?: TextureAtlas): AnimationPlayer {
  let currentClip = clip;
  let defaultAtlas = atlas;
  let speed = 1;
  let playing = false;
  let finished = false;
  let elapsedMs = 0;
  let frameIndex = currentClip.playbackFrames.length > 0 ? 0 : -1;
  let loopCount = 0;

  function rewind() {
    elapsedMs = 0;
    frameIndex = currentClip.playbackFrames.length > 0 ? 0 : -1;
    loopCount = 0;
    finished = false;
  }

  function currentFrame() {
    if (frameIndex < 0) return undefined;
    return currentClip.playbackFrames[frameIndex];
  }

  function syncFrame() {
    frameIndex = resolveFrameIndex(currentClip.playbackFrames, elapsedMs);
  }

  function update(deltaMs: number) {
    requireNonNegativeFinite(deltaMs, "deltaMs");
    if (!playing || finished || deltaMs === 0 || speed === 0) return player;
    if (currentClip.playbackFrames.length === 0) return player;

    const advanceMs = deltaMs * speed;
    if (!Number.isFinite(advanceMs) || !Number.isFinite(elapsedMs + advanceMs)) {
      throw new RangeError("animation playback advance is too large");
    }
    if (currentClip.totalDurationMs <= 0) {
      if (currentClip.loop === "once") {
        finished = true;
        playing = false;
      }
      return player;
    }

    const nextElapsed = elapsedMs + advanceMs;

    if (currentClip.loop === "loop") {
      const completedLoops = Math.floor(nextElapsed / currentClip.totalDurationMs);
      const remainder = nextElapsed % currentClip.totalDurationMs;
      if (!Number.isSafeInteger(completedLoops) || completedLoops > Number.MAX_SAFE_INTEGER - loopCount || !Number.isFinite(remainder)) {
        throw new RangeError("animation playback loop count exceeds the safe integer range");
      }
      loopCount += completedLoops;
      elapsedMs = remainder;
    } else if (nextElapsed >= currentClip.totalDurationMs) {
      elapsedMs = currentClip.totalDurationMs;
      finished = true;
      playing = false;
      loopCount = Math.max(loopCount, 1);
    } else {
      elapsedMs = nextElapsed;
    }

    syncFrame();
    return player;
  }

  const player: AnimationPlayer = {
    play() {
      playing = true;
      return player;
    },
    pause() {
      playing = false;
      return player;
    },
    stop() {
      playing = false;
      rewind();
      return player;
    },
    reset() {
      rewind();
      return player;
    },
    setClip(nextClip: AnimationClip) {
      const wasPlaying = playing;
      currentClip = nextClip;
      rewind();
      playing = wasPlaying;
      return player;
    },
    setSpeed(nextSpeed: number) {
      speed = requireNonNegativeFinite(nextSpeed, "speed");
      return player;
    },
    update,
    getCurrentFrame() {
      return currentFrame();
    },
    getCurrentAtlasFrame(nextAtlas?: TextureAtlas) {
      const activeAtlas = nextAtlas ?? defaultAtlas;
      const frame = currentFrame();
      return frame ? activeAtlas?.getFrame(frame.frame) : undefined;
    },
    isFinished() {
      return finished;
    },
    state() {
      const frame = currentFrame();
      return {
        clipId: currentClip.id,
        frameIndex,
        frameName: frame?.frame,
        elapsedMs,
        speed,
        playing,
        finished,
        loopCount
      };
    }
  };

  syncFrame();
  return player;
}

export type AtlasClipOptions = {
  loop?: boolean;
  framesPerSecond?: number;
  speed?: number;
  startFrame?: number | string;
};

export type AtlasClip = {
  atlas: TextureAtlas;
  frames: readonly TextureAtlasFrame[];
  frameNames: readonly string[];
  loop: boolean;
  framesPerSecond: number;
  speed: number;
  index: number;
  elapsed: number;
  done: boolean;
  update(deltaSeconds: number): TextureAtlasFrame;
  reset(frame?: number | string): TextureAtlasFrame;
  currentFrame(): TextureAtlasFrame;
  currentFrameName(): string;
  setSpeed(speed: number): AtlasClip;
};

function resolveClipIndex(frameNames: readonly string[], frame: number | string | undefined) {
  if (frame === undefined) return 0;
  if (typeof frame === "number") {
    if (!Number.isInteger(frame)) throw new RangeError("Frame index must be an integer");
    if (frame < 0 || frame >= frameNames.length) {
      throw new RangeError(`Frame index ${frame} is outside the clip range`);
    }
    return frame;
  }
  const index = frameNames.indexOf(frame);
  if (index < 0) throw new Error(`TexturePacker frame not found in clip: ${frame}`);
  return index;
}

export function createAtlasClip(atlas: TextureAtlas, frameNames: readonly string[], options: AtlasClipOptions = {}): AtlasClip {
  if (frameNames.length === 0) throw new Error("Atlas clip needs at least one frame name");

  const frames = frameNames.map((name) => atlas.requireFrame(name));
  const framesPerSecond = options.framesPerSecond ?? 12;
  if (!Number.isFinite(framesPerSecond) || framesPerSecond <= 0) {
    throw new RangeError("framesPerSecond must be a positive number");
  }
  const frameDuration = 1 / framesPerSecond;
  if (!Number.isFinite(frameDuration) || frameDuration <= 0) {
    throw new RangeError("framesPerSecond must resolve to a positive finite frame duration");
  }
  const initialSpeed = requireNonNegativeFinite(options.speed ?? 1, "speed");

  const clip: AtlasClip = {
    atlas,
    frames,
    frameNames,
    loop: options.loop ?? true,
    framesPerSecond,
    speed: initialSpeed,
    index: resolveClipIndex(frameNames, options.startFrame),
    elapsed: 0,
    done: false,
    update(deltaSeconds: number) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
        throw new RangeError("deltaSeconds must be a non-negative finite number");
      }
      if (this.done && !this.loop) return this.currentFrame();

      const advance = deltaSeconds * this.speed;
      const nextElapsed = this.elapsed + advance;
      if (!Number.isFinite(advance) || !Number.isFinite(nextElapsed)) {
        throw new RangeError("atlas playback advance is too large");
      }
      const steps = Math.floor(nextElapsed / frameDuration);
      if (!Number.isSafeInteger(steps)) {
        throw new RangeError("atlas playback advance is too large");
      }
      this.elapsed = nextElapsed - steps * frameDuration;
      if (steps === 0) return this.currentFrame();

      if (this.loop) {
        this.index = (this.index + (steps % this.frames.length)) % this.frames.length;
      } else {
        const remainingFrames = this.frames.length - 1 - this.index;
        if (steps <= remainingFrames) {
          this.index += steps;
        } else {
          this.index = this.frames.length - 1;
          this.elapsed = 0;
          this.done = true;
        }
      }

      return this.currentFrame();
    },
    reset(frame?: number | string) {
      this.index = resolveClipIndex(this.frameNames, frame);
      this.elapsed = 0;
      this.done = false;
      return this.currentFrame();
    },
    currentFrame() {
      return this.frames[this.index];
    },
    currentFrameName() {
      return this.frameNames[this.index];
    },
    setSpeed(speed: number) {
      this.speed = requireNonNegativeFinite(speed, "speed");
      return this;
    }
  };

  return clip;
}
