export function formatCapabilityTag(tag: string) {
  if (tag === "expensive") return "Higher usage";
  if (tag === "long-context") return "Long context";
  return tag;
}

export function getComposerLookupOptionId(index: number) {
  return `chat-composer-lookup-option-${index}`;
}

export function formatTokenCount(value: number | undefined) {
  if (value === undefined) return "?";
  if (value < 1_000) return String(value);
  if (value < 1_000_000) {
    const scaled = value / 1_000;
    return `${scaled >= 100 ? Math.round(scaled) : Number(scaled.toFixed(1))}k`;
  }
  const scaled = value / 1_000_000;
  return `${scaled >= 100 ? Math.round(scaled) : Number(scaled.toFixed(1))}m`;
}
