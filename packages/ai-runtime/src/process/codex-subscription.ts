import type { AiRunRequest, AiRunResult } from "@hyperfocus/ai-core/runtime";
import { z } from "zod";

/** Repository commands are returned as data to the remote execution bridge. */
export function subscriptionCodexArguments(request: AiRunRequest): string[] {
  const args = ["exec", "--json", "--ephemeral", "--skip-git-repo-check", "--ignore-rules", "--ignore-user-config", "--color", "never", "--sandbox", "read-only"];
  const config: Record<string, string | number | boolean> = {
    forced_login_method: "chatgpt", model_provider: "openai", approval_policy: "never", web_search: "disabled", project_doc_max_bytes: 0,
    model_reasoning_effort: request.profile.reasoning ?? "low", model_verbosity: "low",
    "features.shell_tool": false, "features.unified_exec": false, "features.shell_snapshot": false,
    "features.multi_agent": false, "features.multi_agent_v2": false, "features.apps": false,
    "features.plugins": false, "features.hooks": false, "features.memories": false,
    "features.browser_use": false, "features.computer_use": false, "features.image_generation": false,
    "features.view_image": false, "tools.view_image": false, "features.code_mode": false,
    "features.code_mode_host": false, "features.tool_suggest": false, "features.skill_search": false,
    "features.skip_host_skill_discovery": true, "features.workspace_dependencies": false,
    "features.unbounded_connection_retries": false,
  };
  for (const [key, value] of Object.entries(config)) args.push("-c", `${key}=${JSON.stringify(value)}`);
  if (request.profile.modelId !== "default") args.push("--model", request.profile.modelId);
  args.push("-");
  return args;
}

export function parseCodexSubscriptionResult(result: AiRunResult): AiRunResult {
  const usageSchema = z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() });
  let text = "";
  let usage: AiRunResult["usage"];
  const errors: string[] = [];
  for (const line of result.text.split(/\r?\n/).filter(Boolean)) {
    const event = JSON.parse(line);
    if (event.type === "item.completed" && event.item?.type === "agent_message") text = event.item.text;
    if (event.type === "item.started" || event.type === "item.completed") {
      if (event.item?.type === "error") errors.push(String(event.item.message ?? "Codex diagnostic error").slice(0, 500));
      else if (!["agent_message", "reasoning"].includes(event.item?.type)) throw Error(`Codex returned unsupported item type ${String(event.item?.type).replace(/[^a-zA-Z_]/g, "").slice(0, 80)}; subscription reasoning must return remote commands as data.`);
    }
    if (event.type === "turn.completed") {
      const value = usageSchema.parse(event.usage);
      usage = { inputTokens: value.input_tokens, outputTokens: value.output_tokens, costUsd: 0, costSource: "estimated" };
    }
    if (event.type === "error" || event.type === "turn.failed") throw Error("Codex subscription inference failed. Inspect subscription status; paid API fallback is disabled.");
  }
  if (!text || !usage) throw Error(`Codex did not return a complete subscription response with token usage. ${errors.join(" ")}`);
  return { ...result, text, usage };
}
