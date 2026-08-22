import { readFile, writeFile } from "node:fs/promises";
import type { EditorAgentHandoff, EditorAgentPlan, EditorAgentSnapshot } from "./src/editor-agent-protocol.ts";

type JsonRecord = Record<string, unknown>;
type CdpTarget = { type?: string; url?: string; webSocketDebuggerUrl?: string };

export type EditorAgentDriverOptions = {
  cdpUrl: string;
  editorUrl?: string;
  planPath?: string;
  outputPath?: string;
};

export async function runEditorAgentDriver(options: EditorAgentDriverOptions) {
  const target = await findEditorTarget(options.cdpUrl, options.editorUrl);
  const session = await CdpSession.connect(target.webSocketDebuggerUrl!);
  try {
    await waitForAgentBridge(session);
    const expression = options.planPath
      ? `globalThis.__hyperfocusEditorAgent.perform(${JSON.stringify(await readPlan(options.planPath))})`
      : "globalThis.__hyperfocusEditorAgent.snapshot()";
    const result = await session.evaluate<EditorAgentHandoff | EditorAgentSnapshot>(expression, true);
    const output = `${JSON.stringify(result, null, 2)}\n`;
    if (options.outputPath) await writeFile(options.outputPath, output, "utf8");
    return result;
  } finally {
    session.close();
  }
}

async function waitForAgentBridge(session: CdpSession) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await session.evaluate<boolean>("globalThis.__hyperfocusEditorAgent?.ready === true && globalThis.__hyperfocusEditorAgent.snapshot().ready === true", false)) return;
    await Bun.sleep(100);
  }
  throw new Error("Timed out waiting for the Hyperfocus Editor agent bridge.");
}

async function readPlan(path: string): Promise<EditorAgentPlan> {
  const text = path === "-" ? await new Response(Bun.stdin.stream()).text() : await readFile(path, "utf8");
  return JSON.parse(text) as EditorAgentPlan;
}

export async function findEditorTarget(cdpUrl: string, editorUrl?: string) {
  const base = cdpUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/json/list`);
  if (!response.ok) throw new Error(`Could not list CDP targets at ${base}: HTTP ${response.status}`);
  const targets = await response.json() as CdpTarget[];
  const target = targets.find((candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl && (!editorUrl || candidate.url?.startsWith(editorUrl)));
  if (!target?.webSocketDebuggerUrl) throw new Error(`No ${editorUrl ? `editor page matching ${editorUrl}` : "page"} is available at ${base}.`);
  return target as Required<Pick<CdpTarget, "webSocketDebuggerUrl">> & CdpTarget;
}

class CdpSession {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => this.accept(String(event.data)));
    socket.addEventListener("close", () => this.rejectAll(new Error("CDP connection closed.")));
    socket.addEventListener("error", () => this.rejectAll(new Error("CDP connection failed.")));
  }

  static async connect(url: string) {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out connecting to CDP.")), 10_000);
      socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Could not connect to CDP.")); }, { once: true });
    });
    return new CdpSession(socket);
  }

  async evaluate<T>(expression: string, awaitPromise: boolean): Promise<T> {
    const response = await this.command("Runtime.evaluate", { expression, awaitPromise, returnByValue: true, userGesture: true }) as { result?: { value?: T }; exceptionDetails?: unknown };
    if (response.exceptionDetails) throw new Error(`Editor agent evaluation failed: ${JSON.stringify(response.exceptionDetails)}`);
    return response.result?.value as T;
  }

  command(method: string, params: JsonRecord) {
    const id = this.nextId++;
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP command timed out: ${method}`)); }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  close() { this.socket.close(1000, "Editor agent handoff complete"); }

  private accept(message: string) {
    const packet = JSON.parse(message) as { id?: number; result?: unknown; error?: unknown };
    if (typeof packet.id !== "number") return;
    const pending = this.pending.get(packet.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(packet.id);
    if (packet.error) pending.reject(new Error(JSON.stringify(packet.error)));
    else pending.resolve(packet.result);
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }
}
