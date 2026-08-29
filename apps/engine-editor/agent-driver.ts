import { readFile, writeFile } from "node:fs/promises";
import { parseEditorAgentPlan, type EditorAgentPlan } from "./src/editor-agent-protocol.ts";
import { connectCdpSession, evaluateCdp, requireJsonRecord, type CdpSession } from "./cdp-session.ts";

type CdpTarget = { type?: string; url?: string; webSocketDebuggerUrl?: string };

export type EditorAgentDriverOptions = {
  cdpUrl: string;
  editorUrl?: string;
  planPath?: string;
  outputPath?: string;
};

/** CDP transport for visual/runtime compatibility plans; direct project commands use headless-editor.ts. */
export async function runEditorAgentDriver(options: EditorAgentDriverOptions) {
  const target = await findEditorTarget(options.cdpUrl, options.editorUrl);
  const session = await connectCdpSession(target.webSocketDebuggerUrl);
  try {
    await waitForAgentBridge(session);
    const expression = options.planPath
      ? `globalThis.__hyperfocusEditorAgent.perform(${JSON.stringify(await readPlan(options.planPath))})`
      : "globalThis.__hyperfocusEditorAgent.snapshot()";
    const result = await evaluateCdp(session, expression, { awaitPromise: true });
    const output = `${JSON.stringify(result, null, 2)}\n`;
    if (options.outputPath) await writeFile(options.outputPath, output, "utf8");
    return result;
  } finally {
    session.close("Editor agent handoff complete");
  }
}

async function waitForAgentBridge(session: CdpSession) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await evaluateCdp(session, "globalThis.__hyperfocusEditorAgent?.ready === true && globalThis.__hyperfocusEditorAgent.snapshot().ready === true") === true) return;
    await Bun.sleep(100);
  }
  throw new Error("Timed out waiting for the Hyperfocus Editor agent bridge.");
}

async function readPlan(path: string): Promise<EditorAgentPlan> {
  const text = path === "-" ? await new Response(Bun.stdin.stream()).text() : await readFile(path, "utf8");
  const value: unknown = JSON.parse(text);
  return parseEditorAgentPlan(value);
}

export async function findEditorTarget(cdpUrl: string, editorUrl?: string) {
  const base = cdpUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/json/list`);
  if (!response.ok) throw new Error(`Could not list CDP targets at ${base}: HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new TypeError("CDP target list must be an array.");
  const targets = body.map(parseCdpTarget);
  const target = targets.find((candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl && (!editorUrl || candidate.url?.startsWith(editorUrl)));
  if (!target?.webSocketDebuggerUrl) throw new Error(`No ${editorUrl ? `editor page matching ${editorUrl}` : "page"} is available at ${base}.`);
  return { ...target, webSocketDebuggerUrl: target.webSocketDebuggerUrl };
}

function parseCdpTarget(value: unknown): CdpTarget {
  const target = requireJsonRecord(value, "CDP target");
  return {
    ...(typeof target.type === "string" ? { type: target.type } : {}),
    ...(typeof target.url === "string" ? { url: target.url } : {}),
    ...(typeof target.webSocketDebuggerUrl === "string" ? { webSocketDebuggerUrl: target.webSocketDebuggerUrl } : {}),
  };
}
