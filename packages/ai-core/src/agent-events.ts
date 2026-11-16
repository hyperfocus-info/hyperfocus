import { z } from "zod";

const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/);
export const agentEventSubjectSchema = z.object({ type: id, id }).strict();
export const agentEventSchema = z.object({
  schema: z.literal("hyperfocus-agent-event-v1"), id, projectId: id,
  subject: agentEventSubjectSchema, kind: id, occurredAt: z.number().int().nonnegative(),
  // Existing one-shot result events are terminal. Progress producers explicitly
  // keep their subject waiting until a later terminal event arrives.
  terminal: z.boolean().optional(),
  summary: z.string().min(1).max(4000),
  // References retain the producer's access checks; events never carry credentials or executable instructions.
  resultPath: z.string().startsWith("/api/").max(1000),
  artifacts: z.array(z.object({ id, name: z.string().max(240), sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().nonnegative(), path: z.string().startsWith("/api/").max(1000) }).strict()).max(256),
}).strict();
export type AgentEvent = z.infer<typeof agentEventSchema>;
export const agentEventRecipientSchema = z.object({ projectId: id, recipientId: id }).strict();
export type AgentEventRecipient = z.infer<typeof agentEventRecipientSchema>;
export const agentEventInboxSchema = z.object({ events: z.array(agentEventSchema).max(100),
  waiting: z.array(agentEventSubjectSchema).max(200), hasMore: z.boolean() }).strict();
export type AgentEventInbox = z.infer<typeof agentEventInboxSchema>;

/** Resume is one read. Wait is a server-held event callback, never a client polling loop.
 * Hosts acknowledge only after durably incorporating an event into the agent's context.
 */
export function createAgentEventClient(options: { baseUrl: string; fetch?: (input:string|URL|Request,init?:RequestInit)=>Promise<Response> }) {
  const request = options.fetch ?? fetch;
  async function call(action: string, input: unknown, signal?: AbortSignal) {
    const response = await request(`${options.baseUrl}/${action}`, { method: "POST", redirect: "error", signal,
      headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    if (!response.ok) throw Error(`Agent events ${action} failed (${response.status}).`);
    return response.json();
  }
  return {
    async resume(recipient: AgentEventRecipient, signal?: AbortSignal) {
      return agentEventInboxSchema.parse(await call("resume", agentEventRecipientSchema.parse(recipient), signal));
    },
    async wait(recipient: AgentEventRecipient, options: { timeoutMs?: number; signal?: AbortSignal;
      onEvent?: (event: AgentEvent) => void | Promise<void> } = {}) {
      const inbox = agentEventInboxSchema.parse(await call("wait", { ...agentEventRecipientSchema.parse(recipient),
        timeoutMs: z.number().int().min(1).max(55000).parse(options.timeoutMs ?? 55000) }, options.signal));
      for (const event of inbox.events) await options.onEvent?.(event);
      return inbox;
    },
    async acknowledge(recipient: AgentEventRecipient, eventId: string, signal?: AbortSignal) {
      await call("acknowledge", { ...agentEventRecipientSchema.parse(recipient), eventId: id.parse(eventId) }, signal);
    },
  };
}
