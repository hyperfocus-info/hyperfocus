import { getBundledCodexInstallation } from "../agent-runtimes/codex-installation";
import { readCodexSubscription } from "@hyperfocus/ai-runtime";
import { codexLimitsSchema, type CodexLimits } from "@hyperfocus/ai-core/protocol";

// The existing official app-server bridge owns authentication; no credential files are read here.
export async function probeCodexLimits(options: { executable?: string; read?: typeof readCodexSubscription } = {}): Promise<CodexLimits> {
  const checkedAt = new Date().toISOString();
  const executable = options.executable ?? getBundledCodexInstallation().executablePath;
  if (!executable) return { status: "unavailable", checkedAt, windows: [], reason: "Codex CLI is not installed." };
  try {
    const account = await (options.read ?? readCodexSubscription)({ executable, codexHome: process.env.CODEX_HOME });
    if (!account.authenticated) return { status: "unavailable", checkedAt, windows: [], reason: "Sign in to Codex with your ChatGPT account." };
    const windows: CodexLimits["windows"] = [];
    for (const id of ["primary", "secondary"] as const) {
      const window = account.limits?.[id];
      if (!window) continue;
      windows.push({ id, usedPercent: window.usedPercent, remainingPercent: Math.max(0, 100 - window.usedPercent),
        ...(window.windowDurationMins == null ? {} : { windowDurationMins: window.windowDurationMins }),
        ...(window.resetsAt == null ? {} : { resetsAt: new Date(window.resetsAt * 1000).toISOString() }) });
    }
    return codexLimitsSchema.parse({ status: windows.length ? "available" : "unavailable", checkedAt: new Date(account.checkedAt).toISOString(),
      plan: account.plan ?? undefined, windows, ...(!windows.length ? { reason: "Codex did not report account usage windows." } : {}) });
  } catch {
    // Remote/native errors may contain account or credential material.
    return { status: "error", checkedAt, windows: [], reason: "Codex account usage could not be read. Check the CLI login and retry." };
  }
}

const pending = new WeakMap<object, Promise<void>>();
export function refreshCodexLimits(repository: { setCodexLimits(value: CodexLimits): void }, probe = probeCodexLimits) {
  const prior = pending.get(repository);
  if (prior) return prior;
  const next = probe().then(value => repository.setCodexLimits(value)).finally(() => pending.delete(repository));
  pending.set(repository, next);
  return next;
}
