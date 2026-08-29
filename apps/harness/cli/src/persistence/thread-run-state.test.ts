import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { agentRunStateSchema } from "@hyperfocus/ai-core/protocol";
import { createRunDetailSnapshotStore } from "./run-detail-pagination";
import { isPageCursorError } from "./page-cursor-codec";
import { createWorkspaceRepository } from "../workspace-repository";

describe("thread run state snapshot", () => {
  const roots: string[] = [];
  afterEach(async () => {
    Bun.gc(true);
    for (const root of roots.splice(0)) for (let attempt = 0; attempt < 10; attempt += 1) {
      try { rmSync(root, { recursive: true, force: true }); break; }
      catch (error) { if (attempt === 9) throw error; await Bun.sleep(Math.min(50 * 2 ** attempt, 500)); }
    }
  });

  test("hydrates an active latest run once and blocks a concurrent status transition", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "hf-thread-run-state-")); roots.push(root);
    let hydrationCount = 0, transitionBlocked = false, observe = false; let second: Database;
    const repository = createWorkspaceRepository(path.join(root, "workspace.sqlite"), root, {
      durability: "test-fast",
      instrumentation: {
        onHydrateRunState() { if (observe) hydrationCount += 1; },
        onReadActiveRun() {
          if (!observe) return;
          try { second.run(`UPDATE agent_runs SET status = 'completed', completed_at = ?2 WHERE id = ?1`, [run.id, new Date().toISOString()]); }
          catch (error) { transitionBlocked = String(error).includes("locked"); }
        }
      }
    });
    const project = repository.addProject(root);
    const run = repository.createAgentRun(project.id, "snapshot", "openai/gpt-5.4", project.activeThreadId).activeRun!;
    second = new Database(repository.getDatabasePath(), { strict: true }); second.exec("PRAGMA busy_timeout = 0;");
    observe = true;
    const state = repository.getThreadRunState(project.id, project.activeThreadId);
    expect(transitionBlocked).toBe(true); expect(state.activeRun?.id).toBe(run.id);
    expect(state.lastRun).toBe(state.activeRun); expect(hydrationCount).toBe(1);
    second.close(false); repository.close();
  });

  test("snapshots rich run detail once across UTF-8 pages and blocks a concurrent transition", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "hf-run-detail-")); roots.push(root);
    let loadCount = 0, transitionBlocked = false, outsideLockWrites = 0, observe = false; let second: Database; let runId = "";
    const repository = createWorkspaceRepository(path.join(root, "workspace.sqlite"), root, {
      durability: "test-fast",
      instrumentation: {
        onHydrateRunState() {
          if (!observe) return;
          loadCount += 1;
          try { second.run("UPDATE agent_runs SET summary = 'concurrent' WHERE id = ?1", [runId]); }
          catch (error) { transitionBlocked = String(error).includes("locked"); }
        },
        onRunDetailPage() {
          if (!observe) return;
          second.run("UPDATE agent_runs SET summary = summary WHERE id = ?1", [runId]); outsideLockWrites += 1;
        }
      }
    });
    const project = repository.addProject(root);
    const run = repository.createAgentRun(project.id, "detail", "openai/gpt-5.4", project.activeThreadId).activeRun!;
    runId = run.id;
    const activities = [{ id: "tool", runId: run.id, owner: "main" as const, toolCallId: "call", toolName: "read",
      category: "other" as const, status: "completed" as const, rawResultJson: `"${"🙂".repeat(9_000)}"`,
      startedAt: run.createdAt, updatedAt: run.updatedAt }];
    second = new Database(repository.getDatabasePath(), { strict: true }); second.exec("PRAGMA busy_timeout = 0;");
    second.run("UPDATE agent_runs SET tool_activities_json = ?2 WHERE id = ?1", [run.id, JSON.stringify(activities)]);
    observe = true;
    const chunks: string[] = []; let cursor: string | undefined;
    do {
      const page = repository.getAgentRunDetailPage(project.id, run.threadId, run.id, { cursor, limit: 1 });
      chunks.push(...page.items); cursor = page.nextCursor;
    } while (cursor);
    expect(chunks.length).toBeGreaterThan(4);
    expect(chunks.every((chunk) => new TextEncoder().encode(chunk).byteLength <= 8_192)).toBe(true);
    expect(agentRunStateSchema.parse(JSON.parse(chunks.join(""))).id).toBe(run.id);
    expect(loadCount).toBe(1); expect(transitionBlocked).toBe(true);
    expect(outsideLockWrites).toBe(chunks.length);
    expect(() => repository.getAgentRunDetailPage(project.id, run.threadId, run.id,
      { cursor: "foreign", limit: 1 })).toThrow();
    second.close(false); repository.close();
  });

  test("projects run summaries without hydrating heavy detail", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "hf-run-summary-")); roots.push(root);
    let observe = false;
    const repository = createWorkspaceRepository(path.join(root, "workspace.sqlite"), root, {
      durability: "test-fast",
      instrumentation: { onHydrateRunState() { if (observe) throw new Error("heavy hydration must not run"); } }
    });
    const project = repository.addProject(root);
    const run = repository.createAgentRun(project.id, "summary", "openai/gpt-5.4", project.activeThreadId).activeRun!;
    const second = new Database(repository.getDatabasePath(), { strict: true });
    second.run("UPDATE agent_runs SET tool_activities_json = ?2, browser_sessions_json = ?2 WHERE id = ?1",
      [run.id, "corrupt-heavy-detail".repeat(100_000)]);
    observe = true;
    const page = repository.listWorkspaceThreadRunSummaries(project.id, project.activeThreadId, { limit: 1 });
    expect(page.items).toHaveLength(1); expect(page.items[0]?.id).toBe(run.id);
    second.close(false); repository.close();
  });

  test("reuses identical snapshots without inflating the cache budget", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "hf-run-cache-")); roots.push(root);
    const repository = createWorkspaceRepository(path.join(root, "workspace.sqlite"), root, { durability: "test-fast" });
    const project = repository.addProject(root);
    const run = repository.createAgentRun(project.id, "x".repeat(9_000), "openai/gpt-5.4", project.activeThreadId).activeRun!;
    const store = createRunDetailSnapshotStore({ maxCacheBytes: 20_000 });
    const owner = `${project.id}:${run.threadId}:${run.id}`, load = () => run;
    const first = store.page(owner, { limit: 1 }, load);
    for (let index = 0; index < 20; index += 1) store.page(owner, { limit: 1 }, load);
    expect(first.nextCursor).toBeTruthy();
    expect(store.page(owner, { cursor: first.nextCursor, limit: 1 }, load).items.length).toBeGreaterThan(0);
    repository.close();
  });

  test("rejects cached detail after run, thread, or project ownership is recreated", () => {
    for (const target of ["run", "thread", "project"]) {
      const root = mkdtempSync(path.join(os.tmpdir(), `hf-run-owner-${target}-`)); roots.push(root);
      const repository = createWorkspaceRepository(path.join(root, "workspace.sqlite"), root, { durability: "test-fast" });
      let second: Database | undefined, staleCursorError: unknown;
      try {
        const project = repository.addProject(root);
        const run = repository.createAgentRun(project.id, "x".repeat(9_000), "openai/gpt-5.4", project.activeThreadId).activeRun!;
        const first = repository.getAgentRunDetailPage(project.id, run.threadId, run.id, { limit: 1 });
        second = new Database(repository.getDatabasePath(), { strict: true });
        second.run("CREATE TEMP TABLE saved_run AS SELECT * FROM agent_runs WHERE id = ?1", [run.id]);
        second.run("UPDATE saved_run SET thread_run_sequence = 0");
        if (target !== "run") second.run("CREATE TEMP TABLE saved_thread AS SELECT * FROM project_threads WHERE id = ?1", [run.threadId]);
        if (target === "project") second.run("CREATE TEMP TABLE saved_project AS SELECT * FROM projects WHERE id = ?1", [project.id]);
        if (target === "run") second.exec("DELETE FROM agent_runs WHERE id IN (SELECT id FROM saved_run); INSERT INTO agent_runs SELECT * FROM saved_run;");
        else if (target === "thread") second.exec("DELETE FROM agent_runs WHERE id IN (SELECT id FROM saved_run); DELETE FROM project_threads WHERE id IN (SELECT id FROM saved_thread); INSERT INTO project_threads SELECT * FROM saved_thread; INSERT INTO agent_runs SELECT * FROM saved_run;");
        else second.exec("DELETE FROM agent_runs WHERE id IN (SELECT id FROM saved_run); DELETE FROM project_threads WHERE id IN (SELECT id FROM saved_thread); DELETE FROM projects WHERE id IN (SELECT id FROM saved_project); INSERT INTO projects SELECT * FROM saved_project; INSERT INTO project_threads SELECT * FROM saved_thread; INSERT INTO agent_runs SELECT * FROM saved_run;");
        try { repository.getAgentRunDetailPage(project.id, run.threadId, run.id,
          { cursor: first.nextCursor, limit: 1 }); } catch (error) { staleCursorError = error; }
      } finally { try { second?.close(false); } finally { repository.close(); } }
      expect(isPageCursorError(staleCursorError)).toBe(true);
      if (!isPageCursorError(staleCursorError)) throw new Error("Expected stale detail cursor rejection");
      expect(staleCursorError.code).toBe("invalid-cursor"); expect(staleCursorError.message).toContain("cursor");
    }
  });

  test("keeps failed runs with persisted subtasks resumable in lightweight summaries", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "hf-run-summary-task-")); roots.push(root);
    const repository = createWorkspaceRepository(path.join(root, "workspace.sqlite"), root, { durability: "test-fast" });
    const project = repository.addProject(root);
    const run = repository.createAgentRun(project.id, "summary", "openai/gpt-5.4", project.activeThreadId).activeRun!;
    const second = new Database(repository.getDatabasePath(), { strict: true }), now = new Date().toISOString();
    second.run(`INSERT INTO agent_run_subtasks (id, run_id, planner_task_id, title, instruction, status, attempt_count, updated_at)
      VALUES ('row', ?1, 'task', 'Task', 'Do it', 'failed', 1, ?2)`, [run.id, now]);
    second.run("UPDATE agent_runs SET status = 'failed', final_execution_brief = NULL, updated_at = ?2 WHERE id = ?1", [run.id, now]);
    const summary = repository.listWorkspaceThreadRunSummaries(project.id, run.threadId, { limit: 1 }).items[0];
    expect(summary?.resumable).toBe(true); expect(summary?.retryable).toBe(true);
    second.close(false); repository.close();
  });

  test("orders same-millisecond runs by a durable per-thread sequence", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "hf-run-sequence-")); roots.push(root);
    const repository = createWorkspaceRepository(path.join(root, "workspace.sqlite"), root, { durability: "test-fast" });
    const project = repository.addProject(root), threadId = project.activeThreadId;
    const first = repository.createAgentRun(project.id, "first", "openai/gpt-5.4", threadId).activeRun!;
    const second = repository.createAgentRun(project.id, "second", "openai/gpt-5.4", threadId).activeRun!;
    const db = new Database(repository.getDatabasePath(), { strict: true }), sameTime = "2026-01-01T00:00:00.000Z";
    db.run("UPDATE agent_runs SET created_at = ?1, updated_at = ?1 WHERE id IN (?2, ?3)", [sameTime, first.id, second.id]);
    const state = repository.getThreadRunState(project.id, threadId);
    expect(first.threadRunSequence).toBeLessThan(second.threadRunSequence ?? 0);
    expect(state.activeRun?.id).toBe(second.id); expect(state.lastRun?.id).toBe(second.id);
    expect(repository.listWorkspaceThreadRunSummaries(project.id, threadId, { limit: 8 }).items
      .every(({ threadRunSequence }) => threadRunSequence !== undefined)).toBe(true);
    expect(() => db.run("UPDATE agent_runs SET thread_run_sequence = 1.5 WHERE id = ?1", [first.id])).toThrow("immutable");
    expect(() => db.run("UPDATE agent_runs SET thread_run_sequence = -1 WHERE id = ?1", [first.id])).toThrow("immutable");
    expect(() => db.run("UPDATE agent_runs SET thread_run_sequence = ?2 WHERE id = ?1",
      [first.id, (second.threadRunSequence ?? 2) + 1])).toThrow("immutable");
    expect(() => db.run("UPDATE thread_run_sequences SET current_sequence = 0 WHERE thread_id = ?1", [threadId])).toThrow();
    expect(() => db.run("UPDATE thread_run_sequences SET current_sequence = current_sequence + 2 WHERE thread_id = ?1",
      [threadId])).toThrow();
    expect(() => db.run("DELETE FROM thread_run_sequences WHERE thread_id = ?1", [threadId])).toThrow();
    db.run("CREATE TEMP TABLE supplied_run AS SELECT * FROM agent_runs WHERE id = ?1", [first.id]);
    db.run("UPDATE supplied_run SET id = 'supplied-positive'");
    expect(() => db.exec("INSERT INTO agent_runs SELECT * FROM supplied_run")).toThrow("allocator-assigned");
    db.run("UPDATE supplied_run SET thread_run_sequence = 0"); db.exec("INSERT INTO agent_runs SELECT * FROM supplied_run");
    const allocated = repository.getRun(project.id, "supplied-positive");
    expect(allocated?.threadRunSequence).toBeGreaterThan(second.threadRunSequence ?? 0);
    const otherRoot = path.join(root, "other"); mkdirSync(otherRoot);
    const otherProject = repository.addProject(otherRoot);
    const counterBefore = db.query<{ current_sequence: number }, [string]>(
      "SELECT current_sequence FROM thread_run_sequences WHERE thread_id = ?1",
    ).get(threadId)?.current_sequence;
    db.run("UPDATE supplied_run SET id = 'cross-owner', project_id = ?1", [otherProject.id]);
    expect(() => db.exec("INSERT INTO agent_runs SELECT * FROM supplied_run")).toThrow("valid owner");
    expect(db.query<{ current_sequence: number }, [string]>(
      "SELECT current_sequence FROM thread_run_sequences WHERE thread_id = ?1",
    ).get(threadId)?.current_sequence).toBe(counterBefore);
    db.run("DELETE FROM agent_runs WHERE thread_id = ?1", [threadId]);
    const afterDelete = repository.createAgentRun(project.id, "after delete", "openai/gpt-5.4", threadId).activeRun!;
    expect(afterDelete.threadRunSequence).toBeGreaterThan(allocated?.threadRunSequence ?? 0);
    const unusedThread = repository.createThread(project.id).activeThreadId;
    const usedThread = repository.createThread(project.id).activeThreadId;
    const destinationRun = repository.createAgentRun(project.id, "destination", "openai/gpt-5.4", usedThread).activeRun!;
    expect(() => db.run("UPDATE agent_runs SET thread_id = ?2 WHERE id = ?1", [afterDelete.id, unusedThread]))
      .toThrow("owner is immutable");
    expect(() => db.run("UPDATE agent_runs SET thread_id = ?2 WHERE id = ?1", [afterDelete.id, usedThread]))
      .toThrow("owner is immutable");
    expect(() => db.run("UPDATE agent_runs SET project_id = 'other' WHERE id = ?1", [afterDelete.id]))
      .toThrow("owner is immutable");
    const destinationNext = repository.createAgentRun(project.id, "destination next", "openai/gpt-5.4", usedThread).activeRun!;
    expect(destinationNext.threadRunSequence).toBe((destinationRun.threadRunSequence ?? 0) + 1);
    db.close(false); repository.close();
  });

  test("repairs malformed legacy run sequences before rebuilding uniqueness", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "hf-run-sequence-repair-")); roots.push(root);
    const dbPath = path.join(root, "workspace.sqlite"), repository = createWorkspaceRepository(dbPath, root, { durability: "test-fast" });
    const project = repository.addProject(root), threadId = project.activeThreadId;
    const first = repository.createAgentRun(project.id, "first", "openai/gpt-5.4", threadId).activeRun!;
    const second = repository.createAgentRun(project.id, "second", "openai/gpt-5.4", threadId).activeRun!;
    const third = repository.createAgentRun(project.id, "third", "openai/gpt-5.4", threadId).activeRun!;
    repository.close();
    const raw = new Database(dbPath, { strict: true });
    raw.exec(`DROP TRIGGER agent_runs_validate_thread_sequence; DROP INDEX agent_runs_thread_sequence_idx;
      DELETE FROM repository_migrations WHERE id = 'run-lifecycle-sequence-v1';`);
    raw.run("UPDATE agent_runs SET thread_run_sequence = 5 WHERE id = ?1", [first.id]);
    raw.run("UPDATE agent_runs SET thread_run_sequence = 5 WHERE id = ?1", [second.id]);
    raw.run("UPDATE agent_runs SET thread_run_sequence = -1 WHERE id = ?1", [third.id]); raw.close(false);
    const reopened = createWorkspaceRepository(dbPath, root, { durability: "test-fast" });
    const summaries = reopened.listWorkspaceThreadRunSummaries(project.id, threadId, { limit: 8 }).items;
    expect(summaries.map(({ threadRunSequence }) => threadRunSequence).sort()).toEqual([1, 2, 3]);
    reopened.close();
  });
});
