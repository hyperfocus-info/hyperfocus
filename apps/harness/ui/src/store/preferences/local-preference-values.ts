import type { ComposerReasoningStrength,ProviderBrand } from "@hyperfocus/ai-core/protocol";
import { clampLowerFirst,isFiniteNumber } from "@hyperfocus/utilities/math";
export { parseBoundedInteger as parseBoundedIntegerStorageValue, parseBoundedDecimal as parseBoundedDecimalStorageValue } from "@hyperfocus/utilities/math";
export { parseBooleanText as parseBooleanStorageValue } from "@hyperfocus/utilities/text";

export const EXPERIENCE_MODE_STORAGE_KEY = "pi-harness:experience-mode:v1";

export type HarnessExperienceMode = "simple" | "advanced";

export function parseProviderBrandStorageValue(value: string | null): ProviderBrand | undefined {
  return value === "gpt" || value === "gemini" || value === "claude" ? value : undefined;
}

export function parseExperienceModeStorageValue(value: string | null): HarnessExperienceMode | undefined {
  return value === "simple" || value === "advanced" ? value : undefined;
}

export function isComposerReasoningStrength(value: unknown): value is ComposerReasoningStrength {
  return value === "low" || value === "medium" || value === "high" || value === "extra-high";
}

export function parseReasoningStrengthStorageValue(value: string | null): ComposerReasoningStrength | undefined {
  return isComposerReasoningStrength(value) ? value : undefined;
}

export function clampPanelSize(value: unknown, fallback: number) {
  return isFiniteNumber(value) ? clampLowerFirst(value, 0.75, 5) : fallback;
}
