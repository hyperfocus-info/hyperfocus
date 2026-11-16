import { DEFAULT_GENERATOR_AI_SETTINGS, type GeneratorAiSettings } from "./generator-option-catalog";
import { normalizeGeneratorAiSettings } from "./generator-selector-options";

export const GENERATOR_AI_SETTINGS_STORAGE_KEY = "padpilot.generator.ai-settings";
export const AGENT_AI_SETTINGS_STORAGE_KEY = "padpilot.agent.ai-settings";
export const GENERATOR_AI_SETTINGS_CHANGED_EVENT = "padpilot-generator-ai-settings-changed";

export function loadGeneratorAiSettings() {
  try {
    const stored = window.localStorage.getItem(AGENT_AI_SETTINGS_STORAGE_KEY)
      ?? window.localStorage.getItem(GENERATOR_AI_SETTINGS_STORAGE_KEY)
      ?? "{}";
    return normalizeGeneratorAiSettings(JSON.parse(stored));
  } catch {
    return normalizeGeneratorAiSettings();
  }
}

export function saveGeneratorAiSettings(settings: GeneratorAiSettings) {
  try {
    window.localStorage.setItem(AGENT_AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    window.localStorage.setItem("padpilot.agent.provider", settings.provider);
    window.localStorage.setItem("padpilot.agent.model", settings.model);
    window.dispatchEvent(new CustomEvent(GENERATOR_AI_SETTINGS_CHANGED_EVENT, { detail: settings }));
  } catch {
    // UI-only preference; ignore storage failures in plugin WebView privacy modes.
  }
}

export function generatorAiSettingsLabel(settings = DEFAULT_GENERATOR_AI_SETTINGS) {
  return `${settings.provider} / ${settings.model}`;
}
