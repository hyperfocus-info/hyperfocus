/** Captures detached state once; each restoration receives its own copy. */
export function createRollbackParticipant<T>(options: {
  id: string;
  capture: () => T;
  restore: (state: T) => void;
  clone?: (state: T) => T;
}) {
  if (!options.id) throw new Error("rollback participant needs an id");
  const clone = options.clone ?? ((state: T) => structuredClone(state));
  return {
    id: options.id,
    checkpoint() {
      const state = clone(options.capture());
      return { state, restore: () => options.restore(clone(state)) };
    }
  };
}

export type RollbackParticipant = ReturnType<typeof createRollbackParticipant>;

/** Diagnostic hash, not a cryptographic signature or cross-platform determinism guarantee. */
export function hashRollbackState(options: { state: unknown }): string {
  let hash = 2166136261;
  const ancestors = new Set<object>();
  function append(text: string) {
    for (let index = 0; index < text.length; index += 1) {
      hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    }
  }
  function visit(value: unknown): void {
    if (value === null) { append("null;"); return; }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("rollback state must contain finite numbers");
      append(`n${Object.is(value, -0) ? "-0" : value};`);
      return;
    }
    if (typeof value === "string" || typeof value === "boolean" || typeof value === "undefined") {
      append(`${typeof value}:${JSON.stringify(value)};`);
      return;
    }
    if (typeof value !== "object") throw new Error("unsupported rollback state value");
    if (ancestors.has(value)) throw new Error("rollback state must not contain cycles");
    ancestors.add(value);
    if (ArrayBuffer.isView(value)) {
      if ((value instanceof Float32Array || value instanceof Float64Array) && !value.every(Number.isFinite)) {
        throw new Error("rollback state must contain finite numbers");
      }
      append(`${value.constructor.name}[`);
      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      for (const byte of bytes) append(`${byte},`);
    } else if (Array.isArray(value)) {
      append("array[");
      for (const item of value) visit(item);
    } else {
      if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
        throw new Error("rollback state requires plain objects, arrays, or typed arrays");
      }
      append("object[");
      for (const key of Object.keys(value).sort()) {
        append(`${JSON.stringify(key)}:`);
        visit(Reflect.get(value, key));
      }
    }
    append("];");
    ancestors.delete(value);
  }
  visit(options.state);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
