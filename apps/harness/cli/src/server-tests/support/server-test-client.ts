import { encodeValue, readValueFrame } from "@hyperfocus/serialization";
import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseServerEventFrame, RUN_DETAIL_CHUNK_MAX_BYTES, RUN_DETAIL_MAX_BYTES } from "@hyperfocus/ai-core/protocol";
import type { PiAgentAdapter, PiAgentPromptRequest } from "../../pi-agent-adapter";
import { startHarnessServer, type HarnessServerOsAdapters } from "../../server";
import { createPiRuntime } from "../../agent-runtimes/pi-runtime";
import { createAgentRuntimeRegistry } from "../../agent-runtimes/runtime-registry";
import { createFastHarnessServerOsAdapters } from "../../test-support/fast-os-adapters";
import type { FakePiAgentAdapter } from "../../test-support/fake-pi-agent-adapter";
import { HARNESS_SESSION_TOKEN_QUERY, TEST_HARNESS_SESSION_TOKEN } from "../../server/transport/request-admission";

const DEFAULT_TEST_EVENT_TIMEOUT_MS = 1500;
const RUN_DETAIL_PAGE_TIMEOUT_MS = 10_000;
const RUN_DETAIL_MAX_CHUNKS = Math.ceil(RUN_DETAIL_MAX_BYTES / RUN_DETAIL_CHUNK_MAX_BYTES);
type RunDetailFlight = { promise: Promise<any>; consumers: Set<symbol>; abort: AbortController };
const runDetailFlights = new WeakMap<EventTarget, Map<string, RunDetailFlight>>();

export type StartServerForTestInput = Parameters<typeof startHarnessServer>[0] & {
  useFastOsAdapters?: boolean;
};

export async function stopServerForTest(server: Awaited<ReturnType<typeof startHarnessServer>> | undefined) {
  if (!server) {
    return;
  }
  await Promise.resolve(server.stop(true));
}

export async function startServerForTest(input: StartServerForTestInput) {
  const runtimeRegistry = input.runtimeRegistry ?? (input.adapter ? createFastTestRuntimeRegistry(input.adapter) : undefined);
  const osAdapters = resolveTestOsAdapters(input);
  const server = await startHarnessServer({
    ...input,
    sessionToken: input.sessionToken ?? TEST_HARNESS_SESSION_TOKEN,
    port: input.port ?? 0,
    hostname: input.hostname ?? "127.0.0.1",
    runtimeRegistry,
    osAdapters
  });
  if (server.port === undefined) {
    throw new Error("Harness server did not report a bound port");
  }
  return { server, port: server.port };
}

function resolveTestOsAdapters(input: StartServerForTestInput): Partial<HarnessServerOsAdapters> | undefined {
  if (input.useFastOsAdapters === false) {
    return input.osAdapters;
  }

  const fastAdapters = createFastHarnessServerOsAdapters();
  return {
    ...fastAdapters,
    ...input.osAdapters
  };
}

export function createFastTestRuntimeRegistry(adapter: PiAgentAdapter) {
  return createAgentRuntimeRegistry([createPiRuntime(adapter)]);
}

export function waitForAdapterCall(
  adapter: FakePiAgentAdapter,
  kind: PiAgentPromptRequest["kind"],
  timeoutMs: number = DEFAULT_TEST_EVENT_TIMEOUT_MS
) {
  return adapter.waitForCall(kind, undefined, timeoutMs);
}

export async function executeReadyRunUntil(
  socket: EventTarget & { send: (payload: string | Uint8Array<ArrayBuffer>) => void },
  input: { requestId: string; projectId: string; threadId: string; runId: string },
  waiters: Array<Promise<any>>,
  timeoutMs: number = DEFAULT_TEST_EVENT_TIMEOUT_MS,
  options: {
    includeChatComplete?: boolean;
  } = {}
) {
  const completePromise = options.includeChatComplete === false
    ? undefined
    : waitForEvent(socket, "chat.complete", undefined, timeoutMs).then((event) => ({ kind: "complete", event }));
  const rejectedPromise = waitForEvent(socket, "command.rejected", undefined, timeoutMs)
    .then((event) => ({ kind: "rejected", event }))
    .catch(() => undefined);
  const alternatePromises = waiters.map((waiter) => waiter.then((event) => ({ kind: "alternate", event })));

  socket.send(
    encodeValue({
      type: "run.execute",
      requestId: input.requestId,
      payload: {
        projectId: input.projectId,
        threadId: input.threadId,
        runId: input.runId
      }
    })
  );

  const outcome = await Promise.race([completePromise, rejectedPromise, ...alternatePromises].filter(Boolean));
  if (!outcome) {
    throw new Error("Execution waiter resolved without outcome");
  }
  if (outcome.kind === "rejected") {
    throw new Error(outcome.event.payload?.detail ?? outcome.event.payload?.message ?? "Run execution rejected");
  }
  return outcome.event;
}

export function openProject(socket: WebSocket, rootPath: string, requestId: string = `req-open-${crypto.randomUUID()}`) {
  const openedPromise = waitForEvent(socket, "project.opened");
  socket.send(
    encodeValue({
      type: "project.add",
      requestId,
      payload: {
        rootPath
      }
    })
  );
  return openedPromise;
}

export function createStandaloneTempDir(name: string) {
  const rootPath = path.join(os.tmpdir(), name);
  mkdirSync(rootPath, { recursive: true });
  return rootPath;
}

export function createChatSendCommand(input: {
  requestId: string;
  projectId: string;
  threadId: string;
  content: string;
  agentId?: "pi" | "copilot-cli" | "codex-cli";
  executionModelId?: string;
  reasoningStrength?: "low" | "medium" | "high" | "extra-high";
  fastMode?: boolean;
  modeId?: string;
  modeLocked?: boolean;
  attachments?: Array<{
    id: string;
    kind: "image" | "text" | "document";
    documentType?: "pdf" | "docx" | "xlsx" | "pptx" | "odt";
    name: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
    key: string;
    uploadedAt: string;
  }>;
}) {
  return {
    type: "chat.send",
    requestId: input.requestId,
    payload: {
      projectId: input.projectId,
      threadId: input.threadId,
      agentId: input.agentId ?? "pi",
      content: input.content,
      executionModelId: input.executionModelId,
      reasoningStrength: input.reasoningStrength,
      fastMode: input.fastMode,
      modeId: input.modeId,
      modeLocked: input.modeLocked,
      attachments: input.attachments
    }
  };
}

export async function sendChatUntilReady(
  socket: WebSocket,
  input: {
    requestId: string;
    projectId: string;
    threadId: string;
    content: string;
    agentId?: "pi" | "copilot-cli" | "codex-cli";
    reasoningStrength?: "low" | "medium" | "high" | "extra-high";
    fastMode?: boolean;
    modeId?: string;
    modeLocked?: boolean;
  },
  timeoutMs: number = DEFAULT_TEST_EVENT_TIMEOUT_MS
) {
  const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready", timeoutMs);
  const planMessagePromise = waitForEvent(
    socket,
    "chat.message-appended",
    (event) => event.payload.message.kind === "plan-summary",
    timeoutMs
  ).catch((error) => error);
  socket.send(encodeValue(createChatSendCommand(input)));
  const ready = await readyPromise;
  if (ready.payload.run.plan?.origin !== "quick-task") {
    const planMessage = await planMessagePromise;
    if (planMessage instanceof Error) {
      throw planMessage;
    }
  }
  return ready;
}

export async function executeReadyRun(
  socket: WebSocket,
  input: { requestId: string; projectId: string; threadId: string; runId: string },
  timeoutMs: number = DEFAULT_TEST_EVENT_TIMEOUT_MS
) {
  const completePromise = waitForEvent(socket, "chat.complete", undefined, timeoutMs);
  socket.send(
    encodeValue({
      type: "run.execute",
      requestId: input.requestId,
      payload: {
        projectId: input.projectId,
        threadId: input.threadId,
        runId: input.runId
      }
    })
  );
  return completePromise;
}

export async function sendChatAndExecute(
  socket: WebSocket,
  input: { requestId: string; projectId: string; threadId: string; content: string },
  timeoutMs: number = DEFAULT_TEST_EVENT_TIMEOUT_MS
) {
  const ready = await sendChatUntilReady(socket, input, timeoutMs);
  return executeReadyRun(
    socket,
    {
      requestId: `${input.requestId}-execute`,
      projectId: input.projectId,
      threadId: input.threadId,
      runId: ready.payload.run.id
    },
    timeoutMs
  );
}

export async function answerPlanningQuestionAndExecute(
  socket: WebSocket,
  input: { requestId: string; projectId: string; threadId: string; runId: string; questionId: string; content: string },
  timeoutMs: number = DEFAULT_TEST_EVENT_TIMEOUT_MS
) {
  const readyPromise = waitForEvent(
    socket,
    "run.updated",
    (event) => event.payload.run.id === input.runId && event.payload.run.status === "ready",
    timeoutMs
  );
  const planMessagePromise = waitForEvent(
    socket,
    "chat.message-appended",
    (event) => event.payload.message.kind === "plan-summary",
    timeoutMs
  ).catch((error) => error);
  socket.send(
    encodeValue({
      type: "planning.answer",
      requestId: input.requestId,
      payload: {
        projectId: input.projectId,
        threadId: input.threadId,
        runId: input.runId,
        questionId: input.questionId,
        content: input.content
      }
    })
  );
  const ready = await readyPromise;
  if (ready.payload.run.plan?.origin !== "quick-task") {
    const planMessage = await planMessagePromise;
    if (planMessage instanceof Error) {
      throw planMessage;
    }
  }
  return executeReadyRun(
    socket,
    {
      requestId: `${input.requestId}-execute`,
      projectId: input.projectId,
      threadId: input.threadId,
      runId: ready.payload.run.id
    },
    timeoutMs
  );
}

export function createSocket(port: number, sessionToken = TEST_HARNESS_SESSION_TOKEN) {
  const url = new URL(`ws://127.0.0.1:${port}/ws`);
  url.searchParams.set(HARNESS_SESSION_TOKEN_QUERY, sessionToken);
  const socket = new WebSocket(url); socket.binaryType = "arraybuffer"; return socket;
}

export async function pingServer(socket: WebSocket, requestId: string) {
  const pongPromise = waitForEvent(socket, "connection.pong", (event) => event.requestId === requestId);
  socket.send(
    encodeValue({
      type: "connection.ping",
      requestId,
      payload: {
        ok: true
      }
    })
  );
  await pongPromise;
}

export function waitForEvent(socket: EventTarget, type: string, predicate?: (payload: any) => boolean, timeoutMs: number = DEFAULT_TEST_EVENT_TIMEOUT_MS) {
  return new Promise<any>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const releaseHydrations = new Set<() => void>();

    const listener: EventListener = (event) => {
      if (!(event instanceof MessageEvent)) {
        return;
      }
      for (const payload of parseMessageEventPayloads(event)) {
        const effectivePayload =
          type === "chat.message-appended" && payload.type === "thread.message-appended"
            ? {
                ...payload,
                type: "chat.message-appended",
                payload: {
                  ...payload.payload,
                  state: {
                    isStreaming: false
                  }
                }
              }
            : payload;
        if (effectivePayload.type !== type) continue;
        if (type === "run.updated" && effectivePayload.payload.run.detailState !== "complete") {
          const hydration = hydrateRunUpdatedEvent(socket, effectivePayload);
          releaseHydrations.add(hydration.release);
          void hydration.promise.then((hydrated) => {
            hydration.release(); releaseHydrations.delete(hydration.release);
            if (!settled && (!predicate || predicate(hydrated))) { cleanup(); resolve(hydrated); }
          }).catch(() => { hydration.release(); releaseHydrations.delete(hydration.release); });
        } else if (!predicate || predicate(effectivePayload)) { cleanup(); resolve(effectivePayload); return; }
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error("socket error"));
    };

    const cleanup = () => {
      if (settled) {
        return;
      }

      settled = true;
      for (const release of releaseHydrations) release();
      releaseHydrations.clear();
      clearTimeout(timeout);
      socket.removeEventListener("message", listener);
      socket.removeEventListener("error", onError);
    };

    timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${type}`));
    }, timeoutMs);

    socket.addEventListener("message", listener);
    socket.addEventListener("error", onError, { once: true });
  });
}

export function parseMessageEventPayloads(event: MessageEvent): any[] {

  const raw: unknown = readValueFrame(event.data);
  try {
    return parseServerEventFrame(raw);
  } catch {
    return [raw];
  }
}

function hydrateRunUpdatedEvent(socket: EventTarget, event: any) {
  const run = event.payload.run;
  const key = `${event.payload.projectId}:${event.payload.threadId}:${run.id}:${run.updatedAt}`;
  let flights = runDetailFlights.get(socket);
  if (!flights) { flights = new Map(); runDetailFlights.set(socket, flights); }
  const token = Symbol(key);
  let flight = flights.get(key);
  if (!isTestSocket(socket)) throw new Error("Run detail hydration requires a test socket");
  if (!flight) {
    const abort = new AbortController(), consumers = new Set<symbol>();
    const promise = loadRunDetail(socket, event.payload, abort.signal)
      .then((detail) => ({ ...event, payload: { ...event.payload, run: detail } }))
      .finally(() => { if (flights!.get(key)?.promise === promise) flights!.delete(key); });
    flight = { promise, consumers, abort };
    flights.set(key, flight);
  }
  flight.consumers.add(token);
  let released = false;
  return { promise: flight.promise, release() {
    if (released) return;
    released = true; flight!.consumers.delete(token);
    if (flight!.consumers.size === 0) flight!.abort.abort();
  } };
}

function isTestSocket(socket: EventTarget): socket is EventTarget & { send: (payload: string | Uint8Array<ArrayBuffer>) => void } {
  return "send" in socket && typeof socket.send === "function";
}

async function loadRunDetail(socket: EventTarget & { send: (payload: string | Uint8Array<ArrayBuffer>) => void },
  owner: { projectId: string; threadId: string; run: { id: string } }, signal: AbortSignal) {
  const chunks: string[] = [], seenCursors = new Set<string>();
  let totalBytes = 0, totalChunks = 0;
  let cursor: string | undefined;
  do {
    if (signal.aborted) throw new Error("Run detail hydration cancelled");
    const requestId = `run-detail-${crypto.randomUUID()}`;
    const loaded = waitForEvent(socket, "run.detail.loaded", (event) => event.requestId === requestId,
      RUN_DETAIL_PAGE_TIMEOUT_MS);
    socket.send(encodeValue({ type: "run.detail.get", requestId, payload: {
      projectId: owner.projectId, threadId: owner.threadId, runId: owner.run.id, cursor, limit: 128
    } }));
    const page = await raceWithAbort(loaded, signal);
    if (page.payload.projectId !== owner.projectId || page.payload.threadId !== owner.threadId ||
      page.payload.runId !== owner.run.id) throw new Error("Run detail response ownership mismatch");
    chunks.push(...page.payload.chunks.items);
    totalChunks += page.payload.chunks.items.length;
    if (totalChunks > RUN_DETAIL_MAX_CHUNKS) throw new Error("Run detail response exceeds canonical chunk count");
    for (const chunk of page.payload.chunks.items) {
      totalBytes += new TextEncoder().encode(chunk).byteLength;
      if (totalBytes > RUN_DETAIL_MAX_BYTES) throw new Error("Run detail response exceeds aggregate byte limit");
    }
    const nextCursor = page.payload.chunks.nextCursor;
    if (nextCursor && (page.payload.chunks.items.length === 0 || seenCursors.has(nextCursor)))
      throw new Error("Run detail response did not advance its cursor");
    if (nextCursor) seenCursors.add(nextCursor);
    cursor = nextCursor;
  } while (cursor);
  return JSON.parse(chunks.join(""));
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(new Error("Run detail hydration cancelled"));
  let rejectAbort: (error: Error) => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(new Error("Run detail hydration cancelled"));
  signal.addEventListener("abort", onAbort, { once: true });
  return Promise.race([promise, aborted]).finally(() => signal.removeEventListener("abort", onAbort));
}

export function waitForCondition(predicate: () => boolean, timeoutMs: number = DEFAULT_TEST_EVENT_TIMEOUT_MS, intervalMs: number = 25) {
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      if (predicate()) {
        clearInterval(interval);
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(interval);
        reject(new Error("Timed out waiting for condition"));
      }
    }, intervalMs);
  });
}

export async function runGitOutput(args: string[], cwd: string) {
  const process = spawnBackgroundProcess({
    cmd: ["git", ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `git ${args[0] ?? ""} failed`);
  }
  return stdout;
}
