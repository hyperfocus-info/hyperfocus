import type { ServerCommandContext } from "./context";
import { assertGlobalExecutionNotPaused } from "../execution/lifecycle";
import { assertActiveThread } from "../execution/state";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";

type TerminalsCommandContext = Pick<ServerCommandContext, "ws" | "runtime" | "repository" | "runtimeRegistry" | "cliSessionManager" | "terminalSessionManager">;

export async function handleTerminalsCommand(command: ClientCommand, context: TerminalsCommandContext) {
  const { ws, runtime, repository, runtimeRegistry, cliSessionManager, terminalSessionManager } = context;
  switch (command.type) {
case "terminal.shells.list": {
      await terminalSessionManager.refreshShells(command.requestId);
      return;
    }
case "terminal.sessions.list": {
      terminalSessionManager.listSessions({
        requestId: command.requestId,
        projectId: command.payload?.projectId
      });
      return;
    }
case "terminal.history.list": {
      terminalSessionManager.listHistory({
        requestId: command.requestId,
        scope: command.payload
      });
      return;
    }
case "terminal.session.create": {
      const project = runtime.getProject(command.payload.projectId);
      await terminalSessionManager.createSession({
        requestId: command.requestId,
        projectId: project.id,
        projectRoot: project.rootPath,
        clientId: ws.data.clientId,
        connectionId: ws.data.connectionId ?? ws.data.clientId,
        name: command.payload.name,
        shellId: command.payload.shellId,
        cwd: command.payload.cwd,
        cols: command.payload.cols,
        rows: command.payload.rows,
        env: command.payload.env
      });
      return;
    }
case "terminal.session.set-input-override": {
      terminalSessionManager.setInputOverride({ requestId: command.requestId, ...command.payload });
      return;
    }
case "terminal.session.rename": {
      terminalSessionManager.renameSession({ requestId: command.requestId, ...command.payload });
      return;
    }
case "terminal.session.stop": {
      await terminalSessionManager.stopSession({ requestId: command.requestId, ...command.payload });
      return;
    }
case "terminal.session.close": {
      await terminalSessionManager.closeSession({ requestId: command.requestId, ...command.payload });
      return;
    }
case "terminal.session.restart": {
      const project = runtime.getProject(command.payload.projectId);
      await terminalSessionManager.restartSession({
        requestId: command.requestId,
        projectId: command.payload.projectId,
        projectRoot: project.rootPath,
        sessionId: command.payload.sessionId,
        clientId: ws.data.clientId,
        connectionId: ws.data.connectionId ?? ws.data.clientId,
        cols: command.payload.cols,
        rows: command.payload.rows
      });
      return;
    }
case "terminal.session.resize": {
      terminalSessionManager.resizeSession({ requestId: command.requestId, ...command.payload });
      return;
    }
case "terminal.session.attach": {
      terminalSessionManager.attachSession({
        requestId: command.requestId,
        projectId: command.payload.projectId,
        sessionId: command.payload.sessionId,
        clientId: ws.data.clientId,
        connectionId: ws.data.connectionId ?? ws.data.clientId
      });
      return;
    }
case "terminal.preferences.save": {
      terminalSessionManager.savePreferences({
        requestId: command.requestId,
        preferences: command.payload.preferences,
        layout: command.payload.layout
      });
      return;
    }
case "cli-session.start": {
      assertGlobalExecutionNotPaused(repository);
      const project = runtime.getProject(command.payload.projectId);
      assertActiveThread(project, command.payload.threadId);
      const agentRuntime = runtimeRegistry.get(command.payload.agentId);
      const capability = agentRuntime.getCapability() ?? (await agentRuntime.refreshCapability());
      if (!capability.installed) {
        throw new Error(capability.healthMessage ?? `${agentRuntime.label} is not installed`);
      }
      if (!capability.authenticated) {
        throw new Error(capability.healthMessage ?? `${agentRuntime.label} is not authenticated`);
      }
      if (!capability.interactivePipeCompatible || !capability.supportsInteractive) {
        throw new Error(capability.healthMessage ?? `${agentRuntime.label} does not support interactive pipe sessions`);
      }

      runtime.setProjectSelectedAgentId(project.id, agentRuntime.id);
      await cliSessionManager.startSession({
        requestId: command.requestId,
        projectId: project.id,
        threadId: project.activeThreadId,
        agentRuntime,
        cwd: project.rootPath,
        cols: command.payload.cols,
        rows: command.payload.rows,
        prompt: command.payload.prompt,
        runId: command.payload.runId,
        clientId: ws.data.clientId,
        connectionId: ws.data.connectionId ?? ws.data.clientId
      });
      return;
    }
case "cli-session.stop": {
      await cliSessionManager.stopSession(command.payload);
      return;
    }
case "cli-session.resize": {
      cliSessionManager.resizeSession({
        requestId: command.requestId,
        ...command.payload
      });
      return;
    }
case "cli-session.attach": {
      cliSessionManager.attachSession({
        requestId: command.requestId,
        ...command.payload,
        clientId: ws.data.clientId,
        connectionId: ws.data.connectionId ?? ws.data.clientId
      });
      return;
    }
case "cli-session.capture-visible-buffer": {
      cliSessionManager.captureVisibleBuffer(command.payload);
      return;
    }
    default:
      throw new Error(`Unsupported terminals command: ${command.type}`);
  }
}
