export type RetainedCursorOverflow = "grow" | "throw";

export type RetainedCursorOptions<T> = {
  capacity: number;
  create: (index: number) => T;
  overflow?: RetainedCursorOverflow;
  maximumCapacity?: number;
};

export type RetainedCursorView<T> = {
  readonly items: readonly T[];
  readonly count: number;
};

export type RetainedCursor<T> = {
  begin(): void;
  take(): T;
  view(): RetainedCursorView<T>;
  capacity(): number;
};

type MutableRetainedCursorView<T> = {
  readonly items: T[];
  count: number;
};

export function createRetainedCursor<T>(options: RetainedCursorOptions<T>): RetainedCursor<T> {
  assertCapacity("capacity", options.capacity, 1);
  const overflow = options.overflow ?? "throw";
  if (overflow !== "grow" && overflow !== "throw") {
    throw new RangeError(`Unsupported retained cursor overflow policy "${String(overflow)}".`);
  }
  if (overflow === "grow" && options.maximumCapacity === undefined) {
    throw new RangeError("maximumCapacity is required when retained cursor overflow is grow.");
  }
  const maximumCapacity = options.maximumCapacity ?? options.capacity;
  assertCapacity("maximumCapacity", maximumCapacity, options.capacity);
  const items: T[] = [];
  for (let index = 0; index < options.capacity; index += 1) items.push(options.create(index));
  const view: MutableRetainedCursorView<T> = { items, count: 0 };

  function grow() {
    if (overflow === "throw" || items.length >= maximumCapacity) {
      throw new RangeError(`Retained cursor capacity ${items.length} exceeded.`);
    }
    const nextCapacity = Math.min(maximumCapacity, Math.max(items.length + 1, items.length * 2));
    for (let index = items.length; index < nextCapacity; index += 1) items.push(options.create(index));
  }

  return {
    begin() {
      view.count = 0;
    },
    take() {
      if (view.count === items.length) grow();
      const item = items[view.count];
      view.count += 1;
      return item;
    },
    view() {
      return view;
    },
    capacity() {
      return items.length;
    }
  };
}

function assertCapacity(name: string, value: number, minimum: number) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be a safe integer no smaller than ${minimum}.`);
  }
}
