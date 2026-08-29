import { chatAttachmentSchema, type ChatAttachment } from "@hyperfocus/ai-core/protocol";

export function readPersistedDraftAttachments(key: string | undefined, threadId?: string): ChatAttachment[] {
  const effectiveKey = key ?? findAttachmentDraftKeyForThread(threadId);
  if (!effectiveKey) return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(effectiveKey) ?? "{}");
    if (!parsed || typeof parsed !== "object") return [];
    const attachments = Reflect.get(parsed, "attachments");
    if (!Array.isArray(attachments)) return [];
    return attachments.flatMap((attachment) => {
      const result = chatAttachmentSchema.safeParse(attachment);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

export function persistDraftAttachments(key: string, attachments: ChatAttachment[]) {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    const existing = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    localStorage.setItem(key, JSON.stringify({
      ...existing,
      version: 2,
      attachments,
      cleanupNeeded: attachments.length === 0 ? Reflect.get(existing, "cleanupNeeded") : undefined,
      updatedAt: new Date().toISOString()
    }));
  } catch {
    // Best-effort browser draft persistence.
  }
}

function findAttachmentDraftKeyForThread(threadId?: string) {
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("ai-harness:chat-draft:v2:") && (!threadId || key.endsWith(`:${threadId}`))) return key;
  }
  return undefined;
}
