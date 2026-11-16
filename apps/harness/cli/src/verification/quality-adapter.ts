import { createHash } from "node:crypto";
import type { QualitySession } from "@hyperfocus/ai-runtime/quality";
import type { PiAgentAdapter, PiAgentPromptRequest } from "../pi-agent-adapter";
import { qualityPayloadHash, wrapQualityPayload } from "./quality-payload";

/** Decorates the existing adapter; no model/tool-controlled operation can certify delivery. */
export function withQualityContext(adapter: PiAgentAdapter, quality: QualitySession, governingContext?: string, admit?: () => void): PiAgentAdapter {
  const submitted = new Map<string, { agentId: string; prompt: string }>();
  const prepare = (request: PiAgentPromptRequest): PiAgentPromptRequest => {
    admit?.();
    if (!governingContext && !quality.trace.rules.some(rule => rule.eligible === "yes")) return request;
    const agentId = request.qualityAgentId ?? "main";
    const contract = agentId === "main" ? undefined : quality.handoff(agentId, request.qualityParentAgentId ?? "main");
    const context = quality.context(agentId);
    const payload = wrapQualityPayload([governingContext ? `Parent outcome (child completion cannot establish parent acceptance):\n${governingContext}` : "", context, contract ? JSON.stringify(contract) : ""].filter(Boolean).join("\n\n"));
    const prompt = [request.prompt, context ? "Host quality obligations (completion is verified independently):" : "", payload].filter(Boolean).join("\n\n");
    const promptSha256 = createHash("sha256").update(prompt).digest("hex");
    submitted.set(promptSha256, { agentId, prompt });
    submitted.set(qualityPayloadHash(prompt)!, { agentId, prompt });
    quality.delivery(agentId, "unsupported", true, prompt);
    if (governingContext) quality.emit({ agentId, stage: "context-delivery", outcome: "unknown", boundary: "unsupported",
      reason: "Parent outcome assembled; actual adapter delivery is not yet observed.", evidenceRefs: [`prompt-sha256:${promptSha256}`] });
    return { ...request, prompt, onExecutionEvent(event) {
      if (event.type === "context-delivery") {
        const delivery = submitted.get(event.promptSha256) ?? (event.qualityContextSha256 ? submitted.get(event.qualityContextSha256) : undefined);
        if (delivery) quality.delivery(delivery.agentId, event.boundary, true, delivery.prompt, event.promptSha256);
        if (delivery && governingContext) quality.emit({ agentId: delivery.agentId, stage: "context-delivery", outcome: event.boundary === "sdk-prompt" ? "delivered" : "unknown", boundary: event.boundary,
          reason: "Frozen parent outcome submitted at the named boundary; model attention and retention remain unknown.", evidenceRefs: [`prompt-sha256:${event.promptSha256}`] });
      }
      request.onExecutionEvent?.(event);
    } };
  };
  return {
    setApiKey: (provider, key) => adapter.setApiKey(provider, key), hasApiKey: provider => adapter.hasApiKey(provider),
    runPrompt: request => adapter.runPrompt(prepare(request)),
    async startExecution(request) {
      const prepared = prepare(request);
      try {
        const controller = await adapter.startExecution(prepared);
        const result = controller.result.then(result => {
          if (request.qualityAgentId && request.qualityAgentId !== "main") quality.emit({ agentId: request.qualityAgentId, stage: "implementation", outcome: "passed",
            reason: "Child artifact returned; its inherited verification obligations remain pending.", evidenceRefs: [`subtask:${request.qualityAgentId}`, `output-sha256:${createHash("sha256").update(result.text).digest("hex")}`] });
          return result;
        }, error => {
          if (request.qualityAgentId && request.qualityAgentId !== "main") quality.emit({ agentId: request.qualityAgentId, stage: "implementation", outcome: "failed",
            reason: "Delegated execution failed; no verified child result.", evidenceRefs: [`subtask:${request.qualityAgentId}`] });
          throw error;
        });
        return { result, abort: () => controller.abort(), dispose: () => controller.dispose(),
          steer: controller.steer ? message => controller.steer!(prepare({ ...request, prompt: message }).prompt) : undefined,
          // A continued SDK session also receives the frozen obligations.
          continueWithPrompt: prompt => controller.continueWithPrompt(prepare({ ...request, prompt: prompt ?? "continue" }).prompt) };
      } catch (error) {
        quality.delivery(request.qualityAgentId ?? "main", "unsupported", false, prepared.prompt);
        throw error;
      }
    },
  };
}
