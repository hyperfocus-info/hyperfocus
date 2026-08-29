import {
  type AgentPlan,
  type AgentRunState,
  type AgentTrace,
  type CliSession,
  type MemorySummary,
  type ModeDefinition,
  type ProjectContextUsage,
  type ProjectId,
  type StreamingTailSegment,
  type WorkspaceProjectState,
  type WorkspaceRuleSource,
  type WorkspaceState
} from "@hyperfocus/ai-core/protocol";
import { getExecutionKey, type ManagedExecutionState } from "./execution-runtime";

export type RuntimeProjectState = WorkspaceProjectState & {
  latestPlan?: AgentPlan;
  contextUsage?: ProjectContextUsage;
  traces: AgentTrace[];
  streamingAssistantText: string;
  streamingTailSegments: StreamingTailSegment[];
  draft: string;
  lastError?: string;
};

type RuntimeThreadState = {
  sessionId: string;
  isStreaming: boolean;
  lastError?: string;
  latestPlan?: AgentPlan;
  contextUsage?: ProjectContextUsage;
  traces: AgentTrace[];
  streamingAssistantText: string;
  streamingTailSegments: StreamingTailSegment[];
  capturedCliContext?: CapturedCliSessionContext;
};

type RuntimeProjectRecord = {
  project: RuntimeProjectState;
  threadStates: Map<string, RuntimeThreadState>;
  abortControllers: Map<string, AbortController>;
  executions: Map<string, ManagedExecutionState>;
};

type RuntimeStoreState = {
  projects: Map<ProjectId, RuntimeProjectRecord>;
  activeProjectId?: ProjectId;
  workspaceModes: ModeDefinition[];
  workspaceRuleSource?: WorkspaceRuleSource;
  workspaceMemorySummary?: MemorySummary;
};

export type CapturedCliSessionContext = {
  sessionId: string;
  capturedAt: string;
  visibleBuffer: string;
  stderrTail?: string;
};

export function createWorkspaceRuntimeStore(workspace: WorkspaceState) {
  const state = createRuntimeStoreState(workspace);
  return {
    ...createWorkspaceProjectOperations(state),
    ...createThreadRuntimeOperations(state),
    ...createExecutionRuntimeOperations(state)
  };
}

export type WorkspaceRuntimeStore = ReturnType<typeof createWorkspaceRuntimeStore>;

function createRuntimeStoreState(workspace: WorkspaceState): RuntimeStoreState {
  const projects = new Map<ProjectId, RuntimeProjectRecord>();
  for (const project of workspace.projects) {
    const runtimeProject = createRuntimeProject(project);
    projects.set(project.id, createRuntimeProjectRecord(runtimeProject));
  }
  return {
    projects,
    activeProjectId: workspace.activeProjectId,
    workspaceModes: [...(workspace.workspaceModes ?? [])],
    workspaceRuleSource: workspace.workspaceRuleSource,
    workspaceMemorySummary: workspace.workspaceMemorySummary
  };
}

function createRuntimeProjectRecord(project: RuntimeProjectState): RuntimeProjectRecord {
  return {
    project,
    threadStates: new Map([[project.activeThreadId, createThreadRuntimeState(project)]]),
    abortControllers: new Map(),
    executions: new Map()
  };
}

function createWorkspaceProjectOperations(state: RuntimeStoreState) {
  return {
    getWorkspace(): WorkspaceState {
      return {
        projects: Array.from(state.projects.values()).map((record) => stripRuntimeProject(record.project)),
        workspaceModes: [...state.workspaceModes],
        workspaceRuleSource: state.workspaceRuleSource,
        workspaceMemorySummary: state.workspaceMemorySummary,
        activeProjectId: state.activeProjectId
      };
    },
    getWorkspaceMetadata(): Omit<WorkspaceState, "projects"> {
      return {
        workspaceModes: [...state.workspaceModes],
        workspaceRuleSource: state.workspaceRuleSource,
        workspaceMemorySummary: state.workspaceMemorySummary,
        activeProjectId: state.activeProjectId
      };
    },
    getProject(projectId: ProjectId) {
      return getProjectRecord(state, projectId).project;
    },
    hasProject(projectId: ProjectId) {
      return state.projects.has(projectId);
    },
    upsertPersistedProject(project: WorkspaceProjectState) {
      const existing = state.projects.get(project.id);
      if (!existing) {
        const runtimeProject = createRuntimeProject(project);
        state.projects.set(project.id, createRuntimeProjectRecord(runtimeProject));
        return;
      }

      persistActiveThreadState(existing);
      const nextThreadStates = filterKnownThreadStates(existing.threadStates, project.threads.map((thread) => thread.id));
      const nextProject = hydrateProjectState(existing.project, nextThreadStates, project);
      nextThreadStates.set(nextProject.activeThreadId, createThreadRuntimeState(nextProject));
      state.projects.set(project.id, {
        project: nextProject,
        threadStates: nextThreadStates,
        abortControllers: existing.abortControllers,
        executions: existing.executions
      });
    },
    removeProject(projectId: ProjectId, activeProjectId?: ProjectId) {
      state.projects.delete(projectId);
      state.activeProjectId = activeProjectId;
    },
    setActiveProject(projectId: ProjectId) {
      getProjectRecord(state, projectId);
      state.activeProjectId = projectId;
    },
    replaceWorkspaceState(nextWorkspace: WorkspaceState) {
      state.workspaceModes = [...(nextWorkspace.workspaceModes ?? [])];
      state.workspaceRuleSource = nextWorkspace.workspaceRuleSource;
      state.workspaceMemorySummary = nextWorkspace.workspaceMemorySummary;
      state.activeProjectId = nextWorkspace.activeProjectId;
    },
    setProjectExecutionModel(projectId: ProjectId, executionModelId?: string) {
      updateProjectState(state, projectId, (project) => ({
        ...project,
        session: { ...project.session, executionModelId }
      }));
    },
    setProjectSelectedAgentId(projectId: ProjectId, selectedAgentId?: RuntimeProjectState["session"]["selectedAgentId"]) {
      updateProjectState(state, projectId, (project) => ({
        ...project,
        session: { ...project.session, selectedAgentId }
      }));
    },
    setProjectRun(projectId: ProjectId, activeRun?: AgentRunState) {
      updateProjectState(state, projectId, (project) => ({ ...project, activeRun }));
    },
    setProjectCliSession(projectId: ProjectId, activeCliSession?: CliSession) {
      updateProjectState(state, projectId, (project) => ({
        ...project,
        activeCliSession:
          activeCliSession && project.activeThreadId === activeCliSession.threadId
            ? activeCliSession
            : project.activeCliSession?.threadId === activeCliSession?.threadId
              ? undefined
              : project.activeCliSession,
        cliSessions: upsertCliSession(project.cliSessions ?? [], activeCliSession)
      }));
    }
  };
}

function createThreadRuntimeOperations(state: RuntimeStoreState) {
  return {
    getThreadRuntime(projectId: ProjectId, threadId: string) {
      return readThreadRuntime(state, projectId, threadId);
    },
    setProjectStreaming(projectId: ProjectId, isStreaming: boolean, threadId?: string) {
      updateThreadState(state, projectId, threadId, (threadState) => ({ ...threadState, isStreaming }));
    },
    setProjectError(projectId: ProjectId, lastError?: string, threadId?: string) {
      updateThreadState(state, projectId, threadId, (threadState) => ({ ...threadState, lastError }));
    },
    setProjectPlan(projectId: ProjectId, latestPlan?: AgentPlan, threadId?: string) {
      updateThreadState(state, projectId, threadId, (threadState) => ({ ...threadState, latestPlan }));
    },
    setThreadCapturedCliContext(projectId: ProjectId, threadId: string, context?: CapturedCliSessionContext) {
      updateThreadState(state, projectId, threadId, (threadState) => ({
        ...threadState,
        capturedCliContext: context
      }));
    },
    consumeThreadCapturedCliContext(projectId: ProjectId, threadId: string) {
      const current = readThreadRuntime(state, projectId, threadId)?.capturedCliContext;
      if (!current) {
        return undefined;
      }
      updateThreadState(state, projectId, threadId, (threadState) => ({
        ...threadState,
        capturedCliContext: undefined
      }));
      return current;
    },
    setProjectContextUsage(projectId: ProjectId, contextUsage?: ProjectContextUsage, threadId?: string) {
      updateThreadState(state, projectId, threadId, (threadState) => ({ ...threadState, contextUsage }));
    },
    appendTrace(projectId: ProjectId, trace: AgentTrace, threadId?: string) {
      updateThreadState(state, projectId, threadId, (threadState) => ({
        ...threadState,
        traces: [...threadState.traces, trace]
      }));
    },
    appendStreamingDelta(projectId: ProjectId, delta: string, threadId?: string) {
      updateThreadState(state, projectId, threadId, (threadState) => ({
        ...threadState,
        streamingAssistantText: `${threadState.streamingAssistantText}${delta}`
      }));
    },
    setStreamingTail(projectId: ProjectId, segments: StreamingTailSegment[], threadId?: string) {
      updateThreadState(state, projectId, threadId, (threadState) => ({
        ...threadState,
        streamingTailSegments: segments
      }));
    },
    clearStreaming(projectId: ProjectId, threadId?: string) {
      updateThreadState(state, projectId, threadId, (threadState) => ({
        ...threadState,
        streamingAssistantText: "",
        streamingTailSegments: []
      }));
    },
    clearProjectTransients(projectId: ProjectId, threadId?: string) {
      clearProjectTransientState(state, projectId, threadId);
    }
  };
}

function createExecutionRuntimeOperations(state: RuntimeStoreState) {
  return {
    setAbortController(projectId: ProjectId, runId: string, abortController?: AbortController) {
      const record = getProjectRecord(state, projectId);
      if (abortController) {
        record.abortControllers.set(runId, abortController);
        return;
      }
      record.abortControllers.delete(runId);
    },
    getAbortController(projectId: ProjectId, runId: string) {
      return state.projects.get(projectId)?.abortControllers.get(runId);
    },
    hasAnyStreamingThread(projectId: ProjectId) {
      const record = getProjectRecord(state, projectId);
      return [...record.threadStates.values()].some((threadState) => threadState.isStreaming);
    },
    getExecutionState(projectId: ProjectId, input: Pick<ManagedExecutionState, "runId" | "subagentId" | "kind">) {
      return getProjectRecord(state, projectId).executions.get(getExecutionKey(input));
    },
    getRunExecutionStates(projectId: ProjectId, runId: string) {
      return [...getProjectRecord(state, projectId).executions.values()].filter((entry) => entry.runId === runId);
    },
    setExecutionState(projectId: ProjectId, executionState: ManagedExecutionState) {
      getProjectRecord(state, projectId).executions.set(getExecutionKey(executionState), executionState);
    },
    updateExecutionState(
      projectId: ProjectId,
      input: Pick<ManagedExecutionState, "runId" | "subagentId" | "kind">,
      updater: (executionState: ManagedExecutionState) => ManagedExecutionState
    ) {
      const record = getProjectRecord(state, projectId);
      const key = getExecutionKey(input);
      const current = record.executions.get(key);
      if (!current) {
        throw new Error(`Unknown execution state: ${key}`);
      }
      record.executions.set(key, updater(current));
    },
    clearExecutionState(projectId: ProjectId, input: Pick<ManagedExecutionState, "runId" | "subagentId" | "kind">) {
      getProjectRecord(state, projectId).executions.delete(getExecutionKey(input));
    },
    abortRun(projectId: ProjectId, runId: string) {
      abortRuntimeRun(state, projectId, runId);
    }
  };
}

function readThreadRuntime(state: RuntimeStoreState, projectId: ProjectId, threadId: string) {
  const record = getProjectRecord(state, projectId);
  if (record.project.activeThreadId === threadId) {
    return record.threadStates.get(threadId) ?? createThreadRuntimeState(record.project);
  }
  return record.threadStates.get(threadId);
}

function getProjectRecord(state: RuntimeStoreState, projectId: ProjectId) {
  const record = state.projects.get(projectId);
  if (!record) {
    throw new Error(`Unknown project: ${projectId}`);
  }
  return record;
}

function updateProjectState(
  state: RuntimeStoreState,
  projectId: ProjectId,
  updater: (project: RuntimeProjectState) => RuntimeProjectState
) {
  const record = getProjectRecord(state, projectId);
  const previousThreadState = record.threadStates.get(record.project.activeThreadId);
  record.project = updater(record.project);
  record.threadStates.set(record.project.activeThreadId, {
    ...createThreadRuntimeState(record.project),
    capturedCliContext: previousThreadState?.capturedCliContext
  });
}

function updateThreadState(
  state: RuntimeStoreState,
  projectId: ProjectId,
  threadId: string | undefined,
  updater: (threadState: RuntimeThreadState) => RuntimeThreadState
) {
  const record = getProjectRecord(state, projectId);
  const resolvedThreadId = threadId ?? record.project.activeThreadId;
  const next = updater(getOrCreateThreadState(record, resolvedThreadId));
  record.threadStates.set(resolvedThreadId, next);
  if (record.project.activeThreadId === resolvedThreadId) {
    record.project = applyThreadState(record.project, next);
  }
}

function clearProjectTransientState(state: RuntimeStoreState, projectId: ProjectId, threadId?: string) {
  const record = getProjectRecord(state, projectId);
  const resolvedThreadId = threadId ?? record.project.activeThreadId;
  updateThreadState(state, projectId, resolvedThreadId, (threadState) => ({
    ...threadState,
    latestPlan: undefined,
    contextUsage: undefined,
    traces: [],
    streamingAssistantText: "",
    streamingTailSegments: [],
    lastError: undefined,
    isStreaming: false
  }));
  record.executions = new Map(
    [...record.executions.entries()].filter(([, executionState]) => executionState.threadId !== resolvedThreadId)
  );
  if (record.project.activeThreadId === resolvedThreadId) {
    record.project = clearActiveProjectTransientState(record.project, resolvedThreadId);
  }
}

function clearActiveProjectTransientState(project: RuntimeProjectState, threadId: string): RuntimeProjectState {
  return {
    ...project,
    activeCliSession: project.activeCliSession?.threadId === threadId ? undefined : project.activeCliSession,
    activeRun: undefined,
    latestPlan: undefined,
    contextUsage: undefined,
    traces: [],
    streamingAssistantText: "",
    streamingTailSegments: [],
    lastError: undefined,
    session: { ...project.session, isStreaming: false, lastError: undefined }
  };
}

function abortRuntimeRun(state: RuntimeStoreState, projectId: ProjectId, runId: string) {
  const record = getProjectRecord(state, projectId);
  record.abortControllers.get(runId)?.abort();
  record.abortControllers.delete(runId);
  for (const [key, executionState] of record.executions.entries()) {
    if (executionState.runId !== runId) {
      continue;
    }
    const abortPromise = executionState.controller?.abort();
    if (abortPromise) {
      void abortPromise.catch(() => undefined);
    }
    record.executions.delete(key);
  }
}

function createRuntimeProject(project: WorkspaceProjectState): RuntimeProjectState {
  return {
    ...project,
    latestPlan: undefined,
    contextUsage: undefined,
    traces: [],
    streamingAssistantText: "",
    streamingTailSegments: [],
    draft: "",
    lastError: undefined
  };
}

function stripRuntimeProject(project: RuntimeProjectState): WorkspaceProjectState {
  return {
    id: project.id,
    name: project.name,
    rootPath: project.rootPath,
    activeThreadId: project.activeThreadId,
    selectedModeId: project.selectedModeId,
    projectModes: project.projectModes,
    projectRuleSource: project.projectRuleSource,
    threadMemorySummary: project.threadMemorySummary,
    threads: project.threads,
    session: project.session,
    activeCliSession: project.activeCliSession,
    cliSessions: project.cliSessions,
    activeRun: project.activeRun,
    lastRun: project.lastRun,
    runSummaries: project.runSummaries
  };
}

function hydrateProjectState(
  existing: RuntimeProjectState,
  threadStates: Map<string, RuntimeThreadState>,
  incoming: WorkspaceProjectState
): RuntimeProjectState {
  const fallbackProject = {
    ...existing,
    ...incoming,
    cliSessions: existing.cliSessions,
    latestPlan: undefined,
    contextUsage: undefined,
    traces: [],
    streamingAssistantText: "",
    streamingTailSegments: [],
    draft: existing.draft,
    lastError: undefined,
    session: {
      ...incoming.session,
      selectedAgentId: existing.session.selectedAgentId ?? incoming.session.selectedAgentId,
      executionModelId: existing.session.executionModelId ?? incoming.session.executionModelId,
      isStreaming: incoming.session.isStreaming,
      lastError: incoming.session.lastError
    }
  };
  const threadState = threadStates.get(incoming.activeThreadId) ?? createThreadRuntimeState(fallbackProject);
  return applyThreadState(fallbackProject, threadState);
}

function createThreadRuntimeState(
  project: Pick<
    RuntimeProjectState,
    "session" | "latestPlan" | "contextUsage" | "traces" | "streamingAssistantText" | "streamingTailSegments" | "lastError"
  >
): RuntimeThreadState {
  return {
    sessionId: project.session.sessionId,
    isStreaming: project.session.isStreaming,
    lastError: project.lastError ?? project.session.lastError,
    latestPlan: project.latestPlan,
    contextUsage: project.contextUsage,
    traces: [...project.traces],
    streamingAssistantText: project.streamingAssistantText,
    streamingTailSegments: [...project.streamingTailSegments]
  };
}

function getOrCreateThreadState(record: RuntimeProjectRecord, threadId: string) {
  return (
    record.threadStates.get(threadId) ?? {
      sessionId: threadId,
      isStreaming: false,
      lastError: undefined,
      latestPlan: undefined,
      contextUsage: undefined,
      traces: [],
      streamingAssistantText: "",
      streamingTailSegments: [],
      capturedCliContext: undefined
    }
  );
}

function applyThreadState(project: RuntimeProjectState, threadState: RuntimeThreadState): RuntimeProjectState {
  return {
    ...project,
    latestPlan: threadState.latestPlan,
    contextUsage: threadState.contextUsage,
    traces: [...threadState.traces],
    streamingAssistantText: threadState.streamingAssistantText,
    streamingTailSegments: [...threadState.streamingTailSegments],
    lastError: threadState.lastError,
    activeCliSession: (project.cliSessions ?? []).find((session) => session.threadId === threadState.sessionId),
    session: {
      ...project.session,
      sessionId: threadState.sessionId,
      isStreaming: threadState.isStreaming,
      lastError: threadState.lastError
    }
  };
}

function upsertCliSession(sessions: CliSession[], session?: CliSession) {
  if (!session) {
    return sessions;
  }
  const next = sessions.filter((entry) => entry.id !== session.id);
  if (session.status !== "exited" && session.status !== "failed" && session.status !== "stopped") {
    next.push(session);
  }
  return next;
}

function persistActiveThreadState(record: RuntimeProjectRecord) {
  const previous = record.threadStates.get(record.project.activeThreadId);
  record.threadStates.set(record.project.activeThreadId, {
    ...createThreadRuntimeState(record.project),
    capturedCliContext: previous?.capturedCliContext
  });
}

function filterKnownThreadStates(threadStates: Map<string, RuntimeThreadState>, knownThreadIds: string[]) {
  const knownIds = new Set(knownThreadIds);
  return new Map([...threadStates.entries()].filter(([threadId]) => knownIds.has(threadId)));
}
