import { requireText } from "@hyperfocus/utilities/text";
import { readObject, requireNumber, requireOneOf } from "@hyperfocus/utilities/validation";

export function readPerformanceState(value: unknown) {
  return readObject(value, {
    root: value => requireOneOf(value, ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const),
    scale: value => requireOneOf(value, ["major", "minor"] as const),
    octave: requireNumber,
    profileName: requireText,
    currentModifier: requireNumber,
  });
}
