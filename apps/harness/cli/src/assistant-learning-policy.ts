import type { AssistantLearning } from "@hyperfocus/ai-core/protocol";

const SOURCE_MAX_LENGTH = 256;
const SOURCE_FALLBACK = "unknown";
const FUZZY_DUPLICATE_THRESHOLD = 0.86;
const SIMILAR_SENTIMENT_THRESHOLD = 0.58;
const MAX_PROMPT_LEARNINGS = 6;

const GARBAGE_SUMMARIES = new Set([
  "merged durable assistant guidance",
  "compacted summary",
  "compacted summary merged durable assistant guidance"
]);

export function normalizeAssistantLearningKey(summary: string) {
  return summary.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

export function selectAssistantPromptLearnings(learnings: AssistantLearning[]) {
  const summaries = learnings.filter((learning) => (learning.kind ?? "fact") === "summary")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const guidance = learnings.filter((learning) => (learning.kind ?? "fact") === "fact")
    .filter((learning) => learning.confidence === "high" && /^(question:|question-policy:|user)/i.test(learning.source))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const facts = learnings.filter((learning) => (learning.kind ?? "fact") === "fact")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const selected: AssistantLearning[] = [];
  const seenKeys = new Set<string>();
  for (const learning of [...summaries, ...guidance, ...facts]) {
    const key = normalizeAssistantLearningKey(learning.summary);
    if (seenKeys.has(key) || selected.some((entry) => entry.id === learning.id)) continue;
    seenKeys.add(key);
    selected.push(learning);
    if (selected.length >= MAX_PROMPT_LEARNINGS) break;
  }
  return selected;
}

export function readAssistantPromptLearnings(readPage: (cursor: string | undefined) =>
  { items: AssistantLearning[]; nextCursor?: string }) {
  const candidates: AssistantLearning[] = []; let cursor: string | undefined;
  do { const page = readPage(cursor); for (const learning of page.items) {
      candidates.push(learning); candidates.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      const summaries = candidates.filter((item) => (item.kind ?? "fact") === "summary").slice(0, MAX_PROMPT_LEARNINGS);
      const guidance = candidates.filter((item) => (item.kind ?? "fact") === "fact" && item.confidence === "high" && /^(question:|question-policy:|user)/i.test(item.source)).slice(0, MAX_PROMPT_LEARNINGS);
      const facts = candidates.filter((item) => (item.kind ?? "fact") === "fact").slice(0, MAX_PROMPT_LEARNINGS);
      candidates.splice(0, candidates.length, ...new Map([...summaries, ...guidance, ...facts].map((item) => [item.id, item])).values());
    } cursor = page.nextCursor; } while (cursor !== undefined);
  return selectAssistantPromptLearnings(candidates);
}

export function someAssistantLearning(readPage: (cursor: string | undefined) =>
  { items: AssistantLearning[]; nextCursor?: string }, predicate: (learning: AssistantLearning) => boolean) {
  let cursor: string | undefined; do { const page = readPage(cursor); if (page.items.some(predicate)) return true;
    cursor = page.nextCursor; } while (cursor !== undefined); return false;
}

export function findPagedAssistantLearningMatches(readPage: (cursor: string | undefined) =>
  { items: AssistantLearning[]; nextCursor?: string }, candidate: AssistantLearning) {
  let cursor: string | undefined; let sharedPremise: AssistantLearning | undefined; let duplicate: AssistantLearning | undefined;
  do { const page = readPage(cursor); sharedPremise ??= findAssistantLearningSharedPremise(page.items, candidate);
    duplicate ??= findAssistantLearningDuplicate(page.items, candidate); cursor = page.nextCursor;
  } while (cursor !== undefined && !sharedPremise); return { sharedPremise, duplicate };
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "be",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "with"
]);

export function normalizeAssistantLearningSource(source: string) {
  const trimmed = source.trim();
  const normalized = trimmed || SOURCE_FALLBACK;
  return normalized.length > SOURCE_MAX_LENGTH ? normalized.slice(0, SOURCE_MAX_LENGTH) : normalized;
}

export function isGarbageAssistantLearningSummary(summary: string) {
  return GARBAGE_SUMMARIES.has(normalizeAssistantLearningText(summary));
}

export function findAssistantLearningDuplicate(
  existingLearnings: AssistantLearning[],
  candidate: AssistantLearning
) {
  const candidateKind = candidate.kind ?? "fact";
  const candidateKey = normalizeAssistantLearningText(candidate.summary);
  const candidateTokens = tokenizeAssistantLearning(candidate.summary);
  return existingLearnings.find((learning) => {
    if ((learning.kind ?? "fact") !== candidateKind) {
      return false;
    }
    if (learning.id === candidate.id) {
      return true;
    }
    const learningKey = normalizeAssistantLearningText(learning.summary);
    if (learningKey === candidateKey) {
      return true;
    }
    if (learningKey.includes(candidateKey) || candidateKey.includes(learningKey)) {
      return true;
    }
    const learningTokens = tokenizeAssistantLearning(learning.summary);
    if (tokenSmallerSetOverlap(candidateTokens, learningTokens) >= SIMILAR_SENTIMENT_THRESHOLD) {
      return true;
    }
    return tokenJaccardSimilarity(candidateTokens, learningTokens) >= FUZZY_DUPLICATE_THRESHOLD;
  });
}

export function findAssistantLearningSharedPremise(
  existingLearnings: AssistantLearning[],
  candidate: AssistantLearning
) {
  const candidateKind = candidate.kind ?? "fact";
  const candidatePremise = parseNormativeAssistantLearning(candidate.summary);
  if (!candidatePremise) {
    return undefined;
  }
  const candidatePremiseTokens = tokenizeAssistantLearning(candidatePremise.premise);
  return existingLearnings.find((learning) => {
    if ((learning.kind ?? "fact") !== candidateKind || learning.id === candidate.id) {
      return false;
    }
    const existingPremise = parseNormativeAssistantLearning(learning.summary);
    if (!existingPremise || existingPremise.verb !== candidatePremise.verb) {
      return false;
    }
    const existingKey = normalizeAssistantLearningText(existingPremise.premise);
    const candidateKey = normalizeAssistantLearningText(candidatePremise.premise);
    return (
      existingKey === candidateKey ||
      tokenSmallerSetOverlap(candidatePremiseTokens, tokenizeAssistantLearning(existingPremise.premise)) >=
        SIMILAR_SENTIMENT_THRESHOLD
    );
  });
}

export function mergeAssistantLearningSummaries(existing: AssistantLearning, candidate: AssistantLearning) {
  const existingNormative = parseNormativeAssistantLearning(existing.summary);
  const candidateNormative = parseNormativeAssistantLearning(candidate.summary);
  if (!existingNormative || !candidateNormative) {
    return undefined;
  }
  const guidance = mergeAssistantLearningGuidance(existingNormative.guidance, candidateNormative.guidance);
  if (!guidance) {
    return undefined;
  }
  const summary = `${existingNormative.premise} ${existingNormative.verb} ${guidance}.`;
  if (summary.length > 4000) {
    return undefined;
  }
  return {
    ...existing,
    summary,
    source: normalizeAssistantLearningSource(mergeUniqueStrings([existing.source, candidate.source]).join("; ")),
    confidence: strongerAssistantLearningConfidence(existing.confidence, candidate.confidence),
    supersedesLearningIds: mergeUniqueStrings([
      ...(existing.supersedesLearningIds ?? []),
      ...(candidate.supersedesLearningIds ?? [])
    ]),
    compactedAt: existing.compactedAt,
    createdAt: existing.createdAt
  };
}

export function shouldSkipSimilarAssistantLearning(existing: AssistantLearning, candidate: AssistantLearning) {
  const existingKey = normalizeAssistantLearningText(existing.summary);
  const candidateKey = normalizeAssistantLearningText(candidate.summary);
  if (existingKey === candidateKey || existing.id === candidate.id) {
    return false;
  }
  if (isAssistantQuestionPolicyFollowup(existing.source, candidate.source)) {
    return false;
  }
  const existingTokens = tokenizeAssistantLearning(existing.summary);
  const candidateTokens = tokenizeAssistantLearning(candidate.summary);
  return (
    existingKey.includes(candidateKey) ||
    candidateKey.includes(existingKey) ||
    tokenSmallerSetOverlap(existingTokens, candidateTokens) >= SIMILAR_SENTIMENT_THRESHOLD
  );
}

export function isAssistantQuestionPolicyFollowup(left: string, right: string) {
  const families = new Set([left, right].map((source) => source.split(":")[0]?.toLowerCase() ?? source.toLowerCase()));
  return families.has("question") && families.has("question-policy");
}

export function strongerAssistantLearningConfidence(
  left: AssistantLearning["confidence"],
  right: AssistantLearning["confidence"]
) {
  return assistantLearningConfidenceRank(right) > assistantLearningConfidenceRank(left) ? right : left;
}

export function shouldReplaceAssistantLearning(existing: AssistantLearning, candidate: AssistantLearning) {
  const confidenceImproved =
    assistantLearningConfidenceRank(candidate.confidence) > assistantLearningConfidenceRank(existing.confidence);
  if (confidenceImproved) {
    return true;
  }
  const candidateCreatedAt = new Date(candidate.createdAt).getTime();
  const existingCreatedAt = new Date(existing.createdAt).getTime();
  return Number.isFinite(candidateCreatedAt) && Number.isFinite(existingCreatedAt) && candidateCreatedAt >= existingCreatedAt;
}

export function mergeUniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function normalizeAssistantLearningText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeAssistantLearning(value: string) {
  return new Set(
    normalizeAssistantLearningText(value)
      .split(" ")
      .map((token) => normalizeAssistantLearningToken(token))
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
  );
}

function normalizeAssistantLearningToken(token: string) {
  if (token.length > 5 && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.length > 5 && token.endsWith("ied")) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.length > 4 && token.endsWith("ed")) {
    const base = token.slice(0, -2);
    return base.endsWith("s") ? `${base}e` : base;
  }
  if (token.length > 5 && token.endsWith("er")) {
    const base = token.slice(0, -2);
    return base.endsWith("s") ? `${base}e` : base;
  }
  if (token.length > 5 && token.endsWith("est")) {
    return token.slice(0, -3);
  }
  if (token.length > 4 && token.endsWith("s")) {
    return token.slice(0, -1);
  }
  return token;
}

function tokenSmallerSetOverlap(left: Set<string>, right: Set<string>) {
  const smallerSize = Math.min(left.size, right.size);
  if (smallerSize === 0) {
    return left.size === right.size ? 1 : 0;
  }
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  return intersection / smallerSize;
}

function parseNormativeAssistantLearning(summary: string) {
  const normalized = summary.replace(/\s+/g, " ").trim();
  const match = /^(?<premise>.+?)\s+(?<verb>needs?|should|must|requires?)\s+(?<guidance>.+?)\.?$/iu.exec(normalized);
  const premise = match?.groups?.premise?.trim();
  const verb = normalizeNormativeAssistantLearningVerb(match?.groups?.verb?.trim().toLowerCase() ?? "");
  const guidance = match?.groups?.guidance?.replace(/[.?!]+$/u, "").trim();
  if (!premise || !verb || !guidance) {
    return undefined;
  }
  if (/[":;?]/u.test(premise) || /[":;?]/u.test(guidance)) {
    return undefined;
  }
  return { premise, verb, guidance };
}

function normalizeNormativeAssistantLearningVerb(verb: string) {
  if (verb === "needs") {
    return "need";
  }
  if (verb === "requires") {
    return "require";
  }
  return verb;
}

function mergeAssistantLearningGuidance(existingGuidance: string, candidateGuidance: string) {
  const phrases = new Map<string, string>();
  for (const phrase of splitAssistantLearningGuidance(existingGuidance)) {
    phrases.set(normalizeAssistantLearningText(phrase), phrase);
  }
  let added = false;
  for (const phrase of splitAssistantLearningGuidance(candidateGuidance)) {
    const key = normalizeAssistantLearningText(phrase);
    if (!phrases.has(key)) {
      phrases.set(key, phrase);
      added = true;
    }
  }
  if (!added) {
    return existingGuidance;
  }
  return [...phrases.values()].join(" and ");
}

function splitAssistantLearningGuidance(guidance: string) {
  return guidance
    .split(/\s+(?:and|,)\s+/iu)
    .map((part) => part.replace(/[.?!]+$/u, "").trim())
    .filter(Boolean);
}

function tokenJaccardSimilarity(left: Set<string>, right: Set<string>) {
  if (left.size === 0 && right.size === 0) {
    return 1;
  }
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  return intersection / (left.size + right.size - intersection);
}

function assistantLearningConfidenceRank(confidence: AssistantLearning["confidence"]) {
  switch (confidence) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}

export type AssistantCompactionState = { running: boolean; dirty: boolean; lastReason: string };

export function deferAssistantCompaction(pending: Map<string, string>, assistantId: string, reason: string, paused: boolean) {
  if (!paused) return false;
  pending.set(assistantId, reason);
  return true;
}

export function drainDeferredAssistantCompactions(pending: Map<string, string>, paused: boolean) {
  if (paused) return [];
  const entries = [...pending];
  pending.clear();
  return entries;
}

export function scheduleAssistantCompaction(states: Map<string, AssistantCompactionState>, assistantId: string,
  reason: string, run: (reason: string) => Promise<void>, isValid: () => boolean) {
  const existing = states.get(assistantId);
  if (existing?.running) {
    existing.dirty = true;
    existing.lastReason = reason;
    return undefined;
  }
  const state: AssistantCompactionState = { running: true, dirty: false, lastReason: reason };
  states.set(assistantId, state);
  return runAssistantCompactionLoop(states, assistantId, state, run, isValid);
}

async function runAssistantCompactionLoop(states: Map<string, AssistantCompactionState>, assistantId: string,
  state: AssistantCompactionState, run: (reason: string) => Promise<void>, isValid: () => boolean) {
  do {
    state.dirty = false;
    await run(state.lastReason);
  } while (state.dirty && isValid());
  states.delete(assistantId);
}
