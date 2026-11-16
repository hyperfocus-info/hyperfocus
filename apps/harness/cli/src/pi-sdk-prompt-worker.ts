import { createPiSdkAgentAdapter,type PiSdkPromptWorkerRequest,type PiSdkPromptWorkerResponse } from "./pi-agent-adapter";
import { isPiApiKeyProvider } from "./pi-agent/provider-config";

type PromptWorkerScope = {
  onmessage: ((event: MessageEvent<PiSdkPromptWorkerRequest>) => void | Promise<void>) | null;
  postMessage(response: PiSdkPromptWorkerResponse): void;
};

const workerScope = requirePromptWorkerScope(globalThis);

workerScope.onmessage = async (event: MessageEvent<PiSdkPromptWorkerRequest>) => {
  const message = event.data;
  try {
    const adapter = createPiSdkAgentAdapter({ offloadRunPrompt: false });
    adapter.setAutoCompactContextThresholdPercent(message.autoCompactContextThresholdPercent);
    for (const [provider, apiKey] of Object.entries(message.apiKeys)) {
      if (apiKey && isPiApiKeyProvider(provider)) adapter.setApiKey(provider, apiKey);
    }

    const result = await adapter.runPrompt(message.request);
    postResponse({
      id: message.id,
      ok: true,
      result
    });
  } catch (error) {
    postResponse({
      id: message.id,
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    });
  }
};

function postResponse(response: PiSdkPromptWorkerResponse) {
  workerScope.postMessage(response);
}

function requirePromptWorkerScope(value: unknown): PromptWorkerScope {
  if (!isPromptWorkerScope(value)) throw new Error("Pi SDK prompt worker requires a worker global scope");
  return value;
}

function isPromptWorkerScope(value: unknown): value is PromptWorkerScope {
  return typeof value === "object" && value !== null
    && "onmessage" in value
    && typeof Reflect.get(value, "postMessage") === "function";
}
