const favoritePresetsStorageKey = "padpilot.fx.favorite-presets";

export function loadFavoritePresetIds() {
  try {
    const raw = window.localStorage.getItem(favoritePresetsStorageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const favoritePresetIds: string[] = [];
    for (const value of parsed) {
      if (typeof value === "string") {
        favoritePresetIds.push(value);
      }
    }
    return favoritePresetIds;
  } catch {
    return [];
  }
}

export function persistFavoritePresetIds(ids: string[]) {
  try {
    window.localStorage.setItem(favoritePresetsStorageKey, JSON.stringify(ids));
  } catch {
    // Ignore storage failures for non-critical UI preferences.
  }
}
