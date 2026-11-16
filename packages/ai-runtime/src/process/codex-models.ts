import { spawnBackgroundProcess, terminateProcessTree } from "@hyperfocus/desktop-runtime/process";

export function parseCodexModelIds(input: string): string[] {
  try {
    const value: unknown = JSON.parse(input);
    if (!value || typeof value !== "object" || !("models" in value) || !Array.isArray(value.models)) return [];
    return [...new Set(value.models.flatMap(model => {
      if (!model || typeof model !== "object" || model.visibility !== "list" || typeof model.slug !== "string") return [];
      const slug = model.slug.trim().replace(/^openai\//, "");
      return slug && slug.length <= 160 ? [slug] : [];
    }))];
  } catch { return []; }
}

export async function discoverCodexModelIds(executable: string, signal?: AbortSignal): Promise<string[]> {
  signal?.throwIfAborted();
  const child = spawnBackgroundProcess({ cmd: [executable, "debug", "models"], stdout: "pipe", stderr: "ignore" });
  let termination: Promise<void> | undefined;
  const terminate = () => {
    termination ??= terminateProcessTree({ process: child });
    void termination.catch(() => undefined);
  };
  const timeout = setTimeout(terminate, 5_000);
  signal?.addEventListener("abort", terminate, { once: true });
  if (signal?.aborted) terminate();
  try {
    let text = "";
    const decoder = new TextDecoder();
    for await (const chunk of child.stdout) {
      text += decoder.decode(chunk, { stream: true });
      if (text.length > 1048576) { await terminateProcessTree({ process: child }); return []; }
    }
    const code = await child.exited;
    signal?.throwIfAborted();
    return code === 0 ? parseCodexModelIds(text + decoder.decode()) : [];
  } catch { signal?.throwIfAborted(); return []; }
  finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", terminate);
    await terminateProcessTree({ process: child });
    await termination;
  }
}
