/** Stop readiness polling immediately when the owned startup process exits. */
export async function waitForDevReadiness(options: {
  probe: () => Promise<boolean>;
  exited: Promise<number>;
  timeoutMs: number;
}) {
  const deadline = Date.now() + options.timeoutMs;
  let finished = false;
  const childExit = options.exited.then(() => { finished = true; return "exited" as const; });
  while (Date.now() < deadline) {
    const result = await Promise.race([options.probe(), childExit]);
    if (finished || result === "exited") return "exited";
    if (result) return "healthy";
    if (await Promise.race([Bun.sleep(100), childExit]) === "exited") return "exited";
  }
  return "timeout";
}
