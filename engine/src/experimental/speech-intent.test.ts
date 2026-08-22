import { expect, test } from "bun:test";
import { createSpeechIntentMapper, type SpeechRecognitionDriver, type SpeechTranscript } from "./speech-intent.ts";

test("speech intent mapper emits only final confident normalized local commands", () => {
  let callbacks!: { transcript(value: SpeechTranscript): void; error(error: unknown): void; end(): void };
  const driver: SpeechRecognitionDriver = { supported: true, local: true, start(value) { callbacks = value; }, stop() {} };
  const intents: string[] = [];
  const mapper = createSpeechIntentMapper({
    driver, minimumConfidence: 0.7,
    rules: [{ intent: "heal", phrases: ["Heal!", "use potion"] }],
    onIntent(intent) { intents.push(intent); }
  });
  mapper.start();
  callbacks.transcript({ text: " HEAL ", confidence: 0.9, final: true });
  callbacks.transcript({ text: "use potion", confidence: 0.2, final: true });
  callbacks.transcript({ text: "heal", confidence: 1, final: false });
  expect(intents).toEqual(["heal"]);
});

test("speech intent mapper refuses non-local drivers by default", () => {
  const driver: SpeechRecognitionDriver = { supported: true, local: false, start() {}, stop() {} };
  const mapper = createSpeechIntentMapper({ driver, rules: [], onIntent() {} });
  expect(mapper.available).toBe(false);
  expect(() => mapper.start()).toThrow("local execution");
});
