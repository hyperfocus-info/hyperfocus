import { createSwarmClient, type SwarmFetch } from "@hyperfocus/ai-core/swarm";
import { Button, SelectControl, typography } from "@hyperfocus/ui";
import * as stylex from "@stylexjs/stylex";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { HARNESS_SESSION_TOKEN_HEADER, readHarnessSessionToken } from "../../transport/harness-session";
import { Toaster } from "../toaster";
import { HarnessSwarmDialog } from "./swarm-dialog";
import { styles } from "../../app/app.styles";

/** A static view served by the existing authenticated Harness host. No cloud token enters the browser. */
export function SwarmPage() {
  const query = new URLSearchParams(location.search);
  const [projectId, setProjectId] = createSignal(query.get("projectId") ?? "");
  const [projects, setProjects] = createSignal<{id:string;name:string}[]>([]);
  const [error, setError] = createSignal("");
  const lifetime = new AbortController();
  const request: SwarmFetch = (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, lifetime.signal]) : lifetime.signal, headers: { ...Object.fromEntries(new Headers(init?.headers)), [HARNESS_SESSION_TOKEN_HEADER]: readHarnessSessionToken() } });
  onMount(() => void createSwarmClient({fetch:request}).capabilities().then(value => {
    setProjects(value.projects);
    if (!projectId()) setProjectId(value.projects[0]?.id ?? "");
    if (!value.available) setError(value.reason ?? "Coordinator unavailable.");
  }).catch(cause => { if (!lifetime.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); }));
  onCleanup(() => lifetime.abort());
  return <div {...stylex.attrs(styles.appShell, typography.body)} data-test-swarm-site="">
    <div {...stylex.attrs(styles.appContent)}>
      <header {...stylex.attrs(styles.commandBar)}>
        <Button variant="secondary" size="small" tooltip="Return to the Harness workspace" onClick={() => location.assign("/")}>Open Harness</Button>
        <Show when={projects().length > 1}><SelectControl ariaLabel="Swarm project" value={projectId()} options={projects().map(project => ({value:project.id,label:project.name}))} onChange={setProjectId} /></Show>
      </header>
      <Show when={projectId()} keyed fallback={<p role="status">{error() || "Loading authorized projects..."}</p>}>{id => <HarnessSwarmDialog projectId={id} projectName={projects().find(project => project.id === id)?.name ?? "Current project"} goal="" initialRunId={query.get("runId") ?? undefined} presentation="page" onClose={() => location.assign("/")} />}</Show>
    </div><Toaster />
  </div>;
}
