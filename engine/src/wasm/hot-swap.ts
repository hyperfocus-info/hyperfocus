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
export class HotSwappableWasmSimulator<State = unknown> {
  readonly abiVersion: number;
  readonly requiredExports: readonly string[];
  readonly #onDiagnostic: ((message: string, error?: unknown) => void) | undefined;
  #current: WasmSimulatorModule<State> | undefined;
  #generation = 0;

  constructor(options: WasmSimulatorHostOptions) {
    if (!Number.isSafeInteger(options.abiVersion) || options.abiVersion < 0) throw new RangeError("abiVersion must be non-negative.");
    this.abiVersion = options.abiVersion;
    this.requiredExports = Object.freeze([...(options.requiredExports ?? [])]);
    this.#onDiagnostic = options.onDiagnostic;
  }

  get current(): WasmSimulatorModule<State> | undefined {
    return this.#current;
  }

  get generation(): number {
    return this.#generation;
  }

  async replace(load: () => WasmSimulatorModule<State> | Promise<WasmSimulatorModule<State>>): Promise<WasmSwapResult> {
    let candidate: WasmSimulatorModule<State> | undefined;
    try {
      candidate = await load();
      this.#validate(candidate);
      if (this.#current?.captureState) {
        const state = this.#current.captureState();
        await candidate.restoreState?.(state);
      }
    } catch (error) {
      if (candidate && candidate !== this.#current) {
        try { await candidate.dispose?.(); } catch (disposeError) { this.#diagnose("candidate disposal failed", disposeError); }
      }
      this.#diagnose("WASM simulator replacement rejected", error);
      return { ok: false, generation: this.#generation, error };
    }

    const previous = this.#current;
    this.#current = candidate;
    this.#generation += 1;
    if (previous && previous !== candidate) {
      try { await previous.dispose?.(); } catch (error) { this.#diagnose("previous simulator disposal failed", error); }
    }
    return { ok: true, generation: this.#generation };
  }

  async dispose(): Promise<void> {
    const current = this.#current;
    this.#current = undefined;
    if (current) await current.dispose?.();
  }

  #validate(module: WasmSimulatorModule<State>): void {
    if (!module || typeof module !== "object" || !module.exports) throw new TypeError("loader did not return a WASM simulator module.");
    if (module.abiVersion !== this.abiVersion) {
      throw new Error(`WASM simulator ABI ${module.abiVersion} does not match required ABI ${this.abiVersion}.`);
    }
    for (const name of this.requiredExports) {
      if (!(name in module.exports)) throw new Error(`WASM simulator is missing required export ${name}.`);
    }
  }

  #diagnose(message: string, error?: unknown): void {
    try { this.#onDiagnostic?.(message, error); } catch {}
  }
}

export function createHotSwappableWasmSimulator<State = unknown>(
  options: WasmSimulatorHostOptions
): HotSwappableWasmSimulator<State> {
  return new HotSwappableWasmSimulator(options);
}
