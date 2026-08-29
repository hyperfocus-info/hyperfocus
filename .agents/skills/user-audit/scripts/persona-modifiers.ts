#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dictionaryPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "references", "persona-modifiers.json");
let dictionaryPromise;

/** Load and validate the canonical 1,000-entry modifier dictionary. */
export async function loadPersonaDictionary() {
  dictionaryPromise ??= readFile(dictionaryPath, "utf8").then((source) => ({
    ...JSON.parse(source),
    catalogHash: createHash("sha256").update(source).digest("hex")
  }));
  const dictionary = await dictionaryPromise;
  const entries = Object.values(dictionary.modifiers ?? {});
  if (dictionary.count !== 1000 || entries.length !== 1000) {
    throw new Error(`Expected exactly 1000 persona modifiers, received ${entries.length}.`);
  }
  const keys = new Set();
  for (const modifier of entries) {
    if (!modifier.id || !modifier.key || !modifier.statement || !modifier.category || !modifier.axis || !modifier.reaction) {
      throw new Error(`Malformed persona modifier: ${JSON.stringify(modifier)}`);
    }
    if (keys.has(modifier.key)) throw new Error(`Duplicate persona modifier key: ${modifier.key}`);
    keys.add(modifier.key);
  }
  return { ...dictionary, entries };
}

export async function loadPersonaModifiers() {
  return (await loadPersonaDictionary()).entries;
}

/** Select a reproducible random persona while preventing contradictory axis choices. */
export async function createPersona(options = {}) {
  const dictionary = await loadPersonaDictionary();
  const modifiers = dictionary.entries;
  const mission = {
    surface: requiredText(options.surface, "surface"),
    goal: requiredText(options.goal, "goal")
  };
  const minModifiers = integerOption(options.minModifiers, 3, "minModifiers");
  const maxModifiers = integerOption(options.maxModifiers, 8, "maxModifiers");
  if (minModifiers < 1 || maxModifiers < minModifiers || maxModifiers > 25) {
    throw new Error("Persona modifier range must satisfy 1 <= minModifiers <= maxModifiers <= 25.");
  }
  const seed = String(options.seed ?? crypto.randomUUID());
  const random = seededRandom(seed);
  const modifierCount = randomInteger(random, minModifiers, maxModifiers);
  const shuffled = [...modifiers];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInteger(random, 0, index);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  const computerModifier = shuffled.find((modifier) => modifier.axis === "computer-skill");
  const aiModifier = shuffled.find((modifier) => modifier.axis === "ai-familiarity");
  if (!computerModifier || !aiModifier) throw new Error("Catalog must provide computer-skill and ai-familiarity modifiers.");
  const selected = [computerModifier, aiModifier];
  const usedAxes = new Set(selected.map((modifier) => modifier.axis));
  for (const modifier of shuffled) {
    if (usedAxes.has(modifier.axis)) continue;
    selected.push(modifier);
    usedAxes.add(modifier.axis);
    if (selected.length === modifierCount) break;
  }
  if (selected.length !== modifierCount) throw new Error(`Unable to select ${modifierCount} compatible modifiers.`);
  const computerSkill = mapBaseline(computerModifier.key, {
    "computer-new": "beginner",
    "computer-basic": "intermediate",
    "computer-expert": "advanced"
  });
  const aiFamiliarity = mapBaseline(aiModifier.key, {
    "ai-new": "beginner",
    "ai-casual": "intermediate",
    "ai-expert": "advanced"
  });
  const identity = createHash("sha256").update(`${dictionary.catalogHash}:${seed}`).digest("hex").slice(0, 16);
  return {
    id: `persona-${identity}`,
    seed,
    catalogVersion: dictionary.version,
    catalogHash: dictionary.catalogHash,
    samplerVersion: 1,
    mission,
    computerSkill,
    aiFamiliarity,
    modifierCount,
    modifiers: selected
  };
}

function mapBaseline(key, values) {
  const trait = key.split(".")[0];
  const result = values[trait];
  if (!result) throw new Error(`Unknown baseline persona trait: ${trait}`);
  return result;
}

function integerOption(value, fallback, label) {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(result)) throw new Error(`${label} must be an integer.`);
  return result;
}

function requiredText(value, label) {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`${label} is required for a goal-driven persona run.`);
  return result;
}

function randomInteger(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function hashSeed(seed) {
  let value = 2166136261;
  for (const character of seed) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function seededRandom(seed) {
  let state = hashSeed(seed) || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: bun persona-modifiers.ts --surface <product> --goal <outcome> [--seed <text>] [--min-modifiers <n>] [--max-modifiers <n>] [--out <file>] [--json]");
    process.exit(0);
  }
  const readArg = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const persona = await createPersona({
    surface: readArg("--surface"),
    goal: readArg("--goal"),
    seed: readArg("--seed"),
    minModifiers: readArg("--min-modifiers"),
    maxModifiers: readArg("--max-modifiers")
  });
  const outPath = readArg("--out");
  if (outPath) {
    const resolvedOut = path.resolve(outPath);
    await mkdir(path.dirname(resolvedOut), { recursive: true });
    await writeFile(resolvedOut, `${JSON.stringify(persona, null, 2)}\n`);
  }
  if (args.includes("--json")) console.log(JSON.stringify(persona, null, 2));
  else {
    console.log(`${persona.id} | surface=${persona.mission.surface} | seed=${persona.seed} | modifiers=${persona.modifierCount}`);
    console.log(`Goal: ${persona.mission.goal}`);
    for (const modifier of persona.modifiers) console.log(`- ${modifier.statement}: ${modifier.reaction}`);
  }
}
