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

/** Lifecycle boundary for a WASM DSP processor hosted by an AudioWorklet. */
export class AudioWorkletWasmHost {
  readonly #options: AudioWorkletWasmHostOptions;
  #node: AudioWorkletNodeLike | undefined;
  #state: AudioWorkletWasmHostState = "idle";

  constructor(options: AudioWorkletWasmHostOptions) {
    if (!options.processorModuleUrl || !options.processorName) throw new Error("AudioWorklet processor URL and name are required.");
    this.#options = options;
  }

  get state(): AudioWorkletWasmHostState {
    return this.#state;
  }

  get supported(): boolean {
    return typeof this.#options.context.audioWorklet?.addModule === "function";
  }

  async start(): Promise<AudioWorkletNodeLike> {
    if (this.#state === "running" && this.#node) return this.#node;
    if (this.#state === "starting") throw new Error("AudioWorklet WASM host is already starting.");
    if (!this.supported) throw new Error("AudioWorklet is unavailable in this context.");
    this.#state = "starting";
    try {
      await this.#options.context.audioWorklet!.addModule(this.#options.processorModuleUrl);
      const node = this.#options.createNode(this.#options.context, this.#options.processorName, {
        processorOptions: { ...this.#options.processorOptions, wasm: this.#options.wasm }
      });
      node.connect(this.#options.context.destination);
      this.#node = node;
      this.#state = "running";
      return node;
    } catch (error) {
      this.#node = undefined;
      this.#state = "failed";
      throw error;
    }
  }

  control(message: unknown, transfer?: readonly Transferable[]): void {
    if (!this.#node || this.#state !== "running") throw new Error("AudioWorklet WASM host is not running.");
    this.#node.port.postMessage(message, transfer);
  }

  stop(): void {
    this.#node?.disconnect();
    this.#node = undefined;
    this.#state = "stopped";
  }
}

export function createAudioWorkletWasmHost(options: AudioWorkletWasmHostOptions): AudioWorkletWasmHost {
  return new AudioWorkletWasmHost(options);
}
