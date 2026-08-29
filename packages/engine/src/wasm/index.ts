export {
  SharedStateArena,
  createSharedStateArena,
  type SharedStateArenaOptions,
  type StateArenaRegion
} from "./shared-arena.ts";
export {
  createWasmMemoryArena,
  type MutableNumericArray,
  type WasmMemoryArena,
  type WasmMemoryArenaOptions,
  type WasmMemoryLease
} from "./module-memory-arena.ts";
export {
  HotSwappableWasmSimulator,
  createHotSwappableWasmSimulator,
  type WasmSimulatorHostOptions,
  type WasmSimulatorModule,
  type WasmSwapResult
} from "./hot-swap.ts";
