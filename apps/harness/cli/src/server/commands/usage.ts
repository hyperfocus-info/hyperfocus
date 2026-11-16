import { refreshCodexLimits, type probeCodexLimits } from "../../usage/codex-limits";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { ClientCommand, TokenUsageTotals } from "@hyperfocus/ai-core/protocol";
import { createEmptyTokenUsageTotals, emitUsageUpdatedToAll, type ControlEventConnections } from "../transport/events";
export async function handleUsageCommand(command: ClientCommand, context: { repository: WorkspaceRepository; tokenUsageSession: TokenUsageTotals; connections: ControlEventConnections; codexUsageProbe?: typeof probeCodexLimits }) {
 const { repository, tokenUsageSession, connections } = context;
 if (command.type === "usage.refresh") await refreshCodexLimits(repository, context.codexUsageProbe);
 else if (command.type === "usage.reset") { repository.resetTokenUsageLifetime(new Date().toISOString()); delete tokenUsageSession.updatedAt; Object.assign(tokenUsageSession, createEmptyTokenUsageTotals()); }
 else throw new Error(`Unsupported usage command: ${command.type}`);
 emitUsageUpdatedToAll(connections, command.requestId, repository.getTokenUsageState(tokenUsageSession));
}
