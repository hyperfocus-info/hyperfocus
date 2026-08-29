import { expect, test } from "bun:test";
import { beginRunDetailRetry, clearRunDetailRecovery, retainRunDetailRecoveries, runDetailRecoveries,
  setRunDetailRecovery } from "./run-detail-state";

test("run detail recovery remains observable until success or authoritative deletion", () => {
  let retries = 0;
  setRunDetailRecovery({ projectId: "project", threadId: "thread", runId: "run", status: "retryable",
    retry: () => { retries += 1; return true; } });
  expect(runDetailRecoveries[0]?.runId).toBe("run");
  expect(beginRunDetailRetry("run")).toBe(true); runDetailRecoveries[0]?.retry();
  expect(beginRunDetailRetry("run")).toBe(false);
  expect(retries).toBe(1);
  retainRunDetailRecoveries(new Set(["run"]));
  expect(runDetailRecoveries).toHaveLength(1);
  clearRunDetailRecovery("run");
  expect(runDetailRecoveries).toHaveLength(0);
  setRunDetailRecovery({ projectId: "project", threadId: "thread", runId: "deleted", status: "retryable",
    retry: () => false });
  retainRunDetailRecoveries(new Set());
  expect(runDetailRecoveries).toHaveLength(0);
});

test("stale retry admission cannot strand a recovery loading", () => {
  let demanded = false, sends = 0;
  const retry = () => { if (!demanded) return false; sends += 1; return true; };
  setRunDetailRecovery({ projectId: "project", threadId: "thread", runId: "reconnected", status: "retryable", retry });
  expect(beginRunDetailRetry("reconnected", retry)).toBe(false);
  expect(runDetailRecoveries[0]?.status).toBe("retryable");
  demanded = true;
  expect(beginRunDetailRetry("reconnected", retry)).toBe(true);
  expect(runDetailRecoveries[0]?.status).toBe("loading");
  expect(sends).toBe(1);
  clearRunDetailRecovery("reconnected");
});
