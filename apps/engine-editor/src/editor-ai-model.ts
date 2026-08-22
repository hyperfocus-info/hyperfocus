import type { HarnessClientSnapshot, ServerEvent } from "@hyperfocus/ai-core";
import type { TranscriptMessage } from "@hyperfocus/ui";

export function transcriptFromSnapshot(snapshot: HarnessClientSnapshot): TranscriptMessage[] {
  const project = snapshot.workspace?.projects.find((candidate) => candidate.id === snapshot.workspace?.activeProjectId);
  return (project?.session.messages ?? []).map((message) => ({ id: message.id, role: message.role, content: message.content }));
}

export function reduceTranscript(messages: readonly TranscriptMessage[], event: ServerEvent): TranscriptMessage[] {
  if (event.type === "chat.message-appended" || event.type === "thread.message-appended") {
    const message = event.payload.message;
    return upsert(messages, { id: message.id, role: message.role, content: message.content });
  }
  if (event.type === "chat.message-updated" || event.type === "thread.message-updated") {
    const message = event.payload.message;
    return upsert(messages, { id: message.id, role: message.role, content: message.content });
  }
  if (event.type === "chat.delta") {
    const id = `stream-${event.requestId}`;
    const previous = messages.find((message) => message.id === id);
    return upsert(messages, { id, role: "assistant", content: `${previous?.content ?? ""}${event.payload.delta}`, pending: true });
  }
  if (event.type === "chat.complete") {
    const withoutStreams = messages.filter((message) => !message.id.startsWith("stream-"));
    const message = event.payload.assistantMessage;
    return upsert(withoutStreams, { id: message.id, role: message.role, content: message.content });
  }
  return [...messages];
}

function upsert(messages: readonly TranscriptMessage[], next: TranscriptMessage) {
  const index = messages.findIndex((message) => message.id === next.id);
  if (index < 0) return [...messages, next];
  return messages.map((message, messageIndex) => messageIndex === index ? next : message);
}
