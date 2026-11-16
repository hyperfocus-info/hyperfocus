import { createSwarmClient, createSwarmReviewController, describeSwarmActivity, type SwarmFetch } from "@hyperfocus/ai-core/swarm";
import { Button } from "@hyperfocus/ui";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { HARNESS_SESSION_TOKEN_HEADER, readHarnessSessionToken } from "../../transport/harness-session";
import { HarnessSwarmDialog } from "./swarm-dialog";
import { SwarmReviewProvider } from "./review-context";

export function HarnessSwarmLauncher(props: { projectId: string; projectName: string; goal: string; fetch?: SwarmFetch; agentRecipientId?:string }) {
  const lifetime = new AbortController();
  const request: SwarmFetch = (input, init) => (props.fetch ?? fetch)(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, lifetime.signal]) : lifetime.signal, headers: { ...Object.fromEntries(new Headers(init?.headers)), [HARNESS_SESSION_TOKEN_HEADER]: readHarnessSessionToken() } });
  const controller = createSwarmReviewController({ client: createSwarmClient({ fetch: request }), projectId: props.projectId, stream: true, selectLatest: true });
  const [state, setState] = createSignal(controller.snapshot());
  const [open, setOpen] = createSignal(false);
  const unsubscribe = controller.subscribe(() => setState(controller.snapshot()));
  const label = () => describeSwarmActivity(state().runs, state().selectedId).label;
  onMount(() => void controller.refresh());
  onCleanup(() => { unsubscribe(); controller.dispose(); lifetime.abort(); });
  return <SwarmReviewProvider value={controller}>
    <Button tooltip={state().error || "Review the current swarm, steer its work, or prepare a new task"} variant="ghost" size="small" data-test-harness-run-with-swarm="" onClick={() => {setOpen(true);void controller.refresh();}}>{label()}</Button>
    <Show when={open()}><HarnessSwarmDialog projectId={props.projectId} projectName={props.projectName} goal={props.goal} agentRecipientId={props.agentRecipientId} fetch={props.fetch} onClose={() => setOpen(false)} /></Show>
  </SwarmReviewProvider>;
}
