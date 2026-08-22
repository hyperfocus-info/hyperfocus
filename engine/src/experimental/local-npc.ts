export interface LocalNpcRequest<Context = unknown> {
  readonly npcId: string;
  readonly prompt: string;
  readonly context?: readonly Context[];
  readonly seed?: number;
}

export interface LocalNpcModel<Input, Output> {
  readonly available: boolean;
  readonly execution: "local" | "remote" | "unknown";
  generate(input: Input, signal: AbortSignal): Promise<Output>;
}

export interface LocalNpcRuntimeOptions<Context, Output> {
  model: LocalNpcModel<LocalNpcRequest<Context>, Output>;
  fallback(request: LocalNpcRequest<Context>, reason: unknown): Output | Promise<Output>;
  maxPending?: number;
  maxContextEntries?: number;
}

export interface LocalNpcResponse<Output> {
  readonly source: "local-model" | "fallback";
  readonly value: Output;
}

interface PendingNpc<Context, Output> {
  readonly request: LocalNpcRequest<Context>;
  readonly resolve: (response: LocalNpcResponse<Output>) => void;
  readonly reject: (error: unknown) => void;
}

/** Privacy-preserving serial adapter for an injected on-device NPC model. */
export class LocalNpcRuntime<Context = unknown, Output = string> {
  readonly #model: LocalNpcRuntimeOptions<Context, Output>["model"];
  readonly #fallback: LocalNpcRuntimeOptions<Context, Output>["fallback"];
  readonly #maxPending: number;
  readonly #maxContextEntries: number;
  readonly #queue: PendingNpc<Context, Output>[] = [];
  #active: { controller: AbortController; item: PendingNpc<Context, Output> } | undefined;
  #disposed = false;

  constructor(options: LocalNpcRuntimeOptions<Context, Output>) {
    this.#model = options.model;
    this.#fallback = options.fallback;
    this.#maxPending = positiveInteger(options.maxPending ?? 8, "maxPending");
    this.#maxContextEntries = positiveInteger(options.maxContextEntries ?? 16, "maxContextEntries");
  }

  get localModelAvailable(): boolean {
    return this.#model.available && this.#model.execution === "local";
  }

  get pending(): number { return this.#queue.length + (this.#active ? 1 : 0); }

  respond(request: LocalNpcRequest<Context>): Promise<LocalNpcResponse<Output>> {
    if (this.#disposed) return Promise.reject(new Error("local NPC runtime is disposed."));
    if (!request.npcId || !request.prompt.trim()) return Promise.reject(new Error("NPC id and prompt are required."));
    const normalized = this.#boundedRequest(request);
    if (!this.localModelAvailable) return this.#useFallback(normalized, new Error("local NPC model is unavailable."));
    if (this.pending >= this.#maxPending) return Promise.reject(new Error("local NPC pending capacity exceeded."));
    return new Promise((resolve, reject) => {
      this.#queue.push({ request: normalized, resolve, reject });
      this.#pump();
    });
  }

  dispose(reason: unknown = new Error("local NPC runtime disposed.")): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#active?.controller.abort();
    this.#active?.item.reject(reason);
    this.#active = undefined;
    for (const item of this.#queue) item.reject(reason);
    this.#queue.length = 0;
  }

  #boundedRequest(request: LocalNpcRequest<Context>): LocalNpcRequest<Context> {
    const context = request.context;
    if (!context || context.length <= this.#maxContextEntries) return request;
    return { ...request, context: context.slice(context.length - this.#maxContextEntries) };
  }

  #pump(): void {
    if (this.#active || this.#disposed) return;
    const item = this.#queue.shift();
    if (!item) return;
    const controller = new AbortController();
    const active = { controller, item };
    this.#active = active;
    void this.#model.generate(item.request, controller.signal).then(
      (value) => {
        if (this.#active === active) item.resolve({ source: "local-model", value });
      },
      async (error) => {
        if (this.#active !== active) return;
        try {
          const value = await this.#fallback(item.request, error);
          if (this.#active === active) item.resolve({ source: "fallback", value });
        } catch (fallbackError) {
          if (this.#active === active) item.reject(fallbackError);
        }
      }
    ).finally(() => {
      if (this.#active === active) this.#active = undefined;
      this.#pump();
    });
  }

  async #useFallback(request: LocalNpcRequest<Context>, reason: unknown): Promise<LocalNpcResponse<Output>> {
    return { source: "fallback", value: await this.#fallback(request, reason) };
  }
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer.`);
  return value;
}

export function createLocalNpcRuntime<Context = unknown, Output = string>(
  options: LocalNpcRuntimeOptions<Context, Output>
): LocalNpcRuntime<Context, Output> {
  return new LocalNpcRuntime(options);
}
