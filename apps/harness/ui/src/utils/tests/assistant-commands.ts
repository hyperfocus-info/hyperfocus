import type { ClientCommand } from "@hyperfocus/ai-core/protocol";

export function getAssistantJobsListCommands(commands: unknown[]) {
  return commands.filter(
    (command): command is Extract<ClientCommand, { type: "assistant.workloads.list" }> =>
      typeof command === "object" &&
      command !== null &&
      "type" in command &&
      command.type === "assistant.workloads.list"
  );
}
