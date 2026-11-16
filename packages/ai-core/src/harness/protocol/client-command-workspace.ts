import { z } from "zod";
import { notificationInboxItemIdSchema } from "./jobs-and-notifications";
import {
  cliUpdateTargetIdSchema,
  boundedPageCursorSchema,
  boundedPageLimitSchema,
  projectIdSchema,
  projectRootPathSchema,
  requestIdSchema,
  threadIdSchema,
  threadTitleSchema,
  WORKSPACE_FILE_PATH_PAGE_LIMIT,
  WORKSPACE_MESSAGE_PAGE_LIMIT,
  WORKSPACE_PROJECT_PAGE_LIMIT,
  WORKSPACE_RUN_SUMMARY_PAGE_LIMIT,
  WORKSPACE_THREAD_PAGE_LIMIT
} from "./shared";
import { ideFilePathSchema } from "./workspace";

const projectPageLimitSchema = z.number().int().min(1).max(WORKSPACE_PROJECT_PAGE_LIMIT);
const threadPageLimitSchema = z.number().int().min(1).max(WORKSPACE_THREAD_PAGE_LIMIT);
const messagePageLimitSchema = z.number().int().min(1).max(WORKSPACE_MESSAGE_PAGE_LIMIT);
const runSummaryPageLimitSchema = z.number().int().min(1).max(WORKSPACE_RUN_SUMMARY_PAGE_LIMIT);
const filePathPageLimitSchema = z.number().int().min(1).max(WORKSPACE_FILE_PATH_PAGE_LIMIT);

export const workspaceClientCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("thread.message"), requestId: requestIdSchema,
    payload: z.object({ projectId: projectIdSchema, sourceThreadId: threadIdSchema, targetThreadId: threadIdSchema,
      message: z.string().trim().min(1).max(16000), deliveryId: z.string().uuid() })
  }),
  z.object({
    type: z.literal("thread.input"), requestId: requestIdSchema,
    payload: z.object({ projectId: projectIdSchema, threadId: threadIdSchema,
      message: z.string().trim().min(1).max(16000), deliveryId: z.string().uuid(), mode: z.enum(["queue", "steer"]) })
  }),
  z.object({
    type: z.literal("connection.ping"),
    requestId: requestIdSchema,
    payload: z
      .object({
        timestamp: z.number().optional()
      })
      .optional()
  }),
  z.object({
    type: z.literal("agent.list"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("usage.refresh"), requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("usage.reset"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("project.add"),
    requestId: requestIdSchema,
    payload: z.object({
      rootPath: projectRootPathSchema
    })
  }),
  z.object({
    type: z.literal("project.create"),
    requestId: requestIdSchema,
    payload: z.object({
      rootPath: projectRootPathSchema
    })
  }),
  z.object({
    type: z.literal("branchfs.cleanup"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      mode: z.enum(["all", "retention"])
    })
  }),
  z.object({
    type: z.literal("project.git.initBaseline"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema
    })
  }),
  z.object({
    type: z.literal("project.browse"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("project.remove"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema
    })
  }),
  z.object({
    type: z.literal("project.activate"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema
    })
  }),
  z.object({
    type: z.literal("project.search"),
    requestId: requestIdSchema,
    payload: z.object({
      query: z.string().trim().min(1).max(4096)
    })
  }),
  z.object({
    type: z.literal("workspace.projects.list"),
    requestId: requestIdSchema,
    payload: z.object({
      cursor: boundedPageCursorSchema.optional(),
      limit: projectPageLimitSchema.optional()
    })
  }),
  z.object({
    type: z.literal("workspace.projectChildren.list"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      filePaths: z.object({ cursor: boundedPageCursorSchema.optional(), limit: filePathPageLimitSchema.optional() }).optional(),
      threads: z.object({ cursor: boundedPageCursorSchema.optional(), limit: threadPageLimitSchema.optional() }).optional(),
      messages: z.object({ threadId: threadIdSchema, cursor: boundedPageCursorSchema.optional(),
        limit: messagePageLimitSchema.optional() }).optional(),
      runSummaries: z.object({ threadId: threadIdSchema, cursor: boundedPageCursorSchema.optional(),
        limit: runSummaryPageLimitSchema.optional() }).optional()
    }).refine((payload) => payload.filePaths || payload.threads || payload.messages || payload.runSummaries,
      { message: "At least one project child page must be requested" })
  }),
  z.object({
    type: z.literal("ide.fileTree.list"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      rootPath: ideFilePathSchema.optional(),
      maxEntries: z.number().int().min(1).max(20000).optional(),
      includeIgnored: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal("ide.file.read"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      path: ideFilePathSchema,
      maxBytes: z.number().int().min(1).max(5_000_000).optional()
    })
  }),
  z.object({
    type: z.literal("ide.file.write"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      path: ideFilePathSchema,
      content: z.string().max(2_000_000)
    })
  }),
  z.object({
    type: z.literal("ide.search.run"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      query: z.string().min(1).max(4096),
      regex: z.boolean(),
      caseSensitive: z.boolean(),
      wholeWord: z.boolean().optional(),
      includeGlob: z.string().min(1).max(512).optional(),
      excludeGlob: z.string().min(1).max(512).optional(),
      maxResults: z.number().int().min(1).max(1000).optional()
    })
  }),
  z.object({
    type: z.literal("ide.search.cancel"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      searchRequestId: requestIdSchema
    })
  }),
  z.object({
    type: z.literal("ide.git.status"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema
    })
  }),
  z.object({
    type: z.literal("thread.create"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema
    })
  }),
  z.object({
    type: z.literal("thread.activate"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema
    })
  }),
  z.object({
    type: z.literal("thread.fork"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      sourceThreadId: threadIdSchema
    })
  }),
  z.object({
    type: z.literal("thread.rename"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      title: threadTitleSchema
    })
  }),
  z.object({
    type: z.literal("thread.pin"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      pinned: z.boolean()
    })
  }),
  z.object({
    type: z.literal("thread.archive"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema
    })
  }),
  z.object({
    type: z.literal("thread.cleanupArchive"),
    requestId: requestIdSchema,
    payload: z.object({
      projectIds: z.array(projectIdSchema).max(512).optional(),
      olderThanMs: z.number().int().positive(),
      ageBasis: z.literal("last-user-message")
    })
  }),
  z.object({
    type: z.literal("thread.restore"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema
    })
  }),
  z.object({
    type: z.literal("session.reset"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema
    })
  }),
  z.object({
    type: z.literal("execution.pause-all"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("execution.resume-all"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("notifications.page.list"),
    requestId: requestIdSchema,
    payload: z.object({ cursor: boundedPageCursorSchema.optional(), limit: boundedPageLimitSchema.optional() })
  }),
  z.object({
    type: z.literal("notification.mark-read"),
    requestId: requestIdSchema,
    payload: z.object({
      notificationId: notificationInboxItemIdSchema
    })
  }),
  z.object({
    type: z.literal("notifications.mark-all-read"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("cli-updates.check"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("cli-updates.install"),
    requestId: requestIdSchema,
    payload: z.object({
      agentId: cliUpdateTargetIdSchema
    })
  }),
  z.object({
    type: z.literal("setup.refresh"),
    requestId: requestIdSchema
  })
]);
