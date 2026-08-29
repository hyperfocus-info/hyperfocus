import { z } from "zod";
import { assistantsStateSchema } from "./assistants";
import { agentOptionSchema, agentRuntimeCapabilitySchema } from "./conversation";
import { backgroundJobsStateSchema, branchfsCleanupSummarySchema, cliUpdateNotificationSchema, notificationInboxItemPageSchema, notificationInboxStateSchema } from "./jobs-and-notifications";
import { cliUpdateTargetIdSchema, commandRejectionCodeSchema, projectIdSchema, requestIdSchema, threadIdSchema } from "./shared";
import { executionControlStateSchema, preferencesStateSchema, providerConnectionProviderSchema, providerConnectionStatusSchema, setupStateSchema } from "./settings";
import { cliAttachTokenSchema, cliSessionSchema, terminalAttachTokenSchema, terminalHistoryScopeSchema, terminalPaneLayoutSchema, terminalPreferencesSchema, terminalSessionSchema, terminalShellSchema, tokenUsageStateSchema, workspaceStateSchema } from "./workspace";

function requireAttachSessionCorrespondence(value: { sessionId: string; attachToken: { sessionId: string } }, context: z.RefinementCtx) {
  if (value.sessionId !== value.attachToken.sessionId) context.addIssue({ code: "custom", path: ["attachToken", "sessionId"],
    message: "Attach token sessionId must match payload sessionId" });
}

const cliSessionLifecyclePayloadSchema = z.object({
  projectId: projectIdSchema,
  threadId: threadIdSchema,
  session: cliSessionSchema
}).superRefine((payload, ctx) => {
  if (payload.projectId !== payload.session.projectId) ctx.addIssue({ code: z.ZodIssueCode.custom,
    message: "CLI session projectId must match event projectId", path: ["session", "projectId"] });
  if (payload.threadId !== payload.session.threadId) ctx.addIssue({ code: z.ZodIssueCode.custom,
    message: "CLI session threadId must match event threadId", path: ["session", "threadId"] });
});

export const runtimeServerEventSchemas = [
  z.object({
    type: z.literal("connection.ready"),
    payload: z.object({
      agents: z.array(agentOptionSchema),
      availableSkillPaths: z.array(z.string().min(1).max(4096)).max(256).optional(),
      workspace: workspaceStateSchema,
      executionControl: executionControlStateSchema,
      preferences: preferencesStateSchema,
      tokenUsage: tokenUsageStateSchema,
      setup: setupStateSchema,
      backgroundJobs: backgroundJobsStateSchema,
      assistants: assistantsStateSchema,
      notifications: notificationInboxStateSchema
    })
  }),
  z.object({
    type: z.literal("notifications.page.listed"),
    requestId: requestIdSchema,
    payload: z.object({ items: notificationInboxItemPageSchema })
  }),
  z.object({
    type: z.literal("notifications.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      notifications: notificationInboxStateSchema
    })
  }),
  z.object({
    type: z.literal("execution-control.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      executionControl: executionControlStateSchema
    })
  }),
  z.object({
    type: z.literal("connection.pong"),
    requestId: requestIdSchema,
    payload: z
      .object({
        timestamp: z.number().optional()
      })
      .optional()
  }),
  z.object({
    type: z.literal("agent.list"),
    requestId: requestIdSchema,
    payload: z.object({
      agents: z.array(agentOptionSchema)
    })
  }),
  z.object({
    type: z.literal("command.rejected"),
    requestId: requestIdSchema.optional(),
    payload: z.object({
      message: z.string().min(1),
      detail: z.string().min(1).optional(),
      code: commandRejectionCodeSchema.optional()
    })
  }),
  z.object({
    type: z.literal("cli-updates.checked"),
    requestId: requestIdSchema,
    payload: z.object({
      updates: z.array(cliUpdateNotificationSchema).max(8),
      notifications: notificationInboxStateSchema
    })
  }),
  z.object({
    type: z.literal("cli-updates.installed"),
    requestId: requestIdSchema,
    payload: z.object({
      agentId: cliUpdateTargetIdSchema,
      label: z.string().min(1).max(128),
      output: z.string().max(4000)
    })
  }),
  z.object({
    type: z.literal("preferences.saved"),
    requestId: requestIdSchema,
    payload: preferencesStateSchema.extend({
      setup: setupStateSchema
    })
  }),
  z.object({
    type: z.literal("preferences.apiKeyCleared"),
    requestId: requestIdSchema,
    payload: preferencesStateSchema.extend({
      setup: setupStateSchema
    })
  }),
  z.object({
    type: z.literal("branchfs.cleaned"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      summary: branchfsCleanupSummarySchema
    })
  }),
  z.object({
    type: z.literal("preferences.providerConnectionTested"),
    requestId: requestIdSchema,
    payload: z.object({
      provider: providerConnectionProviderSchema,
      status: providerConnectionStatusSchema,
      message: z.string().min(1).max(512),
      modelCount: z.number().int().min(0).max(10000).optional()
    })
  }),
  z.object({
    type: z.literal("setup.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      setup: setupStateSchema
    })
  }),
  z.object({
    type: z.literal("agent.runtime.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      agentRuntimes: z.array(agentRuntimeCapabilitySchema).max(8)
    })
  }),
  z.object({
    type: z.literal("terminal.shells.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      shells: z.array(terminalShellSchema).max(16)
    })
  }),
  z.object({
    type: z.literal("terminal.sessions.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      sessions: z.array(terminalSessionSchema).max(64),
      preferences: terminalPreferencesSchema,
      layout: terminalPaneLayoutSchema.optional()
    })
  }),
  z.object({
    type: z.literal("terminal.history.listed"),
    requestId: requestIdSchema,
    payload: z.object({
      scope: terminalHistoryScopeSchema,
      sessions: z.array(terminalSessionSchema).max(256)
    })
  }),
  z.object({
    type: z.literal("terminal.session.created"),
    requestId: requestIdSchema,
    payload: z.object({
      session: terminalSessionSchema
    })
  }),
  z.object({
    type: z.literal("terminal.session.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      session: terminalSessionSchema
    })
  }),
  z.object({
    type: z.literal("terminal.session.exited"),
    requestId: requestIdSchema,
    payload: z.object({
      session: terminalSessionSchema
    })
  }),
  z.object({
    type: z.literal("terminal.session.attach-ready"),
    requestId: requestIdSchema,
    payload: z.object({
      sessionId: z.string().min(1).max(128),
      attachToken: terminalAttachTokenSchema,
      snapshot: z.string().max(2_000_000)
    }).superRefine(requireAttachSessionCorrespondence)
  }),
  z.object({
    type: z.literal("terminal.preferences.saved"),
    requestId: requestIdSchema,
    payload: z.object({
      preferences: terminalPreferencesSchema,
      layout: terminalPaneLayoutSchema.optional()
    })
  }),
  z.object({
    type: z.literal("cli-session.started"),
    requestId: requestIdSchema,
    payload: cliSessionLifecyclePayloadSchema
  }),
  z.object({
    type: z.literal("cli-session.updated"),
    requestId: requestIdSchema,
    payload: cliSessionLifecyclePayloadSchema
  }),
  z.object({
    type: z.literal("cli-session.attach-ready"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: z.string().min(1).max(128),
      attachToken: cliAttachTokenSchema
    }).superRefine(requireAttachSessionCorrespondence)
  }),
  z.object({
    type: z.literal("cli-session.exited"),
    requestId: requestIdSchema,
    payload: cliSessionLifecyclePayloadSchema
  })
] as const;
