import type { WorkspaceFileChangeEvent, WorkspaceFileSystem } from "./workspace";

/** Creates a fresh disposable adapter for each scenario; cleanup also runs after failure. */
export async function verifyWorkspaceFileSystem(options: {
  create: () => Promise<{ filesystem: WorkspaceFileSystem; close: () => void | Promise<void> }>
    | { filesystem: WorkspaceFileSystem; close: () => void | Promise<void> };
}) {
  const scenarios = [
    ["staleAtomicBatch", staleAtomicBatch],
    ["deleteRecreate", deleteRecreate],
    ["watcherIsolationAndOrder", watcherIsolationAndOrder],
  ] as const;
  const checks: string[] = [];
  for (const [name, scenario] of scenarios) {
    const host = await options.create();
    try {
      requireCondition((await host.filesystem.listFiles()).length === 0, "factory must return an empty workspace");
      await scenario(host.filesystem);
      checks.push(name);
    } catch (cause) {
      throw new Error(`Workspace conformance: ${name}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    } finally {
      await host.close();
    }
  }
  return { passed: true as const, checks };
}

async function staleAtomicBatch(fs: WorkspaceFileSystem) {
  const original = await fs.writeFile({ path: "article", contents: "original", expectedRevision: 0 });
  if (original.status !== "written") throw new Error("initial create failed");
  const revision = original.snapshot.revision;
  const current = await fs.writeFile({ path: "article", contents: "current", expectedRevision: revision });
  if (current.status !== "written") throw new Error("current revision write failed");
  const events: WorkspaceFileChangeEvent[] = [];
  const stop = fs.watch(event => events.push(event));
  try {
    const failed = await fs.writeFilesAtomic({ writes: [
      { path: "release", contents: "must not commit", expectedRevision: 0 },
      { path: "article", contents: "stale", expectedRevision: revision },
    ] });
    requireCondition(failed.status === "conflict", "stale batch must conflict");
    if (failed.status !== "conflict") return;
    const conflict = failed.conflicts.find(item => item.path === "article");
    requireCondition(conflict?.expectedRevision === revision && conflict.current?.contents === "current"
      && conflict.current.revision === current.snapshot.revision, "conflict must include the current snapshot");
    const after = await fs.readFile({ path: "article" });
    requireCondition(after?.contents === "current" && after.revision === current.snapshot.revision, "stale batch changed existing content or revision");
    requireCondition(await fs.readFile({ path: "release" }) === undefined, "stale batch partially created a file");
    requireCondition(events.length === 0, "rejected batch emitted a mutation event");
  } finally { stop(); }
}

async function deleteRecreate(fs: WorkspaceFileSystem) {
  const first = await fs.writeFile({ path: "article", contents: "first", expectedRevision: 0 });
  if (first.status !== "written") throw new Error("initial create failed");
  const deleted = await fs.deleteFile({ path: "article", expectedRevision: first.snapshot.revision });
  requireCondition(deleted.status === "deleted", "delete failed");
  if (deleted.status !== "deleted") return;
  requireCondition(deleted.revision > first.snapshot.revision, "delete must advance the revision");
  requireCondition(await fs.readFile({ path: "article" }) === undefined, "deleted file is still readable");
  const next = await fs.writeFile({ path: "article", contents: "next generation", expectedRevision: 0 });
  requireCondition(next.status === "written", "create-only write must recreate a deleted file");
  if (next.status !== "written") return;
  requireCondition(next.snapshot.revision > deleted.revision, "recreation reset the per-path revision");
  const stale = await fs.writeFile({ path: "article", contents: "old generation", expectedRevision: first.snapshot.revision });
  requireCondition(stale.status === "conflict", "old generation overwrote a recreated file");
  requireCondition((await fs.readFile({ path: "article" }))?.contents === "next generation", "stale write changed the recreated file");
}

async function watcherIsolationAndOrder(fs: WorkspaceFileSystem) {
  const events: WorkspaceFileChangeEvent[] = [];
  let nested: ReturnType<WorkspaceFileSystem["writeFile"]> | undefined;
  const stops = [
    fs.watch(event => { Reflect.set(event, "sequence", -1); throw new Error("failing observer"); }),
    fs.watch(event => {
      if (event.type === "created" && event.path === "article") nested = fs.writeFile({ path: "index", contents: "derived", expectedRevision: 0 });
    }),
    fs.watch(event => events.push(event)),
  ];
  try {
    const batch = await fs.writeFilesAtomic({ writes: [
      { path: "article", contents: "release", expectedRevision: 0 },
      { path: "metadata", contents: "published", expectedRevision: 0 },
    ] });
    requireCondition(batch.status === "written", "failing watcher interrupted the commit");
    requireCondition(nested !== undefined, "failing watcher prevented another subscriber from running");
    const derived = await nested;
    requireCondition(derived?.status === "written", "watcher-triggered write failed");
    requireCondition(events.map(event => event.type === "invalidated" ? "invalidated" : event.path).join(",") === "article,metadata,index", "watcher-triggered writes interleaved the committed batch");
    requireCondition(events.every((event, index) => event.sequence > 0
      && (index === 0 || event.sequence === (events[index - 1]?.sequence ?? 0) + 1)), "watcher mutation must not corrupt another subscriber's ordered events");
    requireCondition((await fs.readFile({ path: "article" }))?.contents === "release"
      && (await fs.readFile({ path: "metadata" }))?.contents === "published", "watcher failure corrupted committed content");
  } finally { for (const stop of stops) stop(); }
}

function requireCondition(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}
