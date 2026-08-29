export type DocumentExtractionStatus = "ok" | "ocr-required" | "no-text";

export type DocumentExtractionResult =
  | {
      status: "ok";
      text: string;
    }
  | {
      status: "ocr-required";
      reason: string;
    }
  | {
      status: "no-text";
      reason: string;
    };

export type DocumentExtractionOptions = {
  maxInputBytes?: number;
  maxItems?: number;
  maxExpandedBytes?: number;
  maxEntryBytes?: number;
  maxCompressionRatio?: number;
  maxOutputChars?: number;
  maxDurationMs?: number;
  signal?: AbortSignal;
};

export type ResourceBudgetOptions = {
  maxItems?: number;
  maxBytes?: number;
  maxDurationMs?: number;
  signal?: AbortSignal;
};

export type ResourceBudgetSnapshot = {
  items: number;
  bytes: number;
  elapsedMs: number;
};

export type ResourceBudget = {
  check(label: string): void;
  consumeItems(count: number, label: string): void;
  consumeBytes(count: number, label: string): void;
  snapshot(): ResourceBudgetSnapshot;
};

export function createResourceBudget(
  options: ResourceBudgetOptions = {},
  now: () => number = performance.now.bind(performance)
): ResourceBudget {
  const maxItems = readLimit(options.maxItems, "maxItems", true);
  const maxBytes = readLimit(options.maxBytes, "maxBytes", true);
  const maxDurationMs = readLimit(options.maxDurationMs, "maxDurationMs", false);
  const startedAt = now();
  let items = 0;
  let bytes = 0;

  function check(label: string) {
    if (options.signal?.aborted) {
      throw new Error(`${label} was aborted`, { cause: options.signal.reason });
    }
    if (now() - startedAt > maxDurationMs) {
      throw new RangeError(`${label} exceeded the ${formatLimit(maxDurationMs)} ms time budget`);
    }
  }

  return {
    check,
    consumeItems(count, label) {
      checkCount(count, "item count");
      check(label);
      items += count;
      if (items > maxItems) throw new RangeError(`${label} exceeded the ${formatLimit(maxItems)} item budget`);
    },
    consumeBytes(count, label) {
      checkCount(count, "byte count");
      check(label);
      bytes += count;
      if (bytes > maxBytes) throw new RangeError(`${label} exceeded the ${formatLimit(maxBytes)} byte budget`);
    },
    snapshot() {
      return { items, bytes, elapsedMs: now() - startedAt };
    }
  };
}

function readLimit(value: number | undefined, name: string, integer: boolean) {
  if (value === undefined) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    throw new RangeError(`${name} must be a non-negative${integer ? " integer" : ""}`);
  }
  return value;
}

function checkCount(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

function formatLimit(value: number) {
  return Number.isFinite(value) ? value.toLocaleString("en-US") : "unlimited";
}
