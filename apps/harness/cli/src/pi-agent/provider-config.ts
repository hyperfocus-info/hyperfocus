import { type PiApiKeyProvider } from "../pi-agent-adapter";

export function isPiApiKeyProvider(value: string): value is PiApiKeyProvider {
  return value === "openai" || value === "google" || value === "anthropic";
}
