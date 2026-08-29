import type {
  ChatMessage,
  ChatSessionState,
  ProjectId,
  RunMilestonesMessageMetadata,
  StreamingTailPhase,
  StreamingTailSegment,
  ThreadId
} from "@hyperfocus/ai-core/protocol";

export const WINDOW_IDLE_CLOSE_MS = 5000;
const UPDATE_COALESCE_MS = 100;
const MAX_VISIBLE_LINES = 16;
const MAX_STORED_LINE_LENGTH = 1200;
const MAX_RENDERED_LINE_LENGTH = 320;

type WindowKey = string;
export type RunMilestonePhase = StreamingTailPhase;

const PHASE_ORDER: RunMilestonePhase[] = ["planning", "subagents", "aggregation", "correctness"];
const PHASE_TITLES: Record<RunMilestonePhase, string> = {
  planning: "Planning",
  subagents: "Subagents",
  aggregation: "Aggregation",
  correctness: "Correctness"
};

type PhaseDraft = {
  phase: RunMilestonePhase;
  lines: string[];
  startedAt?: string;
  updatedAt?: string;
  heldFallback?: string;
  fallbackEmitted: boolean;
};

export type FinalizedRunMilestoneMessage = {
  content: string;
  metadata: RunMilestonesMessageMetadata;
};

type MilestoneWindow = {
  key: WindowKey;
  projectId: ProjectId;
  threadId: ThreadId;
  runId: string;
  windowId: string;
  messageId: string;
  lines: string[];
  startedAt: string;
  updatedAt: string;
  closeTimer: ReturnType<typeof setTimeout>;
  flushTimer?: ReturnType<typeof setTimeout>;
  pendingFlush: boolean;
  closed: boolean;
};

export type RunMilestoneWindowStore = {
  append(input: {
    projectId: ProjectId;
    threadId: ThreadId;
    content: string;
    metadata: RunMilestonesMessageMetadata;
  }): { message: ChatMessage; state: ChatSessionState };
  update(input: {
    projectId: ProjectId;
    threadId: ThreadId;
    messageId: string;
    content: string;
    metadata: RunMilestonesMessageMetadata;
  }): { message: ChatMessage; state: ChatSessionState };
  emitAppended(input: { projectId: ProjectId; threadId: ThreadId; message: ChatMessage; state: ChatSessionState }): void;
  emitUpdated(input: { projectId: ProjectId; threadId: ThreadId; message: ChatMessage; state: ChatSessionState }): void;
};

export type RunMilestoneWindowManager = ReturnType<typeof createRunMilestoneWindowManager>;

export function createRunMilestoneWindowManager(store: RunMilestoneWindowStore) {
  const windows = new Map<WindowKey, MilestoneWindow>();

  function record(input: { projectId: ProjectId; threadId: ThreadId; runId: string; line: string }) {
    const lines = splitMilestoneInput(input.line);
    if (lines.length === 0) {
      return;
    }

    const key = createWindowKey(input.projectId, input.threadId, input.runId);
    const existing = windows.get(key);
    if (existing && !existing.closed) {
      existing.lines.push(...lines);
      existing.updatedAt = new Date().toISOString();
      clearTimeout(existing.closeTimer);
      existing.closeTimer = setTimeout(() => closeWindow(key), WINDOW_IDLE_CLOSE_MS);
      scheduleFlush(existing);
      return;
    }

    const now = new Date().toISOString();
    const metadata: RunMilestonesMessageMetadata = {
      type: "run-milestones",
      runId: input.runId,
      windowId: crypto.randomUUID(),
      status: "open",
      startedAt: now,
      updatedAt: now,
      lineCount: lines.length,
      lines
    };
    const appended = store.append({
      projectId: input.projectId,
      threadId: input.threadId,
      content: renderMilestoneLines(lines),
      metadata
    });
    store.emitAppended({
      projectId: input.projectId,
      threadId: input.threadId,
      message: appended.message,
      state: appended.state
    });

    const window: MilestoneWindow = {
      key,
      projectId: input.projectId,
      threadId: input.threadId,
      runId: input.runId,
      windowId: metadata.windowId,
      messageId: appended.message.id,
      lines,
      startedAt: now,
      updatedAt: now,
      closeTimer: setTimeout(() => closeWindow(key), WINDOW_IDLE_CLOSE_MS),
      pendingFlush: false,
      closed: false
    };
    windows.set(key, window);
  }

  function closeRun(projectId: ProjectId, threadId: ThreadId, runId: string) {
    closeWindow(createWindowKey(projectId, threadId, runId));
  }

  function scheduleFlush(window: MilestoneWindow) {
    window.pendingFlush = true;
    if (window.flushTimer) {
      return;
    }

    window.flushTimer = setTimeout(() => {
      window.flushTimer = undefined;
      if (!window.pendingFlush || window.closed) {
        return;
      }

      window.pendingFlush = false;
      flushWindow(window, "open");
    }, UPDATE_COALESCE_MS);
  }

  function closeWindow(key: WindowKey) {
    const window = windows.get(key);
    if (!window || window.closed) {
      return;
    }

    window.closed = true;
    if (window.flushTimer) {
      clearTimeout(window.flushTimer);
      window.flushTimer = undefined;
    }
    clearTimeout(window.closeTimer);
    flushWindow(window, "closed");
    windows.delete(key);
  }

  function flushWindow(window: MilestoneWindow, status: "open" | "closed") {
    const metadata: RunMilestonesMessageMetadata = {
      type: "run-milestones",
      runId: window.runId,
      windowId: window.windowId,
      status,
      startedAt: window.startedAt,
      updatedAt: new Date().toISOString(),
      lineCount: window.lines.length,
      overflowCount: Math.max(0, aggregateMilestoneLines(window.lines).length - MAX_VISIBLE_LINES),
      hiddenLineCount: Math.max(0, aggregateMilestoneLines(window.lines).length - MAX_VISIBLE_LINES),
      truncatedLineCount: aggregateMilestoneLines(window.lines).filter((entry) => entry.line.length > MAX_RENDERED_LINE_LENGTH).length,
      lines: aggregateMilestoneLines(window.lines).map((entry) => entry.line).slice(0, 64)
    };
    const updated = store.update({
      projectId: window.projectId,
      threadId: window.threadId,
      messageId: window.messageId,
      content: renderMilestoneLines(window.lines),
      metadata
    });
    store.emitUpdated({
      projectId: window.projectId,
      threadId: window.threadId,
      message: updated.message,
      state: updated.state
    });
  }

  return { record, closeRun };
}

export type RunTranscriptDraft = ReturnType<typeof createRunTranscriptDraft>;

export function createRunTranscriptDraft(input: { runId: string }) {
  const phases = new Map<RunMilestonePhase, PhaseDraft>();
  let assistantText = "";
  let lastAcceptedAt = Date.now();

  function recordMilestone(line: string, phase: RunMilestonePhase) {
    let accepted = false;
    for (const candidate of splitMilestoneInput(line)) {
      const classification = classifyMilestoneLine(candidate);
      if (classification === "reject") {
        continue;
      }

      const draft = getPhaseDraft(phase);
      if (classification === "fallback") {
        draft.heldFallback = candidate;
        continue;
      }

      addLine(draft, candidate);
      accepted = true;
    }

    return accepted;
  }

  function recordDerivedMilestone(line: string, phase: RunMilestonePhase) {
    const normalized = normalizeMilestoneLine(line);
    if (!normalized) {
      return false;
    }

    addLine(getPhaseDraft(phase), normalized);
    return true;
  }

  function emitHeldFallback(phase: RunMilestonePhase) {
    const draft = getPhaseDraft(phase);
    if (!draft.heldFallback || draft.fallbackEmitted) {
      return false;
    }

    addLine(draft, draft.heldFallback);
    draft.fallbackEmitted = true;
    return true;
  }

  function appendAssistantDelta(delta: string) {
    if (!delta) {
      return;
    }

    assistantText += delta;
  }

  function getLastAcceptedAt() {
    return lastAcceptedAt;
  }

  function getSegments(): StreamingTailSegment[] {
    const now = new Date().toISOString();
    const phaseSegments = PHASE_ORDER.flatMap((phase) => {
      const draft = phases.get(phase);
      if (!draft || draft.lines.length === 0) {
        return [];
      }

      return [
        {
          id: `${input.runId}:${phase}`,
          kind: "status" as const,
          phase,
          content: renderPhaseContent(phase, draft.lines),
          updatedAt: draft.updatedAt ?? now
        }
      ];
    });

    const assistant = assistantText.trim()
      ? [
          {
            id: `${input.runId}:assistant`,
            kind: "assistant" as const,
            content: assistantText,
            updatedAt: now
          }
        ]
      : [];

    return [...phaseSegments, ...assistant];
  }

  function finalizeMilestoneMessages(): FinalizedRunMilestoneMessage[] {
    const now = new Date().toISOString();
    return PHASE_ORDER.flatMap((phase) => {
      const draft = phases.get(phase);
      if (!draft || draft.lines.length === 0) {
        return [];
      }

      const aggregated = aggregateMilestoneLines(draft.lines);
      return [
        {
          content: renderPhaseContent(phase, draft.lines),
          metadata: {
            type: "run-milestones" as const,
            runId: input.runId,
            windowId: `${input.runId}:${phase}`,
            status: "closed" as const,
            phase,
            phaseTitle: PHASE_TITLES[phase],
            startedAt: draft.startedAt ?? now,
            updatedAt: draft.updatedAt ?? now,
            lineCount: draft.lines.length,
            overflowCount: Math.max(0, aggregated.length - MAX_VISIBLE_LINES),
            hiddenLineCount: Math.max(0, aggregated.length - MAX_VISIBLE_LINES),
            truncatedLineCount: aggregated.filter((entry) => entry.line.length > MAX_RENDERED_LINE_LENGTH).length,
            lines: aggregated.map((entry) => entry.line).slice(0, 64)
          }
        }
      ];
    });
  }

  function getPhaseDraft(phase: RunMilestonePhase) {
    const existing = phases.get(phase);
    if (existing) {
      return existing;
    }

    const draft: PhaseDraft = {
      phase,
      lines: [],
      fallbackEmitted: false
    };
    phases.set(phase, draft);
    return draft;
  }

  function addLine(draft: PhaseDraft, line: string) {
    const now = new Date().toISOString();
    draft.startedAt ??= now;
    draft.updatedAt = now;
    draft.lines.push(line);
    lastAcceptedAt = Date.now();
  }

  return {
    recordMilestone,
    recordDerivedMilestone,
    emitHeldFallback,
    appendAssistantDelta,
    getLastAcceptedAt,
    getSegments,
    finalizeMilestoneMessages,
  };
}

export function normalizeMilestoneLine(input: string) {
  return input.replace(/^MILESTONE:\s*/i, "").replace(/\s+/g, " ").trim().slice(0, MAX_STORED_LINE_LENGTH);
}

export function extractMilestoneLines(text: string) {
  return text.split(/\r?\n/).flatMap(splitMilestoneInput).filter(Boolean);
}

export function stripMilestoneLines(text: string) {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^MILESTONE:\s*\S/i.test(line.trim()))
    .join("\n")
    .trim();
}

export function createMilestoneDeltaParser(onMilestone: (line: string) => void) {
  let buffer = "";
  let emittedCount = 0;
  return {
    push(delta: string) {
      buffer += delta;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (/^MILESTONE:\s*\S/i.test(line.trim())) {
          emittedCount += 1;
          onMilestone(normalizeMilestoneLine(line));
        }
      }
    },
    flush() {
      if (/^MILESTONE:\s*\S/i.test(buffer.trim())) {
        emittedCount += 1;
        onMilestone(normalizeMilestoneLine(buffer));
      }
      buffer = "";
    },
    hasEmitted() {
      return emittedCount > 0;
    }
  };
}

export function renderMilestoneLines(lines: string[]) {
  const aggregated = aggregateMilestoneLines(lines);
  const visible = aggregated.slice(0, MAX_VISIBLE_LINES);
  const overflowCount = aggregated.length - visible.length;
  return [
    ...visible.map((entry) => {
      const line = renderMilestonePreview(entry.line);
      return `- ${entry.count > 1 ? `${line} x${entry.count}` : line}`;
    }),
    overflowCount > 0 ? `- +${overflowCount} more updates` : ""
  ].filter(Boolean).join("\n");
}

export function aggregateMilestoneLines(lines: string[]) {
  const counts = new Map<string, { line: string; count: number }>();
  for (const line of lines) {
    const existing = counts.get(line);
    if (existing) {
      existing.count += 1;
      continue;
    }

    counts.set(line, { line, count: 1 });
  }

  return [...counts.values()];
}

export function classifyMilestoneLine(line: string): "accept" | "fallback" | "reject" {
  const normalized = normalizeMilestoneLine(line);
  if (!normalized) {
    return "reject";
  }

  if (isToolOrCommandMilestone(normalized)) {
    return "reject";
  }

  if (isLowValueActivityMilestone(normalized)) {
    return "fallback";
  }

  return "accept";
}

function createWindowKey(projectId: ProjectId, threadId: ThreadId, runId: string) {
  return `${projectId}:${threadId}:${runId}`;
}

function splitMilestoneInput(input: string) {
  return input
    .replace(/\r?\n/g, "\n")
    .split(/(?=MILESTONE:\s*\S)/i)
    .flatMap((chunk) => chunk.split("\n"))
    .map((line) => line.trim())
    .filter(Boolean)
    .map(normalizeMilestoneLine)
    .filter(Boolean);
}

function renderMilestonePreview(line: string) {
  return line.length <= MAX_RENDERED_LINE_LENGTH ? line : `${line.slice(0, MAX_RENDERED_LINE_LENGTH - 1)}...`;
}

function renderPhaseContent(phase: RunMilestonePhase, lines: string[]) {
  return `**${PHASE_TITLES[phase]}**\n${renderMilestoneLines(lines)}`;
}

function isToolOrCommandMilestone(line: string) {
  return /\b(?:shell|powershell|cmd\.exe|Get-Content|Get-ChildItem|Set-Content|Select-String|Start-Process|node --check|git diff|git status)\b/i.test(line) ||
    /\brg(?:\.exe)?\b/i.test(line) ||
    /\\Windows\\|System32| -Command |"C:\\|'\$port=|bad shell quoting|found no matches|visible verification command/i.test(line);
}

function isLowValueActivityMilestone(line: string) {
  const withoutOwner = line.replace(/^Subagent [^:]+:\s*/i, "");
  return /^(?:checking|inspecting|searching|reading|looking|running verification|verifying)\b/i.test(withoutOwner);
}
