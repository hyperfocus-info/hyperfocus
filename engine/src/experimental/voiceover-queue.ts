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

/** Sequential bounded dialogue-to-speech queue around an injected synthesis driver. */
export class VoiceoverQueue {
  readonly #driver: VoiceoverDriver;
  readonly #maxQueued: number;
  readonly #overflow: "reject" | "drop-oldest";
  readonly #requireLocal: boolean;
  readonly #onError: VoiceoverQueueOptions["onError"];
  readonly #queue: VoiceoverItem[] = [];
  readonly #idleWaiters: (() => void)[] = [];
  #active = false;
  #generation = 0;

  constructor(options: VoiceoverQueueOptions) {
    this.#driver = options.driver;
    this.#maxQueued = options.maxQueued ?? 16;
    if (!Number.isSafeInteger(this.#maxQueued) || this.#maxQueued <= 0) throw new RangeError("maxQueued must be positive.");
    this.#overflow = options.overflow ?? "reject";
    this.#requireLocal = options.requireLocal ?? true;
    this.#onError = options.onError;
  }

  get available(): boolean { return this.#driver.supported && (!this.#requireLocal || this.#driver.local); }
  get queued(): number { return this.#queue.length; }
  get speaking(): boolean { return this.#active; }

  enqueue(text: string, options?: Readonly<Record<string, unknown>>): boolean {
    if (!this.available) throw new Error(this.#driver.supported ? "voiceover driver is not guaranteed local." : "speech synthesis is unavailable.");
    if (!text.trim()) throw new Error("voiceover text must not be empty.");
    if (this.#queue.length >= this.#maxQueued) {
      if (this.#overflow === "reject") return false;
      this.#queue.shift();
    }
    this.#queue.push({ text, options });
    this.#pump();
    return true;
  }

  whenIdle(): Promise<void> {
    if (!this.#active && this.#queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.#idleWaiters.push(resolve));
  }

  cancel(): void {
    this.#generation += 1;
    this.#queue.length = 0;
    this.#active = false;
    this.#driver.cancel();
    this.#resolveIdle();
  }

  #pump(): void {
    if (this.#active) return;
    const item = this.#queue.shift();
    if (!item) { this.#resolveIdle(); return; }
    const generation = this.#generation;
    this.#active = true;
    void this.#driver.speak(item.text, item.options).catch((error) => {
      try { this.#onError?.(error, item.text); } catch {}
    }).finally(() => {
      if (generation !== this.#generation) return;
      this.#active = false;
      this.#pump();
    });
  }

  #resolveIdle(): void {
    for (const resolve of this.#idleWaiters) resolve();
    this.#idleWaiters.length = 0;
  }
}

export function createVoiceoverQueue(options: VoiceoverQueueOptions): VoiceoverQueue {
  return new VoiceoverQueue(options);
}
