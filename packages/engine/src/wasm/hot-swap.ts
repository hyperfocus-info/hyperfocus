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

/** Transactional host: a failed load, validation, or migration retains the live simulator. */
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
  const diagnose = (message: string, error?: unknown): void => {
    try { options.onDiagnostic?.(message, error); } catch {}
  };
  const validate = (module: WasmSimulatorModule<State>): void => {
    if (!module || typeof module !== "object" || !module.exports) throw new TypeError("loader did not return a WASM simulator module.");
    if (module.abiVersion !== abiVersion) {
      throw new Error(`WASM simulator ABI ${module.abiVersion} does not match required ABI ${abiVersion}.`);
    }
    for (const name of requiredExports) {
      if (!(name in module.exports)) throw new Error(`WASM simulator is missing required export ${name}.`);
    }
  };

  const host: HotSwappableWasmSimulator<State> = {
    abiVersion,
    requiredExports,
    get current() { return current; },
    get generation() { return generation; },
    async replace(load) {
      let candidate: WasmSimulatorModule<State> | undefined;
      try {
        candidate = await load();
        validate(candidate);
        if (current?.captureState) {
          const state = current.captureState();
          await candidate.restoreState?.(state);
        }
      } catch (error) {
        if (candidate && candidate !== current) {
          try { await candidate.dispose?.(); } catch (disposeError) { diagnose("candidate disposal failed", disposeError); }
        }
        diagnose("WASM simulator replacement rejected", error);
        return { ok: false, generation, error };
      }

      const previous = current;
      current = candidate;
      generation += 1;
      if (previous && previous !== candidate) {
        try { await previous.dispose?.(); } catch (error) { diagnose("previous simulator disposal failed", error); }
      }
      return { ok: true, generation };
    },
    async dispose() {
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
