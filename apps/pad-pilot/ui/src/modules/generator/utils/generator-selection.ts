export function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededUnit(seed: string, index: number) {
  const hash = hashString(`${seed}:${index}`);
  return hash / 0xffffffff;
}

export function pickSeeded<T>(items: readonly T[], seed: string, index: number) {
  return items[Math.floor(seededUnit(seed, index) * items.length)] ?? items[0];
}

export const seededScaleRoots = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;

export const canonicalScaleRoots: Record<string, (typeof seededScaleRoots)[number]> = {
  A: "A",
  "A#": "Bb",
  AB: "Ab",
  B: "B",
  BB: "Bb",
  C: "C",
  "C#": "C#",
  CB: "B",
  D: "D",
  "D#": "Eb",
  DB: "C#",
  E: "E",
  EB: "Eb",
  F: "F",
  "F#": "F#",
  FB: "E",
  G: "G",
  "G#": "Ab",
  GB: "F#",
};

export const semitoneByRoot: Record<(typeof seededScaleRoots)[number], number> = {
  A: 9,
  Ab: 8,
  B: 11,
  Bb: 10,
  C: 0,
  "C#": 1,
  D: 2,
  E: 4,
  Eb: 3,
  F: 5,
  "F#": 6,
  G: 7,
};

export function canonicalScaleRootName(value: string | undefined) {
  return canonicalScaleRoots[value?.trim().toUpperCase() ?? ""] ?? "C";
}

export function scaleRootName(scaleKey: string | undefined, seed: string) {
  const trimmed = scaleKey?.trim() ?? "";
  const legacyKeyMatch = /^([A-G](?:#|b)?)(?:\s+|$)/i.exec(trimmed);
  if (legacyKeyMatch?.[1]) {
    return canonicalScaleRootName(legacyKeyMatch[1]);
  }
  return seededScaleRoots[hashString(`${seed}:${trimmed}:root`) % seededScaleRoots.length] ?? "C";
}

export function scaleRoot(scaleKey: string | undefined, seed: string) {
  let root = 60 + semitoneByRoot[scaleRootName(scaleKey, seed)];
  while (root > 66) root -= 12;
  while (root < 57) root += 12;
  return root;
}
