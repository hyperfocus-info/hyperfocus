import { expect, test } from "bun:test";
import { aiRunRequestSchema } from "@hyperfocus/ai-core/runtime";
import { createCodexCliAdapter, createCopilotCliAdapter } from "./cli-adapters";
import { createMemoryOnlyProviderCredentialStore } from "./credential-store";
import type { runAiCliProcess } from "./process/cli-process";

test("planning adapters pass real restrictions and caller cancellation to the process boundary", async () => {
  const invocations: Parameters<typeof runAiCliProcess>[0][] = [];
  const runProcess: typeof runAiCliProcess = async options => {
    invocations.push(options);
    return { requestId: options.request.requestId, profile: options.request.profile, text: "ok", stopReason: "stop" };
  };
  const signal = new AbortController().signal;
  const credentials = createMemoryOnlyProviderCredentialStore();
  for (const factory of [createCodexCliAdapter, createCopilotCliAdapter]) {
    const adapter = factory({ executable: "fixture-cli", runProcess });
    const request = aiRunRequestSchema.parse({ requestId: "policy", profile: { agentId: adapter.descriptor.id, providerId: adapter.descriptor.providerIds[0], modelId: "chosen-model", reasoning: "low" }, messages: [{ role: "user", content: "private prompt" }] });
    await adapter.run(request, credentials, { signal });
  }
  for (const invocation of invocations) {
    expect(invocation.signal).toBe(signal);
    expect(invocation.command).not.toContain("private prompt");
    expect(invocation.input).toContain("private prompt");
    expect(invocation.command).toContain("chosen-model");
  }
  const codex = invocations[0]!.command;
  expect(codex[codex.indexOf("--sandbox") + 1]).toBe("read-only");
  expect(codex).toContain("--ignore-user-config");
  expect(codex).toContain("--ignore-rules");
  expect(codex).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  const copilot = invocations[1]!.command;
  const denials = new Set(copilot.find(argument => argument.startsWith("--deny-tool="))?.split("=")[1]?.split(","));
  for (const operation of ["read", "shell", "write", "url", "memory"]) expect(denials.has(operation)).toBe(true);
  expect(copilot).toContain("--disable-builtin-mcps");
  expect(copilot).toContain("--no-ask-user");
});
