import type { ClientCommand, ServerEvent } from "@hyperfocus/ai-core/protocol";

type SaveCommand = Extract<ClientCommand, { type: "mode.save" }>;

/** Save success is the matching persisted workspace/project event, never dispatch. */
export function createModeSaveRequests(options: { timeoutMs?: number } = {}) {
  const pending = new Map<string, { command: SaveCommand; finish: (error?: string) => void }>();
  return {
    save(command: SaveCommand, send: (command: ClientCommand) => boolean): Promise<void> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish("Save confirmation timed out. Your draft is retained; reconnect and retry."), options.timeoutMs ?? 30000);
        function finish(error?: string) {
          clearTimeout(timer);
          pending.delete(command.requestId);
          if (error) reject(new Error(error)); else resolve();
        }
        pending.set(command.requestId, { command, finish });
        try { if (!send(command)) finish("Could not send this mode. Reconnect and retry."); }
        catch (error) { finish(error instanceof Error ? error.message : "Could not send this mode."); }
      });
    },
    apply(event: ServerEvent) {
      if (!("requestId" in event)) return;
      const request = event.requestId && pending.get(event.requestId);
      if (!request) return;
      if (event.type === "command.rejected") { request.finish(event.payload.detail ?? event.payload.message); return; }
      const { payload } = request.command;
      if (payload.scope === "workspace" && event.type === "workspace.updated" && event.payload.workspace.workspaceModes?.some(mode => mode.id === payload.mode.id)) request.finish();
      if (payload.scope === "project" && event.type === "project.updated" && event.payload.project.id === payload.projectId && event.payload.project.projectModes?.some(mode => mode.id === payload.mode.id)) request.finish();
    },
    cancel() { for (const request of pending.values()) request.finish("Connection changed before save confirmation. Your draft is retained; reconnect and retry."); }
  };
}
