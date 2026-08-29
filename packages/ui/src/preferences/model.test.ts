import { describe, expect, test } from "bun:test";
import { filterPreferences, normalizePreferenceValue, normalizePreferenceValues, type PreferenceDefinition } from "./model";

const definitions: PreferenceDefinition[] = [
  { id: "theme", sectionId: "appearance", scope: "shared-user", title: "Theme", description: "Application color theme", keywords: ["dark", "light"], control: { kind: "select", options: [{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }] }, defaultValue: "dark" },
  { id: "volume", sectionId: "project", scope: "project", title: "Game volume", description: "Portable audio level", control: { kind: "range", minimum: 0, maximum: 1, step: 0.1 }, defaultValue: 0.8 },
];

describe("preference registry", () => {
  test("searches metadata and scope from one definition source", () => {
    expect(filterPreferences(definitions, "light").map((item) => item.id)).toEqual(["theme"]);
    expect(filterPreferences(definitions, "portable project").map((item) => item.id)).toEqual(["volume"]);
  });

  test("normalizes controls before a host persists them", () => {
    expect(normalizePreferenceValue(definitions[1], 9)).toBe(1);
    expect(normalizePreferenceValues(definitions, { theme: "unknown", volume: -4 })).toEqual({ theme: "dark", volume: 0 });
  });
});
