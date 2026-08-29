export interface WorkletMessagePortLike {
  postMessage(message: unknown, transfer?: readonly Transferable[]): void;
}

export interface AudioWorkletNodeLike {
  readonly port: WorkletMessagePortLike;
  connect(destination: unknown): unknown;
  disconnect(): void;
}

export interface AudioWorkletContextLike {
  readonly audioWorklet?: { addModule(url: string): Promise<void> };
  readonly destination: unknown;
}

export interface AudioWorkletWasmHostOptions {
  context: AudioWorkletContextLike;
  processorModuleUrl: string;
  processorName: string;
  wasm: ArrayBuffer | WebAssembly.Module;
  createNode(context: AudioWorkletContextLike, name: string, options: AudioWorkletNodeOptions): AudioWorkletNodeLike;
  processorOptions?: Readonly<Record<string, unknown>>;
}

export type AudioWorkletWasmHostState = "idle" | "starting" | "running" | "stopped" | "failed";

/** Creates a lifecycle boundary for a WASM DSP processor hosted by an AudioWorklet. */
export function createAudioWorkletWasmHost(options: AudioWorkletWasmHostOptions) {
    if (!options.processorModuleUrl || !options.processorName) throw new Error("AudioWorklet processor URL and name are required.");
    let node: AudioWorkletNodeLike | undefined;
    let state: AudioWorkletWasmHostState = "idle";
    return Object.freeze({
      get state(): AudioWorkletWasmHostState { return state; },
      get supported() { return typeof options.context.audioWorklet?.addModule === "function"; },
      async start(): Promise<AudioWorkletNodeLike> {
        if (state === "running" && node) return node;
        if (state === "starting") throw new Error("AudioWorklet WASM host is already starting.");
        const audioWorklet = options.context.audioWorklet;
        if (!audioWorklet || typeof audioWorklet.addModule !== "function") throw new Error("AudioWorklet is unavailable in this context.");
        state = "starting";
        try {
          await audioWorklet.addModule(options.processorModuleUrl);
          const created = options.createNode(options.context, options.processorName, {
            processorOptions: { ...options.processorOptions, wasm: options.wasm }
          });
          created.connect(options.context.destination);
          node = created;
          state = "running";
          return created;
        } catch (error) {
          node = undefined;
          state = "failed";
          throw error;
        }
      },
      control(message: unknown, transfer?: readonly Transferable[]): void {
        if (!node || state !== "running") throw new Error("AudioWorklet WASM host is not running.");
        node.port.postMessage(message, transfer);
      },
      stop(): void {
        node?.disconnect();
        node = undefined;
        state = "stopped";
      },
    });
}

export type AudioWorkletWasmHost = ReturnType<typeof createAudioWorkletWasmHost>;
