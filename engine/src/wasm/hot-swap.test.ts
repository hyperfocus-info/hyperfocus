import { expect, test } from "bun:test";
import { createHotSwappableWasmSimulator, type WasmSimulatorModule } from "./hot-swap.ts";

function simulator(abiVersion = 1): WasmSimulatorModule<number> & { state: number; disposed: boolean } {
  return {
    exports: { tick() {} } as WebAssembly.Exports,
    abiVersion,
    state: 0,
    disposed: false,
    captureState() { return this.state; },
    restoreState(state) { this.state = state; },
    dispose() { this.disposed = true; }
  };
}

test("hot swap migrates state then disposes the previous simulator", async () => {
  const host = createHotSwappableWasmSimulator<number>({ abiVersion: 1, requiredExports: ["tick"] });
  const first = simulator();
  await host.replace(() => first);
  first.state = 42;
  const second = simulator();
  expect(await host.replace(() => second)).toEqual({ ok: true, generation: 2 });
  expect(second.state).toBe(42);
  expect(first.disposed).toBe(true);
  expect(host.current).toBe(second);
});

test("hot swap keeps the live simulator when validation or migration fails", async () => {
  const host = createHotSwappableWasmSimulator<number>({ abiVersion: 1, requiredExports: ["tick"] });
  const live = simulator();
  await host.replace(() => live);
  const incompatible = simulator(2);
  expect((await host.replace(() => incompatible)).ok).toBe(false);
  expect(incompatible.disposed).toBe(true);
  expect(live.disposed).toBe(false);
  expect(host.current).toBe(live);
});
