export type NumericBatchBackend = "auto" | "typescript" | "wasm";

export type NumericBatchPolicy = {
  backend?: NumericBatchBackend;
  minimumWasmBatchSize?: number;
  minimumWasmBatchSizeByOperation?: Readonly<Record<string, number>>;
};

export type ResolvedNumericBatchPolicy = Readonly<{
  backend: NumericBatchBackend;
  minimumWasmBatchSize: number;
  minimumWasmBatchSizeByOperation?: Readonly<Record<string, number>>;
}>;

export type NumericBatchSelector = {
  readonly policy: ResolvedNumericBatchPolicy;
  backendFor(count: number, wasmAvailable?: boolean, operation?: string): Exclude<NumericBatchBackend, "auto">;
};

export const DEFAULT_MINIMUM_WASM_BATCH_SIZE = 256;

export function createNumericBatchSelector(options: NumericBatchPolicy = {}): NumericBatchSelector {
  const backend = options.backend ?? "auto";
  if (backend !== "auto" && backend !== "typescript" && backend !== "wasm") {
    throw new RangeError(`Invalid numeric batch backend "${String(backend)}"`);
  }
  const minimumWasmBatchSize = options.minimumWasmBatchSize ?? DEFAULT_MINIMUM_WASM_BATCH_SIZE;
  if (!Number.isSafeInteger(minimumWasmBatchSize) || minimumWasmBatchSize < 0) {
    throw new RangeError("Invalid minimumWasmBatchSize");
  }
  const minimumWasmBatchSizeByOperation = normalizeOperationThresholds(options.minimumWasmBatchSizeByOperation);
  const policy = Object.freeze({
    backend,
    minimumWasmBatchSize,
    ...(minimumWasmBatchSizeByOperation ? { minimumWasmBatchSizeByOperation } : {})
  });
  return Object.freeze({
    policy,
    backendFor(count, wasmAvailable = true, operation) {
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new RangeError("Invalid numeric batch count");
      }
      if (!wasmAvailable || backend === "typescript") return "typescript";
      if (backend === "wasm") return "wasm";
      const threshold = operation === undefined
        ? minimumWasmBatchSize
        : minimumWasmBatchSizeByOperation?.[operation] ?? minimumWasmBatchSize;
      return count >= threshold ? "wasm" : "typescript";
    }
  });
}

function normalizeOperationThresholds(input: Readonly<Record<string, number>> | undefined) {
  if (input === undefined) return undefined;
  const normalized: Record<string, number> = {};
  for (const [operation, threshold] of Object.entries(input)) {
    if (!operation.trim()) throw new RangeError("Numeric batch operation name is empty");
    if (!Number.isSafeInteger(threshold) || threshold < 0) {
      throw new RangeError(`Invalid minimumWasmBatchSizeByOperation.${operation}`);
    }
    normalized[operation] = threshold;
  }
  return Object.freeze(normalized);
}
