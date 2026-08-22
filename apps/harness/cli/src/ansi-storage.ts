import stripAnsi from "strip-ansi";

/** Removes terminal presentation escapes before durable text reaches SQLite. */
export function stripAnsiForStorage(value: string) {
  return stripAnsi(value);
}

/** Serializes structured trace data while removing ANSI escapes from nested strings. */
export function stringifyAnsiFree(value: unknown) {
  return JSON.stringify(value, (_key, nestedValue) =>
    typeof nestedValue === "string" ? stripAnsiForStorage(nestedValue) : nestedValue
  );
}
