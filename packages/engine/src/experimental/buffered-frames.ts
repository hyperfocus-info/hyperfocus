/** Host supplies execution/worker lifetime; the engine owns bounded frame-buffer handoff. */
export function createBufferedFrames<Input, Output>(options: {
  buffers: 1 | 2 | 3;
  bufferBytes: number;
  run(job: { sequence: number; epoch: number; input: Input; buffer: ArrayBuffer }): Promise<{ buffer: ArrayBuffer; output: Output }>;
  onError(error: unknown): void;
}) {
  if (![1, 2, 3].includes(options.buffers)) throw new RangeError('Frame buffering requires one, two or three buffers.');
  if (!Number.isSafeInteger(options.bufferBytes) || options.bufferBytes < 1) throw new RangeError('Frame buffer size must be a positive safe integer.');
  type Slot = { state: 'free' | 'running' | 'ready' | 'reading'; buffer: ArrayBuffer; sequence: number; epoch: number; output?: Output };
  const slots: Slot[] = Array.from({ length: options.buffers }, () => ({ state: 'free', buffer: new ArrayBuffer(options.bufferBytes), sequence: 0, epoch: 0 }));
  let epoch = 0, sequence = 0, presented = 0, disposed = false, failed = false;
  let submitted = 0, completed = 0, backpressure = 0, superseded = 0, errors = 0;
  const recycle = (slot: typeof slots[number]) => { slot.state = 'free';slot.output = undefined; };
  const fail = (slot: typeof slots[number], error: unknown) => {
    recycle(slot);failed = true;errors++;
    if (!disposed) options.onError(error);
  };
  return {
    /** Never queues inputs. False means the caller should offer its newest input later. */
    submit(input: Input) {
      if (disposed || failed) return false;
      const slot = slots.find(slot => slot.state === 'free');
      if (!slot) { backpressure++;return false; }
      slot.state = 'running';slot.sequence = ++sequence;slot.epoch = epoch;submitted++;
      const currentEpoch = epoch;
      try {
        const result = options.run({ sequence, epoch, input, buffer: slot.buffer });
        void result.then(result => {
          if (!(result.buffer instanceof ArrayBuffer) || result.buffer.byteLength !== options.bufferBytes) { fail(slot, new Error('Executor returned an invalid frame buffer.'));return; }
          slot.buffer = result.buffer;completed++;
          if (disposed || currentEpoch !== epoch || slot.sequence <= presented) { superseded++;recycle(slot);return; }
          slot.output = result.output;slot.state = 'ready';
        }, error => fail(slot, error));
      } catch (error) { fail(slot, error); }
      return true;
    },
    /** Completed frames are a latest-value mailbox, not a FIFO of old input. */
    takeLatest() {
      if (disposed || failed) return undefined;
      let newest: typeof slots[number] | undefined;
      for (const slot of slots) if (slot.state === 'ready' && (!newest || slot.sequence > newest.sequence)) newest = slot;
      if (!newest) return undefined;
      for (const slot of slots) if (slot !== newest && slot.state === 'ready') { superseded++;recycle(slot); }
      const slot = newest;
      slot.state = 'reading';presented = slot.sequence;
      let released = false;
      return { sequence: slot.sequence, epoch: slot.epoch, buffer: slot.buffer, output: slot.output!,
        release() { if (!released) { released = true;recycle(slot); } },
      };
    },
    /** Old running results are fenced until they return; no buffer is reused while a worker owns it. */
    reset() {
      epoch++;
      for (const slot of slots) if (slot.state === 'ready') { superseded++;recycle(slot); }
    },
    snapshot() { return { buffers: slots.length, bufferBytes: options.bufferBytes, retainedBufferBytes: slots.length * options.bufferBytes, submitted, completed, backpressure, superseded, errors, failed, disposed,
      running: slots.filter(slot => slot.state === 'running').length, ready: slots.filter(slot => slot.state === 'ready').length, reading: slots.filter(slot => slot.state === 'reading').length }; },
    dispose() { disposed = true;epoch++;for (const slot of slots) if (slot.state === 'ready' || slot.state === 'free') recycle(slot); },
  };
}
