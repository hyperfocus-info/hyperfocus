import path from "node:path";
import {
  createMemoryEntryId,
  createMemoryRetrievalId,
  type AgentRunState,
  type CorrectnessReview,
  type MemoryEntry,
  type MemoryRetrieval,
  type MemorySummary,
  type ProjectId,
  type ThreadId
} from "@hyperfocus/ai-core/protocol";
import type { WorkspaceRepository } from "./workspace-repository";

type RetrievalOwner = MemoryRetrieval["owner"];

export function retrieveMemorySummaries(
  repository: WorkspaceRepository,
  input: {
    projectId: ProjectId;
    threadId: ThreadId;
    runId: string;
    owner: RetrievalOwner;
    queryText: string;
    tags?: string[];
    subagentId?: string;
    maxEntries?: number;
  }
) {
  const requestedTags = (input.tags ?? []).map(normalize).filter(Boolean);
  const ranked = repository
    .listMemoryEntries(input.projectId, { status: "active" })
    .filter((entry) => requestedTags.every((tag) => entry.tags.some((entryTag) => normalize(entryTag) === tag)))
    .map((entry) => ({ entry, score: scoreEntry(entry, input.queryText, requestedTags) }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score)
    .slice(0, clampEntryLimit(input.maxEntries ?? resolveBudget(input.owner)))
    .map(({ entry }) => entry);

  if (ranked.length === 0) {
    return {
      retrieval: undefined,
      memorySummaries: []
    };
  }

  const createdAt = new Date().toISOString();
  const retrieval: MemoryRetrieval = {
    id: createMemoryRetrievalId(),
    runId: input.runId,
    owner: input.owner,
    subagentId: input.subagentId,
    queryText: input.queryText,
    entryIds: ranked.map((entry) => entry.id),
    createdAt
  };
  repository.logMemoryRetrieval(retrieval);
  for (const entry of ranked) {
    repository.saveMemoryEntry({
      ...entry,
      hitCount: entry.hitCount + 1,
      lastHitAt: createdAt,
      updatedAt: entry.updatedAt
    });
  }

  return {
    retrieval,
    memorySummaries: ranked.map(toMemorySummary)
  };
}

export function extractRunMemories(
  repository: WorkspaceRepository,
  input: {
    projectId: ProjectId;
    threadId: ThreadId;
    run: AgentRunState;
    recordExceptionalRuns: boolean;
    finalAssistantMessage?: string;
    correctnessReview?: CorrectnessReview;
    cwd?: string;
  }
) {
  const entries = buildCandidateEntries(repository, input);
  for (const entry of dedupeEntries(repository, input.projectId, entries)) {
    repository.saveMemoryEntry(entry);
  }
}

export function shouldExtractRunMemories(run: AgentRunState, recordExceptionalRuns: boolean) {
  return recordExceptionalRuns || Boolean(extractExplicitMemoryDirective(run.latestUserPrompt));
}

function buildCandidateEntries(repository: WorkspaceRepository, input: {
  projectId: ProjectId;
  threadId: ThreadId;
  run: AgentRunState;
  recordExceptionalRuns: boolean;
  finalAssistantMessage?: string;
  correctnessReview?: CorrectnessReview;
  cwd?: string;
}) {
  const now = new Date().toISOString();
  const sourceCommitSha = input.run.experiment?.headCommitSha ?? input.run.experiment?.baseCommitSha;
  const pathGlobs = collectPathGlobs(input.run, input.cwd);
  const entries: MemoryEntry[] = [];
  let nextPriority = repository.getNextMemoryPriority(input.projectId);
  const assignPriority = () => {
    const priority = nextPriority;
    nextPriority = Math.min(100000, nextPriority + 100);
    return priority;
  };

  const explicitNote = extractExplicitMemoryDirective(input.run.latestUserPrompt);
  if (explicitNote) {
    entries.push({
      id: createMemoryEntryId(),
      projectId: input.projectId,
      threadId: input.threadId,
      runId: input.run.id,
      kind: "repo-fact",
      status: "active",
      title: truncate(explicitNote, 120),
      summary: truncate(explicitNote, 600),
      evidence: truncate(input.finalAssistantMessage ?? input.run.finalExecutionBrief ?? "", 1200) || undefined,
      tags: buildSemanticTags(input.run, "repo-fact", pathGlobs, ["source:user"]),
      pathGlobs,
      confidence: "high",
      freshness: "fresh",
      pinned: true,
      priority: assignPriority(),
      hitCount: 0,
      sourceCommitSha,
      createdAt: now,
      updatedAt: now
    });
  }

  if (
    input.recordExceptionalRuns &&
    input.run.status === "completed" &&
    (input.run.threadRunSequence ?? 1) > 1 &&
    isUserCorrection(input.run.latestUserPrompt)
  ) {
    entries.push({
      id: createMemoryEntryId(),
      projectId: input.projectId,
      threadId: input.threadId,
      runId: input.run.id,
      kind: "user-correction",
      status: "active",
      title: truncate(input.run.latestUserPrompt, 120),
      summary: truncate(input.run.latestUserPrompt, 600),
      evidence: truncate(input.finalAssistantMessage ?? input.run.finalExecutionBrief ?? "", 1200) || undefined,
      tags: buildSemanticTags(input.run, "user-correction", pathGlobs, ["source:user"]),
      pathGlobs,
      confidence: "high",
      freshness: "fresh",
      pinned: false,
      priority: assignPriority(),
      hitCount: 0,
      sourceCommitSha,
      createdAt: now,
      updatedAt: now
    });
  }

  if (input.recordExceptionalRuns && input.correctnessReview?.status === "needs-iteration") {
    entries.push({
      id: createMemoryEntryId(),
      projectId: input.projectId,
      threadId: input.threadId,
      runId: input.run.id,
      kind: "failure-pattern",
      status: "active",
      title: truncate(input.correctnessReview.summary, 120),
      summary: truncate(input.correctnessReview.gaps.map((gap) => gap.description).join(" | "), 600),
      evidence: truncate(input.correctnessReview.summary, 1200),
      tags: buildSemanticTags(input.run, "failure-pattern", pathGlobs, ["source:correctness-review"]),
      pathGlobs,
      confidence: "medium",
      freshness: "fresh",
      pinned: false,
      priority: assignPriority(),
      hitCount: 0,
      sourceCommitSha,
      createdAt: now,
      updatedAt: now
    });
  }

  if (input.recordExceptionalRuns && (input.run.status === "partial-complete" || input.run.status === "failed")) {
    entries.push({
      id: createMemoryEntryId(),
      projectId: input.projectId,
      threadId: input.threadId,
      runId: input.run.id,
      kind: "fallback-strategy",
      status: "active",
      title: truncate(input.run.failureMessage ?? "Resume failed run", 120),
      summary: truncate(input.run.failureMessage ?? input.correctnessReview?.summary ?? "Resume only failed parts and keep completed work.", 600),
      evidence: truncate(input.run.summary ?? input.run.finalExecutionBrief ?? "", 1200) || undefined,
      tags: buildSemanticTags(input.run, "fallback-strategy", pathGlobs, ["source:run-failure"]),
      pathGlobs,
      confidence: "medium",
      freshness: "fresh",
      pinned: false,
      priority: assignPriority(),
      hitCount: 0,
      sourceCommitSha,
      createdAt: now,
      updatedAt: now
    });
  }

  return entries.slice(0, 24);
}

function dedupeEntries(repository: WorkspaceRepository, projectId: ProjectId, candidates: MemoryEntry[]) {
  const existing = repository.listMemoryEntries(projectId);
  return candidates.map<MemoryEntry>((candidate) => {
    const duplicate = existing.find(
      (entry) =>
        entry.kind === candidate.kind &&
        normalize(entry.title) === normalize(candidate.title) &&
        normalize(entry.pathGlobs.join("|")) === normalize(candidate.pathGlobs.join("|"))
    );

    if (!duplicate) {
      return candidate;
    }

    return {
      ...duplicate,
      status: "active" as const,
      summary: candidate.summary,
      evidence: candidate.evidence,
      tags: uniqueStrings([...duplicate.tags, ...candidate.tags]),
      confidence: candidate.confidence,
      freshness: "fresh" as const,
      priority: duplicate.priority,
      sourceCommitSha: candidate.sourceCommitSha,
      updatedAt: candidate.updatedAt
    };
  });
}

function scoreEntry(entry: MemoryEntry, queryText: string, requestedTags: string[]) {
  const haystack = normalize([entry.title, entry.summary, entry.evidence ?? "", entry.tags.join(" ")].join(" "));
  const tokens = tokenizeQuery(queryText);
  const lexical = tokens.reduce((count, token) => count + (haystack.includes(token) ? 2 : 0), 0);
  const tagMatches = requestedTags.filter((tag) => entry.tags.some((entryTag) => normalize(entryTag) === tag)).length;
  if (lexical === 0 && tagMatches === 0) {
    return Number.NEGATIVE_INFINITY;
  }
  const freshnessBonus = entry.freshness === "fresh" ? 4 : entry.freshness === "aging" ? 2 : 0;
  const pinBonus = entry.pinned ? 6 : 0;
  const confidenceBonus = entry.confidence === "high" ? 4 : entry.confidence === "medium" ? 2 : 0;
  const priorityBonus = Math.max(0, 1000 - Math.min(entry.priority, 1000)) / 200;
  return lexical + tagMatches * 8 + freshnessBonus + pinBonus + confidenceBonus + Math.min(entry.hitCount, 10) + priorityBonus;
}

function toMemorySummary(entry: MemoryEntry): MemorySummary {
  const note = `${entry.summary}${entry.evidence ? ` Source: ${entry.evidence}` : ""}`;
  return {
    id: entry.id,
    scope: "workspace",
    label: `${entry.kind} | ${entry.title}`,
    content: truncate(entry.tags.length > 0 ? `Tags: ${entry.tags.join(", ")}\n${note}` : note, 600),
    updatedAt: entry.updatedAt,
    source: entry.pinned ? "user" : "generated"
  };
}

function collectPathGlobs(run: AgentRunState, cwd?: string) {
  const paths = run.subtasks
    .flatMap((task) => [task.mountPath, task.worktreePath])
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      if (!cwd) {
        return value.replace(/\\/g, "/");
      }
      return path.relative(cwd, value).replace(/\\/g, "/");
    })
    .filter(Boolean);
  return uniqueStrings(paths).slice(0, 12);
}

function resolveBudget(owner: RetrievalOwner) {
  return owner === "subagent" ? 3 : 4;
}

const QUERY_STOP_WORDS = new Set([
  "about", "after", "again", "before", "could", "from", "have", "into", "memory", "notes", "that", "their", "there",
  "these", "this", "those", "with", "would"
]);

function tokenizeQuery(value: string) {
  return uniqueStrings(
    normalize(value)
      .split(/[^a-z0-9:_-]+/)
      .filter((token) => token.length >= 3 && !QUERY_STOP_WORDS.has(token))
  );
}

function clampEntryLimit(value: number) {
  return Math.max(1, Math.min(4, Math.round(value)));
}

function extractExplicitMemoryDirective(prompt: string) {
  const match = prompt.match(/(?:^|\n)\s*(?:remember|memory)\s*:\s*(.+)/i);
  return match?.[1]?.trim();
}

function isUserCorrection(prompt: string) {
  return /^(?:actually\b|correction\b|instead\b|no[,;:]?\s+|don't\b|do not\b|that(?:'s| is) not\b)/i.test(prompt.trim());
}

function buildSemanticTags(run: AgentRunState, kind: MemoryEntry["kind"], pathGlobs: string[], extra: string[]) {
  const explicit = [...run.latestUserPrompt.matchAll(/\b([a-z][a-z0-9-]{0,31}):([a-z0-9][a-z0-9-]{0,63})\b/gi)]
    .map((match) => `${match[1]!.toLowerCase()}:${match[2]!.toLowerCase()}`);
  const areas = pathGlobs
    .map((value) => value.replace(/\\/g, "/").split("/").find((part) => part && part !== "." && part !== ".." && part !== ".local"))
    .filter((value): value is string => Boolean(value))
    .map((value) => `area:${value.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}`);
  return uniqueStrings([`kind:${kind}`, `status:${run.status}`, ...extra, ...explicit, ...areas]).slice(0, 32);
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}
