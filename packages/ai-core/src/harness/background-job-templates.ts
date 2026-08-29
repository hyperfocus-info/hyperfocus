export const defaultBackgroundJobTemplates = [
  {
    id: "scheduled-task",
    label: "Scheduled task",
    description: "Saved recurring AI routine for one project.",
    kind: "ai-routine",
    definition: {
      kind: "ai-routine",
      prompt:
        "Review current project state, complete the requested recurring task, summarize what changed, and call out any blocked follow-up.",
      modeId: "implement",
      executionModelId: "openai/gpt-5.4"
    }
  }
] as const;
