import { z } from "zod";
import { backgroundJobSchema } from "./jobs-and-notifications";
import {
  boundedPageCursorSchema,
  boundedPageLimitSchema,
  backgroundJobIdSchema,
  backgroundJobRunIdSchema,
  bulkOperationPayloadSchema,
  projectIdSchema,
  requestIdSchema
} from "./shared";

export const jobClientCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("background-jobs.page.list"),
    requestId: requestIdSchema,
    payload: z.object({
      jobs: z.object({ cursor: boundedPageCursorSchema.optional(), limit: boundedPageLimitSchema.optional() }).optional(),
      runs: z.object({ cursor: boundedPageCursorSchema.optional(), limit: boundedPageLimitSchema.optional() }).optional()
    }).refine(({ jobs, runs }) => jobs !== undefined || runs !== undefined, {
      message: "At least one background job collection must be requested"
    })
  }),
  z.object({
    type: z.literal("background-job.source.open"),
    requestId: requestIdSchema,
    payload: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("job"), projectId: projectIdSchema, jobId: backgroundJobIdSchema }),
      z.object({ kind: z.literal("run"), projectId: projectIdSchema, runId: backgroundJobRunIdSchema })
    ])
  }),
  z.object({
    type: z.literal("background-job.save"),
    requestId: requestIdSchema,
    payload: z.object({
      job: backgroundJobSchema
    })
  }),
  z.object({
    type: z.literal("background-job.delete"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      jobId: backgroundJobIdSchema
    })
  }),
  z.object({
    type: z.literal("background-job.pause"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      jobId: backgroundJobIdSchema
    })
  }),
  z.object({
    type: z.literal("background-job.pause-assistant-jobs"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("background-job.resume"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      jobId: backgroundJobIdSchema
    })
  }),
  z.object({
    type: z.literal("background-job.run-now"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      jobId: backgroundJobIdSchema
    })
  }),
  z.object({
    type: z.literal("background-job.scheduler.retry"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("background-job.stop-run"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      runId: backgroundJobRunIdSchema
    })
  }),
  z.object({
    type: z.literal("background-job.retry-run"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      runId: backgroundJobRunIdSchema
    })
  }),
  z.object({
    type: z.literal("background-job.approve-run"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      runId: backgroundJobRunIdSchema
    })
  }),
  z.object({
    type: z.literal("background-job.reject-run"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      runId: backgroundJobRunIdSchema
    })
  }),
  z.object({
    type: z.literal("background-job.schedule.preview"),
    requestId: requestIdSchema,
    payload: z.object({
      input: z.string().trim().min(1).max(512),
      timezone: z.string().min(1).max(128).optional()
    })
  }),
  z.object({
    type: z.literal("bulk-operation.preview"),
    requestId: requestIdSchema,
    payload: bulkOperationPayloadSchema
  }),
  z.object({
    type: z.literal("bulk-operation.apply"),
    requestId: requestIdSchema,
    payload: bulkOperationPayloadSchema
  })
]);
