import { z } from "zod";
import { backgroundJobPageSchema, backgroundJobRunPageSchema, backgroundJobSchema, backgroundJobRunSchema, backgroundJobSchedulePreviewSchema, backgroundJobsStateSchema } from "./jobs-and-notifications";
import { BACKGROUND_JOB_DELETION_CHUNK_LIMIT, assistantIdSchema, backgroundJobIdSchema, bulkOperationResultSchema, projectIdSchema, requestIdSchema } from "./shared";

const backgroundJobSourcePayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("job"), job: backgroundJobSchema }),
  z.object({ kind: z.literal("run"), job: backgroundJobSchema, run: backgroundJobRunSchema })
]).superRefine((payload, context) => {
  if (payload.kind !== "run") return;
  if (payload.run.jobId !== payload.job.id) context.addIssue({ code: "custom", message: "Run does not belong to the supplied job", path: ["run", "jobId"] });
  if (payload.run.projectId !== payload.job.projectId) context.addIssue({ code: "custom", message: "Run and job projects must match", path: ["run", "projectId"] });
});

export const jobServerEventSchemas = [
  z.object({
    type: z.literal("background-jobs.page.listed"),
    requestId: requestIdSchema,
    payload: z.object({
      collections: z.array(z.enum(["jobs", "runs"])).min(1).max(2).refine((items) => new Set(items).size === items.length,
        { message: "Background page collections must be unique" }),
      jobs: backgroundJobPageSchema.optional(),
      runs: backgroundJobRunPageSchema.optional()
    }).superRefine(({ collections, jobs, runs }, context) => {
      if (collections.includes("jobs") !== (jobs !== undefined)) context.addIssue({ code: "custom", path: ["jobs"],
        message: "Jobs page must match declared collections" });
      if (collections.includes("runs") !== (runs !== undefined)) context.addIssue({ code: "custom", path: ["runs"],
        message: "Runs page must match declared collections" });
    })
  }),
  z.object({ type: z.literal("background-jobs.updated"), requestId: requestIdSchema,
    payload: z.object({ backgroundJobs: backgroundJobsStateSchema }) }),
  z.object({ type: z.literal("background-jobs.deleted"), requestId: requestIdSchema,
    payload: z.object({
      targets: z.array(z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("background-job"), jobId: backgroundJobIdSchema }),
        z.object({ kind: z.literal("assistant"), assistantId: assistantIdSchema }),
        z.object({ kind: z.literal("project"), projectId: projectIdSchema })
      ])).min(1).max(100),
      deletedJobIds: z.array(backgroundJobIdSchema).max(BACKGROUND_JOB_DELETION_CHUNK_LIMIT)
    }) }),
  z.object({ type: z.literal("bulk-operation.previewed"), requestId: requestIdSchema, payload: bulkOperationResultSchema }),
  z.object({ type: z.literal("bulk-operation.applied"), requestId: requestIdSchema, payload: bulkOperationResultSchema }),
  z.object({ type: z.literal("background-job.source.loaded"), requestId: requestIdSchema, payload: backgroundJobSourcePayloadSchema }),
  z.object({ type: z.literal("background-job-run.updated"), requestId: requestIdSchema,
    payload: z.object({ run: backgroundJobRunSchema }) }),
  z.object({ type: z.literal("background-job-schedule.preview"), requestId: requestIdSchema,
    payload: backgroundJobSchedulePreviewSchema })
] as const;
