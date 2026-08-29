export type SectionedSerializerMetrics = {
  sectionSerializations: number;
};

export type SectionedSerializer<Project extends object> = {
  serialize(project: Project, dirtySections?: Iterable<string>): string;
  invalidate(): void;
  readonly metrics: Readonly<SectionedSerializerMetrics>;
};

/** Caches stable top-level JSON sections so localized editor deltas do not stringify the whole project. */
export function createSectionedSerializer<Project extends object>(): SectionedSerializer<Project> {
  const sections = new Map<string, string>();
  const metrics: SectionedSerializerMetrics = { sectionSerializations: 0 };

  return {
    get metrics() { return metrics; },
    invalidate() { sections.clear(); },
    serialize(project, dirtySections) {
      const keys = Object.keys(project).sort();
      const dirty = sections.size && dirtySections ? new Set(dirtySections) : undefined;
      for (const key of keys) {
        if (dirty && !dirty.has(key) && sections.has(key)) continue;
        sections.set(key, JSON.stringify(sortJsonKeys(Reflect.get(project, key)), null, 2));
        metrics.sectionSerializations += 1;
      }
      for (const key of sections.keys()) if (!(key in project)) sections.delete(key);
      const body = keys.map((key) => `  ${JSON.stringify(key)}: ${indentValue(sections.get(key)!)}`).join(",\n");
      return `{\n${body}\n}\n`;
    }
  };
}

function indentValue(value: string) {
  return value.replaceAll("\n", "\n  ");
}

export function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort()
    .map((key) => [key, sortJsonKeys(Reflect.get(value, key))]));
}
