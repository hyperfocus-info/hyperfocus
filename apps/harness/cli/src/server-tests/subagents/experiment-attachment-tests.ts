import { expect } from "bun:test";
import { createSampleDocxBuffer } from "../../document-extractors/test-fixtures";
import { createChatSendCommand, createSocket, openProject, sendChatUntilReady, waitForEvent } from "../support/server-test-client";
import type { AttachmentFetchBodies } from "../../test-support/attachment-fetch-fixture";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerExperimentAttachmentTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture, attachmentFetchBodies: AttachmentFetchBodies) {
    serverTest("runs experiments in virtual branch mode without recording routine completion notes", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-experiment-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-experiment-ready",
            projectId,
            threadId,
            content: "simple task"
        }, 10000);
        const runUpdatedPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.id === ready.payload.run.id && event.payload.run.status === "completed", 10000);
        const completePromise = waitForEvent(socket, "chat.complete", undefined, 10000);
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-experiment-execute",
            payload: {
                projectId,
                threadId,
                runId: ready.payload.run.id,
                target: "ephemeral-experiment"
            }
        }));
        const runUpdated = await runUpdatedPromise.catch(error => {
          const run = fixture.repository.getRun(projectId, ready.payload.run.id);
          throw new Error(`${error instanceof Error ? error.message : "Experiment did not finish"}; status=${run?.status}; failure=${run?.failureMessage ?? "none"}`);
        });
        await completePromise;
        expect(runUpdated.payload.run.executionTarget).toBe("ephemeral-experiment");
        expect(runUpdated.payload.run.experiment?.virtualBranchName).toContain(ready.payload.run.id);
        const listedPromise = waitForEvent(socket, "memory.listed", undefined, 10000);
        socket.send(JSON.stringify({
            type: "memory.list",
            requestId: "req-memory-list",
            payload: {
                projectId
            }
        }));
        const listed = await listedPromise;
        expect(listed.payload.entries).toEqual([]);
        const inspectedPromise = waitForEvent(socket, "experiment.inspected", undefined, 10000);
        socket.send(JSON.stringify({
            type: "experiment.inspect",
            requestId: "req-experiment-inspect",
            payload: {
                projectId,
                runId: ready.payload.run.id
            }
        }));
        const inspected = await inspectedPromise;
        expect(inspected.payload.inspection.experiment.virtualBranchName).toContain(ready.payload.run.id);
        socket.close();
    });
    serverTest("chat.send forwards attachment context into planner prompts", async () => {
        const { adapter, repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-attach-open");
        const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9s3FoXcAAAAASUVORK5CYII=";
        const textAttachment = {
            id: "attachment-text",
            kind: "text",
            name: "spec.md",
            mimeType: "text/markdown",
            sizeBytes: 29,
            url: "https://example.com/spec.md",
            key: "attachment-text",
            uploadedAt: new Date().toISOString()
        } as const;
        const imageAttachment = {
            id: "attachment-image",
            kind: "image",
            name: "bug.png",
            mimeType: "image/png",
            sizeBytes: tinyPng.length,
            url: "https://example.com/bug.png",
            key: "attachment-image",
            uploadedAt: new Date().toISOString()
        } as const;
        repository.saveChatAttachmentUpload({
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            attachment: textAttachment
        });
        repository.saveChatAttachmentUpload({
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            attachment: imageAttachment
        });
        attachmentFetchBodies.set(textAttachment.url, { body: "Ship the smallest safe fix", mimeType: "text/markdown" });
        attachmentFetchBodies.set(imageAttachment.url, {
            body: Buffer.from(tinyPng, "base64"),
            mimeType: "image/png"
        });
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-attach-send",
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            content: "Use attached context",
            modeId: "plan",
            modeLocked: true,
            attachments: [textAttachment, imageAttachment]
        })));
        await readyPromise;
        expect(adapter.calls[0]?.kind).toBe("planner");
        expect(adapter.calls[0]?.prompt).toContain("Attachment contents:");
        expect(adapter.calls[0]?.prompt).toContain("Ship the smallest safe fix");
        expect(adapter.calls[0]?.images).toHaveLength(1);
        expect(adapter.calls[0]?.images?.[0]?.mimeType).toBe("image/png");
        socket.close();
    });
    serverTest("chat.send forwards extracted document context into planner prompts", async () => {
        const { adapter, repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-doc-open");
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        const documentBody = createSampleDocxBuffer();
        const documentAttachment = {
            id: "attachment-docx",
            kind: "document",
            documentType: "docx",
            name: "brief.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sizeBytes: documentBody.length,
            url: "https://example.com/brief.docx",
            key: "attachment-docx",
            uploadedAt: new Date().toISOString()
        } as const;
        repository.saveChatAttachmentUpload({
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            attachment: documentAttachment
        });
        attachmentFetchBodies.set(documentAttachment.url, {
            body: documentBody,
            mimeType: documentAttachment.mimeType
        });
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-doc-send",
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            content: "Use attached office docs",
            modeId: "plan",
            modeLocked: true,
            attachments: [documentAttachment]
        })));
        await readyPromise;
        expect(adapter.calls[0]?.prompt).toContain("Docx intro");
        expect(adapter.calls[0]?.prompt).toContain("Cell A1");
        socket.close();
    });
    serverTest("chat.send keeps malformed document attachments explicit without crashing planning", async () => {
        const { adapter, repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-bad-doc-open");
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        const badAttachment = {
            id: "attachment-bad-docx",
            kind: "document",
            documentType: "docx",
            name: "broken.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sizeBytes: 9,
            url: "https://example.com/broken.docx",
            key: "attachment-bad-docx",
            uploadedAt: new Date().toISOString()
        } as const;
        repository.saveChatAttachmentUpload({
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            attachment: badAttachment
        });
        attachmentFetchBodies.set(badAttachment.url, {
            body: Buffer.from("not-a-zip"),
            mimeType: badAttachment.mimeType
        });
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-bad-doc-send",
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            content: "Handle malformed document",
            modeId: "plan",
            modeLocked: true,
            attachments: [badAttachment]
        })));
        await readyPromise;
        expect(adapter.calls[0]?.prompt).toContain("[Attachment document unavailable] broken.docx:");
        socket.close();
    });
}
