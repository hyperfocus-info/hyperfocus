import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { afterEach,describe,expect,setDefaultTimeout,spyOn,test } from "bun:test";
import { mkdirSync,rmSync,writeFileSync } from "node:fs";
import * as fs from "node:fs/promises";
import { lstat,readFile,rm } from "node:fs/promises";
import path from "node:path";
import { createBranchfsManager } from "./branchfs-manager";
import {
discardBranchfsIntegrationLease,
discardBranchfsSnapshots,
flushBranchfsIntegrationLease,
prepareBranchfsIntegrationLease,
verifyBranchfsIntegrationLease
} from "./branchfs-subagent-integration";
import type {
PiAgentAdapter,
PiAgentExecutionController,
PiAgentPromptRequest,
PiAgentPromptResult
} from "./pi-agent-adapter";
import type { BranchfsSubagentSnapshot } from "./pi-subagents";
import { normalizeNewlines } from "./test-support/fixtures/text-comparison";
import { useGitProjectFixture } from "./test-support/git-project-fixture";
import { createHarnessTestTempPath } from "./test-support/test-temp-root";

const tempPaths: string[] = [];

setDefaultTimeout(30000);

function createMergeResolverAdapter(): PiAgentAdapter & { calls: PiAgentPromptRequest[] } {
  const calls: PiAgentPromptRequest[] = [];
  async function runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    calls.push(request);
    if (request.kind === "merge-resolver") {
      await Bun.write(path.join(request.cwd, "shared.txt"), "resolved\n");
      return { text: "resolved conflict" };
    }

    return { text: "ok" };
  }

  async function startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
    let currentResult = runPrompt(request);
    return {
      get result() {
        return currentResult;
      },
      continueWithPrompt(prompt: string = "continue") {
        currentResult = runPrompt({ ...request, prompt });
        return currentResult;
      },
      async abort() {},
      dispose() {}
    };
  }

  return { calls, setApiKey() {}, hasApiKey: () => false, runPrompt, startExecution };
}

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((targetPath) => rm(targetPath, { recursive: true, force: true })));
});

describe("branchfs subagent integration", () => {
  const gitFixture = useGitProjectFixture({
    fixtureName: "branchfs-subagent-integration",
    packageName: "branchfs-subagent-test",
    readmeTitle: "# BranchFS Test\n",
    gitIgnore: ".local\n",
    extraFiles: [
      {
        relativePath: "README.md",
        content: "# BranchFS Test\n"
      }
    ]
  });

  test("flushes merged isolated subagent changes back to root", async () => {
    const rootPath = await gitFixture.createRepoClone("branchfs-subagent-merge");

    const snapshots = await Promise.all([
      createSnapshot(rootPath, "task-1", (lease) => {
        writeFileSync(path.join(lease.projectMountPath, "task-1.txt"), "task-1\n");
      }),
      createSnapshot(rootPath, "task-2", (lease) => {
        writeFileSync(path.join(lease.projectMountPath, "task-2.txt"), "task-2\n");
        writeFileSync(path.join(lease.projectMountPath, "empty.txt"), "");
      })
    ]);

    const integration = await prepareBranchfsIntegrationLease(
      createMergeResolverAdapter(),
      {
        rootPath,
        runId: "run-merge",
        executionModelId: "openai/gpt-5.4"
      },
      {
        tasks: [
          { id: "task-1", title: "Task 1", instruction: "Write task-1" },
          { id: "task-2", title: "Task 2", instruction: "Write task-2" }
        ],
        snapshots
      }
    );

    expect(integration).toBeDefined();
    await verifyBranchfsIntegrationLease(integration!);
    await flushBranchfsIntegrationLease(integration!);
    await discardBranchfsIntegrationLease(integration);
    await discardBranchfsSnapshots(snapshots);

    expect(normalizeNewlines(await readFile(path.join(rootPath, "task-1.txt"), "utf8"))).toBe("task-1\n");
    expect(normalizeNewlines(await readFile(path.join(rootPath, "task-2.txt"), "utf8"))).toBe("task-2\n");
    expect(await readFile(path.join(rootPath, "empty.txt"), "utf8")).toBe("");
  });

  test("integration runs explicit checks in the project mount before changes can be flushed", async () => {
    const rootPath = await gitFixture.createRepoClone("branchfs-verification");
    const snapshots = [await createSnapshot(rootPath, "task", (lease) => {
      writeFileSync(path.join(lease.projectMountPath, "result.txt"), "result");
      writeFileSync(path.join(lease.projectMountPath, "accept.ts"), 'await Bun.write("checked.txt", "yes"); process.exit(6);');
    })];
    const integration = await prepareBranchfsIntegrationLease(createMergeResolverAdapter(), {
      rootPath, runId: "verify", executionModelId: "openai/gpt-5.4"
    }, { tasks: [{ id: "task", title: "Task", instruction: "Write result" }], snapshots });
    expect(integration).toBeDefined();
    try {
      await expect(verifyBranchfsIntegrationLease(integration!, { commands: ["bun accept.ts"] })).rejects.toThrow("exit 6");
      expect(await Bun.file(path.join(rootPath, "result.txt")).exists()).toBe(false);
      expect(await Bun.file(path.join(integration!.lease.projectMountPath, "checked.txt")).text()).toBe("yes");
      writeFileSync(path.join(integration!.lease.projectMountPath, "accept.ts"), "process.exit(0);");
      await verifyBranchfsIntegrationLease(integration!, { commands: ["bun accept.ts"] });
      await flushBranchfsIntegrationLease(integration!);
      expect(await Bun.file(path.join(rootPath, "result.txt")).text()).toBe("result");
    } finally {
      await discardBranchfsIntegrationLease(integration);
      await discardBranchfsSnapshots(snapshots);
    }
  });

  test("a project without package.json integrates with explicit unverified evidence", async () => {
    const rootPath = await gitFixture.createRepoClone("no-package");
    await rm(path.join(rootPath, "package.json"));
    const snapshots = [await createSnapshot(rootPath, "task", lease => {
      writeFileSync(path.join(lease.projectMountPath, "result.txt"), "result");
    })];
    const messages: string[] = [];
    const integration = await prepareBranchfsIntegrationLease(createMergeResolverAdapter(), {
      rootPath, runId: "no-package", executionModelId: "openai/gpt-5.4", onTrace: trace => messages.push(trace.message)
    }, { tasks: [{ id: "task", title: "Task", instruction: "Write result" }], snapshots });
    expect(integration).toBeDefined();
    try {
      await verifyBranchfsIntegrationLease(integration!);
      expect(messages).toContain("Verification unverified: no task-specific checks were established.");
      await flushBranchfsIntegrationLease(integration!);
      expect(await readFile(path.join(rootPath, "result.txt"), "utf8")).toBe("result");
    } finally {
      await discardBranchfsIntegrationLease(integration);
      await discardBranchfsSnapshots(snapshots);
    }
  });

  test("integrates file and directory replacements from isolated snapshots", async () => {
    const rootPath = await gitFixture.createRepoClone("branchfs-subagent-shape-change");
    writeFileSync(path.join(rootPath, "shape"), "file\n");
    mkdirSync(path.join(rootPath, "tree"), { recursive: true });
    writeFileSync(path.join(rootPath, "tree", "child.txt"), "child\n");
    runSync(["git", "add", "."], rootPath);
    runSync(["git", "commit", "-m", "shape base"], rootPath);

    const snapshots = [
      await createSnapshot(rootPath, "task-1", (lease) => {
        rmSync(path.join(lease.projectMountPath, "shape"));
        mkdirSync(path.join(lease.projectMountPath, "shape"), { recursive: true });
        writeFileSync(path.join(lease.projectMountPath, "shape", "child.txt"), "dir child\n");
        rmSync(path.join(lease.projectMountPath, "tree"), { recursive: true, force: true });
        writeFileSync(path.join(lease.projectMountPath, "tree"), "file replacement\n");
      })
    ];

    const integration = await prepareBranchfsIntegrationLease(
      createMergeResolverAdapter(),
      {
        rootPath,
        runId: "run-shape-change",
        executionModelId: "openai/gpt-5.4"
      },
      {
        tasks: [{ id: "task-1", title: "Task 1", instruction: "Replace file and directory shapes" }],
        snapshots
      }
    );

    await flushBranchfsIntegrationLease(integration!);
    await discardBranchfsIntegrationLease(integration);
    await discardBranchfsSnapshots(snapshots);

    expect((await lstat(path.join(rootPath, "shape"))).isDirectory()).toBe(true);
    expect(normalizeNewlines(await readFile(path.join(rootPath, "shape", "child.txt"), "utf8"))).toBe("dir child\n");
    expect((await lstat(path.join(rootPath, "tree"))).isFile()).toBe(true);
    expect(normalizeNewlines(await readFile(path.join(rootPath, "tree"), "utf8"))).toBe("file replacement\n");
  });

  test("uses merge resolver when isolated subagent snapshots conflict", async () => {
    const rootPath = await gitFixture.createRepoClone("branchfs-subagent-conflict");
    writeFileSync(path.join(rootPath, "shared.txt"), "base\n");
    runSync(["git", "add", "shared.txt"], rootPath);
    runSync(["git", "commit", "-m", "shared"], rootPath);

    const snapshots = await Promise.all([
      createSnapshot(rootPath, "task-1", (lease) => {
        writeFileSync(path.join(lease.projectMountPath, "shared.txt"), "left\n");
      }),
      createSnapshot(rootPath, "task-2", (lease) => {
        writeFileSync(path.join(lease.projectMountPath, "shared.txt"), "right\n");
      })
    ]);

    const adapter = createMergeResolverAdapter();
    const integration = await prepareBranchfsIntegrationLease(
      adapter,
      {
        rootPath,
        runId: "run-conflict",
        executionModelId: "openai/gpt-5.4"
      },
      {
        tasks: [
          { id: "task-1", title: "Task 1", instruction: "Write left" },
          { id: "task-2", title: "Task 2", instruction: "Write right" }
        ],
        snapshots
      }
    );

    expect(integration?.conflictResolved).toBe(true);
    expect(adapter.calls.some((call) => call.kind === "merge-resolver")).toBe(true);
    await flushBranchfsIntegrationLease(integration!);
    await discardBranchfsIntegrationLease(integration);
    await discardBranchfsSnapshots(snapshots);

    expect(normalizeNewlines(await readFile(path.join(rootPath, "shared.txt"), "utf8"))).toBe("resolved\n");
  });

  test("scopes integration flush to the selected nested project path", async () => {
    const repoRoot = await gitFixture.createRepoClone("branchfs-subagent-slice");
    const projectRoot = path.join(repoRoot, "context");
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(path.join(projectRoot, "guide.md"), "base guide\n");
    writeFileSync(path.join(repoRoot, "outside.txt"), "base outside\n");
    runSync(["git", "add", "."], repoRoot);
    runSync(["git", "commit", "-m", "slice base"], repoRoot);

    writeFileSync(path.join(repoRoot, "outside.txt"), "dirty outside\n");

    const snapshots = [
      await createSnapshot(projectRoot, "task-1", (lease) => {
        writeFileSync(path.join(lease.projectMountPath, "guide.md"), "slice update\n");
      })
    ];

    const integration = await prepareBranchfsIntegrationLease(
      createMergeResolverAdapter(),
      {
        rootPath: projectRoot,
        runId: "run-slice",
        executionModelId: "openai/gpt-5.4"
      },
      {
        tasks: [{ id: "task-1", title: "Task 1", instruction: "Update guide" }],
        snapshots
      }
    );

    await flushBranchfsIntegrationLease(integration!);
    await discardBranchfsIntegrationLease(integration);
    await discardBranchfsSnapshots(snapshots);

    expect(normalizeNewlines(await readFile(path.join(projectRoot, "guide.md"), "utf8"))).toBe("slice update\n");
    expect(normalizeNewlines(await readFile(path.join(repoRoot, "outside.txt"), "utf8"))).toBe("dirty outside\n");
  });

  test("supports isolated subagent integration on unborn git history", async () => {
    const repoRoot = createTempDir("branchfs-subagent-unborn");
    seedBunProject(repoRoot);
    const projectRoot = path.join(repoRoot, "context");
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(path.join(projectRoot, "note.md"), "initial\n");
    runSync(["git", "init"], repoRoot);
    runSync(["git", "config", "user.name", "Test User"], repoRoot);
    runSync(["git", "config", "user.email", "test@example.com"], repoRoot);

    const snapshots = [
      await createSnapshot(projectRoot, "task-1", (lease) => {
        writeFileSync(path.join(lease.projectMountPath, "note.md"), "updated\n");
      })
    ];

    const integration = await prepareBranchfsIntegrationLease(
      createMergeResolverAdapter(),
      {
        rootPath: projectRoot,
        runId: "run-unborn",
        executionModelId: "openai/gpt-5.4"
      },
      {
        tasks: [{ id: "task-1", title: "Task 1", instruction: "Update note" }],
        snapshots
      }
    );

    await flushBranchfsIntegrationLease(integration!);
    await discardBranchfsIntegrationLease(integration);
    await discardBranchfsSnapshots(snapshots);

    expect(normalizeNewlines(await readFile(path.join(projectRoot, "note.md"), "utf8"))).toBe("updated\n");
  });

  test("failed input inspection rejects integration and cleans its owned mount", async () => {
    const rootPath = await gitFixture.createRepoClone("branchfs-denied-integration");
    const snapshot = await createSnapshot(rootPath, "task", lease => {
      writeFileSync(path.join(lease.projectMountPath, "new.txt"), "incoming");
    });
    const denied = Object.assign(new Error("inspection denied"), { code: "EACCES" });
    let restore = () => {};
    const events: string[] = [];
    const incoming = { ...snapshot, manager: { ...snapshot.manager, async readInspection(lease: BranchfsSubagentSnapshot["lease"]) {
      const inspection = await snapshot.manager.readInspection(lease);
      const probe = spyOn(fs, "stat").mockRejectedValue(denied);
      restore = () => probe.mockRestore();
      return inspection;
    } } };
    try {
      await expect(prepareBranchfsIntegrationLease(createMergeResolverAdapter(), {
        rootPath, runId: "denied", executionModelId: "openai/gpt-5.4", onTrace: trace => events.push(trace.stage)
      }, { tasks: [{ id: "task", title: "Task", instruction: "Add file" }], snapshots: [incoming] })).rejects.toBe(denied);
      expect(await Bun.file(path.join(rootPath, "new.txt")).exists()).toBe(false);
      expect(await Bun.file(path.join(rootPath, ".local/branchfs/denied-integration/meta/manifest.json")).exists()).toBe(false);
      expect(events).not.toContain("merge-complete");
      expect(events).toContain("branchfs-unmounted");
    } finally {
      restore();
      await discardBranchfsSnapshots([snapshot]);
    }
  });
});

async function createSnapshot(rootPath: string, taskId: string, edit: (lease: BranchfsSubagentSnapshot["lease"]) => void) {
  const manager = createBranchfsManager({ rootPath, runId: `${taskId}-${crypto.randomUUID()}` });
  const lease = await manager.prepareExperimentLease();
  edit(lease);
  return {
    taskId,
    manager,
    lease
  };
}

function createTempDir(prefix: string) {
  const targetPath = createHarnessTestTempPath(prefix);
  mkdirSync(targetPath, { recursive: true });
  tempPaths.push(targetPath);
  return targetPath;
}

function seedBunProject(rootPath: string) {
  writeFileSync(
    path.join(rootPath, "package.json"),
    JSON.stringify(
      {
        name: "branchfs-subagent-test",
        private: true,
        type: "module",
        scripts: {
          typecheck: "bun --version",
          test: "bun --version"
        }
      },
      null,
      2
    )
  );
  writeFileSync(path.join(rootPath, "bun.lock"), "");
}

function runSync(command: string[], cwd: string) {
  const proc = spawnBackgroundProcessSync({
    cmd: command,
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });

  if (proc.exitCode !== 0) {
    const stdout = new TextDecoder().decode(proc.stdout);
    const stderr = new TextDecoder().decode(proc.stderr);
    throw new Error(`${command.join(" ")} failed: ${(stderr || stdout).trim()}`);
  }
}
