import { handleUsageCommand } from "./usage";
import { probeCodexLimits } from "../../usage/codex-limits";
import { checkCliUpdates, installCliUpdate } from "../../cli-update-checker";
import { emitNotificationsUpdatedToAll } from "../automation/background-events";
import type { ServerCommandContext } from "./context";
import { releaseDeferredExecutionState } from "../execution/deferred-execution";
import { emitAgentRuntimeUpdatedToAll, emitExecutionControlUpdatedToAll, sendEvent } from "../transport/events";
import { createCliUpdateNotification, getCliUpdateTargetLabel, saveCliUpdateNotifications } from "../automation/notifications";
import { defaultAgentCatalog } from "@hyperfocus/ai-core/agent-catalog";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";
import { fitBoundedPage } from "../transport/bounded-page";

type SystemCommandContext = Pick<ServerCommandContext, "launchMode" | "ws" | "runtime" | "repository" | "adapter" | "runtimeRegistry" | "assistantManager" | "emitSetupRefresh" | "connections" | "backgroundRunControllers" | "scheduler" | "tokenUsageSession"> & { codexUsageProbe?: typeof probeCodexLimits };

export async function handleSystemCommand(command: ClientCommand, context: SystemCommandContext) {
  const { ws, runtime, repository, adapter, runtimeRegistry, assistantManager, emitSetupRefresh, connections, backgroundRunControllers, scheduler, tokenUsageSession } = context;
  switch (command.type) {
case "connection.ping": {
      sendEvent(ws, {
        type: "connection.pong",
        requestId: command.requestId,
        payload: command.payload
      });
      return;
    }
case "notifications.page.list": {
      const items = fitBoundedPage((limit) => repository.listNotificationInboxItemsPage(command.payload.cursor, limit),
        command.payload.limit ?? 128, (page) => ({ type: "notifications.page.listed", requestId: command.requestId,
          payload: { items: page } }));
      sendEvent(ws, { type: "notifications.page.listed", requestId: command.requestId,
        payload: { items } });
      return;
    }
case "notification.mark-read": {
      repository.markNotificationRead(command.payload.notificationId);
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
case "notifications.mark-all-read": {
      repository.markAllPassiveNotificationsRead();
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
case "cli-updates.check": {
      if (!repository.getCheckCliUpdatesDefault()) {
        sendEvent(ws, {
          type: "cli-updates.checked",
          requestId: command.requestId,
          payload: {
            updates: [],
            notifications: repository.loadNotificationInboxState()
          }
        });
        return;
      }

      const updates = await checkCliUpdates(runtimeRegistry.listCapabilities());
      const notifications = saveCliUpdateNotifications(repository, updates);
      emitNotificationsUpdatedToAll(connections, command.requestId, notifications);
      sendEvent(ws, {
        type: "cli-updates.checked",
        requestId: command.requestId,
        payload: {
          updates: updates.map((update) => createCliUpdateNotification(update)),
          notifications
        }
      });
      return;
    }
case "cli-updates.install": {
      const output = await installCliUpdate(command.payload.agentId, context.launchMode);
      const agentRuntimes = await runtimeRegistry.refreshAll();
      emitAgentRuntimeUpdatedToAll(connections, command.requestId, agentRuntimes);
      await emitSetupRefresh(command.requestId);
      sendEvent(ws, {
        type: "cli-updates.installed",
        requestId: command.requestId,
        payload: {
          agentId: command.payload.agentId,
          label: getCliUpdateTargetLabel(command.payload.agentId),
          output
        }
      });
      return;
    }
case "execution.pause-all": {
      repository.setGlobalExecutionPaused(true);
      emitExecutionControlUpdatedToAll(connections, command.requestId, repository.getExecutionControlState());
      return;
    }
case "execution.resume-all": {
      repository.setGlobalExecutionPaused(false);
      emitExecutionControlUpdatedToAll(connections, command.requestId, repository.getExecutionControlState());
      await releaseDeferredExecutionState(
        command.requestId,
        runtime,
        repository,
        adapter,
        runtimeRegistry,
        assistantManager,
        connections,
        backgroundRunControllers,
        scheduler,
        tokenUsageSession
      );
      emitExecutionControlUpdatedToAll(connections, command.requestId, repository.getExecutionControlState());
      return;
    }
case "agent.list": {
      sendEvent(ws, {
        type: "agent.list",
        requestId: command.requestId,
        payload: {
          agents: [...defaultAgentCatalog]
        }
      });
      return;
    }
case "usage.refresh":
case "usage.reset": return handleUsageCommand(command, context);
case "agent.runtime.refresh": {
      const agentRuntimes = await runtimeRegistry.refreshAll();
      emitAgentRuntimeUpdatedToAll(connections, command.requestId, agentRuntimes);
      await emitSetupRefresh(command.requestId);
      return;
    }
case "setup.refresh": {
      await emitSetupRefresh(command.requestId);
      return;
    }
    default:
      throw new Error(`Unsupported system command: ${command.type}`);
  }
}
