export type FixedStepLoopOptions = {
  step?: number;
  maxFrame?: number;
  beforeUpdate?: (step: number) => void;
  afterUpdate?: (step: number) => void;
  update: (step: number) => void;
  render: (alpha: number, frame: FixedStepFrame) => void;
  now?: () => number;
};

export type FixedStepAdvanceOptions = {
  /** Stops the current advance between callbacks without discarding accumulated time. */
  shouldContinue?: () => boolean;
};

export type FixedStepFrame = {
  rawDelta: number;
  delta: number;
  updates: number;
  alpha: number;
};

export type FixedStepAdvanceResult = FixedStepFrame & {
  interrupted: boolean;
};

export type FixedStepDriverOptions = Omit<FixedStepLoopOptions, "now">;

const MAX_FIXED_UPDATES_PER_FRAME = 10_000;

function validateFixedStepOptions(step: number, maxFrame: number) {
  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError("step must be a positive finite number");
  }
  if (!Number.isFinite(maxFrame) || maxFrame < 0) {
    throw new RangeError("maxFrame must be a non-negative finite number");
  }
  const maximumUpdatesPerFrame = Math.ceil(maxFrame / step);
  if (!Number.isSafeInteger(maximumUpdatesPerFrame) || maximumUpdatesPerFrame > MAX_FIXED_UPDATES_PER_FRAME) {
    throw new RangeError(`step and maxFrame must require at most ${MAX_FIXED_UPDATES_PER_FRAME} fixed updates per frame`);
  }
}

/**
 * Fixed-step accumulation without owning a browser scheduler.
 *
 * Use `advance(timestampMs)` from RAF/Three render loops, or `advanceBy(deltaSeconds)`
 * from deterministic proofs and server-side simulations. The RAF-owning
 * `createFixedStepLoop` is composed from the same driver.
 */
export function createFixedStepDriver({
  step = 1 / 60,
  maxFrame = 0.05,
  beforeUpdate,
  afterUpdate,
  update,
  render
}: FixedStepDriverOptions) {
  validateFixedStepOptions(step, maxFrame);
  let accumulator = 0;
  let lastTimestamp: number | undefined;

  function reset(timestamp?: number) {
    if (timestamp !== undefined && !Number.isFinite(timestamp)) {
      throw new RangeError("fixed step timestamp must be finite");
    }
    accumulator = 0;
    lastTimestamp = timestamp;
  }

  function advanceBy(rawDelta: number, options: FixedStepAdvanceOptions = {}): FixedStepAdvanceResult {
    if (!Number.isFinite(rawDelta)) throw new RangeError("fixed step delta must be finite");
    const delta = Math.min(maxFrame, Math.max(0, rawDelta));
    accumulator += delta;
    if (!Number.isFinite(accumulator)) throw new RangeError("fixed step accumulator must be finite");
    let updates = 0;
    let interrupted = false;
    const shouldContinue = options.shouldContinue ?? (() => true);

    while (accumulator >= step) {
      if (!shouldContinue()) { interrupted = true; break; }
      beforeUpdate?.(step);
      if (!shouldContinue()) { interrupted = true; break; }
      update(step);
      if (!shouldContinue()) { interrupted = true; break; }
      afterUpdate?.(step);
      if (!shouldContinue()) { interrupted = true; break; }
      accumulator -= step;
      updates += 1;
    }

    const alpha = accumulator / step;
    if (!interrupted && shouldContinue()) render(alpha, { rawDelta, delta, updates, alpha });
    else interrupted = true;
    return { rawDelta, delta, updates, alpha, interrupted };
  }

  function advance(timestamp: number, options: FixedStepAdvanceOptions = {}) {
    if (!Number.isFinite(timestamp)) throw new RangeError("fixed step timestamp must be finite");
    if (lastTimestamp === undefined) {
      lastTimestamp = timestamp;
      return advanceBy(0, options);
    }
    const rawDelta = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;
    return advanceBy(rawDelta, options);
  }

  return {
    advance,
    advanceBy,
    reset,
    snapshot() {
      return { accumulator, alpha: accumulator / step, lastTimestamp, maxFrame, step };
    }
  };
}

export function createFixedStepLoop({
  step = 1 / 60,
  maxFrame = 0.05,
  beforeUpdate,
  afterUpdate,
  update,
  render,
  now = () => performance.now()
}: FixedStepLoopOptions) {
  validateFixedStepOptions(step, maxFrame);
  let running = false;
  let frameId = 0;
  const driver = createFixedStepDriver({ step, maxFrame, beforeUpdate, afterUpdate, update, render });

  function halt() {
    running = false;
    frameId = 0;
    driver.reset();
  }

  function frame(time: number) {
    if (!running) return;
    frameId = 0;
    try {
      driver.advance(time, { shouldContinue: () => running });
      if (!running) return;
      frameId = requestAnimationFrame(frame);
    } catch (error) {
      halt();
      throw error;
    }
  }

  function start() {
    if (running) return;
    const startTime = now();
    if (!Number.isFinite(startTime)) throw new RangeError("fixed step clock must return a finite number");
    driver.reset(startTime);
    running = true;
    try {
      frameId = requestAnimationFrame(frame);
    } catch (error) {
      halt();
      throw error;
    }
  }

  function stop() {
    if (!running) return;
    const pendingFrameId = frameId;
    halt();
    if (pendingFrameId !== 0) cancelAnimationFrame(pendingFrameId);
  }

  return {
    start,
    resume: start,
    stop,
    pause: stop,
    isRunning() {
      return running;
    }
  };
}
