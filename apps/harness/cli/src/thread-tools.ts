import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionAPI } from "@mariozechner/pi-coding-agent";

export type ThreadTools = {
  list(input: { cursor?: string }): unknown;
  read(input: { threadId: string; cursor?: string }): unknown;
  send(input: { threadId: string; message: string; deliveryId: string }): unknown;
};

export function registerThreadTools(pi: ExtensionAPI, tools: ThreadTools, readOnly: boolean) {
  pi.registerTool(defineTool({
    name: "thread_list", label: "List project threads",
    description: "Discover project threads and their parent/subagent lineage. Returns your own thread ID. Follow nextCursor for more.",
    parameters: Type.Object({ cursor: Type.Optional(Type.String()) }),
    async execute(_id, input) { return result(await tools.list(input)); }
  }));
  pi.registerTool(defineTool({
    name: "thread_read", label: "Read thread",
    description: "Read a bounded page of a project thread, including attributed messages from other threads. Follow nextCursor for older messages.",
    parameters: Type.Object({ threadId: Type.String(), cursor: Type.Optional(Type.String()) }),
    async execute(_id, input) { return result(await tools.read(input)); }
  }));
  if (readOnly) return;
  pi.registerTool(defineTool({
    name: "thread_send", label: "Message another thread",
    description: "Send an attributed message to another thread in this project and queue a recipient turn. Idle recipients start automatically; busy recipients run the follow-up when available. Existing approval gates apply. Use the same UUID deliveryId when retrying a send.",
    parameters: Type.Object({ threadId: Type.String(), message: Type.String({ minLength: 1, maxLength: 16000 }), deliveryId: Type.String({ format: "uuid" }) }),
    async execute(_id, input) { return result(await tools.send(input)); }
  }));
}

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }], details: {} };
}
