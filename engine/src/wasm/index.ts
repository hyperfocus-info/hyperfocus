export {
  SharedStateArena,
  createSharedStateArena,
  type SharedStateArenaOptions,
  type StateArenaRegion
} from "./shared-arena.ts";
export {
  HotSwappableWasmSimulator,
  createHotSwappableWasmSimulator,
  type WasmSimulatorHostOptions,
  type WasmSimulatorModule,
  type WasmSwapResult
} from "./hot-swap.ts";
