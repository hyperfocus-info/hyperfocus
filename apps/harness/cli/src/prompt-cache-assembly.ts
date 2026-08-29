export type CacheableUserBlockKind = "workspace-memory" | "uploadthing-attachment" | "frozen-plan";

export type CacheableUserBlock = {
  kind: CacheableUserBlockKind;
  title: string;
  text: string;
};

export type StableJsonObject = { [key: string]: StableJsonValue };
export type StableJsonValue = string | number | boolean | null | undefined | StableJsonValue[] | StableJsonObject;

export function stableCloneJson(value: unknown): StableJsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) => stableCloneJson(entry));
  }

  if (isRecord(value)) {
    const output: StableJsonObject = {};
    for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
      output[key] = stableCloneJson(value[key]);
    }
    return output;
  }

  if (value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  throw new TypeError(`Stable JSON clone does not support ${typeof value}`);
}

export function stableCloneJsonObject(value: unknown): StableJsonObject {
  const cloned = stableCloneJson(value);
  if (!isRecord(cloned)) throw new TypeError("Stable JSON object clone requires an object");
  return cloned;
}

export function stableStringifyJson(value: unknown) {
  return JSON.stringify(stableCloneJson(value));
}

export function formatCacheableUserBlocks(blocks: CacheableUserBlock[]) {
  return blocks
    .map((block) => [`## ${block.title}`, `Kind: ${block.kind}`, "", block.text.trim()].join("\n"))
    .join("\n\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
