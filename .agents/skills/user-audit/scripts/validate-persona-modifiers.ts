#!/usr/bin/env bun

import { createPersona, loadPersonaDictionary } from "./persona-modifiers.ts";

if (process.argv.includes("--help")) {
  console.log("Usage: bun validate-persona-modifiers.ts\n\nValidate catalog schema, deterministic replay, axis exclusivity, and sampled coverage.");
  process.exit(0);
}

const dictionary = await loadPersonaDictionary();
if (dictionary.count !== 1000 || dictionary.entries.length !== 1000) throw new Error("Catalog must contain exactly 1,000 entries.");
if (!/^[a-f0-9]{64}$/.test(dictionary.catalogHash)) throw new Error("Catalog hash must be SHA-256.");
const ids = new Set();
const keys = new Set();
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
for (const modifier of dictionary.entries) {
  if (!/^\d{4}$/.test(modifier.id)) throw new Error(`Invalid modifier id: ${modifier.id}`);
  for (const field of ["key", "statement", "category", "axis", "reaction"]) {
    const value = modifier[field];
    if (typeof value !== "string" || value.trim().length === 0 || value.includes("undefined")) {
      throw new Error(`Modifier ${modifier.id} has an invalid ${field}.`);
    }
  }
  if (!slugPattern.test(modifier.category)) throw new Error(`Invalid modifier category: ${modifier.category}`);
  if (!slugPattern.test(modifier.axis)) throw new Error(`Invalid modifier axis: ${modifier.axis}`);
  if (ids.has(modifier.id)) throw new Error(`Duplicate modifier id: ${modifier.id}`);
  if (keys.has(modifier.key)) throw new Error(`Duplicate modifier key: ${modifier.key}`);
  ids.add(modifier.id);
  keys.add(modifier.key);
}

const mission = { surface: "engine-code", goal: "Build and verify a small platform game" };
const first = await createPersona({ ...mission, seed: "determinism-check", minModifiers: 3, maxModifiers: 8 });
const replay = await createPersona({ ...mission, seed: "determinism-check", minModifiers: 3, maxModifiers: 8 });
if (JSON.stringify(first) !== JSON.stringify(replay)) throw new Error("Same-seed persona replay is not deterministic.");
if (first.mission.surface !== mission.surface || first.mission.goal !== mission.goal) throw new Error("Persona mission was not preserved.");

await createPersona({ seed: "missing-mission" }).then(
  () => { throw new Error("Goal-less persona creation must fail."); },
  (error) => { if (!String(error).includes("surface is required")) throw error; }
);

const observedIds = new Set();
const observedProfiles = new Set();
for (let index = 0; index < 10_000; index += 1) {
  const persona = await createPersona({ ...mission, seed: `property-check-${index}`, minModifiers: 3, maxModifiers: 8 });
  if (persona.modifierCount < 3 || persona.modifierCount > 8 || persona.modifiers.length !== persona.modifierCount) {
    throw new Error(`Modifier count invariant failed for ${persona.seed}.`);
  }
  const axes = persona.modifiers.map((modifier) => modifier.axis);
  if (new Set(axes).size !== axes.length) throw new Error(`Exclusive-axis conflict in ${persona.seed}.`);
  const ids = persona.modifiers.map((modifier) => modifier.id);
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate modifier in ${persona.seed}.`);
  if (!persona.computerSkill || !persona.aiFamiliarity || !persona.catalogHash || persona.samplerVersion !== 1) {
    throw new Error(`Missing baseline or replay metadata in ${persona.seed}.`);
  }
  if (!axes.includes("computer-skill") || !axes.includes("ai-familiarity")) {
    throw new Error(`Missing required baseline modifiers in ${persona.seed}.`);
  }
  for (const id of ids) observedIds.add(id);
  observedProfiles.add(ids.join(","));
}

if (observedIds.size !== 1000) throw new Error(`Deterministic coverage sampled ${observedIds.size}/1000 modifiers.`);
if (observedProfiles.size < 9_900) throw new Error(`Insufficient profile diversity: ${observedProfiles.size}/10000 unique.`);

console.log(`Validated ${dictionary.entries.length} modifiers across 10,000 personas; every entry was sampled.`);
