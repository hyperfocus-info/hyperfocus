import { spawnBackgroundProcess, terminateProcessTree } from "@hyperfocus/desktop-runtime/process";
import { z } from "zod";

const windowSchema = z.object({ usedPercent: z.number().finite().nonnegative(), windowDurationMins: z.number().optional(), resetsAt: z.number().optional() }).nullable();
const limitsSchema = z.object({ primary: windowSchema, secondary: windowSchema, rateLimitReachedType: z.string().nullable().optional(), credits: z.object({ hasCredits: z.boolean(), unlimited: z.boolean(), balance: z.string().nullable().optional() }).nullable().optional() });
export const codexSubscriptionStatusSchema = z.object({
  authenticated: z.boolean(), plan: z.string().nullable(), available: z.boolean(), reason: z.string().optional(),
  limits: limitsSchema.optional(), checkedAt: z.number(), separatelyBilledUsd: z.literal(0),
});
export type CodexSubscriptionStatus = z.infer<typeof codexSubscriptionStatusSchema>;

/** Deliberate allowlist: never forward API keys, proxy credentials, or Railway secrets to Codex. */
export function codexSubscriptionEnvironment(codexHome?: string, source: NodeJS.ProcessEnv = process.env) {
  const env: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(source)) {
    if (/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|LANG|LC_ALL)$/i.test(name)) env[name] = value;
  }
  if (codexHome ?? source.CODEX_HOME) env.CODEX_HOME = codexHome ?? source.CODEX_HOME;
  return env;
}

/** Official account RPC; optional renewal stays CLI-owned and returns no auth material. */
export async function readCodexSubscription(options: { executable: string; codexHome?: string; signal?: AbortSignal; cwd?: string; env?: NodeJS.ProcessEnv; refreshToken?: boolean }): Promise<CodexSubscriptionStatus> {
  options.signal?.throwIfAborted();
  const child = spawnBackgroundProcess({ cmd: [options.executable, "app-server", "--stdio", "-c", 'forced_login_method="chatgpt"'], cwd: options.cwd, env: codexSubscriptionEnvironment(options.codexHome, options.env), stdin: "pipe", stdout: "pipe", stderr: "ignore" });
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  let nextId = 0;
  let ending = false;
  let failure: Error | undefined;
  const fail = (error: Error) => { failure = error; for (const item of pending.values()) item.reject(error); pending.clear(); };
  const terminate = () => { fail(new Error("Codex account check cancelled or timed out.")); void terminateProcessTree({ process: child }).catch(() => undefined); };
  const timer = setTimeout(terminate, 20_000);
  options.signal?.addEventListener("abort", terminate, { once: true });
  const reading = (async () => {
    let buffer = "";
    const decoder = new TextDecoder();
    for await (const bytes of child.stdout) {
      buffer += decoder.decode(bytes, { stream: true });
      if (buffer.length > 2_097_152) throw Error("Codex account response exceeds limit.");
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        const value = JSON.parse(line);
        if (value.method && value.id !== undefined) throw Error("Unexpected Codex server request during account check.");
        const item = pending.get(value.id);
        if (!item) continue;
        pending.delete(value.id);
        if (value.error) item.reject(new Error("Codex account service rejected the request; authenticate with ChatGPT on the trusted host."));
        else item.resolve(value.result);
      }
    }
    if (!ending) throw Error("Codex account service exited before completing the check.");
  })().catch(error => fail(error instanceof Error ? error : Error(String(error))));
  const rpc = (method: string, params: unknown = {}) => new Promise<unknown>((resolve, reject) => {
    if (failure) { reject(failure); return; }
    const id = ++nextId; pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
  });
  try {
    await rpc("initialize", { clientInfo: { name: "hyperfocus_subscription_check", version: "1.0.0" }, capabilities: { experimentalApi: false } });
    child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
    const { account } = z.object({ account: z.object({ type: z.string(), planType: z.string().optional() }).nullable() }).parse(await rpc("account/read", { refreshToken: options.refreshToken ?? false }));
    if (account?.type !== "chatgpt") return { authenticated: false, available: false, plan: null, checkedAt: Date.now(), separatelyBilledUsd: 0, reason: "Codex requires a ChatGPT subscription login on the trusted coordinator. API-key inference is disabled." };
    const response = z.object({ rateLimits: limitsSchema }).parse(await rpc("account/rateLimits/read"));
    return qualifyCodexSubscription(account.planType ?? null, response.rateLimits);
  } finally {
    ending = true; clearTimeout(timer); options.signal?.removeEventListener("abort", terminate);
    await terminateProcessTree({ process: child }); await reading; await child.exited;
  }
}

export function qualifyCodexSubscription(plan: string | null, limits: z.infer<typeof limitsSchema>): CodexSubscriptionStatus {
  const known = Boolean(limits.primary || limits.secondary);
  const exhausted = Boolean(limits.rateLimitReachedType) || [limits.primary, limits.secondary].some(window => window && window.usedPercent >= 100);
  // Keep headroom for parallel calls and delayed quota reporting. A credit
  // balance is not itself evidence of extra billing; never rely on it for admission.
  const nearLimit = [limits.primary, limits.secondary].some(window => window && window.usedPercent >= 90);
  return { authenticated: true, available: known && !exhausted && !nearLimit, plan, limits, checkedAt: Date.now(), separatelyBilledUsd: 0,
    ...(!known ? { reason: "Codex subscription allowance could not be verified; no paid fallback is permitted." } : exhausted ? { reason: "Codex subscription allowance is exhausted; no paid fallback is permitted." } : nearLimit ? { reason: "Codex included usage reached the swarm's 90% safety cutoff. Work is paused before credit fallback; resume after the subscription window resets." } : {}) };
}
