import { afterEach, expect, it } from "bun:test";
import { askAgent } from "./agent";

const originalFetch = globalThis.fetch;
const originalDevtoolsEnv = process.env.PADPILOT_DEVTOOLS_ENABLED;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete window.__PADPILOT_AGENT_ENDPOINT__;
  delete window.__PADPILOT_AGENT_MODEL__;
  delete window.__PADPILOT_AGENT_PROVIDER__;
  window.localStorage.removeItem("padpilot.agent.endpoint");
  window.localStorage.removeItem("padpilot.agent.model");
  window.localStorage.removeItem("padpilot.agent.provider");
  if (originalDevtoolsEnv === undefined) {
    delete process.env.PADPILOT_DEVTOOLS_ENABLED;
  } else {
    process.env.PADPILOT_DEVTOOLS_ENABLED = originalDevtoolsEnv;
  }
});

it("posts agent prompts through the public askAgent helper", async () => {
  let requestUrl = "";
  let requestBody = {};
  globalThis.fetch = ((async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({ response: "tracker text" }));
  }) as unknown) as typeof fetch;

  const response = await askAgent({
    endpoint: "/agent",
    model: "5.5 low fast",
    prompt: "write midi",
    provider: "cursor",
    responseSchema: { type: "object" },
    responseSchemaName: "generator-model-envelope-v1",
    system: "tracker only",
  });

  expect(requestUrl).toBe("/agent");
  expect(requestBody).toMatchObject({
    model: "5.5 low fast",
    prompt: "write midi",
    provider: "cursor",
    responseSchema: { type: "object" },
    responseSchemaName: "generator-model-envelope-v1",
    stream: false,
    system: "tracker only",
  });
  expect(response).toEqual({
    model: "5.5 low fast",
    provider: "cursor",
    source: "remote-agent",
    text: "tracker text",
  });
});

it("uses generic agent settings and dev route without module fetch code", async () => {
  process.env.PADPILOT_DEVTOOLS_ENABLED = "true";
  window.localStorage.setItem("padpilot.agent.model", "agent model");
  let requestUrl = "";
  let requestBody = {};
  globalThis.fetch = ((async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response("{\"response\":\"ok\"}");
  }) as unknown) as typeof fetch;

  const response = await askAgent("hello");

  expect(requestUrl).toBe("/api/dev/generator/codex");
  expect(requestBody).toMatchObject({
    model: "agent model",
    prompt: "hello",
    provider: "cursor",
  });
  expect(response.source).toBe("dev-agent");
  expect(response.text).toBe("ok");
});

it("stringifies structured response objects from agent endpoints", async () => {
  globalThis.fetch = ((async () => new Response(JSON.stringify({
    response: {
      tracker: "!BPM:120!",
    },
  }))) as unknown) as typeof fetch;

  const response = await askAgent({
    endpoint: "/agent",
    prompt: "write midi",
  });

  expect(response.text).toBe("{\"tracker\":\"!BPM:120!\"}");
});

it("rejects oversized agent responses before buffering them without limit", async () => {
  globalThis.fetch = ((async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1))) as unknown) as typeof fetch;

  await expect(askAgent({ endpoint: "/agent", prompt: "write midi" }))
    .rejects.toThrow("response exceeded its size limit");
});

it("aborts agent requests at their deadline", async () => {
  globalThis.fetch = (((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    })) as unknown) as typeof fetch;

  await expect(askAgent({ endpoint: "/agent", prompt: "write midi", timeoutMs: 5 }))
    .rejects.toThrow("timed out");
});
