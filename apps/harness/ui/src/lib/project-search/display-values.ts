import { type ProjectSearchResult } from "@hyperfocus/ai-core/protocol";

export function inferFrameworks(rootPath: string) {
  const lower = rootPath.toLowerCase();
  return [
    lower.includes("react") ? "React" : undefined,
    lower.includes("solid") ? "Solid" : undefined,
    lower.includes("next") ? "Next" : undefined,
    lower.includes("bun") ? "Bun" : undefined
  ].filter((entry): entry is string => Boolean(entry));
}

export function getWorkspaceMatchKind(
  normalizedQuery: string,
  normalizedName: string,
  normalizedRootPath: string
): ProjectSearchResult["matchKind"] | undefined {
  if (!normalizedQuery) {
    return "substring";
  }

  if (normalizedRootPath === normalizedQuery) {
    return "exact";
  }

  if (normalizedRootPath.startsWith(normalizedQuery)) {
    return "path-prefix";
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    return "name-prefix";
  }

  if (normalizedName.includes(normalizedQuery) || normalizedRootPath.includes(normalizedQuery)) {
    return "substring";
  }

  return undefined;
}
