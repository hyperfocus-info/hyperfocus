
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

export function getFastModeDescription(enabled: boolean) {
  return enabled
    ? "Prefer lower-latency responses when current runtime and model support it."
    : "Use standard response path with default latency and reasoning behavior.";
}

export function getIdentityInitial(label: string) { return label.trim().slice(0, 1).toUpperCase() || "A"; }

export function formatModeIntentLabel(modeId: string, fallback: string) {
  switch (modeId) {
    case "ask":
      return "Answer only";
    case "plan":
      return "Plan first";
    case "implement":
      return "Make changes";
    case "debug":
      return "Debug a problem";
    case "review":
      return "Review changes";
    default:
      return fallback;
  }
}

export function getComposerLookup(draft: string, caret: number) {
  const tokenStart = Math.max(draft.lastIndexOf(" ", caret - 1), draft.lastIndexOf("\n", caret - 1), draft.lastIndexOf("\t", caret - 1)) + 1;
  const token = draft.slice(tokenStart, caret);
  if (token.length < 1 || token.includes(" ")) {
    return undefined;
  }
  if (token.startsWith("/") && token.length >= 1) {
    return { kind: "skill" as const, query: token.slice(1), start: tokenStart, end: caret };
  }
  if (token.startsWith("@") && token.length >= 1) {
    return { kind: "file" as const, query: token.slice(1), start: tokenStart, end: caret };
  }
  return undefined;
}

export function getSkillName(skillPath: string) {
  const parts = skillPath.replace(/\\/g, "/").split("/");
  const skillMdIndex = parts.lastIndexOf("SKILL.md");
  return skillMdIndex > 0 ? parts[skillMdIndex - 1]! : parts.at(-1) ?? skillPath;
}

export function getFileName(filePath: string) {
  return filePath.replace(/\\/g, "/").split("/").at(-1) ?? filePath;
}

export function getDirectoryName(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : ".";
}

export function formatElapsedDuration(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    return `${totalMinutes}m ${seconds}s`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${hours}h ${seconds}s`;
}

export function getReasoningStrengthDescription(strength: "low" | "medium" | "high" | "extra-high") {
  switch (strength) {
    case "low":
      return "Fastest pass with minimal internal deliberation.";
    case "medium":
      return "Balanced depth for routine implementation and review.";
    case "high":
      return "Default stronger reasoning for most coding work.";
    case "extra-high":
      return "Heaviest reasoning budget for hard debugging and planning.";
  }
}
