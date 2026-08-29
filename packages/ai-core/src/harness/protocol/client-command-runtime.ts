import { z } from "zod";
import { modeDefinitionSchema } from "./conversation";
import { runDiagnosticsWindowDaysSchema } from "./execution";
import {
  assistantMaxCongestionDefaultSchema,
  maxBackgroundJobsDefaultSchema,
  providerConnectionProviderSchema,
  runModelPreferenceSchema
} from "./settings";
import {
  agentIdSchema,
  autoCompactContextThresholdPercentSchema,
  backgroundJobApprovalPolicySchema,
  correctnessIterationModeSchema,
  dirtyGitChangeLimitSchema,
  modeIdSchema,
  planExecutionModeSchema,
  projectIdSchema,
  providerBrandSchema,
  requestIdSchema,
  runIdSchema,
  subagentWorktreeStrategySchema,
  threadIdSchema
} from "./shared";
import {
  terminalEnvVarSchema,
  terminalHistoryScopeSchema,
  terminalPaneLayoutSchema,
  terminalPreferencesSchema
} from "./workspace";

export const runtimeClientCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("agent.runtime.refresh"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("terminal.shells.list"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("terminal.sessions.list"),
    requestId: requestIdSchema,
    payload: z
      .object({
        projectId: projectIdSchema.optional()
      })
      .optional()
  }),
  z.object({
    type: z.literal("terminal.history.list"),
    requestId: requestIdSchema,
    payload: terminalHistoryScopeSchema
  }),
  z.object({
    type: z.literal("terminal.session.create"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      name: z.string().min(1).max(128).optional(),
      shellId: z.string().min(1).max(128).optional(),
      cwd: z.string().min(1).max(4096).optional(),
      cols: z.number().int().min(1).max(1000),
      rows: z.number().int().min(1).max(1000),
      env: z.array(terminalEnvVarSchema).max(64).optional()
    })
  }),
  z.object({
    type: z.literal("terminal.session.set-input-override"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      sessionId: z.string().min(1).max(128),
      allowInput: z.boolean()
    })
  }),
  z.object({
    type: z.literal("terminal.session.rename"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      sessionId: z.string().min(1).max(128),
      name: z.string().min(1).max(128)
    })
  }),
  z.object({
    type: z.literal("terminal.session.stop"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      sessionId: z.string().min(1).max(128)
    })
  }),
  z.object({
    type: z.literal("terminal.session.close"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      sessionId: z.string().min(1).max(128)
    })
  }),
  z.object({
    type: z.literal("terminal.session.restart"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      sessionId: z.string().min(1).max(128),
      cols: z.number().int().min(1).max(1000),
      rows: z.number().int().min(1).max(1000)
    })
  }),
  z.object({
    type: z.literal("terminal.session.resize"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      sessionId: z.string().min(1).max(128),
      cols: z.number().int().min(1).max(1000),
      rows: z.number().int().min(1).max(1000)
    })
  }),
  z.object({
    type: z.literal("terminal.session.attach"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      sessionId: z.string().min(1).max(128)
    })
  }),
  z.object({
    type: z.literal("terminal.preferences.save"),
    requestId: requestIdSchema,
    payload: z.object({
      preferences: terminalPreferencesSchema,
      layout: terminalPaneLayoutSchema.optional()
    })
  }),
  z.object({
    type: z.literal("cli-session.start"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      agentId: agentIdSchema.exclude(["pi"]),
      cols: z.number().int().min(1).max(1000),
      rows: z.number().int().min(1).max(1000),
      prompt: z.string().min(1).max(32000).optional(),
      runId: runIdSchema.optional()
    })
  }),
  z.object({
    type: z.literal("cli-session.stop"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: z.string().min(1).max(128)
    })
  }),
  z.object({
    type: z.literal("cli-session.resize"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: z.string().min(1).max(128),
      cols: z.number().int().min(1).max(1000),
      rows: z.number().int().min(1).max(1000)
    })
  }),
  z.object({
    type: z.literal("cli-session.attach"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: z.string().min(1).max(128)
    })
  }),
  z.object({
    type: z.literal("cli-session.capture-visible-buffer"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: z.string().min(1).max(128),
      visibleBuffer: z.string().max(64000),
      stderrTail: z.string().max(32000).optional()
    })
  }),
  z.object({
    type: z.literal("project.mode.select"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      modeId: modeIdSchema
    })
  }),
  z.object({
    type: z.literal("mode.save"),
    requestId: requestIdSchema,
    payload: z
      .object({
        scope: z.enum(["workspace", "project"]),
        projectId: projectIdSchema.optional(),
        mode: modeDefinitionSchema.omit({ scope: true }).extend({
          scope: z.enum(["workspace", "project"])
        })
      })
      .superRefine((payload, ctx) => {
        if (payload.scope === "project" && !payload.projectId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "projectId is required for project-scoped modes",
            path: ["projectId"]
          });
        }
      })
  }),
  z.object({
    type: z.literal("mode.delete"),
    requestId: requestIdSchema,
    payload: z
      .object({
        scope: z.enum(["workspace", "project"]),
        projectId: projectIdSchema.optional(),
        modeId: modeIdSchema
      })
      .superRefine((payload, ctx) => {
        if (payload.scope === "project" && !payload.projectId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "projectId is required for project-scoped modes",
            path: ["projectId"]
          });
        }
      })
  }),
  z.object({
    type: z.literal("workspace.context.save"),
    requestId: requestIdSchema,
    payload: z.object({
      rulesContent: z.string().max(32000).optional(),
      memorySummaryContent: z.string().max(32000).optional()
    })
  }),
  z.object({
    type: z.literal("project.context.save"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      rulesContent: z.string().max(32000).optional(),
      threadMemorySummaryContent: z.string().max(32000).optional()
    })
  }),
  z.object({
    type: z.literal("preferences.save"),
    requestId: requestIdSchema,
    payload: z.object({
      openAiApiKey: z.string().min(1).max(1024).optional(),
      googleApiKey: z.string().min(1).max(1024).optional(),
      anthropicApiKey: z.string().min(1).max(1024).optional(),
      providerBrand: providerBrandSchema,
      debugEnabled: z.boolean(),
      tracePanelDefaultOpen: z.boolean(),
      subagentWorktreeStrategyDefault: subagentWorktreeStrategySchema,
      blockChatOnDirtyGitDefault: z.boolean(),
      dirtyGitChangeLimitDefault: dirtyGitChangeLimitSchema,
      autoCompactContextThresholdPercentDefault: autoCompactContextThresholdPercentSchema,
      planExecutionModeDefault: planExecutionModeSchema,
      planExecutionDelaySecondsDefault: z.number().int().min(0).max(300),
      singleAgentModelPreferenceDefault: runModelPreferenceSchema.optional(),
      subagentModelPreferenceDefault: runModelPreferenceSchema.optional(),
      correctnessIterationModeDefault: correctnessIterationModeSchema,
      backgroundJobApprovalPolicyDefault: backgroundJobApprovalPolicySchema,
      assistantAutoApproveNonBlockingQuestionsDefault: z.boolean().optional(),
      assistantCongestionControlEnabledDefault: z.boolean().optional(),
      assistantMaxCongestionDefault: assistantMaxCongestionDefaultSchema.optional(),
      maxBackgroundJobsDefault: maxBackgroundJobsDefaultSchema.optional(),
      autoArchiveCompletedThreadsDefault: z.boolean().optional(),
      memoryBankEnabledDefault: z.boolean().optional(),
      memoryBankRecordRunsDefault: z.boolean().optional(),
      checkCliUpdatesDefault: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal("preferences.testProviderConnection"),
    requestId: requestIdSchema,
    payload: z.object({
      provider: providerConnectionProviderSchema,
      apiKey: z.string().min(1).max(1024).optional()
    })
  }),
  z.object({
    type: z.literal("preferences.clearApiKey"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("run-diagnostics.inspect"),
    requestId: requestIdSchema,
    payload: z
      .object({
        windowDays: runDiagnosticsWindowDaysSchema.optional()
      })
      .optional()
  })
]);
