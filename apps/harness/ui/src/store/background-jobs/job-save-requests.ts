import type { ClientCommand, ServerEvent } from "@hyperfocus/ai-core/protocol";
type SaveCommand = Extract<ClientCommand, { type: "background-job.save" }>;

/** Only the server's correlated post-persistence event acknowledges this task save. */
export function createJobSaveRequests(options: { timeoutMs?: number } = {}) {
  const pending = new Map<string, (error?: string) => void>();
  return {
    save(command: SaveCommand, send: (command: ClientCommand) => boolean): Promise<void> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish("Save confirmation timed out. Your draft is retained; reconnect and retry."), options.timeoutMs ?? 30000);
        function finish(error?: string) { clearTimeout(timer); pending.delete(command.requestId); if (error) reject(new Error(error)); else resolve(); }
        pending.set(command.requestId, finish);
        try { if (!send(command)) finish("Could not send this task. Reconnect and retry."); }
        catch (error) { finish(error instanceof Error ? error.message : "Could not send this task."); }
      });
    },
    apply(event: ServerEvent) {
      if (!("requestId" in event) || !event.requestId) return;
      const finish = pending.get(event.requestId);
      if (event.type === "command.rejected") finish?.(event.payload.detail ?? event.payload.message);
      if (event.type === "background-jobs.updated") finish?.();
    },
    cancel() { for (const finish of pending.values()) finish("Connection changed before confirmation. Your draft is retained; reconnect and retry."); }
  };
}
