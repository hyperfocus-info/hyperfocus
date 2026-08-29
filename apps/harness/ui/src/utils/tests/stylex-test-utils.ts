export function readStylexRules(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }
  const rules: unknown = Reflect.get(metadata, "stylex");
  return Array.isArray(rules) ? rules : [];
}
