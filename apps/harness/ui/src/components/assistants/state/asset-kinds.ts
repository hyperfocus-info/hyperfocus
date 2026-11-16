

export const assistantAssetKinds = [
  "skill",
  "script",
  "mode",
  "background-template",
] as const;

export function isAssistantAssetKind(value: string | undefined): value is (typeof assistantAssetKinds)[number] {
  return value === "skill" || value === "script" || value === "mode" || value === "background-template";
}
