import { expect, test } from "bun:test";
import { createSwarmEventResponse } from "./response";

const encoder = new TextEncoder();
function fixture(encoding?: string) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; }, cancel() { cancelled = true; } });
  const request = new Request("https://swarm.example/events", { headers: encoding ? { "accept-encoding": encoding } : {} });
  return { response: createSwarmEventResponse(request, body), write: (text: string) => controller.enqueue(encoder.encode(text)), close: () => controller.close(), cancelled: () => cancelled };
}

test("gzip delivers each complete event before the long-lived source closes", async () => {
  const value = fixture("br, gzip;q=0.8");
  expect(value.response.headers.get("content-encoding")).toBe("gzip");
  const reader = value.response.body!.pipeThrough(new DecompressionStream("gzip")).getReader();
  const first = "id: 1\nevent: swarm\ndata: {\"status\":\"RUNNING\"}\n\n";
  value.write(first);
  const received = await reader.read();
  expect(new TextDecoder().decode(received.value)).toBe(first);
  expect(received.done).toBe(false);
  value.write("id: 2\nevent: swarm\ndata: {\"status\":\"COMPLETED\"}\n\n");
  expect(new TextDecoder().decode((await reader.read()).value)).toContain("COMPLETED");
  value.close();
  expect((await reader.read()).done).toBe(true);
});

test("explicit gzip refusal wins over wildcard and identity stays compatible", async () => {
  for (const encoding of [undefined, "identity", "gzip;q=0, *;q=1", "gzip;q=invalid"]) {
    const value = fixture(encoding);
    expect(value.response.headers.get("content-encoding")).toBeNull();
    value.write("data: unchanged\n\n"); value.close();
    expect(await value.response.text()).toBe("data: unchanged\n\n");
  }
});

test("cancelling a compressed response cancels upstream work", async () => {
  const value = fixture("gzip");
  const reader = value.response.body!.getReader();
  value.write("data: first\n\n"); await reader.read();
  await reader.cancel();
  await new Promise(resolve => setTimeout(resolve, 5));
  expect(value.cancelled()).toBe(true);
});

test("compressed retained evidence is smaller while decoding to identical SSE bytes", async () => {
  const text = `data: ${JSON.stringify({ findings: Array.from({ length: 100 }, (_, index) => ({ id: index, sourceRevision: "a".repeat(40), evidence: "Repeated attributable finding with immutable artifact reference." })) })}\n\n`;
  const value = fixture("gzip"); value.write(text); value.close();
  const compressed = new Uint8Array(await value.response.arrayBuffer());
  expect(compressed.length).toBeLessThan(encoder.encode(text).length / 4);
  expect(new TextDecoder().decode(Bun.gunzipSync(compressed))).toBe(text);
});

test("real HTTP fetch decodes a flushed event while the server stream remains open", async () => {
  let cancelled = false;
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    return createSwarmEventResponse(request, new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(encoder.encode("event: swarm\ndata: live fixture\n\n")); },
      cancel() { cancelled = true; },
    }));
  } });
  try {
    const response = await fetch(server.url, { headers: { "accept-encoding": "gzip" }, signal: AbortSignal.timeout(2_000) });
    expect(response.headers.get("content-encoding")).toBe("gzip");
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("event: swarm\ndata: live fixture\n\n");
    await reader.cancel();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(cancelled).toBe(true);
  } finally { await server.stop(true); }
});
