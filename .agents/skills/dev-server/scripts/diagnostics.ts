import { classifyDevError, fingerprintDevError, isErrorLogLine } from "./process";
import type { DevErrorRow } from "./registry";

type LogLine = { source: string; message: string; at: string };
type Diagnostic = LogLine & { category: DevErrorRow["category"]; fingerprint: string };
type PendingDiagnostic = LogLine & { lines: string[]; size: number; hasError: boolean };

/** Preserve stack context as one record; raw logs remain the complete transcript. */
export function createDevErrorCollector(options: { record: (error: Diagnostic) => void; quietMs?: number }) {
  const pending = new Map<string, PendingDiagnostic>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flushSource = (source: string) => {
    const entry = pending.get(source);
    pending.delete(source);
    if (!entry?.hasError) return;
    const message = entry.lines.join("\n");
    options.record({ source, message, at: entry.at, category: classifyDevError(entry.message),
      fingerprint: fingerprintDevError(entry.message) });
  };
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    for (const source of pending.keys()) flushSource(source);
  };
  const push = (line: LogLine) => {
    const message = line.message.replace(/\x1b\[[0-9;]*m/g, "").trimEnd();
    const continuation = isDiagnosticContext(message);
    const isError = !continuation && isErrorLogLine(message, line.source);
    let entry = pending.get(line.source);
    if (!continuation && entry?.hasError) {
      flushSource(line.source);
      entry = undefined;
    }
    if (!isError && !continuation) {
      pending.delete(line.source);
      return;
    }
    if (!entry) {
      entry = { ...line, message, lines: [], size: 0, hasError: false };
      pending.set(line.source, entry);
    }
    if (isError) {
      entry.message = message;
      entry.at = line.at;
      entry.hasError = true;
      // A long source excerpt must never displace the actual failure.
      const context = entry.lines.join("\n");
      entry.lines = [];
      entry.size = 0;
      appendContext(entry, message);
      if (context) appendContext(entry, context);
    } else {
      appendContext(entry, message);
    }
    clearTimeout(timer);
    timer = setTimeout(flush, options.quietMs ?? 100);
    timer.unref();
  };
  return { push, flush };
}

function appendContext(entry: PendingDiagnostic, message: string) {
  const remaining = 8_000 - entry.size;
  if (remaining <= 0) return;
  const marker = " [see full dev log]";
  const text = message.length > remaining
    ? remaining < marker.length ? marker.slice(0, remaining) : `${message.slice(0, remaining - marker.length)}${marker}`
    : message;
  entry.lines.push(text);
  entry.size += text.length + 1;
}

function isDiagnosticContext(message: string) {
  return /^\s*(?:at\s|\d+\s*[|:]|\^|(?:path|dest|syscall|errno|code):|Bun v\d|Windows v\d|CPU:|Args:|Features:|Builtins:|Elapsed:|RSS:|={5,}|To send a redacted crash report|please file a GitHub issue|https:\/\/bun\.report\/)/.test(message) || message.trim() === "";
}

export function formatDevErrors(options: { errors: readonly DevErrorRow[]; limit?: number; full?: boolean }) {
  const { errors, limit = 20, full = false } = options;
  if (!errors.length) return "No matching development errors.";
  const candidates = full ? errors : errors.filter((error) => error.message.split(/\r?\n/).some((line) => !isDiagnosticContext(line)));
  const shown = candidates.slice(0, limit);
  const lines = shown.map((error) => {
    const state = error.fixedAt ? "fixed" : error.investigatedAt ? "investigated" : "open";
    const primary = error.message.split(/\r?\n/).find((line) => !isDiagnosticContext(line)) ?? error.message;
    const message = full ? error.message : primary.length > 240 ? `${primary.slice(0, 237)}...` : primary;
    return `#${error.id} ${error.category.padEnd(11)} ${state.padEnd(12)} x${error.occurrenceCount} ${error.surface}: ${message}`;
  });
  lines.push(`Showing ${shown.length} of ${candidates.length} matching errors.${candidates.length < errors.length ? ` ${errors.length - candidates.length} historical context-only records omitted; --full includes them.` : ""} Use --limit <count> for more, --full for context, or --json for records. Complete output: dev:logs.`);
  return lines.join("\n");
}
