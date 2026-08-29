import type {

  PiAgentExecutionController,
  PiAgentPromptRequest,
  PiAgentPromptResult,
  PiApiKeyProvider
} from "../pi-agent-adapter";
import { runFakePiAgentPrompt } from "./fake-pi-agent-prompt";

const DEFAULT_TEST_EVENT_TIMEOUT_MS = 1500;

type CallWaiter = {
      kind: PiAgentPromptRequest["kind"];
      predicate?: (request: PiAgentPromptRequest) => boolean;
      resolve: (request: PiAgentPromptRequest) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
};

export type FakePiAgentAdapter = ReturnType<typeof createFakePiAgentAdapter>;

export function createFakePiAgentAdapter() {
  const calls: PiAgentPromptRequest[] = [];
  const callWaiters: CallWaiter[] = [];
  const deferredSubagentReleases: Array<() => void> = [];
  const deferredAggregatorReleases: Array<() => void> = [];
  const retryTracker = new Set<string>();
  const subagentCallCounts = new Map<string, number>();
  const apiKeys: Record<PiApiKeyProvider, string | undefined> = {
      openai: undefined,
      google: undefined,
      anthropic: undefined
    };

  function setApiKey(provider: PiApiKeyProvider, apiKey: string | undefined) {
      apiKeys[provider] = apiKey;
    }

  function hasApiKey(provider: PiApiKeyProvider) {
      return Boolean(apiKeys[provider]);
    }

  function waitForCall(
      kind: PiAgentPromptRequest["kind"],
      predicate?: (request: PiAgentPromptRequest) => boolean,
      timeoutMs: number = DEFAULT_TEST_EVENT_TIMEOUT_MS
    ) {
      const existing = calls.find((call) => call.kind === kind && (predicate ? predicate(call) : true));
      if (existing) {
        return Promise.resolve(existing);
      }

      return new Promise<PiAgentPromptRequest>((resolve, reject) => {
        const waiter = {
          kind,
          predicate,
          resolve,
          reject,
          timeout: setTimeout(() => {
            removeCallWaiter(waiter);
            reject(new Error(`Timed out waiting for ${kind} adapter call`));
          }, timeoutMs)
        };
        callWaiters.push(waiter);
      });
    }

  function releaseDeferredSubagents() {
      const releases = deferredSubagentReleases.splice(0);
      for (const release of releases) {
        release();
      }
    }

  function releaseDeferredAggregators() {
      const releases = deferredAggregatorReleases.splice(0);
      for (const release of releases) {
        release();
      }
    }

  function recordCall(request: PiAgentPromptRequest) {
      calls.push(request);
      for (const waiter of [...callWaiters]) {
        if (waiter.kind !== request.kind || (waiter.predicate && !waiter.predicate(request))) {
          continue;
        }

        removeCallWaiter(waiter);
        waiter.resolve(request);
      }
    }

  function removeCallWaiter(waiter: CallWaiter) {
      const index = callWaiters.indexOf(waiter);
      if (index >= 0) {
        callWaiters.splice(index, 1);
      }
      clearTimeout(waiter.timeout);
    }

  function waitForDeferredSubagentRelease() {
      return new Promise<void>((resolve) => {
        deferredSubagentReleases.push(resolve);
      });
    }

  function waitForDeferredAggregatorRelease() {
      return new Promise<void>((resolve) => {
        deferredAggregatorReleases.push(resolve);
      });
    }

  async function runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    recordCall(request);
    return runFakePiAgentPrompt(request, {
      retryTracker,
      subagentCallCounts,
      waitForDeferredSubagentRelease,
      waitForDeferredAggregatorRelease
    });
  }

  async function startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
      let aborted = false;
      let rejectAbort: ((error: Error) => void) | undefined;
      const run = (nextRequest: PiAgentPromptRequest) => {
        if (nextRequest.kind === "executor" && nextRequest.prompt.includes("streaming refresh")) {
          recordCall(nextRequest);
          nextRequest.onExecutionEvent?.({ type: "session-created" });
          nextRequest.onExecutionEvent?.({ type: "activity" });
          nextRequest.onTextDelta?.("working");
          const completionDelayMs = nextRequest.prompt.includes("streaming refresh hold") ? 1000 : 120;
          return new Promise<PiAgentPromptResult>((resolve, reject) => {
            rejectAbort = (error: Error) => reject(error);
            setTimeout(() => {
              if (aborted) {
                reject(new Error("aborted by test"));
                return;
              }

              resolve({
                text: "main execution result",
                contextUsage: {
                  tokens: 2400,
                  contextWindow: 200000,
                  usagePercent: 1.2,
                  sessionStats: {
                    sessionFile: undefined,
                    sessionId: crypto.randomUUID(),
                    userMessages: 1,
                    assistantMessages: 1,
                    toolCalls: 0,
                    toolResults: 0,
                    totalMessages: 2,
                    tokens: {
                      input: 100,
                      output: 200,
                      cacheRead: 0,
                      cacheWrite: 0,
                      total: 300
                    },
                    cost: 0,
                    contextUsage: {
                      tokens: 2400,
                      contextWindow: 200000,
                      percent: 1.2
                    }
                  }
                }
              });
            }, completionDelayMs);
          });
        }

        return Promise.race([
          runPrompt(nextRequest),
          new Promise<PiAgentPromptResult>((_, reject) => {
            rejectAbort = (error: Error) => reject(error);
            if (aborted) {
              reject(new Error("aborted by test"));
            }
          })
        ]);
      };

      let currentResult = run(request);
      return {
        get result() {
          return currentResult;
        },
        continueWithPrompt(prompt: string = "continue") {
          currentResult = run({ ...request, prompt });
          return currentResult;
        },
        async abort() {
          aborted = true;
          rejectAbort?.(new Error("aborted by test"));
        },
        dispose() {}
      };
    }

  return {
    calls,
    setApiKey,
    hasApiKey,
    waitForCall,
    releaseDeferredSubagents,
    releaseDeferredAggregators,
    runPrompt,
    startExecution,
  };
}
