

import { type Assistant } from "@hyperfocus/ai-core/protocol";

export const assistant = (id: string, name: string, createdAt: string): Assistant => ({ id, name, scope: "global",
      personalityPrompt: "Be precise.", jobPrompt: "Maintain exact intent identity.", agentId: "pi", runState: "active",
      bootstrapState: "completed", failureStreakCount: 0, circuitBreakerState: "closed", unreadQuestionCount: 0,
      createdAt, updatedAt: createdAt });

export function bootstrapResult(title: string) {
  return {
    text: JSON.stringify({
      researchSummary: title,
      initialTodos: [{ title, workKind: "app-code", workTarget: "src/app.ts" }],
      remainIdle: true
    })
  };
}

export function plannerChoices(answerText: string = "Use existing guidance.") {
  return [
    {
      id: "choice-1",
      label: "Use guidance",
      description: "Use existing guidance.",
      answerText,
      recommended: true
    },
    {
      id: "choice-2",
      label: "Wait",
      description: "Wait for user input.",
      answerText: "Wait for user input.",
      recommended: false
    },
    {
      id: "choice-3",
      label: "Skip",
      description: "Skip this pass.",
      answerText: "Skip this pass.",
      recommended: false
    }
  ];
}
