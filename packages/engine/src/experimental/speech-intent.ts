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

/** Creates an exact normalized phrase mapper around an injected local speech driver. */
export function createSpeechIntentMapper<Intent extends string>(options: SpeechIntentMapperOptions<Intent>) {
    const phrases = new Map<string, Intent>();
    const minimumConfidence = options.minimumConfidence ?? 0.5;
    const requireLocal = options.requireLocal ?? true;
    let running = false;
    if (!Number.isFinite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 1) {
      throw new RangeError("minimumConfidence must be between zero and one.");
    }
    for (const rule of options.rules) {
      for (const phrase of rule.phrases) {
        const normalized = normalizePhrase(phrase);
        if (!normalized) throw new Error("speech intent phrases must not be empty.");
        if (phrases.has(normalized)) throw new Error(`duplicate speech intent phrase: ${normalized}`);
        phrases.set(normalized, rule.intent);
      }
    }
    const receive = (transcript: SpeechTranscript) => {
      if (!running || !transcript.final || transcript.confidence < minimumConfidence) return;
      const intent = phrases.get(normalizePhrase(transcript.text));
      if (intent !== undefined) options.onIntent(intent, transcript);
    };
    return Object.freeze({
      get available() { return options.driver.supported && (!requireLocal || options.driver.local); },
      get running() { return running; },
      start(): void {
        if (running) return;
        if (!options.driver.supported) throw new Error("speech recognition is unavailable.");
        if (requireLocal && !options.driver.local) throw new Error("speech recognition driver does not guarantee local execution.");
        running = true;
        options.driver.start({
          transcript: receive,
          error: (error) => { try { options.onError?.(error); } catch {} },
          end: () => { running = false; }
        });
      },
      stop(): void {
        if (!running) return;
        running = false;
        options.driver.stop();
      },
    });
}

export type SpeechIntentMapper<Intent extends string> = ReturnType<typeof createSpeechIntentMapper<Intent>>;

function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
