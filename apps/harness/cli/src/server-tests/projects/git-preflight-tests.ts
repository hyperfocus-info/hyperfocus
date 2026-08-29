import { expect } from "bun:test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createSocket, createStandaloneTempDir, executeReadyRun, openProject, sendChatUntilReady, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerGitPreflightTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("allows chat runs in non-git folders when dirty git restriction is disabled", async () => {
        const { repository, port } = fixture;
        repository.setBlockChatOnDirtyGitDefault(false);
        const nonGitRoot = createStandaloneTempDir(`non-git-disabled-${crypto.randomUUID()}`);
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, nonGitRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-non-git-disabled",
            projectId,
            threadId,
            content: "simple task"
        });
        await executeReadyRun(socket, {
            requestId: "req-non-git-disabled-execute",
            projectId,
            threadId,
            runId: ready.payload.run.id
        });
        socket.close();
    });
    serverTest("emits blocking preflight for non-git folders when dirty git restriction is enabled", async () => {
        let { port } = fixture;
        await fixture.restartWithRealOsAdapters();
        port = fixture.port;
        const nonGitRoot = createStandaloneTempDir(`non-git-enabled-${crypto.randomUUID()}`);
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, nonGitRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const preflightPromise = waitForEvent(socket, "run.preflight");
        socket.send(JSON.stringify({
            type: "chat.send",
            requestId: "req-non-git-enabled",
            payload: {
                projectId,
                threadId,
                agentId: "pi",
                content: "simple task"
            }
        }));
        const preflight = await preflightPromise;
        expect(preflight.payload.preflight.kind).toBe("git-not-repo");
        expect(preflight.payload.preflight.severity).toBe("blocking");
        socket.close();
    });
    serverTest("emits dirty git warning and still runs when change count is within threshold", async () => {
        let { projectRoot, port } = fixture;
        await fixture.restartWithRealOsAdapters();
        port = fixture.port;
        writeFileSync(path.join(projectRoot, "dirty-warning.txt"), "warn\n");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const preflightPromise = waitForEvent(socket, "run.preflight");
        const readyPromise = sendChatUntilReady(socket, {
            requestId: "req-dirty-warning",
            projectId,
            threadId,
            content: "simple task"
        });
        const preflight = await preflightPromise;
        const ready = await readyPromise;
        await executeReadyRun(socket, {
            requestId: "req-dirty-warning-execute",
            projectId,
            threadId,
            runId: ready.payload.run.id
        });
        expect(preflight.payload.preflight.changedFileCount).toBe(1);
        expect(preflight.payload.preflight.kind).toBe("git-dirty");
        socket.close();
    });
    serverTest("rejects chat.send and run.retry when git is too dirty", async () => {
        let { projectRoot, port } = fixture;
        await fixture.restartWithRealOsAdapters();
        port = fixture.port;
        for (let index = 0; index < 21; index += 1) {
            writeFileSync(path.join(projectRoot, `dirty-${index}.txt`), `${index}\n`);
        }
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const rejectedPromise = waitForEvent(socket, "command.rejected");
        socket.send(JSON.stringify({
            type: "chat.send",
            requestId: "req-dirty-block",
            payload: {
                projectId,
                threadId,
                agentId: "pi",
                content: "simple task"
            }
        }));
        const rejected = await rejectedPromise;
        expect(rejected.payload.detail).toContain("21 changed files");
        socket.close();
    });
    serverTest("honors custom dirty git change limit", async () => {
        let { repository, projectRoot, port } = fixture;
        await fixture.restartWithRealOsAdapters();
        port = fixture.port;
        repository.setDirtyGitChangeLimitDefault(1);
        writeFileSync(path.join(projectRoot, "dirty-limit-1.txt"), "1\n");
        writeFileSync(path.join(projectRoot, "dirty-limit-2.txt"), "2\n");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const rejectedPromise = waitForEvent(socket, "command.rejected");
        socket.send(JSON.stringify({
            type: "chat.send",
            requestId: "req-dirty-custom-limit",
            payload: {
                projectId,
                threadId,
                agentId: "pi",
                content: "simple task"
            }
        }));
        const rejected = await rejectedPromise;
        expect(rejected.payload.detail).toContain("Refusing run above 1 files");
        socket.close();
    });
    serverTest("allows chat runs on dirty repos when dirty git restriction is disabled", async () => {
        const { repository, projectRoot, port } = fixture;
        repository.setBlockChatOnDirtyGitDefault(false);
        for (let index = 0; index < 21; index += 1) {
            writeFileSync(path.join(projectRoot, `dirty-disabled-${index}.txt`), `${index}\n`);
        }
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-dirty-disabled",
            projectId,
            threadId,
            content: "simple task"
        });
        await executeReadyRun(socket, {
            requestId: "req-dirty-disabled-execute",
            projectId,
            threadId,
            runId: ready.payload.run.id
        });
        socket.close();
    });
}
