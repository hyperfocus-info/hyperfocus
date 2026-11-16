export interface WasmSimulatorModule<State = unknown> {
  readonly exports: WebAssembly.Exports;
  readonly abiVersion: number;
  captureState?(): State;
  restoreState?(state: State): void | Promise<void>;
  dispose?(): void | Promise<void>;
}

export interface WasmSimulatorHostOptions {
  abiVersion: number;
  requiredExports?: readonly string[];
  onDiagnostic?: (message: string, error?: unknown) => void;
}

export type WasmSwapResult =
  | { readonly ok: true; readonly generation: number }
  | { readonly ok: false; readonly generation: number; readonly error: unknown };

/** Latest-request-wins host. Failed swaps retain the live module; disposal is terminal. */
export type HotSwappableWasmSimulator<State = unknown> = {
  readonly abiVersion: number;
  readonly requiredExports: readonly string[];
  readonly current: WasmSimulatorModule<State> | undefined;
  readonly generation: number;
  replace(load: () => WasmSimulatorModule<State> | Promise<WasmSimulatorModule<State>>): Promise<WasmSwapResult>;
  dispose(): Promise<void>;
};

type HotSwappableWasmSimulatorFactory = {
  <State = unknown>(options: WasmSimulatorHostOptions): HotSwappableWasmSimulator<State>;
  new<State = unknown>(options: WasmSimulatorHostOptions): HotSwappableWasmSimulator<State>;
  readonly prototype: object;
};

const hotSwappableWasmSimulatorPrototype = {};

export function createHotSwappableWasmSimulator<State = unknown>(
  options: WasmSimulatorHostOptions
): HotSwappableWasmSimulator<State> {
  if (!Number.isSafeInteger(options.abiVersion) || options.abiVersion < 0) throw new RangeError("abiVersion must be non-negative.");
  const abiVersion = options.abiVersion;
  const requiredExports = Object.freeze([...(options.requiredExports ?? [])]);
  let current: WasmSimulatorModule<State> | undefined;
  let generation = 0;
  let request = 0;
  let disposed = false;
  const claimed = new WeakSet<WasmSimulatorModule<State>>();
  const diagnose = (message: string, error?: unknown): void => {
    try { options.onDiagnostic?.(message, error); } catch {}
  };
  const validate = (module: WasmSimulatorModule<State>): void => {
    if (!module || typeof module !== "object" || !module.exports) throw new TypeError("Invalid WASM simulator module.");
    if (module.abiVersion !== abiVersion) {
      throw new Error(`WASM ABI ${module.abiVersion}; expected ${abiVersion}.`);
    }
    for (const name of requiredExports) {
      if (!(name in module.exports)) throw new Error(`WASM export missing: ${name}.`);
    }
  };

  const host: HotSwappableWasmSimulator<State> = {
    abiVersion,
    requiredExports,
    get current() { return current; },
    get generation() { return generation; },
    async replace(load) {
      const requested = ++request;
      let candidate: WasmSimulatorModule<State> | undefined;
      const assertCurrentRequest = () => {
        if (disposed || requested !== request) throw new Error("WASM swap is stale or disposed.");
      };
      try {
        assertCurrentRequest();
        candidate = await load();
        if (claimed.has(candidate)) {
          // This request must not dispose a module already owned by another request.
          candidate = undefined;
          throw new Error("WASM module instance was already used.");
        }
        claimed.add(candidate);
        assertCurrentRequest();
        validate(candidate);
        if (current?.captureState) {
          const state = current.captureState();
          await candidate.restoreState?.(state);
        }
        assertCurrentRequest();
      } catch (error) {
        if (candidate) {
          try { await candidate.dispose?.(); } catch (disposeError) { diagnose("candidate disposal failed", disposeError); }
        }
        diagnose("WASM simulator replacement rejected", error);
        return { ok: false, generation, error };
      }

      const previous = current;
      current = candidate;
      const installedGeneration = ++generation;
      if (previous) {
        try { await previous.dispose?.(); } catch (error) { diagnose("previous simulator disposal failed", error); }
      }
      return { ok: true, generation: installedGeneration };
    },
    async dispose() {
      disposed = true;
      const active = current;
      current = undefined;
      if (active) await active.dispose?.();
    }
  };
  Object.setPrototypeOf(host, hotSwappableWasmSimulatorPrototype);
  return host;
}

function hotSwappableWasmSimulatorFactory<State = unknown>(
  options: WasmSimulatorHostOptions
): HotSwappableWasmSimulator<State> {
  return createHotSwappableWasmSimulator<State>(options);
}

function isHotSwappableWasmSimulatorFactory(value: unknown): value is HotSwappableWasmSimulatorFactory {
  if (typeof value !== "function") return false;
  try {
    Reflect.construct(Object, [], value);
    return true;
  } catch {
    return false;
  }
}

function requireHotSwappableWasmSimulatorFactory(value: unknown): HotSwappableWasmSimulatorFactory {
  if (!isHotSwappableWasmSimulatorFactory(value)) throw new Error("Hot-swappable WASM simulator factory must be constructable");
  return value;
}

Object.defineProperty(hotSwappableWasmSimulatorFactory, "prototype", { value: hotSwappableWasmSimulatorPrototype });
export const HotSwappableWasmSimulator = requireHotSwappableWasmSimulatorFactory(hotSwappableWasmSimulatorFactory);
