import { swarmCapabilitiesSchema, swarmContextSchema, type SwarmRun } from "@hyperfocus/ai-core/swarm";
import type { SwarmStore } from "../persistence/store";
import type { SwarmBrowserAccess } from "./sessions";

const MAX_ANCESTORS = 64;
const LIST_LIMIT = 200;
export function createSwarmBrowserScope(options: { store: SwarmStore; name: (projectId: string) => string | undefined }) {
  const { store } = options;
  function lineage(access: SwarmBrowserAccess, id: string) {
    const root = store.get(access.runId), requested = store.get(id);
    if (!root || !requested || root.request.projectId !== access.projectId || !options.name(access.projectId)) throw Error("Run access denied.");
    const seen = new Set<string>();
    let current: SwarmRun | undefined = requested;
    for (let depth = 0; current && depth < MAX_ANCESTORS; depth++) {
      if (seen.has(current.id) || current.request.projectId !== access.projectId || current.request.repository.revision !== root.request.repository.revision || current.request.repository.sourceArtifactId !== root.request.repository.sourceArtifactId) break;
      if (current.id === root.id) return { run: requested, depth };
      seen.add(current.id);
      current = current.parentRunId ? store.get(current.parentRunId) : undefined;
    }
    throw Error("Run access denied.");
  }
  function run(access: SwarmBrowserAccess, id: string) { return lineage(access, id).run; }
  function assertFollowUp(access: SwarmBrowserAccess, id: string) {
    if (lineage(access, id).depth + 1 >= MAX_ANCESTORS) throw Error("This browser link has reached its follow-up depth limit. Create a new scoped link from the trusted host.");
  }
  function list(access: SwarmBrowserAccess) {
    const root = run(access, access.runId);
    const rows = store.db.query<{ id: string }, [string, string, string, number]>(`WITH RECURSIVE descendants(id) AS (
      SELECT id FROM swarm_runs WHERE id=? AND project_id=? UNION
      SELECT child.id FROM swarm_runs child JOIN descendants parent ON json_extract(child.data,'$.parentRunId')=parent.id WHERE child.project_id=?
    ) SELECT id FROM swarm_runs WHERE id IN descendants ORDER BY json_extract(data,'$.createdAt') DESC LIMIT ?`).all(root.id, access.projectId, access.projectId, LIST_LIMIT);
    const children: SwarmRun[] = [];
    for (const row of rows) {
      if (row.id === root.id) continue;
      try { children.push(run(access, row.id)); }
      catch { /* Invalid or out-of-scope descendants do not disclose data or hide the root. */ }
    }
    return [root, ...children].slice(0, LIST_LIMIT);
  }
  function context(access: SwarmBrowserAccess, capabilities: unknown) {
    const root = run(access, access.runId), available = swarmCapabilitiesSchema.parse(capabilities);
    return swarmContextSchema.parse({ projectId: access.projectId, name: options.name(access.projectId), repository: root.request.repository,
      dirty: false, sourceSnapshotRequired: false, provider: { available: available.available, reason: available.reason } });
  }
  function capabilities(access: SwarmBrowserAccess, value: unknown) {
    run(access, access.runId);
    const available = swarmCapabilitiesSchema.parse(value);
    return { ...available, projects: available.projects.filter(project => project.id === access.projectId) };
  }
  return { run, list, context, capabilities, assertFollowUp };
}
