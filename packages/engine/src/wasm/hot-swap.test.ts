import { expect, test } from "bun:test";
import { HotSwappableWasmSimulator, createHotSwappableWasmSimulator, type WasmSimulatorModule } from "./hot-swap.ts";

function simulator(abiVersion = 1): WasmSimulatorModule<number> & { state: number; disposed: boolean } {
  return {
    exports: { tick() {} },
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

test("hot swap host preserves public generic constructor compatibility", () => {
  const host = new HotSwappableWasmSimulator<number>({ abiVersion: 1 });
  expect(host).toBeInstanceOf(HotSwappableWasmSimulator);
  expect(host.generation).toBe(0);
});

test("disposal cancels a pending load and disposes its eventual candidate", async () => {
  const host = createHotSwappableWasmSimulator<number>({ abiVersion: 1 });
  const loading = Promise.withResolvers<WasmSimulatorModule<number>>();
  const candidate = simulator();
  let disposals = 0;
  candidate.dispose = () => { disposals++; };
  const pending = host.replace(() => loading.promise);
  await host.dispose();
  loading.resolve(candidate);
  expect((await pending).ok).toBe(false);
  expect(host.current).toBeUndefined();
  expect(host.generation).toBe(0);
  expect(disposals).toBe(1);
  let loaded = false;
  expect((await host.replace(() => { loaded = true; return simulator(); })).ok).toBe(false);
  expect(loaded).toBe(false);
  await host.dispose();
  expect(disposals).toBe(1);
});

test("a superseded migration cannot overwrite newer state or dispose its owner", async () => {
  const host = createHotSwappableWasmSimulator<number>({ abiVersion: 1 });
  const initial = simulator();
  await host.replace(() => initial);
  initial.state = 1;
  const restoring = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const slow = simulator();
  let disposals = 0;
  slow.dispose = () => { disposals++; };
  slow.restoreState = async state => { slow.state = state; entered.resolve(); await restoring.promise; };
  const pending = host.replace(() => slow);
  await entered.promise;
  const latest = simulator();
  expect((await host.replace(() => latest)).ok).toBe(true);
  latest.state = 2;
  restoring.resolve();
  expect((await pending).ok).toBe(false);
  expect(host.current).toBe(latest);
  expect(latest.state).toBe(2);
  expect(latest.disposed).toBe(false);
  expect(disposals).toBe(1);
  expect(host.generation).toBe(2);
  await host.dispose();
});

test("disposal during restore retires both the live module and the candidate", async () => {
  const host = createHotSwappableWasmSimulator<number>({ abiVersion: 1 });
  const live = simulator(), candidate = simulator();
  await host.replace(() => live);
  const restoring = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  candidate.restoreState = async () => { entered.resolve(); await restoring.promise; };
  const pending = host.replace(() => candidate);
  await entered.promise;
  await host.dispose();
  restoring.resolve();
  expect((await pending).ok).toBe(false);
  expect(live.disposed).toBe(true);
  expect(candidate.disposed).toBe(true);
  expect(host.current).toBeUndefined();
});

test("rejected reused instances do not dispose the installed module", async () => {
  const diagnostics: string[] = [];
  const host = createHotSwappableWasmSimulator<number>({ abiVersion: 1, onDiagnostic: message => { diagnostics.push(message); } });
  const live = simulator();
  await host.replace(() => live);
  expect((await host.replace(() => live)).ok).toBe(false);
  expect(host.current).toBe(live);
  expect(live.disposed).toBe(false);
  const candidate = simulator();
  candidate.restoreState = () => { throw Error('migration failed'); };
  candidate.dispose = () => { throw Error('cleanup failed'); };
  expect((await host.replace(() => candidate)).ok).toBe(false);
  expect(host.current).toBe(live);
  expect(diagnostics).toContain('candidate disposal failed');
  await host.dispose();
});
