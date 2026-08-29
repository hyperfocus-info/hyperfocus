import { isPadPilotDevtoolsEnabled } from "../runtime-flags";
import {
  BoundedStreamLimitError,
  readBoundedStreamText,
} from "@hyperfocus/pad-pilot/bounded-stream";

export type PadPilotAgentProvider = "cursor";

export type PadPilotAgentRequest = {
  endpoint?: string;
  model?: string;
  prompt: string;
  provider?: PadPilotAgentProvider;
  responseSchema?: unknown;
  responseSchemaName?: string;
  signal?: AbortSignal;
  stream?: false;
  system?: string;
  timeoutMs?: number;
};

export type PadPilotAgentResponse = {
  model: string;
  provider: PadPilotAgentProvider;
  source: "dev-agent" | "remote-agent";
  text: string;
};

const DEFAULT_AGENT_MODEL = "5.5 low fast";
const DEFAULT_AGENT_PROVIDER: PadPilotAgentProvider = "cursor";
const DEFAULT_AGENT_TIMEOUT_MS = 5 * 60_000;
const MAX_AGENT_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_AGENT_ERROR_BYTES = 64 * 1024;

function envValue(key: string) {
  return typeof process !== "undefined" ? process.env[key] : undefined;
}

function browserWindow() {
  return typeof window === "undefined" ? undefined : window;
}

function localStorageValue(key: string) {
  try {
    return browserWindow()?.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function resolveEndpoint(option?: string) {
  const configuredEndpoint = option
    ?? browserWindow()?.__PADPILOT_AGENT_ENDPOINT__
    ?? localStorageValue("padpilot.agent.endpoint")
    ?? envValue("PADPILOT_AGENT_ENDPOINT");
  if (configuredEndpoint) {
    return configuredEndpoint;
  }
  if (isPadPilotDevtoolsEnabled()) {
    return "/api/dev/generator/codex";
  }
  return "http://localhost:11434/api/generate";
}

function resolveModel(option?: string) {
  return option
    ?? browserWindow()?.__PADPILOT_AGENT_MODEL__
    ?? localStorageValue("padpilot.agent.model")
    ?? envValue("PADPILOT_AGENT_MODEL")
    ?? DEFAULT_AGENT_MODEL;
}

function resolveProvider(option?: PadPilotAgentProvider) {
  const provider = option
    ?? browserWindow()?.__PADPILOT_AGENT_PROVIDER__
    ?? (localStorageValue("padpilot.agent.provider") as PadPilotAgentProvider | undefined)
    ?? (envValue("PADPILOT_AGENT_PROVIDER") as PadPilotAgentProvider | undefined)
    ?? DEFAULT_AGENT_PROVIDER;
  return provider === "cursor" ? DEFAULT_AGENT_PROVIDER : DEFAULT_AGENT_PROVIDER;
}

function parseAgentText(buffer: string) {
  const trimmed = buffer.trim();
  if (!trimmed) {
    return "";
  }
  const responseText = (value: unknown) => {
    if (typeof value === "string") {
      return value;
    }
    if (value === undefined || value === null) {
      return "";
    }
    return JSON.stringify(value);
  };
  try {
    const parsed = JSON.parse(trimmed) as { response?: unknown; text?: unknown; output?: unknown };
    return responseText(parsed.response ?? parsed.text ?? parsed.output ?? trimmed);
  } catch {
    const fragments: string[] = [];
    for (const line of trimmed.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      try {
        const parsed = JSON.parse(line) as { response?: unknown; text?: unknown; output?: unknown };
        fragments.push(responseText(parsed.response ?? parsed.text ?? parsed.output));
      } catch {
        fragments.push(line);
      }
    }
    return fragments.join("");
  }
}

async function readBoundedResponse(response: Response, maxBytes: number) {
  try {
    return await readBoundedStreamText(response.body, {
      label: "PadPilot agent response",
      maxBytes,
    });
  } catch (error) {
    if (error instanceof BoundedStreamLimitError) {
      throw new Error("PadPilot agent response exceeded its size limit.");
    }
    throw error;
  }
}

async function responseErrorMessage(response: Response) {
  const fallback = `Agent endpoint returned HTTP ${response.status}.`;
  const text = await readBoundedResponse(response, MAX_AGENT_ERROR_BYTES);
  if (!text.trim()) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(text) as { error?: { code?: string; message?: string } };
    const code = parsed.error?.code ? `${parsed.error.code}: ` : "";
    const message = parsed.error?.message?.trim();
    return message ? `${fallback} ${code}${message}` : `${fallback} ${text.trim()}`;
  } catch {
    return `${fallback} ${text.trim()}`;
  }
}

export async function askAgent(request: PadPilotAgentRequest | string) {
  const normalized = typeof request === "string" ? { prompt: request } : request;
  const endpoint = resolveEndpoint(normalized.endpoint);
  const model = resolveModel(normalized.model);
  const provider = resolveProvider(normalized.provider);
  const controller = new AbortController();
  const requestedTimeoutMs = normalized.timeoutMs;
  const timeoutMs = typeof requestedTimeoutMs === "number" && Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0
    ? Math.min(30 * 60_000, Math.round(requestedTimeoutMs))
    : DEFAULT_AGENT_TIMEOUT_MS;
  const abortFromCaller = () => controller.abort(normalized.signal?.reason);
  if (normalized.signal?.aborted) {
    abortFromCaller();
  } else {
    normalized.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timeoutHandle = globalThis.setTimeout(() => controller.abort(new Error("PadPilot agent request timed out.")), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      body: JSON.stringify({
        model,
        prompt: normalized.prompt,
        provider,
        responseSchema: normalized.responseSchema,
        responseSchemaName: normalized.responseSchemaName,
        stream: normalized.stream ?? false,
        system: normalized.system ?? "",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(await responseErrorMessage(response));
    }
    return {
      model,
      provider,
      source: endpoint.includes("/api/dev/generator/codex") ? "dev-agent" : "remote-agent",
      text: parseAgentText(await readBoundedResponse(response, MAX_AGENT_RESPONSE_BYTES)),
    } satisfies PadPilotAgentResponse;
  } finally {
    globalThis.clearTimeout(timeoutHandle);
    normalized.signal?.removeEventListener("abort", abortFromCaller);
  }
}

declare global {
  interface Window {
    __PADPILOT_AGENT_ENDPOINT__?: string;
    __PADPILOT_AGENT_MODEL__?: string;
    __PADPILOT_AGENT_PROVIDER__?: PadPilotAgentProvider;
  }
}
