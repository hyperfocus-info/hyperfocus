export type PagingUnavailableCollection = "jobs" | "runs" | "notifications" | "projects" |
  "filePaths" | "threads" | "messages" | "runSummaries";
export type PagingUnavailableItem = { collection: PagingUnavailableCollection; id: string;
  reason: "item-too-large"; projectId?: string; jobId?: string };

export function mergePagingUnavailableItems(existing: PagingUnavailableItem[], incoming: PagingUnavailableItem[]) {
  const items = new Map(existing.map((item) => [`${item.projectId ?? "global"}:${item.collection}:${item.id}`, item]));
  incoming.forEach((item) => items.set(`${item.projectId ?? "global"}:${item.collection}:${item.id}`, item));
  return [...items.values()];
}

export function clearAvailablePagingItems(existing: PagingUnavailableItem[], collection: PagingUnavailableCollection,
  ids: string[], projectId?: string) {
  const available = new Set(ids);
  const globallyOwned = collection === "jobs" || collection === "runs" || collection === "notifications";
  return existing.filter((item) => item.collection !== collection || (!globallyOwned && item.projectId !== projectId) ||
    !available.has(item.id));
}

export function createPagingUnavailableCallbacks(options: {
  get: () => PagingUnavailableItem[];
  set: (items: PagingUnavailableItem[]) => void;
  notify: (collection: PagingUnavailableCollection, count: number) => void;
}) {
  return {
    unavailable(collection: PagingUnavailableCollection, ids: string[], projectId?: string) {
      options.set(mergePagingUnavailableItems(options.get(), ids.map((id) => ({ collection, id, projectId,
        reason: "item-too-large" }))));
      options.notify(collection, ids.length);
    },
    unavailableEntries(collection: PagingUnavailableCollection,
      entries: Array<{ id: string; reason: "item-too-large"; projectId?: string; jobId?: string }>) {
      options.set(mergePagingUnavailableItems(options.get(), entries.map((entry) => ({ ...entry, collection }))));
      options.notify(collection, entries.length);
    },
    available(collection: PagingUnavailableCollection, ids: string[], projectId?: string) {
      options.set(clearAvailablePagingItems(options.get(), collection, ids, projectId));
    },
    reconciled(collection: PagingUnavailableCollection, retainedIds: string[], projectId?: string) {
      const retained = new Set(retainedIds); const globallyOwned = collection === "jobs" || collection === "runs" || collection === "notifications";
      options.set(options.get().filter((item) => item.collection !== collection || (!globallyOwned && item.projectId !== projectId) ||
        retained.has(item.id)));
    },
    backgroundDeleted(jobIds: string[], projectIds: string[]) { const jobs = new Set(jobIds); const projects = new Set(projectIds);
      options.set(options.get().filter((item) => !jobs.has(item.id) && !jobs.has(item.jobId ?? "") &&
        !projects.has(item.projectId ?? ""))); },
    projectDeleted(projectId: string) { options.set(options.get().filter((item) => item.projectId !== projectId)); }
  };
}

export function retryUnavailablePagingItems(items: PagingUnavailableItem[], retry: {
  ready: (collections: ReadonlySet<"jobs" | "runs" | "notifications">) => void;
  workspace: (collections: ReadonlySet<"projects" | "filePaths" | "threads" | "messages" | "runSummaries">,
    projectId?: string) => void;
}) {
  retry.ready(new Set(items.flatMap(({ collection }) => collection === "jobs" || collection === "runs" ||
    collection === "notifications" ? [collection] : [])));
  for (const projectId of new Set(items.flatMap(({ projectId }) => projectId ? [projectId] : []))) retry.workspace(new Set(
    items.flatMap((item) => item.projectId === projectId && item.collection !== "jobs" && item.collection !== "runs" &&
      item.collection !== "notifications" ? [item.collection] : [])), projectId);
  if (items.some(({ collection }) => collection === "projects")) retry.workspace(new Set(["projects"]));
}
