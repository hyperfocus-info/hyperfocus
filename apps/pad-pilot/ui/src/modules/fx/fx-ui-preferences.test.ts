import { describe, expect, it, mock } from "bun:test";
import {
  DEFAULT_FX_UI_PREFERENCES,
  FX_UI_PREFERENCES_KEY,
  loadFxUiPreferences,
  persistFxUiPreferences,
} from "./fx-ui-preferences";

describe("Fx UI preferences", () => {
  it("falls back to defaults for missing or invalid storage payloads", () => {
    expect(loadFxUiPreferences({ getItem: () => null })).toEqual(DEFAULT_FX_UI_PREFERENCES);
    expect(loadFxUiPreferences({ getItem: () => "{not-json" })).toEqual(DEFAULT_FX_UI_PREFERENCES);
    expect(loadFxUiPreferences({ getItem: () => JSON.stringify({ displayNodeMeters: "bad" }) })).toEqual(DEFAULT_FX_UI_PREFERENCES);
  });

  it("loads persisted values and preserves optional font scale when valid", () => {
    const result = loadFxUiPreferences({
      getItem: () =>
        JSON.stringify({
          displayStereoMeters: false,
          displayNodeMeters: true,
          displayChainMeters: true,
          fontScale: "lg",
        }),
    });

    expect(result).toEqual({
      displayStereoMeters: false,
      displayNodeMeters: true,
      displayChainMeters: true,
      fontScale: "lg",
    });
  });

  it("persists normalized preferences with the module storage key", () => {
    const setItem = mock(() => undefined);

    persistFxUiPreferences(
      {
        displayStereoMeters: false,
        displayNodeMeters: true,
        displayChainMeters: false,
      },
      { setItem },
    );

    expect(setItem).toHaveBeenCalledWith(
      FX_UI_PREFERENCES_KEY,
      JSON.stringify({
        displayStereoMeters: false,
        displayNodeMeters: true,
        displayChainMeters: false,
      }),
    );
  });
});
