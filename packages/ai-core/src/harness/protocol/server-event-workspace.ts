import { z } from "zod";
import { createBoundedPageSchema, projectIdSchema, projectRootPathSchema, requestIdSchema, threadIdSchema,
  WORKSPACE_MESSAGE_PAGE_LIMIT, WORKSPACE_PROJECT_PAGE_LIMIT, WORKSPACE_RUN_SUMMARY_PAGE_LIMIT,
  WORKSPACE_THREAD_PAGE_LIMIT } from "./shared";
import { agentRunSummarySchema } from "./execution";
import { chatMessageSchema } from "./conversation";
import { ideFilePathSchema, ideFileReadSchema, ideFileTreeEntrySchema, ideGitChangeSchema, ideSearchResultSchema, projectSearchResultSchema, projectThreadSummarySchema, workspaceFilePathPageSchema, workspaceProjectStateSchema, workspaceStateSchema } from "./workspace";

export const workspaceServerEventSchemas = [
  z.object({
    type: z.literal("project.opened"),
    requestId: requestIdSchema,
    payload: z.object({
      project: workspaceProjectStateSchema,
      activeProjectId: projectIdSchema,
      availableSkillPaths: z.array(z.string().min(1).max(4096)).max(256).optional(),
      resolution: z.enum(["created-project", "existing-project-new-thread"])
    })
  }),
  z.object({
    type: z.literal("project.git.initialized"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      rootPath: projectRootPathSchema,
      initialized: z.literal(true),
      baselineCommitCreated: z.boolean()
    })
  }),
  z.object({
    type: z.literal("project.removed"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      activeProjectId: projectIdSchema.optional()
    })
  }),
  z.object({
    type: z.literal("project.activated"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      availableSkillPaths: z.array(z.string().min(1).max(4096)).max(256).optional()
    })
  }),
  z.object({
    type: z.literal("project.search.results"),
    requestId: requestIdSchema,
    payload: z.object({
      query: z.string().trim().min(1).max(4096),
      results: z.array(projectSearchResultSchema).max(32)
    })
  }),
  z.object({
    type: z.literal("workspace.projects.listed"),
    requestId: requestIdSchema,
    payload: z.object({
      projects: createBoundedPageSchema(workspaceProjectStateSchema, WORKSPACE_PROJECT_PAGE_LIMIT)
    })
  }),
  z.object({
    type: z.literal("workspace.projectChildren.listed"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      collections: z.array(z.enum(["filePaths", "threads", "messages", "runSummaries"])).min(1).max(4),
      filePaths: workspaceFilePathPageSchema.optional(),
      threads: createBoundedPageSchema(projectThreadSummarySchema, WORKSPACE_THREAD_PAGE_LIMIT).optional(),
      messages: z.object({
        threadId: threadIdSchema,
        page: createBoundedPageSchema(chatMessageSchema, WORKSPACE_MESSAGE_PAGE_LIMIT)
      }).optional(),
      runSummaries: z.object({
        threadId: threadIdSchema,
        page: createBoundedPageSchema(agentRunSummarySchema, WORKSPACE_RUN_SUMMARY_PAGE_LIMIT)
      }).optional()
    }).superRefine((payload, context) => {
      const declared = new Set(payload.collections);
      if (declared.size !== payload.collections.length) context.addIssue({ code: "custom", path: ["collections"],
        message: "Returned project child collections must be unique" });
      for (const collection of ["filePaths", "threads", "messages", "runSummaries"] as const)
        if (declared.has(collection) !== (payload[collection] !== undefined)) context.addIssue({ code: "custom", path: [collection],
          message: `Returned ${collection} must match declared collections` });
    })
  }),
  z.object({
    type: z.literal("ide.fileTree.listed"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      requestedPath: ideFilePathSchema.optional(),
      rootPath: projectRootPathSchema,
      entries: z.array(ideFileTreeEntrySchema).max(20000),
      truncated: z.boolean()
    })
  }),
  z.object({
    type: z.literal("ide.file.read"),
    requestId: requestIdSchema,
    payload: ideFileReadSchema
  }),
  z.object({
    type: z.literal("ide.file.written"),
    requestId: requestIdSchema,
    payload: ideFileReadSchema
  }),
  z.object({
    type: z.literal("ide.search.results"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      query: z.string().min(1).max(4096),
      results: z.array(ideSearchResultSchema).max(1000),
      truncated: z.boolean()
    })
  }),
  z.object({
    type: z.literal("ide.search.cancelled"),
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
      projectId: projectIdSchema,
      branch: z.string().min(1).max(512).optional(),
      isRepository: z.boolean(),
      changes: z.array(ideGitChangeSchema).max(5000)
    })
  }),
  z.object({
    type: z.literal("workspace.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      workspace: workspaceStateSchema
    })
  }),
  z.object({
    type: z.literal("project.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      project: workspaceProjectStateSchema
    })
  }),
  z.object({
    type: z.literal("thread.created"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      project: workspaceProjectStateSchema
    })
  }),
  z.object({
    type: z.literal("thread.activated"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      project: workspaceProjectStateSchema
    })
  }),
  z.object({
    type: z.literal("thread.renamed"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      thread: projectThreadSummarySchema
    })
  }),
  z.object({
    type: z.literal("thread.pinned"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      thread: projectThreadSummarySchema
    })
  }),
  z.object({
    type: z.literal("thread.cleanupArchived"),
    requestId: requestIdSchema,
    payload: z.object({
      archivedCount: z.number().int().min(0),
      skippedCount: z.number().int().min(0),
      projects: z.array(
        z.object({
          projectId: projectIdSchema,
          archivedThreadIds: z.array(threadIdSchema).max(512),
          skippedThreadIds: z.array(threadIdSchema).max(512),
          project: workspaceProjectStateSchema
        })
      )
    })
  }),
] as const;
