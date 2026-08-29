import { createMemo, type Accessor } from "solid-js";
import type { Assistant } from "@hyperfocus/ai-core/protocol";
import type { FileLinkConfig } from "../file-linked-text";
import { harnessStore } from "../../harness-store";
import {
  compareAssistantLearnings,
  fuzzyMatches,
  splitAssistantStreamingText,
} from "./assistant-panel-model";

type HarnessState = typeof harnessStore.state;
type WorkspaceProject = HarnessState["workspace"]["projects"][number];

export function createAssistantDetailSelectors(options: {
  state: HarnessState; selectedAssistant: Accessor<Assistant | undefined>;
  selectedCircuitBreakerAssistantId: Accessor<string | undefined>;
  assistantFileProject: Accessor<WorkspaceProject | undefined>;
  getAssistantProjectFileLinks: (project: WorkspaceProject | undefined) => FileLinkConfig;
  assistantStreamingStartedAtByAssistantId: Accessor<Record<string, string>>;
}) {
  const { state, selectedAssistant, selectedCircuitBreakerAssistantId, assistantFileProject,
    getAssistantProjectFileLinks, assistantStreamingStartedAtByAssistantId } = options;
  const selectedThread = createMemo(() =>
      state.assistants.threads.find(
        (thread) => thread.assistantId === selectedAssistant()?.id,
      ),
    );
  const visibleAssistantMessages = createMemo(() =>
      (selectedThread()?.messages ?? []).filter((message) =>
        fuzzyMatches(
          [message.role, message.content].join(" "),
          state.assistants.detailSearch,
        ),
      ),
    );
  const selectedTodos = createMemo(() =>
      [...state.assistants.todos]
        .filter((todo) => todo.assistantId === selectedAssistant()?.id)
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder ||
            right.updatedAt.localeCompare(left.updatedAt),
        ),
    );
  const visibleTodos = createMemo(() =>
      selectedTodos().filter((todo) =>
        fuzzyMatches(
          [
            todo.title,
            todo.description,
            todo.state,
            todo.blockerReason,
            todo.workKind,
            todo.workTarget,
          ]
            .filter(Boolean)
            .join(" "),
          state.assistants.detailSearch,
        ),
      ),
    );
  const selectedQuestions = createMemo(() =>
      [...state.assistants.questions]
        .filter((question) => question.assistantId === selectedAssistant()?.id)
        .sort((left, right) => right.askedAt.localeCompare(left.askedAt)),
    );
  const visibleQuestions = createMemo(() =>
      selectedQuestions().filter((question) =>
        fuzzyMatches(
          [question.prompt, question.answerText, question.status]
            .filter(Boolean)
            .join(" "),
          state.assistants.detailSearch,
        ),
      ),
    );
  const selectedLearnings = createMemo(() =>
      [...state.assistants.learnings]
        .filter((learning) => learning.assistantId === selectedAssistant()?.id)
        .sort(compareAssistantLearnings),
    );
  const filteredLearnings = createMemo(() =>
      selectedLearnings().filter((learning) =>
        fuzzyMatches(
          [learning.summary, learning.source, learning.confidence, learning.kind]
            .filter(Boolean)
            .join(" "),
          state.assistants.detailSearch,
        ),
      ),
    );
  const selectedLogs = createMemo(() =>
      [...state.assistants.logs]
        .filter((entry) => entry.assistantId === selectedAssistant()?.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    );
  const visibleLogs = createMemo(() =>
      selectedLogs().filter((entry) =>
        fuzzyMatches(
          [entry.summary, entry.detail, entry.level, entry.detailsJson]
            .filter(Boolean)
            .join(" "),
          state.assistants.detailSearch,
        ),
      ),
    );
  const selectedExecutionLogs = createMemo(() =>
      visibleLogs()
        .slice(0, 500)
        .map((entry) => ({
          id: entry.id,
          message: entry.summary,
          rowSummary: [entry.summary, entry.detail].filter(Boolean).join(" "),
          level: entry.level,
          createdAt: entry.createdAt,
          detail: entry.detail,
          detailsJson: entry.detailsJson,
          detailsJsonSummary: entry.detailsJsonSummary,
        })),
    );
  const selectedAssetRefs = createMemo(() =>
      state.assistants.assetRefs.filter(
        (assetRef) => assetRef.assistantId === selectedAssistant()?.id,
      ),
    );
  const circuitBreakerAssistant = createMemo(() =>
      state.assistants.assistants.find(
        (assistant) => assistant.id === selectedCircuitBreakerAssistantId(),
      ),
    );
  const circuitBreakerFileProject = createMemo(
      () =>
        state.workspace.projects.find(
          (project) => project.id === circuitBreakerAssistant()?.projectId,
        ) ?? assistantFileProject(),
    );
  const circuitBreakerFileLinks = () =>
      getAssistantProjectFileLinks(circuitBreakerFileProject());
  const circuitBreakerLogs = createMemo(() =>
      [...state.assistants.logs]
        .filter(
          (entry) => entry.assistantId === selectedCircuitBreakerAssistantId(),
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 5),
    );
  const circuitBreakerRuns = createMemo(() =>
      [...state.backgroundJobs.runs]
        .filter((run) => run.assistantId === selectedCircuitBreakerAssistantId())
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 5),
    );
  const circuitBreakerQuestions = createMemo(() =>
      [...state.assistants.questions]
        .filter(
          (question) =>
            question.assistantId === selectedCircuitBreakerAssistantId() &&
            question.status === "pending",
        )
        .sort((left, right) => right.askedAt.localeCompare(left.askedAt))
        .slice(0, 5),
    );
  const streamingText = createMemo(
      () =>
        state.assistants.streamingByAssistantId[selectedAssistant()?.id ?? ""] ??
        "",
    );
  const assistantChatRows = createMemo(() => [
      ...visibleAssistantMessages().map((message) => ({
        kind: "message" as const,
        message,
      })),
      ...splitAssistantStreamingText(streamingText()).map((content, index) => ({
        kind: "streaming" as const,
        content,
        createdAt:
          assistantStreamingStartedAtByAssistantId()[
            selectedAssistant()?.id ?? ""
          ],
        index,
      })),
    ]);
  return {
    assistantChatRows, circuitBreakerAssistant, circuitBreakerFileLinks,
    circuitBreakerLogs, circuitBreakerQuestions, circuitBreakerRuns,
    filteredLearnings, selectedAssetRefs, selectedExecutionLogs, selectedLearnings,
    selectedThread, selectedTodos, streamingText, visibleLogs, visibleQuestions, visibleTodos,
  };
}

