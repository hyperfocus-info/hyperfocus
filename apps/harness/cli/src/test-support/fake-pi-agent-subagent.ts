import type { PiAgentPromptRequest } from "../pi-agent-adapter";
import type { FakePromptBehavior, FakePromptUsage } from "./fake-pi-agent-prompt-types";

function getLastPromptLineValue(prompt: string, prefix: string) {
  const line = prompt
    .split(/\r?\n/)
    .reverse()
    .map((entry) => entry.trimStart())
    .find((entry) => entry.startsWith(prefix));
  return line?.slice(prefix.length).trim();
}

export async function runFakeSubagentPrompt(
  request: PiAgentPromptRequest,
  withUsage: FakePromptUsage,
  behavior: FakePromptBehavior
) {
  const instruction = getLastPromptLineValue(request.prompt, "Subtask instruction:");

  const isSlowInspectSubtask = instruction === "Inspect files slow";

  const isInspectSubtask = instruction?.startsWith("Inspect") ?? false;

  const isPatchSubtask = instruction?.startsWith("Patch") ?? false;

  const isHardPatchSubtask = instruction === "Patch code hard";

  const isAlwaysFailPatchSubtask = instruction === "Patch code always fail";

  const emitsToolFailureBurst = instruction === "Emit tool failure burst";

  if (emitsToolFailureBurst) {
          for (let index = 1; index <= 3; index += 1) {
            request.onExecutionEvent?.({
              type: "tool-end",
              toolCallId: `shell-fail-${index}`,
              toolName: "shell",
              result: {
                command: "bad-command",
                exitCode: 1,
                status: "failed",
                output: "bad-command failed"
              },
              isError: true
            });
          }
          return withUsage("tool burst complete");
        }

  if (isSlowInspectSubtask) {
          request.onTextDelta?.("MILESTONE: inspecting slow files\n");
          await behavior.waitForDeferredSubagentRelease();
          return withUsage("inspection complete");
        }

  if (isAlwaysFailPatchSubtask) {
          throw new Error("hard failure from fake subagent");
        }

  if (isHardPatchSubtask) {
          const count = (behavior.subagentCallCounts.get("task-2-hard") ?? 0) + 1;
          behavior.subagentCallCounts.set("task-2-hard", count);
          if (count < 5) {
            throw new Error("timeout from hard fake subagent");
          }

          request.onTextDelta?.("MILESTONE: patch recovered\n");
          return withUsage("patch recovered");
        }

  if (isPatchSubtask && !behavior.retryTracker.has("task-2")) {
          behavior.retryTracker.add("task-2");
          throw new Error("timeout from fake subagent");
        }

  request.onTextDelta?.(isInspectSubtask ? "MILESTONE: inspected files\n" : "MILESTONE: patched code\n");

  return withUsage(isInspectSubtask ? "inspection complete" : "patch complete");
}
