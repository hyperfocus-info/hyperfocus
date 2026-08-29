import { z } from "zod";

import {
  chatMessageSchema,
  memorySummarySchema,
  modeDefinitionSchema,
  workspaceRuleSourceSchema
} from "./conversation";
import {
  agentRunStateSchema,
  agentRunSummarySchema
} from "./execution";
import {
  agentIdSchema,
  backgroundJobThreadKindSchema,
  boundedPageCursorSchema,
  executionModelIdSchema,
  modeIdSchema,
  projectIdSchema,
  projectNameSchema,
  projectRootPathSchema,
  projectSearchMatchKindSchema,
  projectSearchRepoKindSchema,
  runIdSchema,
  sessionIdSchema,
  threadBadgeStateSchema,
  threadIdSchema,
  threadTitleSchema,
  threadTitleSourceSchema,
  WORKSPACE_BOOTSTRAP_PROJECT_LIMIT,
  WORKSPACE_FILE_PATH_PAGE_LIMIT,
  WORKSPACE_MESSAGE_PAGE_LIMIT,
  WORKSPACE_RUN_SUMMARY_PAGE_LIMIT,
  WORKSPACE_THREAD_PAGE_LIMIT
} from "./shared";

export const cliSessionStatusSchema = z.enum(["starting", "running", "stopped", "exited", "failed"]);
export const cliSessionAttachStateSchema = z.enum(["detached", "attached"]);

export const cliSessionSchema = z.object({
  id: z.string().min(1).max(128),
  projectId: projectIdSchema,
  threadId: threadIdSchema,
  runId: runIdSchema.optional(),
  agentId: agentIdSchema,
  cwd: z.string().min(1).max(4096),
  status: cliSessionStatusSchema,
  cols: z.number().int().min(1).max(1000),
  rows: z.number().int().min(1).max(1000),
  attachState: cliSessionAttachStateSchema,
  idleTimeoutMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
  totalTimeoutMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
  lastStdoutAt: z.string().datetime().or(z.string().min(1)).optional(),
  lastStderrAt: z.string().datetime().or(z.string().min(1)).optional(),
  startedAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  exitedAt: z.string().datetime().or(z.string().min(1)).optional(),
  exitCode: z.number().int().min(-1).max(65535).optional()
});

export const cliAttachTokenSchema = z.object({
  token: z.string().min(16).max(512),
  sessionId: z.string().min(1).max(128),
  clientId: z.string().min(1).max(128),
  expiresAt: z.string().datetime().or(z.string().min(1)),
  usedAt: z.string().datetime().or(z.string().min(1)).optional()
});

export const terminalShellKindSchema = z.enum(["powershell", "cmd", "bash", "zsh", "sh", "custom"]);
export const terminalSessionStatusSchema = z.enum(["starting", "running", "stopped", "exited", "failed"]);
export const terminalTransportModeSchema = z.enum(["pty", "pipe"]);
export const terminalCtrlCModeSchema = z.enum(["auto", "copy", "sigint"]);
export const terminalRendererModeSchema = z.enum(["xterm-webgl", "xterm-dom", "solid-prototype"]);
export const terminalSessionSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("user"),
    label: z.string().min(1).max(128).optional()
  }),
  z.object({
    kind: z.literal("agent"),
    threadId: threadIdSchema,
    runId: runIdSchema.optional(),
    label: z.string().min(1).max(128),
    trigger: z.enum(["project-chat", "run", "assistant", "background-job"]).default("project-chat")
  })
]);
export const terminalSessionInputModeSchema = z.enum(["interactive", "read-only"]);

export const terminalShellSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(128),
  executableLabel: z.string().min(1).max(512),
  kind: terminalShellKindSchema,
  available: z.boolean(),
  default: z.boolean()
});

export const terminalEnvVarSchema = z.object({
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  value: z.string().max(4096).optional(),
  secret: z.boolean().default(false)
});

export const terminalSessionSchema = z.object({
  id: z.string().min(1).max(128),
  projectId: projectIdSchema,
  source: terminalSessionSourceSchema.optional(),
  name: z.string().min(1).max(128),
  shellId: z.string().min(1).max(128),
  cwd: z.string().min(1).max(4096),
  status: terminalSessionStatusSchema,
  inputMode: terminalSessionInputModeSchema.optional(),
  inputOverride: z.boolean().optional(),
  inputLockReason: z.string().min(1).max(512).optional(),
  cols: z.number().int().min(1).max(1000),
  rows: z.number().int().min(1).max(1000),
  transportMode: terminalTransportModeSchema.optional(),
  transportWarning: z.string().min(1).max(512).optional(),
  pid: z.number().int().min(0).optional(),
  exitCode: z.number().int().min(-1).max(65535).optional(),
  startedAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  exitedAt: z.string().datetime().or(z.string().min(1)).optional(),
  closedAt: z.string().datetime().or(z.string().min(1)).optional(),
  serverRestarted: z.boolean().optional()
});

export const terminalHistoryScopeSchema = z.object({
  projectId: projectIdSchema,
  threadId: threadIdSchema.optional(),
  runId: runIdSchema.optional()
});

export type TerminalPaneLayoutInput =
  | {
      type: "leaf";
      id: string;
      sessionId?: string;
    }
  | {
      type: "split";
      id: string;
      direction: "horizontal" | "vertical";
      sizes: number[];
      children: TerminalPaneLayoutInput[];
    };

export const terminalPaneLayoutSchema: z.ZodType<TerminalPaneLayoutInput> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("leaf"),
      id: z.string().min(1).max(128),
      sessionId: z.string().min(1).max(128).optional()
    }),
    z.object({
      type: z.literal("split"),
      id: z.string().min(1).max(128),
      direction: z.enum(["horizontal", "vertical"]),
      sizes: z.array(z.number().min(5).max(95)).min(2).max(4),
      children: z.array(terminalPaneLayoutSchema).min(2).max(4)
    })
  ])
);

export const terminalPreferencesSchema = z.object({
  defaultShellId: z.string().min(1).max(128).optional(),
  scrollbackLimit: z.number().int().min(1000).max(200000).default(10000),
  copyOnSelect: z.boolean().default(false),
  ctrlCMode: terminalCtrlCModeSchema.default("auto"),
  rendererMode: terminalRendererModeSchema.default("solid-prototype")
});

export const terminalAttachTokenSchema = z.object({
  token: z.string().min(16).max(512),
  sessionId: z.string().min(1).max(128),
  clientId: z.string().min(1).max(128),
  expiresAt: z.string().datetime().or(z.string().min(1)),
  usedAt: z.string().datetime().or(z.string().min(1)).optional()
});

export const chatSessionStateSchema = z.object({
  sessionId: sessionIdSchema,
  selectedAgentId: agentIdSchema.optional(),
  executionModelId: executionModelIdSchema.optional(),
  messages: z.array(chatMessageSchema).max(WORKSPACE_MESSAGE_PAGE_LIMIT),
  isStreaming: z.boolean(),
  lastError: z.string().min(1).optional()
});

export const projectThreadSummarySchema = z.object({
  id: threadIdSchema,
  kind: backgroundJobThreadKindSchema,
  status: z.enum(["active", "archived"]),
  pinned: z.boolean().optional(),
  title: threadTitleSchema,
  titleSource: threadTitleSourceSchema,
  badgeState: threadBadgeStateSchema,
  messageCount: z.number().int().min(0),
  lastMessagePreview: z.string().min(1).optional(),
  createdAt: z.string().datetime().or(z.string().min(1)).optional(),
  lastUserMessageAt: z.string().datetime().or(z.string().min(1)).optional(),
  archivedAt: z.string().datetime().or(z.string().min(1)).optional(),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  forkedFromThreadId: threadIdSchema.optional()
});

export const projectSearchResultSchema = z.object({
  id: z.string().min(1).max(512),
  name: projectNameSchema,
  rootPath: projectRootPathSchema,
  repoKind: projectSearchRepoKindSchema,
  matchKind: projectSearchMatchKindSchema,
  activeRunCount: z.number().int().min(0).optional(),
  pendingApprovalCount: z.number().int().min(0).optional(),
  pendingQuestionCount: z.number().int().min(0).optional(),
  failedJobCount: z.number().int().min(0).optional(),
  lastThreadPreview: z.string().max(240).optional(),
  detectedFrameworks: z.array(z.string().min(1).max(48)).max(8).optional()
});

export const ideFilePathSchema = z.string().min(1).max(4096);
export const workspaceFilePathPageSchema = z.object({
  items: z.array(ideFilePathSchema).max(WORKSPACE_FILE_PATH_PAGE_LIMIT),
  nextCursor: boundedPageCursorSchema.optional(),
  totalApprox: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional()
}).superRefine(({ items }, context) => {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item)) context.addIssue({ code: "custom", message: "File path page items must be unique", path: ["items", index] });
    seen.add(item);
  });
});
export const ideFileTreeEntrySchema = z.object({
  path: ideFilePathSchema,
  name: z.string().min(1).max(512),
  kind: z.enum(["file", "directory"]),
  depth: z.number().int().min(0).max(256),
  parentPath: ideFilePathSchema.optional(),
  hasChildren: z.boolean().optional()
});
export const ideFileReadSchema = z.object({
  projectId: projectIdSchema,
  path: ideFilePathSchema,
  name: z.string().min(1).max(512),
  language: z.string().min(1).max(64),
  encoding: z.string().min(1).max(32),
  sizeBytes: z.number().int().min(0),
  lineCount: z.number().int().min(0),
  isBinary: z.boolean(),
  tooLarge: z.boolean(),
  content: z.string().max(2_000_000).optional()
});
export const ideSearchMatchSchema = z.object({
  line: z.number().int().min(1),
  column: z.number().int().min(1),
  preview: z.string().max(500)
});
export const ideSearchResultSchema = z.object({
  path: ideFilePathSchema,
  name: z.string().min(1).max(512),
  matches: z.array(ideSearchMatchSchema).max(64)
});
export const ideGitChangeSchema = z.object({
  path: ideFilePathSchema,
  originalPath: ideFilePathSchema.optional(),
  status: z.enum(["modified", "added", "deleted", "renamed", "untracked", "copied", "conflicted"]),
  shortStatus: z.string().min(1).max(4)
});

export const workspaceProjectStateSchema = z.object({
  id: projectIdSchema,
  name: projectNameSchema,
  rootPath: projectRootPathSchema,
  filePaths: z.array(z.string().min(1).max(4096)).max(WORKSPACE_FILE_PATH_PAGE_LIMIT).optional(),
  filePathsNextCursor: boundedPageCursorSchema.optional(),
  activeThreadId: threadIdSchema,
  selectedModeId: modeIdSchema.optional(),
  projectModes: z.array(modeDefinitionSchema).max(16).optional(),
  projectRuleSource: workspaceRuleSourceSchema.optional(),
  threadMemorySummary: memorySummarySchema.optional(),
  threads: z.array(projectThreadSummarySchema).min(1).max(WORKSPACE_THREAD_PAGE_LIMIT),
  threadsNextCursor: boundedPageCursorSchema.optional(),
  session: chatSessionStateSchema,
  messagesNextCursor: boundedPageCursorSchema.optional(),
  activeCliSession: cliSessionSchema.optional(),
  cliSessions: z.array(cliSessionSchema).max(64).optional(),
  activeRun: agentRunStateSchema.optional(),
  lastRun: agentRunStateSchema.optional(),
  runSummaries: z.array(agentRunSummarySchema).max(WORKSPACE_RUN_SUMMARY_PAGE_LIMIT),
  runSummariesNextCursor: boundedPageCursorSchema.optional()
}).superRefine((project, ctx) => {
  if (!project.threads.some((thread) => thread.id === project.activeThreadId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Project activeThreadId must reference an existing thread",
      path: ["activeThreadId"]
    });
  }
});

export const workspaceStateSchema = z.object({
  projects: z.array(workspaceProjectStateSchema).max(WORKSPACE_BOOTSTRAP_PROJECT_LIMIT),
  projectsNextCursor: boundedPageCursorSchema.optional(),
  workspaceModes: z.array(modeDefinitionSchema).max(16).optional(),
  workspaceRuleSource: workspaceRuleSourceSchema.optional(),
  workspaceMemorySummary: memorySummarySchema.optional(),
  activeProjectId: projectIdSchema.optional()
}).superRefine((workspace, ctx) => {
  if (workspace.projects.length === 0) {
    if (workspace.activeProjectId !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Workspace activeProjectId must be undefined when no projects exist",
        path: ["activeProjectId"]
      });
    }
    return;
  }

  if (!workspace.activeProjectId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Workspace activeProjectId is required when projects exist",
      path: ["activeProjectId"]
    });
    return;
  }

  if (!workspace.projects.some((project) => project.id === workspace.activeProjectId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Workspace activeProjectId must reference an existing project",
      path: ["activeProjectId"]
    });
  }
});

export const tokenUsageTotalsSchema = z.object({
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  cachedInputTokens: z.number().int().min(0),
  totalProcessedTokens: z.number().int().min(0),
  totalTokensIncludingCached: z.number().int().min(0),
  events: z.number().int().min(0),
  updatedAt: z.string().datetime().or(z.string().min(1)).optional()
});

export const tokenUsageStateSchema = z.object({
  session: tokenUsageTotalsSchema,
  lifetime: tokenUsageTotalsSchema,
  resetAt: z.string().datetime().or(z.string().min(1)).optional()
});

export type CliSessionStatus = z.infer<typeof cliSessionStatusSchema>;
export type CliSessionAttachState = z.infer<typeof cliSessionAttachStateSchema>;
export type CliSession = z.infer<typeof cliSessionSchema>;
export type CliAttachToken = z.infer<typeof cliAttachTokenSchema>;
export type TerminalShell = z.infer<typeof terminalShellSchema>;
export type TerminalShellKind = z.infer<typeof terminalShellKindSchema>;
export type TerminalSessionStatus = z.infer<typeof terminalSessionStatusSchema>;
export type TerminalTransportMode = z.infer<typeof terminalTransportModeSchema>;
export type TerminalSessionSource = z.infer<typeof terminalSessionSourceSchema>;
export type TerminalSessionInputMode = z.infer<typeof terminalSessionInputModeSchema>;
export type TerminalSession = z.infer<typeof terminalSessionSchema>;
export type TerminalEnvVar = z.infer<typeof terminalEnvVarSchema>;
export type TerminalHistoryScope = z.infer<typeof terminalHistoryScopeSchema>;
export type TerminalPaneLayout = z.infer<typeof terminalPaneLayoutSchema>;
export type TerminalPreferences = z.infer<typeof terminalPreferencesSchema>;
export type TerminalAttachToken = z.infer<typeof terminalAttachTokenSchema>;
export type ChatSessionState = z.infer<typeof chatSessionStateSchema>;
export type ProjectThreadSummary = z.infer<typeof projectThreadSummarySchema>;
export type ProjectSearchResult = z.infer<typeof projectSearchResultSchema>;
export type IdeFileTreeEntry = z.infer<typeof ideFileTreeEntrySchema>;
export type IdeFileRead = z.infer<typeof ideFileReadSchema>;
export type IdeSearchResult = z.infer<typeof ideSearchResultSchema>;
export type IdeGitChange = z.infer<typeof ideGitChangeSchema>;
export type WorkspaceProjectState = z.infer<typeof workspaceProjectStateSchema>;
export type WorkspaceState = z.infer<typeof workspaceStateSchema>;
export type TokenUsageTotals = z.infer<typeof tokenUsageTotalsSchema>;
export type TokenUsageState = z.infer<typeof tokenUsageStateSchema>;
