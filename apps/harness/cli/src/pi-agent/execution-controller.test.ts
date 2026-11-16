import { expect, test } from "bun:test";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { AgentSessionEvent, SessionStats } from "@mariozechner/pi-coding-agent";
import type { PiAgentPromptRequest } from "../pi-agent-adapter";
import { createPiSdkExecutionController, type PiExecutionSession } from "./execution-controller";
import { createRunBudgetAgentAdapter } from "../run-budget-agent-adapter";
import { createHash } from "node:crypto";

const request: PiAgentPromptRequest = {
  kind: "executor", cwd: ".", modelId: "openai/test", prompt: "Complete the task"
};

test("steers the running SDK session and refuses delivery after completion", async () => {
  const fake = fixture([[assistant("stop")]]);
  let finish!: () => void;
  const waiting = new Promise<void>(resolve => { finish = resolve; });
  const messages: string[] = [];
  const session = { ...fake.session, async prompt() { await waiting; await fake.session.prompt("initial"); },
    async steer(message: string) { messages.push(message); } };
  const controller = createPiSdkExecutionController(session, request, 1000, () => {});
  try {
    await controller.steer!("Use the new constraint");
    expect(messages).toEqual(["Use the new constraint"]);
    finish();
    await controller.result;
    await expect(controller.steer!("Too late")).rejects.toThrow("ended");
  } finally { finish(); controller.dispose(); }
});

test("SDK delivery receipt is produced at the actual prompt API, without retaining prompt text", async () => {
  const { session } = fixture([[assistant("stop")]]);
  const receipts: unknown[] = [];
  const controller = createPiSdkExecutionController(session, { ...request, onExecutionEvent: event => { if (event.type === "context-delivery") receipts.push(event); } }, 1000, () => {});
  try { await controller.result;
    expect(receipts).toEqual([{ type: "context-delivery", boundary: "sdk-prompt", promptSha256: createHash("sha256").update(request.prompt).digest("hex") }]);
  } finally { controller.dispose(); }
});

test("reused SDK sessions report prompt deltas without recounting cumulative cached input", async () => {
  const fake = fixture([[assistant("stop")], [assistant("stop")]]);
  let calls = 0;
  const stats = { input: 10, output: 2, cacheRead: 8, cacheWrite: 0, total: 20 };
  const session = { ...fake.session, getSessionStats: () => ({ ...fake.session.getSessionStats(), tokens: { ...stats } }),
    async prompt(text: string) { await fake.session.prompt(text); calls++; stats.input += 100; stats.output += 20; stats.cacheRead += 80; stats.total += 200; } };
  for (let i = 0; i < 2; i++) {
    const controller = createPiSdkExecutionController(session, request, 1000, () => {});
    try { const result = await controller.result;
      expect(result.contextUsage?.sessionStats.tokens).toMatchObject({ input: 100, output: 20, cacheRead: 80, total: 200 });
      expect(result.contextUsage?.cachedInputTokens).toBe(80);
    } finally { controller.dispose(); }
  }
  expect(calls).toBe(2);
});

function assistant(stopReason: AssistantMessage["stopReason"], text = "Completed") : AssistantMessage {
  return {
    role: "assistant", api: "openai-responses", provider: "openai", model: "test",
    content: [{ type: "text", text }], stopReason, timestamp: 1,
    ...(stopReason === "error" ? { errorMessage: "Provider disconnected" } : {}),
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
  };
}

function fixture(turns: AssistantMessage[][]) {
  let listener: ((event: AgentSessionEvent) => void) | undefined;
  let promptCount = 0;
  const stats: SessionStats = {
    sessionFile: undefined, sessionId: "test", userMessages: 1, assistantMessages: 1,
    toolCalls: 0, toolResults: 0, totalMessages: 2, cost: 0,
    tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2 }
  };
  const messages: PiExecutionSession["messages"] = [];
  const session: PiExecutionSession = {
    messages,
    subscribe(callback) { listener = callback; return () => { listener = undefined; }; },
    async prompt() {
      const turn = turns[promptCount++] ?? [];
      for (const message of turn) {
        messages.push(message);
        listener?.({ type: "message_end", message });
      }
    },
    getSessionStats: () => stats,
    abort: async () => {},
    dispose() {}
  };
  return { session, prompts: () => promptCount };
}

for (const reason of ["error", "aborted", "length", "toolUse"] as const) {
  test(`rejects terminal ${reason} even after partial text`, async () => {
    const { session } = fixture([[assistant(reason, "Partial output")]]);
    const controller = createPiSdkExecutionController(session, request, 1000, () => {});
    try {
      await expect(controller.result).rejects.toThrow(reason === "error" ? "Provider disconnected"
        : reason === "aborted" ? "aborted" : `(${reason})`);
    } finally { controller.dispose(); }
  });
}

test("returns the final successful response after an SDK retry", async () => {
  const { session } = fixture([[assistant("error", "Partial"), assistant("stop", "Recovered")]]);
  const controller = createPiSdkExecutionController(session, request, 1000, () => {});
  try { expect((await controller.result).text).toBe("Recovered"); }
  finally { controller.dispose(); }
});

test("does not reuse prior text when a continuation emits no assistant message", async () => {
  const { session } = fixture([[assistant("stop", "Prior answer")], []]);
  const controller = createPiSdkExecutionController(session, request, 1000, () => {});
  try {
    expect((await controller.result).text).toBe("Prior answer");
    await expect(controller.continueWithPrompt()).rejects.toThrow("empty response");
  } finally { controller.dispose(); }
});

test("reads terminal state even when SDK event delivery is delayed", async () => {
  const fake = fixture([[assistant("stop", "Canonical response")]]);
  const session = { ...fake.session, subscribe: () => () => {} };
  const controller = createPiSdkExecutionController(session, request, 1000, () => {});
  try { expect((await controller.result).text).toBe("Canonical response"); }
  finally { controller.dispose(); }
});

test("explicit abort rejects a late successful response", async () => {
  const fake = fixture([[assistant("stop", "Late response")]]);
  const release = Promise.withResolvers<void>();
  const session = { ...fake.session, async prompt() { await release.promise; await fake.session.prompt("test"); } };
  const controller = createPiSdkExecutionController(session, request, 1000, () => {});
  await controller.abort();
  release.resolve();
  try { await expect(controller.result).rejects.toThrow("aborted"); }
  finally { controller.dispose(); }
});

test("an aborted signal prevents launch and late success", async () => {
  const abort = new AbortController();
  const fake = fixture([[assistant("stop")]]);
  abort.abort();
  const controller = createPiSdkExecutionController(fake.session, { ...request, abortSignal: abort.signal }, 1000, () => {});
  try {
    await expect(controller.result).rejects.toThrow();
    expect(fake.prompts()).toBe(0);
  } finally { controller.dispose(); }

  const lateAbort = new AbortController();
  const late = fixture([[assistant("stop")]]);
  const lateController = createPiSdkExecutionController(late.session, { ...request, abortSignal: lateAbort.signal }, 1000, () => lateAbort.abort());
  try { await expect(lateController.result).rejects.toThrow(); }
  finally { lateController.dispose(); }
});

test("empty output consumes one reservation without an unbudgeted retry", async () => {
  const fake = fixture([[assistant("stop", "")], [assistant("stop", "Hidden retry")]]);
  let reservations = 0;
  const adapter = createRunBudgetAgentAdapter({
    setApiKey() {}, hasApiKey: () => true,
    startExecution: async (input) => createPiSdkExecutionController(fake.session, input, 1000, () => {}),
    async runPrompt(input) {
      const controller = createPiSdkExecutionController(fake.session, input, 1000, () => {});
      try { return await controller.result; } finally { controller.dispose(); }
    }
  }, {
    reserveAgentRunTurn() {
      if (++reservations > 1) throw new Error("Runtime budget exhausted");
      return { maxTurns: 1, turnsUsed: 1, currentTurn: 1, remainingTurns: 0, exhausted: true };
    }
  }, "project", "run");
  await expect(adapter.runPrompt(request)).rejects.toThrow("empty response");
  expect(fake.prompts()).toBe(1);
  expect(reservations).toBe(1);
  await expect(adapter.runPrompt(request)).rejects.toThrow("Runtime budget exhausted");
  expect(fake.prompts()).toBe(1);
});
