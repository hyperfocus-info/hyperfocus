import type { Database } from "bun:sqlite";
import { agentEventSchema, agentEventRecipientSchema, agentEventSubjectSchema,
  type AgentEvent, type AgentEventInbox, type AgentEventRecipient } from "@hyperfocus/ai-core/agent-events";

/** Host-owned durable inbox. The host authenticates project/recipient access before calling it.
 * At-least-once delivery, immutable event IDs, explicit acknowledgement, no inference or polling.
 */
export function createAgentEventStore(db: Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS agent_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
    project_id TEXT NOT NULL, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS agent_event_subscriptions(project_id TEXT NOT NULL, recipient_id TEXT NOT NULL,
    subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, PRIMARY KEY(project_id,recipient_id,subject_type,subject_id));
    CREATE TABLE IF NOT EXISTS agent_event_acks(project_id TEXT NOT NULL, recipient_id TEXT NOT NULL, event_id TEXT NOT NULL,
    PRIMARY KEY(project_id,recipient_id,event_id));
    CREATE INDEX IF NOT EXISTS agent_events_subject ON agent_events(project_id,subject_type,subject_id);`);
  const listeners = new Set<() => void>();
  function subscribe(recipient: AgentEventRecipient, subject: AgentEvent["subject"]) {
    agentEventRecipientSchema.parse(recipient); agentEventSubjectSchema.parse(subject);
    db.query("INSERT OR IGNORE INTO agent_event_subscriptions VALUES(?,?,?,?)")
      .run(recipient.projectId, recipient.recipientId, subject.type, subject.id);
  }
  function publish(input: AgentEvent) {
    const event = agentEventSchema.parse(input), data = JSON.stringify(event);
    const prior = db.query<{data: string}, [string]>("SELECT data FROM agent_events WHERE id=?").get(event.id);
    if (prior) { if (prior.data !== data) throw Error("An agent event ID cannot be reused for different evidence."); return; }
    db.query("INSERT INTO agent_events(id,project_id,subject_type,subject_id,data) VALUES(?,?,?,?,?)")
      .run(event.id,event.projectId,event.subject.type,event.subject.id,data);
    // Notifications read after the outer producer transaction commits; rollback cannot deliver phantom evidence.
    queueMicrotask(() => { for (const notify of listeners) notify(); });
  }
  function resume(input: AgentEventRecipient): AgentEventInbox {
    const {projectId,recipientId} = agentEventRecipientSchema.parse(input);
    const rows = db.query<{data: string}, [string,string]>(`SELECT e.data FROM agent_events e JOIN agent_event_subscriptions s
      ON s.project_id=e.project_id AND s.subject_type=e.subject_type AND s.subject_id=e.subject_id
      WHERE s.project_id=?1 AND s.recipient_id=?2 AND NOT EXISTS(SELECT 1 FROM agent_event_acks a
      WHERE a.project_id=?1 AND a.recipient_id=?2 AND a.event_id=e.id) ORDER BY e.sequence LIMIT 101`).all(projectId,recipientId);
    const waiting = db.query<{type: string; id: string}, [string,string]>(`SELECT subject_type AS type,subject_id AS id
      FROM agent_event_subscriptions s WHERE project_id=?1 AND recipient_id=?2 AND NOT EXISTS(SELECT 1 FROM agent_events e
      WHERE e.project_id=s.project_id AND e.subject_type=s.subject_type AND e.subject_id=s.subject_id
        AND COALESCE(json_extract(e.data,'$.terminal'),1)<>0) LIMIT 200`).all(projectId,recipientId);
    return {events: rows.slice(0,100).map(row => agentEventSchema.parse(JSON.parse(row.data))), waiting, hasMore: rows.length > 100};
  }
  function acknowledge(input: AgentEventRecipient, eventId: string) {
    const {projectId,recipientId} = agentEventRecipientSchema.parse(input);
    const allowed = db.query(`SELECT 1 FROM agent_events e JOIN agent_event_subscriptions s ON s.project_id=e.project_id
      AND s.subject_type=e.subject_type AND s.subject_id=e.subject_id WHERE s.project_id=? AND s.recipient_id=? AND e.id=?`).get(projectId,recipientId,eventId);
    if (!allowed) throw Error("Event is outside this recipient's subscriptions.");
    db.query("INSERT OR IGNORE INTO agent_event_acks VALUES(?,?,?)").run(projectId,recipientId,eventId);
  }
  function wait(input: AgentEventRecipient, options: {timeoutMs: number; signal?: AbortSignal}) {
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 55000) throw Error("Invalid event wait deadline.");
    options.signal?.throwIfAborted();
    const initial = resume(input); if (initial.events.length) return Promise.resolve(initial);
    return new Promise<AgentEventInbox>((resolve,reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const release = () => { clearTimeout(timer); listeners.delete(notify); options.signal?.removeEventListener("abort",abort); };
      const abort = () => { release(); reject(options.signal?.reason ?? Error("Agent event wait cancelled.")); };
      const notify = () => {
        try { const value = resume(input); if (value.events.length) { release(); resolve(value); } }
        catch (error) { release(); reject(error); }
      };
      listeners.add(notify); options.signal?.addEventListener("abort",abort,{once:true});
      timer = setTimeout(() => { release(); try { resolve(resume(input)); } catch (error) { reject(error); } },options.timeoutMs);
      if (options.signal?.aborted) abort(); else notify();
    });
  }
  return {subscribe,publish,resume,acknowledge,wait, get waitingConnections() { return listeners.size; }};
}
