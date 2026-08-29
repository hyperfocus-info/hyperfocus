export type PreferenceScope = "shared-user" | "app-user" | "project" | "session";
export type PreferenceValue = string | number | boolean;

export type PreferenceOption = {
  value: string;
  label: string;
  description?: string;
};

export type PreferenceControl =
  | { kind: "toggle" }
  | { kind: "text"; placeholder?: string }
  | { kind: "select"; options: readonly PreferenceOption[] }
  | { kind: "segmented"; options: readonly PreferenceOption[] }
  | { kind: "range"; minimum: number; maximum: number; step: number; unit?: string };

export type PreferenceDefinition = {
  id: string;
  sectionId: string;
  scope: PreferenceScope;
  title: string;
  description: string;
  keywords?: readonly string[];
  control: PreferenceControl;
  defaultValue: PreferenceValue;
  advanced?: boolean;
};

export type PreferenceSectionDefinition = {
  id: string;
  title: string;
  description: string;
};

export type PreferenceValues = Record<string, PreferenceValue>;

export function filterPreferences(definitions: readonly PreferenceDefinition[], query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...definitions];
  return definitions.filter((definition) => {
    const haystack = [definition.title, definition.description, definition.scope, ...(definition.keywords ?? [])].join(" ").toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function normalizePreferenceValue(definition: PreferenceDefinition, value: unknown): PreferenceValue {
  if (definition.control.kind === "toggle") return typeof value === "boolean" ? value : Boolean(definition.defaultValue);
  if (definition.control.kind === "range") {
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(number)) return definition.defaultValue;
    return Math.min(definition.control.maximum, Math.max(definition.control.minimum, number));
  }
  if (definition.control.kind === "select" || definition.control.kind === "segmented") {
    const text = String(value);
    return definition.control.options.some((option) => option.value === text) ? text : definition.defaultValue;
  }
  return typeof value === "string" ? value : String(definition.defaultValue);
}

export function normalizePreferenceValues(definitions: readonly PreferenceDefinition[], values: Partial<PreferenceValues>) {
  const normalized: PreferenceValues = {};
  for (const definition of definitions) {
    normalized[definition.id] = normalizePreferenceValue(definition, values[definition.id]);
  }
  return normalized;
}
