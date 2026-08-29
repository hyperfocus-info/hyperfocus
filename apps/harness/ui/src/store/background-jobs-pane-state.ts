import type { BackgroundJobRun } from "@hyperfocus/ai-core/protocol";

export type JobsRunFilter = "all" | "approval" | "input" | "queued" | "running" | "failed" | "done";

export function getBackgroundRunFilter(
  run: Pick<BackgroundJobRun, "status" | "approvalStatus">
): Exclude<JobsRunFilter, "all"> {
  if (run.status === "awaiting-user-input") return "input";
  if (run.status === "awaiting-approval" || run.approvalStatus === "pending") return "approval";
  if (run.status === "queued") return "queued";
  if (run.status === "running") return "running";
  return run.status === "failed" || run.status === "cancelled" ? "failed" : "done";
}
