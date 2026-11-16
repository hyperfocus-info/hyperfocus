import { expect } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createWorkspaceRepository } from "../../workspace-repository";
import { answerPlanningQuestionAndExecute, createSocket, openProject, runGitOutput, sendChatAndExecute, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerWorkspaceProjectTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    registerWorkspaceProjectCommandTests(serverTest, fixture);
    registerWorkspaceProjectLifecycleTests(serverTest, fixture);
}

function registerWorkspaceProjectCommandTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("opens repositories with more than one file page through a bounded project event", async () => {
        const projectRoot = fixture.createTempDir(`large-project-${crypto.randomUUID()}`);
        for (let index = 0; index < 600; index += 1) {
            writeFileSync(path.join(projectRoot, `file-${String(index).padStart(3, "0")}.txt`), `${index}\n`);
        }
        const socket = createSocket(fixture.port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-open-large-project");
        expect(opened.payload.project.filePaths).toHaveLength(512);
        expect(opened.payload.project.filePathsNextCursor).toBe(opened.payload.project.filePaths?.at(-1));
        socket.close();
    });
    serverTest("direct and bulk inactive project deletion preserve the active project", async () => {
        const socket = createSocket(fixture.port);
        await waitForEvent(socket, "connection.ready");
        const active = await openProject(socket, fixture.createTempDir(`active-${crypto.randomUUID()}`));
        const directTarget = await openProject(socket, fixture.createTempDir(`direct-target-${crypto.randomUUID()}`));
        const bulkTarget = await openProject(socket, fixture.createTempDir(`bulk-target-${crypto.randomUUID()}`));
        const activated = waitForEvent(socket, "project.activated", (event) => event.requestId === "req-activate-preserved");
        socket.send(JSON.stringify({ type: "project.activate", requestId: "req-activate-preserved",
            payload: { projectId: active.payload.project.id } }));
        await activated;

        const directRemoved = waitForEvent(socket, "project.removed", (event) => event.requestId === "req-remove-inactive");
        socket.send(JSON.stringify({ type: "project.remove", requestId: "req-remove-inactive",
            payload: { projectId: directTarget.payload.project.id } }));
        expect((await directRemoved).payload.activeProjectId).toBe(active.payload.project.id);

        const bulkRemoved = waitForEvent(socket, "project.removed", (event) => event.requestId === "req-bulk-remove-inactive");
        const bulkApplied = waitForEvent(socket, "bulk-operation.applied", (event) => event.requestId === "req-bulk-remove-inactive");
        socket.send(JSON.stringify({ type: "bulk-operation.apply", requestId: "req-bulk-remove-inactive",
            payload: { operationId: "bulk-remove-inactive", action: "delete",
                targets: [{ kind: "project", projectId: bulkTarget.payload.project.id }] } }));
        expect((await bulkRemoved).payload.activeProjectId).toBe(active.payload.project.id);
        expect((await bulkApplied).payload.results[0]?.status).toBe("applied");
        expect(fixture.repository.loadWorkspace().activeProjectId).toBe(active.payload.project.id);
        const cleanupRemoved = waitForEvent(socket, "project.removed", (event) => event.requestId === "req-remove-active-cleanup");
        socket.send(JSON.stringify({ type: "project.remove", requestId: "req-remove-active-cleanup",
            payload: { projectId: active.payload.project.id } }));
        await cleanupRemoved;
        socket.close();
    });
    serverTest("opens project through typed folder browse command", async () => {
        const { extraProjectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const addedPromise = waitForEvent(socket, "project.opened");
        socket.send(JSON.stringify({
            type: "project.browse",
            requestId: "req-browse"
        }));
        const added = await addedPromise;
        expect(added.payload.project.rootPath).toBe(extraProjectRoot);
        expect(added.payload.activeProjectId).toBe(added.payload.project.id);
        expect(added.payload.resolution).toBe("created-project");
        socket.close();
    });
    serverTest("creates a missing folder through typed project.create command", async () => {
        const { port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const createdRoot = path.join(fixture.createTempDir(`new-parent-${crypto.randomUUID()}`), "created-project");
        const addedPromise = waitForEvent(socket, "project.opened");
        socket.send(JSON.stringify({
            type: "project.create",
            requestId: "req-create-project",
            payload: {
                rootPath: createdRoot
            }
        }));
        const added = await addedPromise;
        expect(existsSync(createdRoot)).toBe(true);
        expect(added.payload.project.rootPath).toBe(createdRoot);
        expect(added.payload.resolution).toBe("created-project");
        socket.close();
    });
    serverTest("rejects unavailable Windows project roots without changing workspace ownership", async () => {
        if (process.platform !== "win32") return;
        const unavailableDrive = "ZYXWVUTSRQPONMLKJIHGFED".split("")
            .find((drive) => !existsSync(`${drive}:\\`));
        if (!unavailableDrive) return;
        const { port, repository } = fixture;
        const projectsBefore = repository.loadWorkspace().projects.map((project) => project.id);
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const rejectedPromise = waitForEvent(socket, "command.rejected",
            (event) => event.requestId === "req-create-unavailable-drive");
        socket.send(JSON.stringify({
            type: "project.create",
            requestId: "req-create-unavailable-drive",
            payload: { rootPath: `${unavailableDrive}:\\missing-project` }
        }));

        const rejected = await rejectedPromise;
        expect(rejected.payload.detail).toContain(`Project drive ${unavailableDrive}: is unavailable`);
        expect(repository.loadWorkspace().projects.map((project) => project.id)).toEqual(projectsBefore);
        socket.close();
    });
    serverTest("initializes git with a baseline commit for non-git projects", async () => {
        const { port } = fixture;
        const nonGitRoot = fixture.createTempDir(`non-git-${crypto.randomUUID()}`);
        writeFileSync(path.join(nonGitRoot, "notes.md"), "baseline\n");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, nonGitRoot, "req-non-git-open");
        const initializedPromise = waitForEvent(socket, "project.git.initialized");
        socket.send(JSON.stringify({
            type: "project.git.initBaseline",
            requestId: "req-init-baseline",
            payload: {
                projectId: opened.payload.project.id
            }
        }));
        const initialized = await initializedPromise;
        expect(initialized.payload.initialized).toBe(true);
        expect(initialized.payload.baselineCommitCreated).toBe(true);
        expect(existsSync(path.join(nonGitRoot, ".git"))).toBe(true);
        expect((await runGitOutput(["rev-parse", "--verify", "HEAD"], nonGitRoot)).trim()).toHaveLength(40);
        socket.close();
    });
    serverTest("returns ranked filesystem suggestions through project.search", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        await openProject(socket, projectRoot, "req-project-search-open");
        const searchPromise = waitForEvent(socket, "project.search.results", undefined, 15000);
        socket.send(JSON.stringify({
            type: "project.search",
            requestId: "req-project-search",
            payload: {
                query: "repo"
            }
        }));
        const searchResults = await searchPromise;
        expect(searchResults.payload.query).toBe("repo");
        expect(searchResults.payload.results.length).toBeGreaterThan(0);
        expect(searchResults.payload.results[0]?.repoKind).toBe("git-repo");
        expect(typeof searchResults.payload.results[0]?.rootPath).toBe("string");
        socket.close();
    }, 15000);
    serverTest("serves IDE file tree, read, write, and git status through typed commands", async () => {
        const { projectRoot, port } = fixture;
        writeFileSync(path.join(projectRoot, "ide-target.ts"), "export const ideNeedle = true;\n");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-ide-open");
        const projectId = opened.payload.project.id;
        const treePromise = waitForEvent(socket, "ide.fileTree.listed");
        socket.send(JSON.stringify({ type: "ide.fileTree.list", requestId: "req-ide-tree", payload: { projectId } }));
        const tree = await treePromise;
        expect(tree.payload.entries.some((entry: {
            path: string;
        }) => entry.path === "ide-target.ts")).toBe(true);
        const readPromise = waitForEvent(socket, "ide.file.read");
        socket.send(JSON.stringify({ type: "ide.file.read", requestId: "req-ide-read", payload: { projectId, path: "ide-target.ts" } }));
        const read = await readPromise;
        expect(read.payload.content).toContain("ideNeedle");
        const writePromise = waitForEvent(socket, "ide.file.written");
        socket.send(JSON.stringify({ type: "ide.file.write", requestId: "req-ide-write", payload: { projectId, path: "ide-target.ts", content: "export const ideNeedle = false;\n" } }));
        const written = await writePromise;
        expect(written.payload.content).toContain("false");
        const gitPromise = waitForEvent(socket, "ide.git.status");
        socket.send(JSON.stringify({ type: "ide.git.status", requestId: "req-ide-git", payload: { projectId } }));
        const git = await gitPromise;
        expect(git.payload.isRepository).toBe(true);
        socket.close();
    }, 15000);
}

function registerWorkspaceProjectLifecycleTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("reopens existing project by creating a new thread", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const firstOpened = await openProject(socket, projectRoot, "req-open-existing-1");
        const secondOpened = await openProject(socket, projectRoot, "req-open-existing-2");
        expect(firstOpened.payload.resolution).toBe("created-project");
        expect(secondOpened.payload.resolution).toBe("existing-project-new-thread");
        expect(secondOpened.payload.project.id).toBe(firstOpened.payload.project.id);
        expect(secondOpened.payload.project.threads).toHaveLength(2);
        expect(secondOpened.payload.project.activeThreadId).not.toBe(firstOpened.payload.project.activeThreadId);
        socket.close();
    });
    serverTest("restores pending planner question when switching back to its thread", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-thread-question-open");
        const projectId = opened.payload.project.id;
        const originalThreadId = opened.payload.project.activeThreadId;
        const createdPromise = waitForEvent(socket, "thread.created");
        socket.send(JSON.stringify({
            type: "thread.create",
            requestId: "req-thread-question-create",
            payload: {
                projectId
            }
        }));
        const created = await createdPromise;
        const questionThreadId = created.payload.project.activeThreadId;
        const questionRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.projectId === projectId &&
            event.payload.threadId === questionThreadId &&
            event.payload.run.status === "awaiting-user-input");
        socket.send(JSON.stringify({
            type: "chat.send",
            requestId: "req-thread-question-ask",
            payload: {
                projectId,
                threadId: questionThreadId,
                agentId: "pi",
                content: "needs clarification",
                modeId: "plan",
                modeLocked: true
            }
        }));
        const questionRun = await questionRunPromise;
        const switchAwayPromise = waitForEvent(socket, "thread.activated", (event) => event.payload.projectId === projectId && event.payload.project.activeThreadId === originalThreadId);
        socket.send(JSON.stringify({
            type: "thread.activate",
            requestId: "req-thread-question-switch-away",
            payload: {
                projectId,
                threadId: originalThreadId
            }
        }));
        await switchAwayPromise;
        const switchBackPromise = waitForEvent(socket, "thread.activated", (event) => event.payload.projectId === projectId && event.payload.project.activeThreadId === questionThreadId);
        socket.send(JSON.stringify({
            type: "thread.activate",
            requestId: "req-thread-question-switch-back",
            payload: {
                projectId,
                threadId: questionThreadId
            }
        }));
        const switchedBack = await switchBackPromise;
        expect(switchedBack.payload.project.activeRun?.id).toBe(questionRun.payload.run.id);
        expect(switchedBack.payload.project.activeRun?.status).toBe("awaiting-user-input");
        expect(switchedBack.payload.project.activeRun?.questions[0]?.prompt).toContain("Which route");
        expect(switchedBack.payload.project.activeRun?.questions[0]?.status).toBe("pending");
        const complete = await answerPlanningQuestionAndExecute(socket, {
            requestId: "req-thread-question-answer",
            projectId,
            threadId: questionThreadId,
            runId: questionRun.payload.run.id,
            questionId: questionRun.payload.run.questions[0]!.id,
            content: "api/users/[id]"
        });
        expect(complete.payload.assistantMessage.content).toBe("main execution result\n\nVerification unverified: no task-specific checks were established.");
        socket.close();
    });
    serverTest("removes final project and returns to empty workspace", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-remove-open");
        const jobId = crypto.randomUUID();
        const runAt = "2099-01-01T00:00:00.000Z";
        repository.saveBackgroundJob({ id: jobId, projectId: opened.payload.project.id,
            automationThreadId: crypto.randomUUID(), kind: "ai-routine", name: "Remove with project",
            status: "paused", riskLevel: "safe", definition: { kind: "ai-routine", prompt: "Remove me." },
            schedule: { type: "one-off", runAt, sourceText: runAt }, scheduleInput: runAt, nextRunAt: runAt,
            createdAt: runAt, updatedAt: runAt });
        const removedPromise = waitForEvent(socket, "project.removed");
        const deletedJobsPromise = waitForEvent(socket, "background-jobs.deleted", (event) => event.requestId === "req-remove-last");
        socket.send(JSON.stringify({
            type: "project.remove",
            requestId: "req-remove-last",
            payload: {
                projectId: opened.payload.project.id
            }
        }));
        const removed = await removedPromise;
        expect((await deletedJobsPromise).payload.deletedJobIds).toEqual([jobId]);
        expect(removed.payload.projectId).toBe(opened.payload.project.id);
        expect(removed.payload.activeProjectId).toBeUndefined();
        expect(repository.loadWorkspace()).toEqual({
            projects: [],
            activeProjectId: undefined,
            workspaceModes: [],
            workspaceRuleSource: undefined,
            workspaceMemorySummary: undefined
        });
        socket.close();
    });
    serverTest("restores persisted chat history after restart", async () => {
        let { adapter, dbPath, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        await sendChatAndExecute(socket, {
            requestId: "req-persist",
            projectId,
            threadId,
            content: "simple task"
        });
        socket.close();
        await fixture.restart({
            port: 0,
            adapter,
            repository: createWorkspaceRepository(dbPath, projectRoot, { durability: "test-fast" }),
            serverOnly: true
        });
        port = fixture.port;
        const nextSocket = createSocket(port);
        const nextReady = await waitForEvent(nextSocket, "connection.ready");
        const restoredProject = nextReady.payload.workspace.projects.find((project: any) => project.id === projectId);
        expect(restoredProject.session.messages.length).toBeGreaterThanOrEqual(3);
        expect(restoredProject.session.messages[0].content).toBe("simple task");
        expect(restoredProject.session.messages.some((message: any) => message.kind === "run-milestones")).toBe(true);
        expect(restoredProject.session.messages.at(-1).content).toBe("main execution result\n\nVerification unverified: no task-specific checks were established.");
        expect(restoredProject.lastRun?.status).toBe("completed");
        expect(restoredProject.lastRun?.retryable).toBe(true);
        nextSocket.close();
    });
}
