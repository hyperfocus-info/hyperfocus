

export const providerKeys = ["openai", "google", "anthropic", "github", "other"] as const;

export type ProviderKey = (typeof providerKeys)[number];

export function providerForModel(modelId: string): ProviderKey {
  const prefix = modelId.split("/", 1)[0]?.toLowerCase();
  if (prefix === "openai") return "openai";
  if (prefix === "google") return "google";
  if (prefix === "anthropic") return "anthropic";
  if (prefix === "github" || prefix === "copilot") return "github";
  return "other";
}

export function readCapacity(value: string | undefined, fallback: number, label: string) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 4_096) {
    throw new RangeError(`${label} must be an integer from 1 to 4096`);
  }
  return parsed;
}

export function readRateLimit(value: string | undefined, fallback: number, label: string) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new RangeError(`${label} must be a positive safe integer`);
  return parsed;
}
