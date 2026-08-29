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

/** Creates a privacy-preserving serial adapter for an injected on-device NPC model. */
export function createLocalNpcRuntime<Context = unknown, Output = string>(options: LocalNpcRuntimeOptions<Context, Output>) {
  const maxPending = positiveInteger(options.maxPending ?? 8, "maxPending");
  const maxContextEntries = positiveInteger(options.maxContextEntries ?? 16, "maxContextEntries");
  const queue: PendingNpc<Context, Output>[] = [];
  let active: { controller: AbortController; item: PendingNpc<Context, Output> } | undefined;
  let disposed = false;
  const localModelAvailable = () => options.model.available && options.model.execution === "local";
  const boundedRequest = (request: LocalNpcRequest<Context>): LocalNpcRequest<Context> => {
    const context = request.context;
    if (!context || context.length <= maxContextEntries) return request;
    return { ...request, context: context.slice(context.length - maxContextEntries) };
  };
  const useFallback = async (request: LocalNpcRequest<Context>, reason: unknown): Promise<LocalNpcResponse<Output>> => ({
    source: "fallback",
    value: await options.fallback(request, reason),
  });
  const pump = () => {
    if (active || disposed) return;
    const item = queue.shift();
    if (!item) return;
    const controller = new AbortController();
    const current = { controller, item };
    active = current;
    void options.model.generate(item.request, controller.signal).then(
      (value) => {
        if (active === current) item.resolve({ source: "local-model", value });
      },
      async (error) => {
        if (active !== current) return;
        try {
          const value = await options.fallback(item.request, error);
          if (active === current) item.resolve({ source: "fallback", value });
        } catch (fallbackError) {
          if (active === current) item.reject(fallbackError);
        }
      }
    ).finally(() => {
      if (active === current) active = undefined;
      pump();
    });
  };
  return Object.freeze({
    get localModelAvailable() { return localModelAvailable(); },
    get pending() { return queue.length + (active ? 1 : 0); },
    respond(request: LocalNpcRequest<Context>): Promise<LocalNpcResponse<Output>> {
    if (disposed) return Promise.reject(new Error("local NPC runtime is disposed."));
    if (!request.npcId || !request.prompt.trim()) return Promise.reject(new Error("NPC id and prompt are required."));
    const normalized = boundedRequest(request);
    if (!localModelAvailable()) return useFallback(normalized, new Error("local NPC model is unavailable."));
    if (queue.length + (active ? 1 : 0) >= maxPending) return Promise.reject(new Error("local NPC pending capacity exceeded."));
    return new Promise((resolve, reject) => {
      queue.push({ request: normalized, resolve, reject });
      pump();
    });
    },

    dispose(reason: unknown = new Error("local NPC runtime disposed.")): void {
      if (disposed) return;
      disposed = true;
      active?.controller.abort();
      active?.item.reject(reason);
      active = undefined;
      for (const item of queue) item.reject(reason);
      queue.length = 0;
    },
  });
}

export type LocalNpcRuntime<Context = unknown, Output = string> = ReturnType<typeof createLocalNpcRuntime<Context, Output>>;

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer.`);
  return value;
}
