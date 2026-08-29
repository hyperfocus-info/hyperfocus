import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createMemoryEntryId } from "@hyperfocus/ai-core/protocol";
import { extractRunMemories, retrieveMemorySummaries, shouldExtractRunMemories } from "./memory-bank";
import { createWorkspaceRepository, type WorkspaceRepository } from "./workspace-repository";
import { createHarnessTestTempPath, resolveHarnessTestTempRoot } from "./test-support/test-temp-root";

function createRepository() {
  const tempRoot = resolveHarnessTestTempRoot();
  mkdirSync(tempRoot, { recursive: true });
  return createWorkspaceRepository(path.join(tempRoot, `memory-bank-${crypto.randomUUID()}.sqlite`), process.cwd(), {
    durability: "test-fast"
  });
}

function addProject(repository: WorkspaceRepository) {
  const tempRoot = createHarnessTestTempPath("memory-bank-repo");
  mkdirSync(tempRoot, { recursive: true });
  return repository.addProject(tempRoot);
}

function saveMemory(repository: WorkspaceRepository, input: {
  projectId: string;
  title: string;
  priority: number;
  pinned?: boolean;
  summary?: string;
}) {
  const now = new Date().toISOString();
  return repository.saveMemoryEntry({
    id: createMemoryEntryId(),
    projectId: input.projectId,
    kind: "task-summary",
    status: "active",
    title: input.title,
    summary: input.summary ?? `${input.title} shared query`,
    tags: ["feature:shared-query"],
    pathGlobs: ["src/**"],
    confidence: "medium",
    freshness: "fresh",
    pinned: input.pinned ?? false,
    priority: input.priority,
    hitCount: 0,
    createdAt: now,
    updatedAt: now
  })!;
}

describe("memory bank", () => {
  test("manual priority affects retrieval ranking", () => {
    const repository = createRepository();
    const project = addProject(repository);
    saveMemory(repository, { projectId: project.id, title: "Low priority", priority: 900 });
    saveMemory(repository, { projectId: project.id, title: "High priority", priority: 100 });
    const run = repository.createAgentRun(project.id, "shared query", "openai/gpt-5.4").activeRun!;

    const result = retrieveMemorySummaries(repository, {
      projectId: project.id,
      threadId: project.activeThreadId,
      runId: run.id,
      owner: "planner",
      queryText: "shared query",
      maxEntries: 2
    });

    expect(result.memorySummaries.map((summary) => summary.label)).toEqual([
      "task-summary | High priority",
      "task-summary | Low priority"
    ]);
  });

  test("pinned memory wins when relevance and priority match", () => {
    const repository = createRepository();
    const project = addProject(repository);
    saveMemory(repository, { projectId: project.id, title: "Plain", priority: 500 });
    saveMemory(repository, { projectId: project.id, title: "Pinned", priority: 500, pinned: true });
    const run = repository.createAgentRun(project.id, "shared query", "openai/gpt-5.4").activeRun!;

    const result = retrieveMemorySummaries(repository, {
      projectId: project.id,
      threadId: project.activeThreadId,
      runId: run.id,
      owner: "planner",
      queryText: "shared query",
      maxEntries: 2
    });

    expect(result.memorySummaries[0]?.label).toBe("task-summary | Pinned");
  });

  test("specific relevance outweighs manual priority", () => {
    const repository = createRepository();
    const project = addProject(repository);
    saveMemory(repository, {
      projectId: project.id,
      title: "Generic frontend note",
      summary: "Workspace conventions",
      priority: 100
    });
    saveMemory(repository, {
      projectId: project.id,
      title: "Typed workspace migration boundary",
      summary: "Keep typed workspace migration contracts framework neutral",
      priority: 900
    });
    const run = repository.createAgentRun(project.id, "typed workspace migration contracts", "openai/gpt-5.4").activeRun!;

    const result = retrieveMemorySummaries(repository, {
      projectId: project.id,
      threadId: project.activeThreadId,
      runId: run.id,
      owner: "planner",
      queryText: "typed workspace migration contracts",
      maxEntries: 2
    });

    expect(result.memorySummaries[0]?.label).toBe("task-summary | Typed workspace migration boundary");
  });

  test("does not turn routine completed runs into memory", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const run = repository.createAgentRun(project.id, "shared task", "openai/gpt-5.4").activeRun!;
    const completedRun = { ...run, status: "completed" as const, summary: "Routine completion" };

    extractRunMemories(repository, {
      projectId: project.id,
      threadId: project.activeThreadId,
      run: completedRun,
      recordExceptionalRuns: false
    });

    expect(repository.listMemoryEntries(project.id)).toEqual([]);
    expect(shouldExtractRunMemories(completedRun, false)).toBe(false);
  });

  test("records an explicit tagged note even when exceptional recording is off", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const run = repository.createAgentRun(
      project.id,
      "Remember: keep the frontend refactor behind typed workspace boundaries feature:frontend-refactor",
      "openai/gpt-5.4"
    ).activeRun!;
    const completedRun = { ...run, status: "failed" as const, failureMessage: "Run failed after saving the note." };

    expect(shouldExtractRunMemories(completedRun, false)).toBe(true);
    extractRunMemories(repository, {
      projectId: project.id,
      threadId: project.activeThreadId,
      run: completedRun,
      recordExceptionalRuns: false,
      finalAssistantMessage: "Captured by explicit request."
    });

    const entries = repository.listMemoryEntries(project.id);
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry).toMatchObject({ kind: "repo-fact", pinned: true, confidence: "high" });
    expect(entry?.tags).toContain("feature:frontend-refactor");
    expect(entry?.tags).toContain("source:user");
  });

  test("requires lexical relevance or requested semantic tags", () => {
    const repository = createRepository();
    const project = addProject(repository);
    saveMemory(repository, { projectId: project.id, title: "Frontend boundary", priority: 100 });
    const run = repository.createAgentRun(project.id, "investigate", "openai/gpt-5.4").activeRun!;

    const irrelevant = retrieveMemorySummaries(repository, {
      projectId: project.id,
      threadId: project.activeThreadId,
      runId: run.id,
      owner: "planner",
      queryText: "database migration"
    });
    expect(irrelevant.memorySummaries).toEqual([]);

    const tagged = retrieveMemorySummaries(repository, {
      projectId: project.id,
      threadId: project.activeThreadId,
      runId: run.id,
      owner: "planner",
      queryText: "specific refactor history",
      tags: ["feature:shared-query"]
    });
    expect(tagged.memorySummaries).toHaveLength(1);
    expect(tagged.memorySummaries[0]?.content).toContain("Tags: feature:shared-query");
    expect(repository.getMemoryEntry(tagged.memorySummaries[0]!.id)?.hitCount).toBe(1);
  });

  test("records failed-run learnings only when exceptional recording is enabled", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const run = repository.createAgentRun(project.id, "attempt migration", "openai/gpt-5.4").activeRun!;
    const failedRun = { ...run, status: "failed" as const, failureMessage: "Migration command failed" };

    extractRunMemories(repository, {
      projectId: project.id,
      threadId: project.activeThreadId,
      run: failedRun,
      recordExceptionalRuns: false
    });
    expect(repository.listMemoryEntries(project.id)).toEqual([]);

    extractRunMemories(repository, {
      projectId: project.id,
      threadId: project.activeThreadId,
      run: failedRun,
      recordExceptionalRuns: true
    });
    expect(repository.listMemoryEntries(project.id)).toHaveLength(1);
    expect(repository.listMemoryEntries(project.id)[0]?.kind).toBe("fallback-strategy");
  });

  test("dedupes repeated explicit notes without resetting their priority", () => {
    const repository = createRepository();
    const project = addProject(repository);
    const run = repository.createAgentRun(project.id, "Memory: stable constraint", "openai/gpt-5.4").activeRun!;
    const completedRun = { ...run, status: "completed" as const };

    extractRunMemories(repository, {
      projectId: project.id,
      threadId: project.activeThreadId,
      run: completedRun,
      recordExceptionalRuns: false
    });
    const generated = repository.listMemoryEntries(project.id)[0]!;

    repository.saveMemoryEntry({
      ...generated,
      status: "archived",
      priority: 123
    });
    extractRunMemories(repository, {
      projectId: project.id,
      threadId: project.activeThreadId,
      run: completedRun,
      recordExceptionalRuns: false
    });

    expect(repository.listMemoryEntries(project.id)).toHaveLength(1);
    expect(repository.getMemoryEntry(generated.id)?.priority).toBe(123);
    expect(repository.getMemoryEntry(generated.id)?.status).toBe("active");
  });
});
