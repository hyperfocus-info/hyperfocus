export interface SpeechTranscript {
  readonly text: string;
  readonly confidence: number;
  readonly final: boolean;
}

export interface SpeechRecognitionDriver {
  readonly supported: boolean;
  /** True only when the driver guarantees recognition stays on device. */
  readonly local: boolean;
  start(callbacks: { transcript(value: SpeechTranscript): void; error(error: unknown): void; end(): void }): void;
  stop(): void;
}

export interface SpeechIntentRule<Intent extends string> {
  readonly intent: Intent;
  readonly phrases: readonly string[];
}

export interface SpeechIntentMapperOptions<Intent extends string> {
  driver: SpeechRecognitionDriver;
  rules: readonly SpeechIntentRule<Intent>[];
  onIntent(intent: Intent, transcript: SpeechTranscript): void;
  onError?: (error: unknown) => void;
  minimumConfidence?: number;
  requireLocal?: boolean;
}

/** Exact normalized phrase mapper around an injected local speech driver. */
export class SpeechIntentMapper<Intent extends string> {
  readonly #driver: SpeechRecognitionDriver;
  readonly #phrases = new Map<string, Intent>();
  readonly #onIntent: SpeechIntentMapperOptions<Intent>["onIntent"];
  readonly #onError: ((error: unknown) => void) | undefined;
  readonly #minimumConfidence: number;
  readonly #requireLocal: boolean;
  #running = false;

  constructor(options: SpeechIntentMapperOptions<Intent>) {
    this.#driver = options.driver;
    this.#onIntent = options.onIntent;
    this.#onError = options.onError;
    this.#minimumConfidence = options.minimumConfidence ?? 0.5;
    this.#requireLocal = options.requireLocal ?? true;
    if (!Number.isFinite(this.#minimumConfidence) || this.#minimumConfidence < 0 || this.#minimumConfidence > 1) {
      throw new RangeError("minimumConfidence must be between zero and one.");
    }
    for (const rule of options.rules) {
      for (const phrase of rule.phrases) {
        const normalized = normalizePhrase(phrase);
        if (!normalized) throw new Error("speech intent phrases must not be empty.");
        if (this.#phrases.has(normalized)) throw new Error(`duplicate speech intent phrase: ${normalized}`);
        this.#phrases.set(normalized, rule.intent);
      }
    }
  }

  get available(): boolean {
    return this.#driver.supported && (!this.#requireLocal || this.#driver.local);
  }

  get running(): boolean { return this.#running; }

  start(): void {
    if (this.#running) return;
    if (!this.#driver.supported) throw new Error("speech recognition is unavailable.");
    if (this.#requireLocal && !this.#driver.local) throw new Error("speech recognition driver does not guarantee local execution.");
    this.#running = true;
    this.#driver.start({
      transcript: (value) => this.#receive(value),
      error: (error) => { try { this.#onError?.(error); } catch {} },
      end: () => { this.#running = false; }
    });
  }

  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    this.#driver.stop();
  }

  #receive(transcript: SpeechTranscript): void {
    if (!this.#running || !transcript.final || transcript.confidence < this.#minimumConfidence) return;
    const intent = this.#phrases.get(normalizePhrase(transcript.text));
    if (intent !== undefined) this.#onIntent(intent, transcript);
  }
}

function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function createSpeechIntentMapper<Intent extends string>(options: SpeechIntentMapperOptions<Intent>): SpeechIntentMapper<Intent> {
  return new SpeechIntentMapper(options);
}
