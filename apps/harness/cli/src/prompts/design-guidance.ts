import { aiDesignGuidanceForTask } from "@hyperfocus/ai-core/runtime";

/** Generated-app assistance, separate from the project's own contributor rules. */
export function taskDesignGuidance(options: { task: string }) {
  return aiDesignGuidanceForTask(options);
}
