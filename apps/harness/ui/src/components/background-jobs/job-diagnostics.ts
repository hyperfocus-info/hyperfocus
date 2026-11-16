import type { BackgroundJob } from "@hyperfocus/ai-core/protocol";
import { formatShortTimestamp } from "../../lib/time-format";

export function formatFailureCategory(value: string) {
  return value.replace(/-/g, " ");
}

export function formatFailureTracking(job: BackgroundJob) {
  const streak = job.consecutiveFailureCount ?? 0;
  const lastCategory = job.lastFailureCategory ? formatFailureCategory(job.lastFailureCategory) : undefined;
  const backoffUntil = job.backoffUntil ? formatShortTimestamp(job.backoffUntil) : undefined;
  if (streak <= 0 && !lastCategory && !backoffUntil) return undefined;
  return [
    streak > 0 ? `Failure streak ${streak}` : undefined,
    lastCategory ? `last ${lastCategory}` : undefined,
    backoffUntil ? `backoff until ${backoffUntil}` : undefined
  ].filter(Boolean).join(" | ");
}
