import { createHash } from "node:crypto";
import { terminateProcessTree as terminateBackgroundProcessTree } from "@hyperfocus/desktop-runtime/process";
import type { DevErrorCategory } from "./registry";

export function isProcessAlive(pid: number | null) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function terminateProcessTree(pid: number | null) {
  if (!pid || pid <= 0 || !isProcessAlive(pid)) return;
  await terminateBackgroundProcessTree({ pid });
}

export function classifyDevError(message: string): DevErrorCategory {
  const normalized = message.toLowerCase();
  if (/sqlite|database|migration|constraint failed|database is locked/.test(normalized)) return "persistence";
  if (/eaddrinuse|econn|enotfound|websocket|network|fetch failed|port .*in use/.test(normalized)) return "network";
  if (/build|bundle|compile|syntaxerror|transform|module not found|cannot find module/.test(normalized)) return "build";
  if (/exited|signal|spawn|enoent|eperm|eacces|permission denied/.test(normalized)) return "process";
  if (/error|exception|unhandled|failed|stack|fatal|panic|crashed/.test(normalized)) return "runtime";
  return "unknown";
}

export function isErrorLogLine(message: string, source: string) {
  if (/^\s*\$\s+/.test(message)) return false;
  if (source === "stderr" && /^\s*warn(?:ing)?\b/i.test(message)) {
    return /\b(error|exception|failed|failure|fatal|panic|eaddrinuse|unhandled)\b/i.test(message);
  }
  if (source === "stderr") return message.trim().length > 0;
  return /\b(error|exception|failed|failure|fatal|panic|eaddrinuse|unhandled)\b/i.test(message);
}

export function fingerprintDevError(message: string) {
  const normalized = message
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\b\d{2,}\b/g, "#")
    .replace(/[A-F]:\\[^\s:]+/gi, "<path>")
    .replace(/\/[^\s:]+/g, "<path>")
    .trim()
    .slice(0, 2_000);
  return createHash("sha256").update(normalized).digest("hex").slice(0, 24);
}
