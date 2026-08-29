export interface VoiceoverDriver {
  readonly supported: boolean;
  /** True only when the selected voice is guaranteed to execute locally. */
  readonly local: boolean;
  speak(text: string, options?: Readonly<Record<string, unknown>>): Promise<void>;
  cancel(): void;
}

export interface VoiceoverQueueOptions {
  driver: VoiceoverDriver;
  maxQueued?: number;
  overflow?: "reject" | "drop-oldest";
  requireLocal?: boolean;
  onError?: (error: unknown, text: string) => void;
}

interface VoiceoverItem {
  readonly text: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

/** Creates a sequential bounded dialogue-to-speech queue around an injected driver. */
export function createVoiceoverQueue(options: VoiceoverQueueOptions) {
  const driver = options.driver;
  const maxQueued = options.maxQueued ?? 16;
  if (!Number.isSafeInteger(maxQueued) || maxQueued <= 0) throw new RangeError("maxQueued must be positive.");
  const overflow = options.overflow ?? "reject";
  const requireLocal = options.requireLocal ?? true;
  const onError = options.onError;
  const queue: VoiceoverItem[] = [];
  const idleWaiters: (() => void)[] = [];
  let active = false;
  let generation = 0;
  const available = () => driver.supported && (!requireLocal || driver.local);
  const resolveIdle = () => {
    for (const resolve of idleWaiters) resolve();
    idleWaiters.length = 0;
  };
  const pump = () => {
    if (active) return;
    const item = queue.shift();
    if (!item) { resolveIdle(); return; }
    const currentGeneration = generation;
    active = true;
    void driver.speak(item.text, item.options).catch((error) => {
      try { onError?.(error, item.text); } catch {}
    }).finally(() => {
      if (currentGeneration !== generation) return;
      active = false;
      pump();
    });
  };
  return Object.freeze({
    get available() { return available(); },
    get queued() { return queue.length; },
    get speaking() { return active; },
    enqueue(text: string, itemOptions?: Readonly<Record<string, unknown>>): boolean {
    if (!available()) throw new Error(driver.supported ? "voiceover driver is not guaranteed local." : "speech synthesis is unavailable.");
    if (!text.trim()) throw new Error("voiceover text must not be empty.");
    if (queue.length >= maxQueued) {
      if (overflow === "reject") return false;
      queue.shift();
    }
    queue.push({ text, options: itemOptions });
    pump();
    return true;
    },

    whenIdle(): Promise<void> {
      if (!active && queue.length === 0) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },

    cancel(): void {
      generation += 1;
      queue.length = 0;
      active = false;
      driver.cancel();
      resolveIdle();
    },
  });
}

export type VoiceoverQueue = ReturnType<typeof createVoiceoverQueue>;
