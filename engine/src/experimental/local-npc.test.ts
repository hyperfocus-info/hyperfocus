import { expect, test } from "bun:test";
import { createLocalNpcRuntime } from "./local-npc.ts";

test("local NPC runtime serializes on-device inference and bounds context", async () => {
  const seen: number[][] = [];
  let release!: () => void;
  const runtime = createLocalNpcRuntime<number, string>({
    maxContextEntries: 2,
    model: {
      available: true, execution: "local",
      async generate(request) {
        seen.push([...(request.context ?? [])]);
        await new Promise<void>((resolve) => { release = resolve; });
        return `model:${request.prompt}`;
      }
    },
    fallback(request) { return `fallback:${request.prompt}`; }
  });
  const response = runtime.respond({ npcId: "smith", prompt: "hello", context: [1, 2, 3] });
  expect(seen).toEqual([[2, 3]]);
  release();
  expect(await response).toEqual({ source: "local-model", value: "model:hello" });
});

test("local NPC runtime never calls remote models and falls back on local errors", async () => {
  let remoteCalls = 0;
  const remote = createLocalNpcRuntime({
    model: { available: true, execution: "remote", async generate() { remoteCalls += 1; return "remote"; } },
    fallback() { return "offline"; }
  });
  expect(await remote.respond({ npcId: "guide", prompt: "where?" })).toEqual({ source: "fallback", value: "offline" });
  expect(remoteCalls).toBe(0);

  const failing = createLocalNpcRuntime({
    model: { available: true, execution: "local", async generate() { throw new Error("model failed"); } },
    fallback(_request, reason) { return `safe:${(reason as Error).message}`; }
  });
  expect(await failing.respond({ npcId: "guide", prompt: "where?" })).toEqual({ source: "fallback", value: "safe:model failed" });
});
