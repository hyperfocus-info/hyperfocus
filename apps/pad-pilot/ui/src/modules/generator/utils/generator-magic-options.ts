import { MagicProfile, matchingMagicProfiles, ScoreTable, MagicBoosts, MagicAdvancedTargets, MagicFactor, profileInfluence, magicInteractionFactors, advancedProfileTargets } from "./generator-magic-profiles";
import { SearchableComboboxItem } from "../../../components/elements/searchable-combobox";
import { clamp01Or } from "../../../utils/math";
import { GeneratorFieldKey, GeneratorRangeKey, GeneratorLengthBars, GeneratorAdvancedKey, GeneratorLockKey, GeneratorDashboardFields, GeneratorFieldLocks, GeneratorMagicOptions, GENERATOR_FIELD_KEYS, GENERATOR_RANGE_KEYS, GENERATOR_ADVANCED_KEYS, GENERATOR_LENGTH_OPTIONS, DEFAULT_GENERATOR_ADVANCED_SETTINGS, GENERATOR_OPTION_GROUPS } from "./generator-option-catalog";
import { normalizeGeneratorScaleMode, normalizeGeneratorLengthBars } from "./generator-selector-options";

export function randomUnit(rng: () => number) {
  const value = rng();
  return Number.isFinite(value) ? Math.max(0, Math.min(0.999999, value)) : 0;
}

export function weightedPick<T>(items: readonly T[], weights: readonly number[], rng: () => number) {
  const total = weights.reduce((sum, value) => sum + Math.max(0.001, value), 0);
  let cursor = randomUnit(rng) * total;
  for (const [index, item] of items.entries()) {
    cursor -= Math.max(0.001, weights[index] ?? 0);
    if (cursor < 0) {
      return item;
    }
  }
  return items[0];
}

export function weightedLabelPick(items: SearchableComboboxItem[], scores: Record<string, number>, chaos: number, rng: () => number) {
  const bucketWeight = 1 - chaos * 0.8;
  const weights = items.map((item) => 1 + Math.max(0, scores[item.label] ?? 0) * bucketWeight);
  return weightedPick(items, weights, rng)?.label ?? items[0]?.label ?? "";
}

export function softmaxPick(items: SearchableComboboxItem[], scores: Record<string, number>, temperature: number, rng: () => number, avoid?: string) {
  const pool = avoid ? items.filter((item) => item.label !== avoid) : items;
  const nextItems = pool.length > 0 ? pool : items;
  const logits = nextItems.map((item) => scores[item.label] ?? 0);
  const maxLogit = Math.max(...logits, 0);
  const weights = logits.map((score) => Math.exp((score - maxLogit) / Math.max(0.08, temperature)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = randomUnit(rng) * total;
  for (const [index, item] of nextItems.entries()) {
    cursor -= weights[index] ?? 0;
    if (cursor < 0) {
      return item.label;
    }
  }
  return nextItems[0]?.label ?? "";
}

export function createScoreTable() {
  return {
    complexity: {},
    era: {},
    genre: {},
    mood: {},
    scaleKey: {},
  } satisfies ScoreTable;
}

export function normalizedFieldValue(key: GeneratorFieldKey, value: string) {
  return key === "scaleKey" ? normalizeGeneratorScaleMode(value) : value.trim();
}

export function addScore(scores: ScoreTable, key: GeneratorFieldKey, label: string, value: number) {
  if (!GENERATOR_OPTION_GROUPS[key].some((item) => item.label === label)) {
    return;
  }
  scores[key][label] = (scores[key][label] ?? 0) + value;
}

export function applyProfileScores(scores: ScoreTable, sourceKey: GeneratorFieldKey, profile: MagicProfile, strength = 10) {
  for (const targetKey of GENERATOR_FIELD_KEYS) {
    const influence = profileInfluence[sourceKey][targetKey];
    for (const [index, label] of profile[targetKey].entries()) {
      addScore(scores, targetKey, label, Math.max(0.3, strength * influence - index * 0.45));
    }
  }
}

export function applyBoosts(scores: ScoreTable, boosts: MagicBoosts, strength = 1) {
  for (const key of GENERATOR_FIELD_KEYS) {
    const bucket = boosts[key];
    if (!bucket) {
      continue;
    }
    for (const [label, value] of Object.entries(bucket)) {
      addScore(scores, key, label, value * strength);
    }
  }
}

export function factorMatches(input: GeneratorDashboardFields, factor: MagicFactor) {
  for (const key of GENERATOR_FIELD_KEYS) {
    const expected = factor.match[key];
    if (expected && normalizedFieldValue(key, input[key]) !== expected) {
      return false;
    }
  }
  return true;
}

export function riskStrength(chaos: number, risk: number | undefined) {
  if (risk === undefined) {
    return 1;
  }
  return clamp01Or((chaos - risk) / Math.max(0.01, 1 - risk), 0);
}

export function allPromptFieldsEmpty(input: GeneratorDashboardFields) {
  return !input.genre && !input.mood && !input.era && !input.complexity && !input.scaleKey && !input.notes.trim();
}

export function applySelectedValueScores(input: GeneratorDashboardFields, scores: ScoreTable) {
  for (const key of GENERATOR_FIELD_KEYS) {
    const value = normalizedFieldValue(key, input[key]);
    if (!value) {
      continue;
    }
    const strength = key === "genre" ? 12 : key === "mood" ? 7 : 8;
    for (const profile of matchingMagicProfiles(key, value)) {
      applyProfileScores(scores, key, profile, strength);
    }
  }
}

export function applyInteractionScores(input: GeneratorDashboardFields, scores: ScoreTable, chaos: number) {
  for (const factor of magicInteractionFactors) {
    if (factorMatches(input, factor)) {
      applyBoosts(scores, factor.boosts, riskStrength(chaos, factor.risk));
    }
  }
}

export function applyEmptyFallback(input: GeneratorDashboardFields, scores: ScoreTable, chaos: number) {
  const empty = allPromptFieldsEmpty(input);
  if (!empty) {
    return;
  }
  const swing = 1 + chaos * 0.45;
  applyBoosts(scores, {
    complexity: { "Complex Polyphonic": 18, "Drop Template": 10, "Syncopated Groove": 12 },
    era: { "Retro Future": 24, "Rave 1992": 10, "Synth Pop 1984": 12 },
    genre: { "Liquid Drum & Bass": 24, "Modern Trap": 12, "Retro Future": 10, Synthwave: 22 },
    mood: { Aggressive: 16, Bold: 9, Euphoric: 24, Urgent: 12 },
    scaleKey: { Dorian: 18, Lydian: 12, "Minor Pentatonic": 10 },
  }, swing);
}

export function buildScores(input: GeneratorDashboardFields, options: GeneratorMagicOptions = {}) {
  const chaos = clamp01Or(options.chaos, 0.18);
  const scores = createScoreTable();
  applySelectedValueScores(input, scores);
  applyInteractionScores(input, scores, chaos);
  applyEmptyFallback(input, scores, chaos);
  return scores;
}

export function weightedScore(value: number | undefined, chaos: number) {
  return (value ?? 0) * (1 - chaos * 0.8);
}

export function rerollPoolSize(key: GeneratorFieldKey, scores: Record<string, number>, chaos: number) {
  const scoredCount = GENERATOR_OPTION_GROUPS[key].filter((item) => (scores[item.label] ?? 0) > 0).length;
  const musicalBucketSize = Math.max(4, scoredCount);
  return Math.min(
    GENERATOR_OPTION_GROUPS[key].length,
    musicalBucketSize + Math.round(chaos * (GENERATOR_OPTION_GROUPS[key].length - musicalBucketSize)),
  );
}

export function scorePick(key: GeneratorFieldKey, scores: ScoreTable, chaos: number, rng: () => number, avoid?: string) {
  const jitter = 0.45 + chaos * 7.5;
  const poolSize = rerollPoolSize(key, scores[key], chaos);
  const nextScores = GENERATOR_OPTION_GROUPS[key].reduce<Record<string, number>>((next, item) => {
    next[item.label] = weightedScore(scores[key][item.label], chaos);
    return next;
  }, {});
  const ranked = [...GENERATOR_OPTION_GROUPS[key]]
    .map((item) => ({
      item,
      rankScore: (nextScores[item.label] ?? 0) + (randomUnit(rng) - 0.5) * jitter,
    }))
    .sort((left, right) => right.rankScore - left.rankScore)
    .slice(0, poolSize);
  const avoidPool = avoid ? ranked.filter(({ item }) => item.label !== avoid) : ranked;
  const pool = avoidPool.length > 0 ? avoidPool : ranked;
  return weightedLabelPick(pool.map(({ item }) => item), nextScores, chaos, rng);
}

export function advancedTargetForProfile(profile: MagicProfile) {
  return advancedProfileTargets.find((entry) => entry.profile === profile)?.target;
}

export function createAdvancedAccumulator() {
  const lengthScores: Partial<Record<GeneratorLengthBars, number>> = {};
  lengthScores[DEFAULT_GENERATOR_ADVANCED_SETTINGS.lengthBars] = 2;
  return {
    lengthScores,
    ranges: {
      creativity: { sum: DEFAULT_GENERATOR_ADVANCED_SETTINGS.creativity * 2, weight: 2 },
      density: { sum: DEFAULT_GENERATOR_ADVANCED_SETTINGS.density * 2, weight: 2 },
      humanize: { sum: DEFAULT_GENERATOR_ADVANCED_SETTINGS.humanize * 2, weight: 2 },
      temperature: { sum: DEFAULT_GENERATOR_ADVANCED_SETTINGS.temperature * 2, weight: 2 },
    } satisfies Record<GeneratorRangeKey, { sum: number; weight: number }>,
  };
}

export function addAdvancedTarget(accumulator: ReturnType<typeof createAdvancedAccumulator>, target: MagicAdvancedTargets | undefined, strength: number) {
  if (!target || strength <= 0) {
    return;
  }

  for (const key of GENERATOR_RANGE_KEYS) {
    const value = target[key];
    if (value === undefined) {
      continue;
    }
    accumulator.ranges[key].sum += clamp01Or(value, DEFAULT_GENERATOR_ADVANCED_SETTINGS[key]) * strength;
    accumulator.ranges[key].weight += strength;
  }

  const lengthValue = target.lengthBars;
  const lengthOption = GENERATOR_LENGTH_OPTIONS.find((option) => option.value === lengthValue);
  if (lengthOption) {
    accumulator.lengthScores[lengthOption.value] = (accumulator.lengthScores[lengthOption.value] ?? 0) + strength;
  }
}

export function selectedAdvancedStrength(key: GeneratorFieldKey) {
  if (key === "genre") return 12;
  if (key === "mood") return 5;
  if (key === "scaleKey") return 3;
  return 7;
}

export function pickLengthBars(scores: Partial<Record<GeneratorLengthBars, number>>, chaos: number, rng: () => number) {
  const items = GENERATOR_LENGTH_OPTIONS.map((option) => ({
    id: String(option.value),
    label: option.label,
  }));
  const labelScores = GENERATOR_LENGTH_OPTIONS.reduce<Record<string, number>>((next, option) => {
    next[option.label] = scores[option.value] ?? 0;
    return next;
  }, {});
  const picked = softmaxPick(items, labelScores, 0.28 + chaos * 1.2, rng);
  return GENERATOR_LENGTH_OPTIONS.find((option) => option.label === picked)?.value ?? DEFAULT_GENERATOR_ADVANCED_SETTINGS.lengthBars;
}

export function buildAdvancedSettings(input: GeneratorDashboardFields, options: GeneratorMagicOptions = {}) {
  const chaos = clamp01Or(options.chaos, 0.18);
  const rng = options.rng ?? Math.random;
  const accumulator = createAdvancedAccumulator();

  for (const key of GENERATOR_FIELD_KEYS) {
    const value = normalizedFieldValue(key, input[key]);
    if (!value) {
      continue;
    }
    for (const profile of matchingMagicProfiles(key, value)) {
      addAdvancedTarget(accumulator, advancedTargetForProfile(profile), selectedAdvancedStrength(key));
    }
  }

  for (const factor of magicInteractionFactors) {
    if (factorMatches(input, factor)) {
      addAdvancedTarget(accumulator, factor.advanced, 14 * riskStrength(chaos, factor.risk));
    }
  }

  if (allPromptFieldsEmpty(input)) {
    addAdvancedTarget(accumulator, { creativity: 0.78, density: 0.76, humanize: 0.38, lengthBars: 8, temperature: 0.68 }, 9 + chaos * 6);
  }

  const next = {
    creativity: DEFAULT_GENERATOR_ADVANCED_SETTINGS.creativity,
    density: DEFAULT_GENERATOR_ADVANCED_SETTINGS.density,
    humanize: DEFAULT_GENERATOR_ADVANCED_SETTINGS.humanize,
    lengthBars: pickLengthBars(accumulator.lengthScores, chaos, rng),
    temperature: DEFAULT_GENERATOR_ADVANCED_SETTINGS.temperature,
  } satisfies Pick<GeneratorDashboardFields, GeneratorAdvancedKey>;

  for (const key of GENERATOR_RANGE_KEYS) {
    const average = accumulator.ranges[key].sum / Math.max(1, accumulator.ranges[key].weight);
    const jitter = (randomUnit(rng) - 0.5) * (0.05 + chaos * 0.16);
    next[key] = clamp01Or(average + jitter, DEFAULT_GENERATOR_ADVANCED_SETTINGS[key]);
  }

  return next satisfies Pick<GeneratorDashboardFields, GeneratorAdvancedKey>;
}

export function setAdvancedValue(fields: GeneratorDashboardFields, key: GeneratorAdvancedKey, value: number) {
  if (key === "lengthBars") {
    fields.lengthBars = normalizeGeneratorLengthBars(value);
    return;
  }
  fields[key] = clamp01Or(value, DEFAULT_GENERATOR_ADVANCED_SETTINGS[key]);
}

export function isLocked(locks: GeneratorFieldLocks | undefined, key: GeneratorLockKey) {
  return locks?.[key] ?? false;
}

export function resetGeneratorDropdowns(input: GeneratorDashboardFields, locks: GeneratorFieldLocks = {}) {
  const next = { ...input };
  for (const key of GENERATOR_FIELD_KEYS) {
    if (!isLocked(locks, key)) {
      next[key] = "";
    }
  }
  for (const key of GENERATOR_ADVANCED_KEYS) {
    if (!isLocked(locks, key)) {
      setAdvancedValue(next, key, DEFAULT_GENERATOR_ADVANCED_SETTINGS[key]);
    }
  }
  return next;
}

export function buildRandomSuggestion(
  input: GeneratorDashboardFields,
  locks: GeneratorFieldLocks = {},
  rng = Math.random,
) {
  const next = { ...input };
  for (const key of GENERATOR_FIELD_KEYS) {
    if (isLocked(locks, key)) {
      continue;
    }
    const items = GENERATOR_OPTION_GROUPS[key];
    next[key] = items[Math.floor(Math.max(0, Math.min(0.999999, rng())) * items.length)]?.label ?? "";
  }
  for (const key of GENERATOR_RANGE_KEYS) {
    if (!isLocked(locks, key)) {
      next[key] = clamp01Or(rng(), 0);
    }
  }
  if (!isLocked(locks, "lengthBars")) {
    const index = Math.floor(Math.max(0, Math.min(0.999999, rng())) * GENERATOR_LENGTH_OPTIONS.length);
    next.lengthBars = GENERATOR_LENGTH_OPTIONS[index]?.value ?? DEFAULT_GENERATOR_ADVANCED_SETTINGS.lengthBars;
  }
  return next;
}

export function buildMagicSuggestion(
  input: GeneratorDashboardFields,
  locks: GeneratorFieldLocks = {},
  options: GeneratorMagicOptions = {},
) {
  const chaos = clamp01Or(options.chaos, 0.18);
  const rng = options.rng ?? Math.random;
  const next = { ...input };
  const source = { ...input };
  for (const key of GENERATOR_FIELD_KEYS) {
    if (next[key] || isLocked(locks, key)) {
      continue;
    }
    const scores = buildScores(source, options);
    next[key] = scorePick(key, scores, chaos, rng, options.avoid?.[key]);
  }
  const advanced = buildAdvancedSettings(next, { ...options, rng });
  for (const key of GENERATOR_ADVANCED_KEYS) {
    if (!isLocked(locks, key)) {
      setAdvancedValue(next, key, advanced[key]);
    }
  }
  return next;
}
