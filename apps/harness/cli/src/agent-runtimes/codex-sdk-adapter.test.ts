import { existsSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import type { PiAgentPromptRequest } from "../pi-agent-adapter";
import { buildGitRepositoryPromptContext } from "../git-context";
import { createCodexSdkAdapter, testExports } from "./codex-sdk-adapter";

type FakeThreadRun = {
  events: unknown[];
  onSignal?: (signal: AbortSignal) => Promise<unknown> | unknown;
  error?: Error;
};

function createFakeThread(runs: FakeThreadRun[]) {
  const runCalls: Array<{ input: unknown; signal?: AbortSignal }> = [];
  async function runStreamed(input: unknown, options: { signal?: AbortSignal } = {}) {
    runCalls.push({
      input,
      signal: options.signal
    });
    const nextRun = runs.shift();
    if (!nextRun) {
      throw new Error("No fake run configured");
    }
    if (nextRun.error) {
      throw nextRun.error;
    }

    const signal = options.signal;
    if (nextRun.onSignal && signal) {
      return {
        events: (async function* () {
          await nextRun.onSignal?.(signal);
        })()
      };
    }

    return {
      events: (async function* () {
        for (const event of nextRun.events) {
          yield event;
        }
      })()
    };
  }
  return { runCalls, runStreamed };
}

function createFakeCodexClient(thread: ReturnType<typeof createFakeThread>) {
  const startThreadCalls: Array<Record<string, unknown>> = [];
  function startThread(options: Record<string, unknown> = {}) {
    startThreadCalls.push(options);
    return thread;
  }
  return { startThreadCalls, startThread };
}

function createRequest(overrides: Partial<PiAgentPromptRequest> = {}): PiAgentPromptRequest {
  return {
    kind: "executor",
    prompt: "Inspect repo",
    cwd: "C:\\repo",
    modelId: "openai/gpt-5.4",
    readOnly: false,
    ...overrides
  };
}

describe("codex sdk adapter", () => {
  test("maps request options into sdk thread options", async () => {
    const thread = createFakeThread([
      {
        events: [
          { type: "thread.started", thread_id: "thread-1" },
          { type: "turn.started" },
          { type: "item.completed", item: { id: "item-1", type: "agent_message", text: "done" } },
          { type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }
        ]
      }
    ]);
    const client = createFakeCodexClient(thread);
    const adapter = createCodexSdkAdapter({
      executablePath: "C:\\codex\\codex.exe",
      createClient() {
        return client;
      }
    });

    const result = await adapter.runPrompt(
      createRequest({
        readOnly: true,
        modelId: "openai/gpt-5.4-mini"
      })
    );

    expect(result.text).toBe("done");
    expect(client.startThreadCalls[0]).toMatchObject({
      model: "gpt-5.4-mini",
      sandboxMode: "read-only",
      workingDirectory: "C:\\repo",
      skipGitRepoCheck: true,
      approvalPolicy: "never",
      networkAccessEnabled: false,
      webSearchMode: "live"
    });
    expect(String(thread.runCalls[0]?.input)).toContain(testExports.CODEX_TOOL_GUIDANCE);
    expect(String(thread.runCalls[0]?.input)).toContain("Git repository state:");
    expect(String(thread.runCalls[0]?.input)).toContain("Inspect repo");
  });

  test("uses danger-full-access for writable Windows runs", () => {
    expect(testExports.buildThreadOptions(createRequest(), { platform: "win32" })).toMatchObject({
      sandboxMode: "danger-full-access"
    });
    expect(
      testExports.buildThreadOptions(
        createRequest({
          readOnly: true
        }),
        { platform: "win32" }
      )
    ).toMatchObject({
      sandboxMode: "read-only"
    });
  });

  test("maps reasoning, web search, and network into sdk thread options", async () => {
    let clientOptions: unknown;
    const thread = createFakeThread([
      {
        events: [
          { type: "item.completed", item: { id: "msg-1", type: "agent_message", text: "done" } },
          { type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }
        ]
      }
    ]);
    const client = createFakeCodexClient(thread);
    const adapter = createCodexSdkAdapter({
      executablePath: "C:\\codex\\codex.exe",
      createClient(options) {
        clientOptions = options;
        return client;
      }
    });

    await adapter.runPrompt(
      createRequest({
        reasoningStrength: "extra-high",
        fastMode: true
      })
    );

    expect(client.startThreadCalls[0]).toMatchObject({
      modelReasoningEffort: "xhigh",
      networkAccessEnabled: true,
      webSearchMode: "live"
    });
    expect(clientOptions).toMatchObject({ config: { service_tier: "fast", features: { fast_mode: true } } });
    expect(String(thread.runCalls[0]?.input)).not.toContain("/fast");
  });

  test("keeps service controls out of the model prompt", () => {
    expect(testExports.buildCodexCommandPrelude(createRequest({ fastMode: true }))).not.toContain("/fast");
    expect(testExports.buildCodexCommandPrelude(createRequest({ reasoningStrength: "extra-high" }))).toContain("Git repository state:");
  });

  test("explicit Fast off overrides inherited tier while omitted controls preserve provider defaults", async () => {
    for (const fastMode of [false, undefined]) {
      let clientOptions: { config?: unknown } | undefined;
      const thread = createFakeThread([{ events: [{ type: "item.completed", item: { id: "done", type: "agent_message", text: "done" } }] }]);
      const adapter = createCodexSdkAdapter({ executablePath: "codex.exe", createClient(options) {
        clientOptions = options;
        return createFakeCodexClient(thread);
      } });
      await adapter.runPrompt(createRequest({ fastMode }));
      expect(clientOptions?.config).toEqual(fastMode === false ? { service_tier: "default" } : undefined);
    }
  });

  test("sends identical Git guidance once while preserving fast mode and changed guidance", () => {
    const cwd = process.cwd();
    const context = buildGitRepositoryPromptContext(cwd);
    const prompt = testExports.buildCodexPromptWithPrelude(createRequest({ cwd, prompt: `${context}\nBuild the product`, fastMode: true }));
    expect(prompt.split(context)).toHaveLength(2);
    expect(prompt).not.toContain("/fast");
    expect(prompt).toContain("Build the product");
    expect(prompt).toContain(testExports.CODEX_TOOL_GUIDANCE);
    const changed = testExports.buildCodexPromptWithPrelude(createRequest({ cwd, prompt: "Git repository state:\nA different state supplied by the caller." }));
    expect(changed).toContain(context);
    expect(changed).toContain("A different state supplied by the caller.");
  });

  test("streams appended agent-message deltas and tool events", async () => {
    const thread = createFakeThread([
      {
        events: [
          { type: "thread.started", thread_id: "thread-1" },
          { type: "turn.started" },
          { type: "item.started", item: { id: "msg-1", type: "agent_message", text: "Hel" } },
          {
            type: "item.started",
            item: { id: "cmd-1", type: "command_execution", command: "dir", aggregated_output: "", status: "in_progress" }
          },
          {
            type: "item.updated",
            item: {
              id: "cmd-1",
              type: "command_execution",
              command: "dir",
              aggregated_output: "one",
              status: "in_progress"
            }
          },
          { type: "item.updated", item: { id: "msg-1", type: "agent_message", text: "Hello" } },
          {
            type: "item.completed",
            item: {
              id: "cmd-1",
              type: "command_execution",
              command: "dir",
              aggregated_output: "one",
              exit_code: 0,
              status: "completed"
            }
          },
          { type: "item.completed", item: { id: "msg-1", type: "agent_message", text: "Hello world" } },
          { type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }
        ]
      }
    ]);
    const client = createFakeCodexClient(thread);
    const deltas: string[] = [];
    const events: string[] = [];
    const adapter = createCodexSdkAdapter({
      executablePath: "C:\\codex\\codex.exe",
      createClient() {
        return client;
      }
    });

    const result = await adapter.runPrompt(
      createRequest({
        onTextDelta(delta) {
          deltas.push(delta);
        },
        onExecutionEvent(event) {
          events.push(event.type);
        }
      })
    );

    expect(result.text).toBe("Hello world");
    expect(deltas).toEqual(["Hel", "lo", " world"]);
    expect(events).toContain("session-created");
    expect(events).toContain("tool-start");
    expect(events).toContain("tool-update");
    expect(events).toContain("tool-end");
  });

  test("reuses the same thread for continuation", async () => {
    const thread = createFakeThread([
      {
        events: [
          { type: "item.completed", item: { id: "msg-1", type: "agent_message", text: "first" } },
          { type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }
        ]
      },
      {
        events: [
          { type: "item.completed", item: { id: "msg-2", type: "agent_message", text: "second" } },
          { type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }
        ]
      }
    ]);
    const client = createFakeCodexClient(thread);
    const adapter = createCodexSdkAdapter({
      executablePath: "C:\\codex\\codex.exe",
      createClient() {
        return client;
      }
    });

    const controller = await adapter.startExecution(createRequest());
    try {
      expect((await controller.result).text).toBe("first");
      expect((await controller.continueWithPrompt("continue working")).text).toBe("second");
      expect(thread.runCalls).toHaveLength(2);
      expect(client.startThreadCalls).toHaveLength(1);
    } finally {
      controller.dispose();
    }
  });

  test("aborts an in-flight streamed turn", async () => {
    const thread = createFakeThread([
      {
        events: [],
        onSignal(signal) {
          return new Promise((_, reject) => {
            if (signal.aborted) {
              reject(new Error("aborted by test"));
              return;
            }
            signal.addEventListener("abort", () => reject(new Error("aborted by test")), { once: true });
          });
        }
      }
    ]);
    const client = createFakeCodexClient(thread);
    const adapter = createCodexSdkAdapter({
      executablePath: "C:\\codex\\codex.exe",
      createClient() {
        return client;
      }
    });

    const controller = await adapter.startExecution(createRequest());
    const pending = controller.result;
    await controller.abort();
    await expect(pending).rejects.toThrow("aborted by test");
    controller.dispose();
  });

  test("does not abort completed turn during automatic disposal", async () => {
    const thread = createFakeThread([
      {
        events: [{ type: "item.completed", item: { id: "msg-1", type: "agent_message", text: "done" } }]
      }
    ]);
    const client = createFakeCodexClient(thread);
    const adapter = createCodexSdkAdapter({
      executablePath: "C:\\codex\\codex.exe",
      createClient() {
        return client;
      }
    });

    await expect(adapter.runPrompt(createRequest())).resolves.toMatchObject({
      text: "done"
    });
    expect(thread.runCalls[0]?.signal?.aborted).toBe(false);
  });

  test("fails on turn failure events", async () => {
    const thread = createFakeThread([
      {
        events: [{ type: "turn.failed", error: { message: "bad turn" } }]
      }
    ]);
    const client = createFakeCodexClient(thread);
    const adapter = createCodexSdkAdapter({
      executablePath: "C:\\codex\\codex.exe",
      createClient() {
        return client;
      }
    });

    await expect(adapter.runPrompt(createRequest())).rejects.toThrow("bad turn");
  });

  test("materializes images into temporary local-image inputs and cleans them up", async () => {
    const imageInput = await testExports.materializeSdkInput(
      createRequest({
        images: [
          {
            type: "image",
            data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9s3FoXcAAAAASUVORK5CYII=",
            mimeType: "image/png"
          }
        ]
      })
    );

    expect(Array.isArray(imageInput.input)).toBe(true);
    if (!Array.isArray(imageInput.input)) throw new Error("Expected materialized SDK input entries");
    const inputEntries = imageInput.input;
    expect(inputEntries[0]).toEqual({
      type: "text",
      text: "Inspect repo"
    });
    const localImage = inputEntries[1];
    if (localImage === null || typeof localImage !== "object") throw new Error("Expected local image SDK input");
    const localImagePath = Reflect.get(localImage, "path");
    expect(Reflect.get(localImage, "type")).toBe("local_image");
    expect(existsSync(typeof localImagePath === "string" ? localImagePath : "")).toBe(true);

    const imagePath = typeof localImagePath === "string" ? localImagePath : "";
    await imageInput.cleanup();
    expect(existsSync(imagePath)).toBe(false);
  });
});
