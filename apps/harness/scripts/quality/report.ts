import { Database } from "bun:sqlite";
import { qualityCoverage, qualityTraceSchema } from "@hyperfocus/ai-core/quality";
import { z } from "zod";

/** Read only: the normal Harness SQLite run remains the evidence owner. */
export function readTaskQuality(databasePath: string, taskId: string) {
  const db = new Database(databasePath, { readonly: true });
  try {
    const row = db.query<{ plan_json: string | null }, [string]>("SELECT plan_json FROM agent_runs WHERE id = ?1").get(taskId);
    if (!row) throw new Error("Task not found.");
    if (!row.plan_json) return { schema: "hyperfocus-quality-report-v1", taskId, acceptance: "UNKNOWN", reason: "Legacy task has no recorded rule lifecycle." };
    const plan = z.object({ quality: qualityTraceSchema.optional() }).parse(JSON.parse(row.plan_json));
    return plan.quality ? qualityCoverage(plan.quality) : { schema: "hyperfocus-quality-report-v1", taskId, acceptance: "UNKNOWN", reason: "No quality trace was recorded; execution completion is not proof of verification." };
  } finally { db.close(); }
}

if (import.meta.main) {
  const args = process.argv.slice(2), db = args[args.indexOf("--db") + 1], task = args[args.indexOf("--task") + 1];
  if (!args.includes("--db") || !args.includes("--task") || !db || !task) throw new Error("Usage: bun scripts/quality/report.ts --db <harness.db> --task <run-id>");
  console.log(JSON.stringify(readTaskQuality(db, task), null, 2));
}
