import { expect, test } from "bun:test";
import { createHarnessCapacityGovernor, getHarnessManagedAgentAdapter } from "../execution-runtime";
import type { PiAgentAdapter, PiAgentExecutionEvent } from "../pi-agent-adapter";

test("a saturated provider reports queued then acquired with separate wait duration", async () => {
  const governor = createHarnessCapacityGovernor({ capacities: { provider: 1, "provider.openai": 1 } });
  const held = await governor.acquire({ resources: { provider: 1, "provider.openai": 1 } });
  const events: PiAgentExecutionEvent[] = [];
  let invoked = false;
  const source: PiAgentAdapter = { async runPrompt() { invoked = true; return { text: "done" }; },
    async startExecution() { throw new Error("not used"); }, setApiKey() {}, hasApiKey() { return false; } };
  const running = getHarnessManagedAgentAdapter(source, { governor }).runPrompt({ kind: "executor", cwd: ".", prompt: "test",
    modelId: "openai/gpt-5.6-luna", onExecutionEvent: event => events.push(event) });
  expect(invoked).toBe(false);
  expect(events[0]).toMatchObject({ type: "provider-capacity", state: "queued", provider: "openai" });
  held.release(); await running;
  expect(invoked).toBe(true); expect(events[1]).toMatchObject({ type: "provider-capacity", state: "acquired" });
});
