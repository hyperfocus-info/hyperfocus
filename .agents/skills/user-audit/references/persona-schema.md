# Simulated-user persona schema

## Purpose

Persona modifiers change how a simulated user reacts to observed stimuli. They are audit constraints, not predictions about demographic groups. Apply each modifier only through its stated reaction.

## Dictionary

`persona-modifiers.json` is a JSON dictionary keyed by a four-digit stable id. It must contain exactly 1,000 entries. Each entry has:

- `id`: stable four-digit dictionary key.
- `key`: stable human-readable trait and context key.
- `statement`: the simulated-user condition.
- `category`: broad coverage area used in audit reporting.
- `axis`: mutual-exclusion group. A persona receives at most one modifier from an axis.
- `reaction`: observable expectations to apply when evaluating UI stimuli.

The catalog is deterministically generated from 100 base traits and 10 situational contexts by `../scripts/generate-persona-modifiers.ts`. Change the generator source rather than hand-editing generated JSON.

## Sampling and replay

`../scripts/persona-modifiers.ts` validates the dictionary and samples without replacement using a versioned catalog and a seeded pseudorandom sequence. Defaults are three through eight modifiers, with the exact count chosen randomly for each persona.

A persona manifest records its id, seed, product mission, catalog version and SHA-256 hash, sampler version, randomized computer-skill and AI-familiarity baselines, selected count, and complete modifier records. A mission contains a nonempty `surface` and outcome-oriented `goal`. Persist that manifest before product interaction. The CDP runner writes it to `persona-run.json` and copies the persona into `results.json` and every flow. For a product-native browser or code-only run, use the sampler's `--out` flag before interaction.

Use the same seed for targeted before/after comparison. A fresh discovery run must use a new seed, because replay alone cannot reveal issues triggered by different reactions.

Use one persona per runner invocation. Multiple simulated users are separate seeded runs so each evidence bundle has one unambiguous profile.

The mission is part of the evidence but not the randomized persona identity. Reusing a seed preserves the same reaction lenses across before/after verification even when the goal wording becomes more precise.

## Quality rules

- Keep traits behaviorally distinct; do not pad the dictionary with synonyms.
- Describe accessibility needs and cognitive constraints respectfully and concretely.
- Do not infer ability, motivation, or knowledge from age, disability, income, or role beyond the explicit reaction.
- Preserve useful intersections such as blind plus keyboard-preferring. Use the same `axis` only for genuinely exclusive states.
- Every reaction must change what the audit checks, the severity it assigns, or the evidence it requires.
- Reject goal-less audit manifests. A sequence of interface actions is evidence collection, not the user's goal.
