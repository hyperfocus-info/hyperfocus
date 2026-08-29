import { createFixedStepLoop } from "./loop.ts";

export type BufferedInput<TInput> = {
  input: TInput;
  predicted: boolean;
};

export type InputBuffer<TInput> = {
  set(frame: number, peerId: string, input: TInput, predicted?: boolean): BufferedInput<TInput> | undefined;
  get(frame: number, peerId: string): BufferedInput<TInput> | undefined;
  getFrame(
    frame: number,
    peerIds: readonly string[],
    defaultInput: TInput,
    predictInput?: (peerId: string, frame: number) => TInput,
    cloneInput?: (input: TInput) => TInput
  ): Record<string, TInput>;
  clearBefore(frame: number): void;
};

export type RollbackLoopOptions<TInput, TState> = {
  step?: number;
  maxFrame?: number;
  maxRollbackFrames?: number;
  /** Number of early input frames retained to absorb polling and transport jitter. */
  maxFutureInputFrames?: number;
  peerIds: readonly string[] | (() => readonly string[]);
  localPeerId: string;
  defaultInput: TInput;
  getLocalInput: () => TInput;
  getState: () => TState;
  setState: (state: TState) => void;
  update: (inputs: Record<string, TInput>, step: number, frame: number) => void;
  render?: (alpha: number, frame: number) => void;
  predictInput?: (peerId: string, frame: number) => TInput;
  cloneState?: (state: TState) => TState;
  cloneInput?: (input: TInput) => TInput;
  compareInput?: (a: TInput, b: TInput) => boolean;
  now?: () => number;
  onRollback?: (fromFrame: number, toFrame: number) => void;
  onInputDropped?: (peerId: string, frame: number, reason: "history" | "future") => void;
};

export type RollbackLoop<TInput> = {
  start(): void;
  stop(): void;
  tick(): void;
  receiveInput(peerId: string, frame: number, input: TInput): void;
  frame(): number;
  inputBuffer: InputBuffer<TInput>;
};

const EMPTY_FRAME = -2147483648;

function assertFrame(frame: number) {
  if (!Number.isSafeInteger(frame) || frame < 0) throw new RangeError(`rollback frame must be a non-negative safe integer: ${String(frame)}`);
}

function slotFor(frame: number, capacity: number) {
  return ((frame % capacity) + capacity) % capacity;
}

function sameInput(a: unknown, b: unknown) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return Object.is(a, b);
  }
}

function cloneSerializable<T>(value: T): T {
  if (typeof structuredClone !== "function") throw new Error("rollback needs cloneState and cloneInput when structuredClone is unavailable");
  return structuredClone(value);
}

export function createInputBuffer<TInput>(capacity = 120): InputBuffer<TInput> {
  if (!Number.isSafeInteger(capacity) || capacity <= 0 || capacity > 0xffffffff) {
    throw new RangeError("input buffer capacity must be a positive safe array length");
  }
  const frames = new Array<number>(capacity).fill(EMPTY_FRAME);
  const slots = Array.from({ length: capacity }, () => new Map<string, BufferedInput<TInput>>());

  function ensure(frame: number) {
    const slot = slotFor(frame, capacity);
    if (frames[slot] !== frame) {
      frames[slot] = frame;
      slots[slot].clear();
    }
    return slots[slot];
  }

  return {
    set(frame, peerId, input, predicted = false) {
      assertFrame(frame);
      const slot = ensure(frame);
      const previous = slot.get(peerId);
      slot.set(peerId, { input, predicted });
      return previous;
    },
    get(frame, peerId) {
      assertFrame(frame);
      const slot = slotFor(frame, capacity);
      if (frames[slot] !== frame) return undefined;
      return slots[slot].get(peerId);
    },
    getFrame(frame, peerIds, defaultInput, predictInput, cloneInput) {
      assertFrame(frame);
      const inputs: Record<string, TInput> = {};
      const slot = ensure(frame);
      for (const peerId of peerIds) {
        const existing = slot.get(peerId);
        if (existing) {
          const exposed = cloneInput ? cloneInput(existing.input) : existing.input;
          Object.defineProperty(inputs, peerId, { value: exposed, enumerable: true, configurable: true, writable: true });
          continue;
        }
        const predictedValue = predictInput?.(peerId, frame) ?? defaultInput;
        const predicted = cloneInput ? cloneInput(predictedValue) : predictedValue;
        slot.set(peerId, { input: predicted, predicted: true });
        const exposed = cloneInput ? cloneInput(predicted) : predicted;
        Object.defineProperty(inputs, peerId, { value: exposed, enumerable: true, configurable: true, writable: true });
      }
      return inputs;
    },
    clearBefore(frame) {
      if (!Number.isSafeInteger(frame)) throw new RangeError(`rollback frame must be a safe integer: ${String(frame)}`);
      for (let i = 0; i < frames.length; i += 1) {
        if (frames[i] < frame) {
          frames[i] = EMPTY_FRAME;
          slots[i].clear();
        }
      }
    }
  };
}

export function createRollbackLoop<TInput, TState>(options: RollbackLoopOptions<TInput, TState>): RollbackLoop<TInput> {
  const step = options.step ?? 1 / 60;
  const maxRollbackFrames = options.maxRollbackFrames ?? 120;
  const maxFutureInputFrames = options.maxFutureInputFrames ?? 8;
  if (!Number.isFinite(step) || step <= 0) throw new RangeError("rollback step must be a positive finite number");
  if (!Number.isSafeInteger(maxRollbackFrames) || maxRollbackFrames < 0) {
    throw new RangeError("maxRollbackFrames must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(maxFutureInputFrames) || maxFutureInputFrames < 0) {
    throw new RangeError("maxFutureInputFrames must be a non-negative safe integer");
  }
  if (maxRollbackFrames + maxFutureInputFrames > 0xfffffffd) {
    throw new RangeError("rollback history and future input windows exceed supported input buffer capacity");
  }
  if (typeof options.localPeerId !== "string" || options.localPeerId.length === 0) {
    throw new Error("rollback localPeerId must be a non-empty string");
  }
  const inputBuffer = createInputBuffer<TInput>(maxRollbackFrames + maxFutureInputFrames + 2);
  const snapshots = new Map<number, TState>();
  const framePeers = new Map<number, readonly string[]>();
  const cloneState = options.cloneState ?? cloneSerializable<TState>;
  const cloneInput = options.cloneInput ?? cloneSerializable<TInput>;
  const compareInput = options.compareInput ?? sameInput;
  let currentFrame = 0;

  function saveSnapshot(frame: number) {
    snapshots.set(frame, cloneState(options.getState()));
    for (const snapshotFrame of snapshots.keys()) {
      if (snapshotFrame < frame - maxRollbackFrames) snapshots.delete(snapshotFrame);
    }
    for (const peerFrame of framePeers.keys()) {
      if (peerFrame < frame - maxRollbackFrames) framePeers.delete(peerFrame);
    }
  }

  function peersForFrame(frame: number) {
    const existing = framePeers.get(frame);
    if (existing) return existing;
    const configured = typeof options.peerIds === "function" ? options.peerIds() : options.peerIds;
    const peers = [...new Set(configured)];
    if (!peers.includes(options.localPeerId)) peers.unshift(options.localPeerId);
    framePeers.set(frame, peers);
    return peers;
  }

  function simulateFrame(frame: number) {
    const existingLocal = inputBuffer.get(frame, options.localPeerId);
    if (!existingLocal || existingLocal.predicted) {
      const localInput = options.getLocalInput();
      inputBuffer.set(frame, options.localPeerId, cloneInput(localInput), false);
    }
    const inputs = inputBuffer.getFrame(frame, peersForFrame(frame), options.defaultInput, options.predictInput, cloneInput);
    options.update(inputs, step, frame);
  }

  function tick() {
    saveSnapshot(currentFrame);
    simulateFrame(currentFrame);
    currentFrame += 1;
    inputBuffer.clearBefore(currentFrame - maxRollbackFrames);
  }

  function rollbackTo(frame: number) {
    const snapshot = snapshots.get(frame);
    if (!snapshot) return;
    const targetFrame = currentFrame;
    options.setState(cloneState(snapshot));
    currentFrame = frame;
    while (currentFrame < targetFrame) {
      saveSnapshot(currentFrame);
      simulateFrame(currentFrame);
      currentFrame += 1;
    }
    options.onRollback?.(frame, targetFrame);
  }

  const fixedLoop = createFixedStepLoop({
    step,
    maxFrame: options.maxFrame,
    update: tick,
    render: (alpha) => options.render?.(alpha, currentFrame),
    now: options.now
  });

  return {
    start: fixedLoop.start,
    stop: fixedLoop.stop,
    tick,
    receiveInput(peerId, frame, input) {
      if (typeof peerId !== "string" || peerId.length === 0) return;
      assertFrame(frame);
      if (frame < Math.max(0, currentFrame - maxRollbackFrames)) {
        options.onInputDropped?.(peerId, frame, "history");
        return;
      }
      if (frame > currentFrame + maxFutureInputFrames) {
        options.onInputDropped?.(peerId, frame, "future");
        return;
      }
      const received = cloneInput(input);
      const previous = inputBuffer.set(frame, peerId, received, false);
      const participated = framePeers.get(frame)?.includes(peerId) ?? false;
      const changedLateInput = frame < currentFrame && participated && (!previous || !compareInput(previous.input, received));
      if (changedLateInput) rollbackTo(frame);
    },
    frame() {
      return currentFrame;
    },
    inputBuffer
  };
}
