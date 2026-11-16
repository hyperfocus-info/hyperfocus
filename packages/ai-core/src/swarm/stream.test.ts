import { expect, test } from "bun:test";
import { createSwarmClient } from "./client";
import { swarmRunSchema, type SwarmRun } from "./contracts";
import { applySwarmRunFrame, createSwarmRunFrame } from "./stream";

function fixture(count = 0): SwarmRun {
  return swarmRunSchema.parse({ id: "run-1", request: { requestId: "request-1", projectId: "project-1", goal: "Investigate performance", repository: { revision: "a".repeat(40) } }, status: "RUNNING", createdAt: 1, updatedAt: 1, reason: "Preparing", tasks: [], candidates: [], artifacts: [], metrics: {}, messages: Array.from({ length: count }, (_, index) => ({ id: `message-${index}`, swarmId: "run-1", taskId: "task-1", agentId: "agent-1", sourceRevision: "a".repeat(40), kind: "evidence", text: `SIMULATED STREAM FIXTURE ${index}: ${"bounded evidence ".repeat(35)}`, artifactIds: [], createdAt: index })) });
}
test("swarm deltas preserve append, update, removal, reordering and optional-field clearing", () => {
  const run = fixture(20), initial = applySwarmRunFrame({ frame: createSwarmRunFrame({ run }), runId: run.id });
  const messages = run.messages.slice(1).reverse();
  messages[0] = { ...messages[0]!, text: "Corrected finding" };
  messages.push({ ...run.messages[0]!, id: "new-message" });
  const next = swarmRunSchema.parse({ ...run, reason: undefined, updatedAt: 2, messages });
  const frame = createSwarmRunFrame({ previous: initial, run: next });
  expect(frame?.type).toBe("delta");
  expect(applySwarmRunFrame({ previous: initial, frame: JSON.parse(JSON.stringify(frame)), runId: run.id }).run).toEqual(next);
  expect(createSwarmRunFrame({ previous: initial, run })).toBeUndefined();
});
test("stream gaps, cross-run identifiers and duplicate collection IDs fail closed", () => {
  const run = fixture(10), initial = applySwarmRunFrame({ frame: createSwarmRunFrame({ run }), runId: run.id });
  const frame = createSwarmRunFrame({ previous: initial, run: { ...run, updatedAt: 2 } });
  expect(frame?.type).toBe("delta");
  expect(() => applySwarmRunFrame({ frame, runId: run.id })).toThrow("sequence");
  expect(() => applySwarmRunFrame({ previous: initial, frame: { ...frame, sequence: 4 }, runId: run.id })).toThrow("sequence");
  expect(() => applySwarmRunFrame({ previous: initial, frame, runId: "other-run" })).toThrow("identity");
  expect(() => applySwarmRunFrame({ previous: initial, frame: { ...frame, messages: { upsert: [run.messages[0], run.messages[0]], remove: [] } }, runId: run.id })).toThrow("Duplicate");
  expect(() => applySwarmRunFrame({ frame: { type: "snapshot", sequence: 0, run: { ...run, messages: [run.messages[0], run.messages[0]] } }, runId: run.id })).toThrow("Duplicate");
});
test("representative retained evidence is transmitted once and subsequent deltas reconstruct exactly", () => {
  const run = fixture(500), initial = applySwarmRunFrame({ frame: createSwarmRunFrame({ run }), runId: run.id });
  const next = { ...run, updatedAt: 2, metrics: { ...run.metrics, modelCalls: 2 }, messages: [...run.messages, { ...run.messages[0]!, id: "latest-message", text: "New useful finding" }] };
  const frame = createSwarmRunFrame({ previous: initial, run: next });
  expect(JSON.stringify(frame).length).toBeLessThan(JSON.stringify(next).length / 100);
  expect(applySwarmRunFrame({ previous: initial, frame, runId: run.id }).run).toEqual(next);
});
test("watch reconstructs fragmented UTF-8/CRLF frames and accepts the legacy deployed server", async () => {
  const run = fixture(8), first = createSwarmRunFrame({ run });
  const initial = applySwarmRunFrame({ frame: first, runId: run.id });
  const next = { ...run, reason: "検証", updatedAt: 2 };
  for (const frames of [[first, createSwarmRunFrame({ previous: initial, run: next })], [run, next]]) {
    const bytes = new TextEncoder().encode(frames.map(frame => `event: swarm\r\ndata: ${JSON.stringify(frame)}\r\n\r\n`).join(""));
    const observed: SwarmRun[] = [];
    const client = createSwarmClient({ fetch: async () => new Response(new ReadableStream({ start(controller) { for (let offset = 0; offset < bytes.length; offset += 17) controller.enqueue(bytes.slice(offset, offset + 17)); controller.close(); } })) });
    await client.watch(run.id, value => observed.push(value), new AbortController().signal);
    expect(observed).toEqual([run, next]);
  }
});
test("watch rejects a cross-run legacy snapshot", async () => {
  const client = createSwarmClient({ fetch: async () => new Response(`data: ${JSON.stringify(fixture())}\n\n`) });
  await expect(client.watch("another-run", () => {}, new AbortController().signal)).rejects.toThrow("another run");
});
