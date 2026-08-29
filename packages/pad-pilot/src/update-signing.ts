export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export function compareUpdaterStrings(left: string, right: string) {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  return 0;
}

type Canonicalizer = (value: JsonValue) => string;

const canonicalize: Canonicalizer = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .sort(([left], [right]) => compareUpdaterStrings(left, right));
    for (let index = 1; index < entries.length; index += 1) {
      const previous = entries[index - 1];
      const current = entries[index];
      if (previous && current && compareUpdaterStrings(previous[0], current[0]) === 0) {
        throw new Error(`Signed manifest contains case-insensitive duplicate keys: ${previous[0]}, ${current[0]}`);
      }
    }
    return `{${entries
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export function canonicalizeSignedManifestPayload(payload: JsonValue) {
  return canonicalize(payload);
}
