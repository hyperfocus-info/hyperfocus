import type { ChatSessionState, ChatMessage } from "@hyperfocus/ai-core/protocol";
export function applyAssistantMessage(state: ChatSessionState, assistantMessage: ChatMessage): ChatSessionState {
  return {
    ...state,
    messages: [...state.messages, assistantMessage],
    lastError: undefined,
    isStreaming: false
  };
}

export function chooseExecutionPath(difficultyScore: number) {
  return difficultyScore > 40 ? "subagents" : "main";
}
