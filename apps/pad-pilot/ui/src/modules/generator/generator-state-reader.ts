import { requireText } from "@hyperfocus/utilities/text";
import { optional, readList, readObject, requireBoolean, requireNumber, requireOneOf } from "@hyperfocus/utilities/validation";
import type { GeneratorDashboardState } from "./components/generator-dashboard";
import { GENERATOR_LENGTH_OPTIONS } from "./utils/generator-option-catalog";

const fieldReaders = {
  genre: requireText, mood: requireText, era: requireText, complexity: requireText, scaleKey: requireText,
};
const flagReaders = {
  genre: requireBoolean, mood: requireBoolean, era: requireBoolean, complexity: requireBoolean, scaleKey: requireBoolean,
};
const readDashboard = (value: unknown): GeneratorDashboardState => readObject(value, {
  fields: value => readObject(value, {
    ...fieldReaders, creativity: requireNumber, density: requireNumber, humanize: requireNumber,
    lengthBars: value => requireOneOf(value, GENERATOR_LENGTH_OPTIONS.map(option => option.value)),
    notes: requireText, temperature: requireNumber,
  }),
  locked: value => readObject(value, {
    ...flagReaders, creativity: requireBoolean, temperature: requireBoolean, lengthBars: requireBoolean,
    density: requireBoolean, humanize: requireBoolean,
  }),
  manualFields: value => readObject(value, flagReaders),
  queries: value => readObject(value, fieldReaders),
  rerollSeed: requireNumber,
  suggestedFields: value => readObject(value, flagReaders),
});

export function readGeneratorState(value: unknown) {
  return readObject(value, {
    dashboard: readDashboard,
    midiDrawerOpen: optional(requireBoolean),
    statusDrawerOpen: optional(requireBoolean),
    run: optional(value => readObject(value, {
      logs: value => readList(value, requireText), progress: requireNumber,
      status: value => requireOneOf(value, ["error", "idle", "loading", "ready"] as const),
    })),
    template: optional(value => value),
  });
}

export function readGeneratorView(value: unknown) {
  return readObject(value, { midiDrawerOpen: requireBoolean, statusDrawerOpen: requireBoolean });
}
