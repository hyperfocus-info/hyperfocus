import { createWorkspaceProjectState,type ClientCommand } from "@hyperfocus/ai-core/protocol";
import { beforeEach,expect,test } from "bun:test";
import { harnessStore } from "../harness-store";
import { captureDispatchedCommands,clearBrowserStateForTests } from "../utils/tests/store-test-utils";
import { createUiTest } from "../utils/tests/test-harness";
import { filePayload } from "../utils/tests/transport-fixtures";
import { ideStore } from "./ide-store";

const projectA = createWorkspaceProjectState({ id: "project-a", name: "Project A", rootPath: "C:\\project-a" });
const projectB = createWorkspaceProjectState({ id: "project-b", name: "Project B", rootPath: "C:\\project-b" });


function requireLatestCommand<TType extends ClientCommand["type"]>(commands: ClientCommand[], type: TType) {
  for (let index = commands.length - 1; index >= 0; index -= 1) {
    const command = commands[index];
    if (command && isCommandType(command, type)) return command;
  }
  throw new Error(`Expected ${type} command`);
}

function isCommandType<TType extends ClientCommand["type"]>(
  command: ClientCommand,
  type: TType
): command is Extract<ClientCommand, { type: TType }> {
  return command.type === type;
}

function setActiveProject(projectId: string) {
  harnessStore.applyServerEvent({
    type: "workspace.updated",
    requestId: `workspace-${projectId}`,
    payload: { workspace: { workspaceModes: [], projects: [projectA, projectB], activeProjectId: projectId } }
  });
}

createUiTest("IDE store request ownership", () => {
  let commands: ClientCommand[];

  beforeEach(() => {
    clearBrowserStateForTests();
    commands = [];
    captureDispatchedCommands(commands);
    setActiveProject(projectA.id);
    ideStore.resetForTests();
  });

  test("clears project-owned state and ignores a delayed read from the previous project", () => {
    ideStore.loadProject(projectA.id);
    ideStore.openFile("src/app.ts");
    const projectARead = requireLatestCommand(commands, "ide.file.read");

    setActiveProject(projectB.id);
    ideStore.loadProject(projectB.id);
    ideStore.openFile("src/app.ts");
    const projectBRead = requireLatestCommand(commands, "ide.file.read");

    ideStore.applyServerEvent({
      type: "ide.file.read",
      requestId: projectARead.requestId,
      payload: filePayload(projectA.id, "src/app.ts", "export const owner = 'a';")
    });
    expect(ideStore.state.filesByPath["src/app.ts"]).toBeUndefined();

    ideStore.applyServerEvent({
      type: "ide.file.read",
      requestId: projectBRead.requestId,
      payload: filePayload(projectB.id, "src/app.ts", "export const owner = 'b';")
    });
    expect(ideStore.state.projectId).toBe(projectB.id);
    expect(ideStore.state.filesByPath["src/app.ts"]?.content).toContain("'b'");
  });

  test("keeps focus on the latest opened file when reads resolve out of order", () => {
    ideStore.loadProject(projectA.id);
    ideStore.openFile("src/first.ts");
    const firstRead = requireLatestCommand(commands, "ide.file.read");
    ideStore.openFile("src/second.ts");
    const secondRead = requireLatestCommand(commands, "ide.file.read");

    ideStore.applyServerEvent({
      type: "ide.file.read",
      requestId: firstRead.requestId,
      payload: filePayload(projectA.id, "src/first.ts", "export const first = true;")
    });
    expect(ideStore.state.activePath).toBe("src/second.ts");

    ideStore.applyServerEvent({
      type: "ide.file.read",
      requestId: secondRead.requestId,
      payload: filePayload(projectA.id, "src/second.ts", "export const second = true;")
    });
    expect(ideStore.state.activePath).toBe("src/second.ts");
  });

  test("rejects stale tree and git responses after a project switch", () => {
    ideStore.loadProject(projectA.id);
    const projectATree = requireLatestCommand(commands, "ide.fileTree.list");
    const projectAGit = requireLatestCommand(commands, "ide.git.status");
    setActiveProject(projectB.id);
    ideStore.loadProject(projectB.id);
    const projectBTree = requireLatestCommand(commands, "ide.fileTree.list");
    const projectBGit = requireLatestCommand(commands, "ide.git.status");

    ideStore.applyServerEvent({
      type: "ide.fileTree.listed",
      requestId: projectATree.requestId,
      payload: {
        projectId: projectA.id,
        rootPath: projectA.rootPath,
        entries: [{ path: "only-a.ts", name: "only-a.ts", kind: "file", depth: 0 }],
        truncated: false
      }
    });
    ideStore.applyServerEvent({
      type: "ide.git.status",
      requestId: projectAGit.requestId,
      payload: { projectId: projectA.id, branch: "project-a", isRepository: true, changes: [] }
    });
    expect(ideStore.state.treeEntries).toEqual([]);
    expect(ideStore.state.gitBranch).toBeUndefined();

    ideStore.applyServerEvent({
      type: "ide.fileTree.listed",
      requestId: projectBTree.requestId,
      payload: {
        projectId: projectB.id,
        rootPath: projectB.rootPath,
        entries: [{ path: "only-b.ts", name: "only-b.ts", kind: "file", depth: 0 }],
        truncated: false
      }
    });
    ideStore.applyServerEvent({
      type: "ide.git.status",
      requestId: projectBGit.requestId,
      payload: { projectId: projectB.id, branch: "project-b", isRepository: true, changes: [] }
    });
    expect(ideStore.state.treeEntries.map((entry) => entry.path)).toEqual(["only-b.ts"]);
    expect(ideStore.state.gitBranch).toBe("project-b");
  });

  test("does not let an old save acknowledgement overwrite a newer edit", () => {
    ideStore.resetForTests({
      projectId: projectA.id,
      activePath: "src/app.ts",
      openPaths: ["src/app.ts"],
      filesByPath: { "src/app.ts": { ...filePayload(projectA.id, "src/app.ts", "version 0"), contentLines: ["version 0"] } }
    });
    ideStore.updateFileContent("src/app.ts", "version 1");
    ideStore.saveFile();
    const firstWrite = requireLatestCommand(commands, "ide.file.write");
    ideStore.updateFileContent("src/app.ts", "version 2");

    ideStore.applyServerEvent({
      type: "ide.file.written",
      requestId: firstWrite.requestId,
      payload: filePayload(projectA.id, "src/app.ts", "version 1")
    });
    expect(ideStore.state.filesByPath["src/app.ts"]?.content).toBe("version 2");
    expect(ideStore.state.dirtyPaths).toContain("src/app.ts");

    ideStore.saveFile();
    const secondWrite = requireLatestCommand(commands, "ide.file.write");
    ideStore.applyServerEvent({
      type: "ide.file.written",
      requestId: secondWrite.requestId,
      payload: filePayload(projectA.id, "src/app.ts", "version 2")
    });
    expect(ideStore.state.filesByPath["src/app.ts"]?.content).toBe("version 2");
    expect(ideStore.state.dirtyPaths).not.toContain("src/app.ts");
  });
});
