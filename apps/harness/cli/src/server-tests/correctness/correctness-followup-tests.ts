import { expect } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createChatSendCommand, createSocket, executeReadyRunUntil, openProject, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerCorrectnessFollowupTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("presents a corrective plan when correctness review finds a runnable gap", async () => {
        const { projectRoot, port } = fixture;
        writeFileSync(path.join(projectRoot, "index.html"), '<!doctype html><html><body><script type="module" src="./app.ts"></script></body></html>\n');
        writeFileSync(path.join(projectRoot, "app.ts"), 'console.log("hello");\n');
        mkdirSync(path.join(projectRoot, "node_modules", "autoprefixer", "lib"), { recursive: true });
        writeFileSync(path.join(projectRoot, "node_modules", "autoprefixer", "lib", "old-selector.js"), "module.exports = {};\n");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const correctiveReadyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready" && event.payload.run.plan?.origin === "correctness-followup", 10000);
        const initialReadyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready", 10000);
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-correctness-gap",
            projectId,
            threadId,
            content: "simple task"
        })));
        const initialReady = await initialReadyPromise;
        await executeReadyRunUntil(socket, {
            requestId: "req-correctness-gap-execute",
            projectId,
            threadId,
            runId: initialReady.payload.run.id
        }, [correctiveReadyPromise], 10000, { includeChatComplete: false });
        const correctiveReady = await correctiveReadyPromise;
        expect(correctiveReady.payload.run.plan?.origin).toBe("correctness-followup");
        expect(correctiveReady.payload.run.plan?.gating.mode).toBe("immediate");
        expect(correctiveReady.payload.run.plan?.summary).toContain("TypeScript modules directly");
        expect(correctiveReady.payload.run.plan?.summary).not.toContain("node_modules");
        socket.close();
    }, 15000);
    serverTest("presents a corrective plan when write-required execution produces no files", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-correctness-write-block-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const correctiveReadyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready" && event.payload.run.plan?.origin === "correctness-followup", 10000);
        const initialReadyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready", 10000);
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-correctness-write-block-send",
            projectId,
            threadId,
            content: "read-only scaffold failure"
        })));
        const initialReady = await initialReadyPromise;
        await executeReadyRunUntil(socket, {
            requestId: "req-correctness-write-block-execute",
            projectId,
            threadId,
            runId: initialReady.payload.run.id
        }, [correctiveReadyPromise], 10000, { includeChatComplete: false });
        const correctiveReady = await correctiveReadyPromise;
        expect(correctiveReady.payload.run.plan?.origin).toBe("correctness-followup");
        expect(correctiveReady.payload.run.plan?.summary).toContain("produced no file changes");
        expect(correctiveReady.payload.run.plan?.finalExecutionBrief).toContain("workspace-write execution");
        socket.close();
    }, 15000);
    serverTest("corrective follow-up upgrades implement mode to approval when gaps can parallelize", async () => {
        const { projectRoot, port } = fixture;
        writeFileSync(path.join(projectRoot, "index.html"), '<!doctype html><html><body><script type="module" src="./app.ts"></script></body></html>\n');
        writeFileSync(path.join(projectRoot, "app.ts"), 'console.log("hello");\n');
        writeFileSync(path.join(projectRoot, "temp-helper.ts"), "export const temp = true;\n");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-corrective-parallel-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const correctiveReadyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready" && event.payload.run.plan?.origin === "correctness-followup", 10000);
        const initialReadyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready", 10000);
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-corrective-parallel-send",
            projectId,
            threadId,
            content: "simple task"
        })));
        const initialReady = await initialReadyPromise;
        await executeReadyRunUntil(socket, {
            requestId: "req-corrective-parallel-execute",
            projectId,
            threadId,
            runId: initialReady.payload.run.id
        }, [correctiveReadyPromise], 10000, { includeChatComplete: false });
        const correctiveReady = await correctiveReadyPromise;
        expect(correctiveReady.payload.run.plan?.origin).toBe("correctness-followup");
        expect(correctiveReady.payload.run.plan?.route).toBe("pi-subagents");
        expect(correctiveReady.payload.run.plan?.actualSubagentCount).toBeGreaterThan(1);
        expect(correctiveReady.payload.run.plan?.gating.mode).toBe("approve");
        socket.close();
    }, 15000);
}
