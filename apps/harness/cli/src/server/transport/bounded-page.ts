import { SERVER_EVENT_EMIT_MAX_BYTES } from "@hyperfocus/ai-core/protocol";

type Page<Item extends { id: string }> = { items: Item[]; nextCursor?: string; totalApprox?: number;
  unavailableItems?: { id: string; reason: "item-too-large"; projectId?: string; jobId?: string }[] };

export function fitBoundedPage<Item extends { id: string }>(load: (limit: number) => Page<Item>, requestedLimit: number,
  envelope: (page: Page<Item>) => unknown, byteBudget = SERVER_EVENT_EMIT_MAX_BYTES) {
  let limit = Math.max(1, requestedLimit); let page = load(limit);
  const size = () => new TextEncoder().encode(JSON.stringify(envelope(page))).byteLength;
  while (size() > byteBudget && limit > 1) { limit = Math.max(1, Math.floor(limit / 2)); page = load(limit); }
  if (size() > byteBudget && page.items[0]) { const item = page.items[0]; page = { ...page, unavailableItems: [{ id: item.id,
    reason: "item-too-large", ...("projectId" in item && typeof item.projectId === "string" ? { projectId: item.projectId } : {}),
    ...("jobId" in item && typeof item.jobId === "string" ? { jobId: item.jobId } : {}) }], items: [] }; }
  return page;
}
