import { asRecord } from "@hyperfocus/utilities/records";
export type FxUiPreferences = {
  displayStereoMeters: boolean;
  displayNodeMeters: boolean;
  displayChainMeters: boolean;
  fontScale?: "sm" | "md" | "lg";
};

export const FX_UI_PREFERENCES_KEY = "padpilot.fx.preferences.v1";

export const DEFAULT_FX_UI_PREFERENCES: FxUiPreferences = {
  displayStereoMeters: true,
  displayNodeMeters: false,
  displayChainMeters: false,
};
const fontScaleOptions = ["sm", "md", "lg"] as const;

export function normalizeFxUiPreferences(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_FX_UI_PREFERENCES };
  }

  const candidate = asRecord(value);
  const fontScale = fontScaleOptions.find(
    (option) => option === candidate.fontScale
  );
  return {
    displayStereoMeters:
      typeof candidate.displayStereoMeters === "boolean"
        ? candidate.displayStereoMeters
        : DEFAULT_FX_UI_PREFERENCES.displayStereoMeters,
    displayNodeMeters:
      typeof candidate.displayNodeMeters === "boolean"
        ? candidate.displayNodeMeters
        : DEFAULT_FX_UI_PREFERENCES.displayNodeMeters,
    displayChainMeters:
      typeof candidate.displayChainMeters === "boolean"
        ? candidate.displayChainMeters
        : DEFAULT_FX_UI_PREFERENCES.displayChainMeters,
    ...(fontScale ? { fontScale } : {}),
  };
}

export function loadFxUiPreferences(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(FX_UI_PREFERENCES_KEY);
    if (!raw) {
      return { ...DEFAULT_FX_UI_PREFERENCES };
    }

    return normalizeFxUiPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_FX_UI_PREFERENCES };
  }
}

export function persistFxUiPreferences(
  preferences: FxUiPreferences,
  storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage,
) {
  try {
    storage?.setItem(FX_UI_PREFERENCES_KEY, JSON.stringify(normalizeFxUiPreferences(preferences)));
  } catch {
    // Ignore storage failures for UI-only preferences.
  }
}
