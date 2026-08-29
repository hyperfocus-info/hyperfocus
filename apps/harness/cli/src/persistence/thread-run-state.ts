import type { Database } from "bun:sqlite";

export function readThreadRunStateSnapshot<T extends { id: string }>(db: Database, projectId: string, threadId: string,
  readActive: () => T | undefined, readLatest: () => T | undefined) {
  return db.transaction(() => {
    const activeRun = readActive();
    const latestId = db.query<{ id: string }, [string, string]>(`SELECT id FROM agent_runs
      WHERE project_id = ?1 AND thread_id = ?2 ORDER BY thread_run_sequence DESC LIMIT 1`).get(projectId, threadId)?.id;
    return { activeRun, lastRun: latestId === activeRun?.id ? activeRun : readLatest() };
  }).immediate();
}
