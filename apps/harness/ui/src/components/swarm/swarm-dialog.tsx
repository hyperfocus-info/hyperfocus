import { applySwarmSuggestedFields, canApproveSwarmCandidate, createSwarmClient, createSwarmRequestSchema, createSwarmReviewController, describeSwarmRun, swarmStatusLabel, type SwarmCandidate } from "@hyperfocus/ai-core/swarm";
import { Button, Disclosure } from "@hyperfocus/ui";
import { TaskAccessLink, TaskRequestForm, TaskReviewArtifactPreview, TaskReviewArtifacts, TaskReviewCandidates, TaskReviewDialog, TaskReviewEvents, TaskReviewFacts, TaskReviewOutcome, TaskReviewProgress, type TaskRequestField } from "@hyperfocus/ui/task-review";
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { SwarmFetch } from "@hyperfocus/ai-core/swarm";
import { formatShortTimestamp } from "../../lib/time-format";
import { pushToast } from "../../toast-store";
import { HARNESS_SESSION_TOKEN_HEADER, readHarnessSessionToken } from "../../transport/harness-session";
import { describeSwarmConversation } from "@hyperfocus/ai-core/swarm";
import { TaskCampaignConversation } from "@hyperfocus/ui/task-review";
import { ConnectionAccessLink } from "@hyperfocus/ui/connections";
import { useSwarmReviewController } from "./review-context";

export function HarnessSwarmDialog(props: { projectId: string; projectName: string; goal: string; onClose: () => void; fetch?: SwarmFetch; presentation?: "dialog" | "page"; initialRunId?: string; agentRecipientId?:string; remote?: {access:"view"|"control";baseUrl:string} }) {
  const lifetime = new AbortController();
  const authorizedFetch: SwarmFetch = (input, init) => (props.fetch ?? fetch)(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, lifetime.signal]) : lifetime.signal, headers: { ...Object.fromEntries(new Headers(init?.headers)), ...(!props.remote ? { [HARNESS_SESSION_TOKEN_HEADER]: readHarnessSessionToken() } : {}) } });
  const client = createSwarmClient({ fetch: authorizedFetch, baseUrl:props.remote?.baseUrl });
  const sharedController = useSwarmReviewController();
  const controller = sharedController ?? createSwarmReviewController({ client, projectId: props.projectId, stream: props.presentation === "page", issueAccessOnStart:!props.remote, onError: message => pushToast("Swarm request failed", message) });
  const [state, setState] = createSignal(controller.snapshot());
  const unsubscribe = controller.subscribe(() => setState(controller.snapshot()));
  const editedFields = new Set<string>();
  const [draft, setDraft] = createSignal<Record<string, string>>(applySwarmSuggestedFields({ goal: props.goal, strategy: "tournament", backend: "railway", maxWorkers: "3", minutes: "60", compute: "5", model: "0", calls: "24", tokens: "100000", taskMinutes: "10", retries: "1", priority: "5", revision: "", mode: "auto", difficulty: "auto", doneCriteria: "Preserve attributable findings and independent correctness evidence.\nCompare candidates honestly and retain unresolved promotion blockers.", totalTokens: "500000", weeklyQuota: "20" }, editedFields));
  const [steering, setSteering] = createSignal("");
  const [followUp, setFollowUp] = createSignal("");
  const [followUpCriteria, setFollowUpCriteria] = createSignal("");
  const [localError, setLocalError] = createSignal("");
  const [artifactBusy, setArtifactBusy] = createSignal(false);
  const [preview, setPreview] = createSignal<{ id: string; label: string; text?: string; url?: string; mediaType?: "image" | "video" }>();
  let previewUrl: string | undefined;
  let artifactEpoch = 0;
  const selected = createMemo(() => state().runs.find(run => run.id === state().selectedId));
  const description = createMemo(() => selected() ? describeSwarmRun(selected()!) : undefined);
  const conversation = createMemo(() => selected() ? describeSwarmConversation(selected()!) : undefined);
  const busy = () => state().loading || state().pending;
  const archived = () => Boolean(state().capabilities?.archive);
  const canControl = () => props.remote?.access !== "view" && !archived();
  const available = () => (state().capabilities?.available||state().capabilities?.canQueue) && state().context?.provider.available;
  const changed = (id: string, value: string) => { editedFields.add(id); setDraft(current => { const next = { ...current, [id]: value }; return id === "goal" || id === "difficulty" ? applySwarmSuggestedFields(next, editedFields) : next; }); };
  createEffect(() => { const revision = state().context?.repository.revision; if (revision && !draft().revision) changed("revision", revision); });
  createEffect(() => { if (!editedFields.has("executionMode") && state().capabilities?.projects.some(project => project.id === props.projectId && project.campaign)) setDraft(current => current.executionMode === "campaign" ? current : {...current,executionMode:"campaign"}); });
  const resetPreview = () => { artifactEpoch++; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = undefined; setPreview(undefined); setArtifactBusy(false); };
  let previewRunId = "";
  createEffect(() => { const id = state().selectedId; if (id !== previewRunId) { previewRunId = id; resetPreview(); } });
  onMount(() => { void controller.refresh().then(() => { if (!lifetime.signal.aborted && props.initialRunId) controller.select(props.initialRunId); }); });
  onCleanup(() => { lifetime.abort(); unsubscribe(); if (!sharedController) controller.dispose(); resetPreview(); });

  const fields = (): TaskRequestField[] => [
    { id: "goal", label: "Engineering goal", value: draft().goal ?? "", kind: "multiline", required: true, maxLength: 20_000 },
    { id: "executionMode", label: "Work mode", value: draft().executionMode ?? "bounded", kind: "choice", options: [{value:"campaign",label:"Adaptive campaign",description:"Keep choosing useful work within one time and cost budget."},{value:"bounded",label:"Single investigation or comparison"}] },
    { id: "strategy", label: "Execution strategy", value: draft().strategy!, kind: "choice", options: [{ value: "tournament", label: "Compare three independent candidates" }, { value: "investigation", label: "Investigate and preserve findings" }] },
    { id: "mode", label: "Intelligence mode", value: draft().mode!, kind: "choice", options: [{ value: "auto", label: "Auto - match implementation to difficulty" }, { value: "value", label: "Value - configured efficient implementation" }, { value: "max-intelligence", label: "Maximum intelligence - no downgrade" }] },
    { id: "doneCriteria", label: "Done when", value: draft().doneCriteria!, kind: "multiline", required: true, maxLength: 12000, description: "One verifiable completion criterion per line. Unmet criteria remain visible in the final review." },
    { id: "difficulty", label: "Task difficulty", description: "Goal-based suggestions fill worker and usage limits until you edit them. The planner still qualifies difficulty.", value: draft().difficulty!, kind: "choice", advanced: true, options: [{ value: "auto", label: "Auto - planner assesses complexity" }, { value: "bounded", label: "Bounded" }, { value: "complex", label: "Complex" }] },
    { id: "totalTokens", label: "Total run token ceiling", value: draft().totalTokens!, kind: "number", min: 256, max: 10000000, step: 1, advanced: true, required: true },
    { id: "weeklyQuota", label: "Weekly quota allocation (%)", value: draft().weeklyQuota!, kind: "number", min: 1, max: 100, step: 1, advanced: true, required: true, description: "Allowed percentage-point increase from the first shared account quota observation. Other account activity may count; provider snapshots are approximate and the account safety stop still applies." },
    { id: "revision", label: "Base Git revision", value: draft().revision!, kind: "text", required: true, maxLength: 64, description: "An immutable commit. Current working files are captured in a source snapshot; ignored generated files are excluded." },
    { id: "backend", label: "Execution backend", value: draft().backend!, kind: "choice", advanced: true, options: [{ value: "railway", label: "Railway cloud", description: "Remote execution; never falls back to this computer." }, { value: "local", label: "Local execution", description: "Explicitly uses the coordinator's own resources.", disabled: !state().capabilities?.backends.includes("local") }] },
    { id: "maxWorkers", label: "Concurrent workers", value: draft().maxWorkers!, kind: "number", min: 1, max: state().capabilities?.maxWorkers ?? 3, step: 1, advanced: true, required: true },
    { id: "minutes", label: "Run limit (minutes)", value: draft().minutes!, kind: "number", min: 1, max: 1440, step: 1, advanced: true, required: true },
    { id: "compute", label: "Cloud compute budget (USD)", value: draft().compute!, kind: "number", min: 0, max: 10, step: 0.01, advanced: true, required: true, description: "Run target $3–5; authorized hard ceiling $10." },
    { id: "model", label: "Separate inference billing limit (USD)", value: draft().model!, kind: "number", min: 0, max: 0, step: 0.01, advanced: true, required: true, description: state().capabilities?.inference ? `${state().capabilities!.inference!.provider} · ${state().capabilities!.inference!.credentialSource}. $0 separate API billing; account usage limits apply.` : "Default: existing Codex subscription. $0 separate API billing; account usage limits apply." },
    { id: "calls", label: "Calls per agent", value: draft().calls!, kind: "number", min: 1, max: 200, step: 1, advanced: true, required: true },
    { id: "tokens", label: "Tokens per agent", value: draft().tokens!, kind: "number", min: 256, max: 2_000_000, step: 1, advanced: true, required: true },
    { id: "taskMinutes", label: "Task limit (minutes)", value: draft().taskMinutes!, kind: "number", min: 1, max: 60, step: 1, advanced: true, required: true },
    { id: "retries", label: "Retries per task", value: draft().retries!, kind: "number", min: 0, max: 3, step: 1, advanced: true, required: true },
    { id: "priority", label: "Priority (0–10)", value: draft().priority!, kind: "number", min: 0, max: 10, step: 1, advanced: true, required: true },
  ];

  async function submit() {
    setLocalError("");
    const context = state().context;
    if (props.remote || !canControl() || !context || !available()) return;
    try {
      await controller.create(createSwarmRequestSchema.parse({ requestId: crypto.randomUUID(), projectId: props.projectId, agentRecipientId:props.agentRecipientId, goal: draft().goal, repository: { ...context.repository, revision: draft().revision }, executionMode: draft().executionMode ?? "bounded", strategy: draft().strategy, mode: draft().mode, difficulty: draft().difficulty, doneCriteria: draft().doneCriteria!.split(/\r?\n/).map(value => value.trim()).filter(Boolean), backend: draft().backend, maxWorkers: Number(draft().maxWorkers), reviewPlan: true, priority: Number(draft().priority), budget: { maxTotalTokens: Number(draft().totalTokens), maxWeeklyQuotaPercent: Number(draft().weeklyQuota), maxDurationMs: Number(draft().minutes) * 60_000, maxComputeUsd: Number(draft().compute), maxModelUsd: Number(draft().model), maxCallsPerAgent: Number(draft().calls), maxTokensPerAgent: Number(draft().tokens), maxTaskDurationMs: Number(draft().taskMinutes) * 60_000, maxRetries: Number(draft().retries) } }));
    } catch (cause) { report(cause); }
  }
  function report(cause: unknown) { const message = cause instanceof Error ? cause.message : String(cause); setLocalError(message); pushToast("Swarm review failed", message); }
  async function inspectArtifact(id: string, download = false) {
    const run = selected();
    const artifact = run?.artifacts.find(value => value.id === id);
    if (!run || !artifact) return;
    resetPreview();
    const epoch = artifactEpoch;
    setArtifactBusy(true);
    setLocalError("");
    try {
      if (artifact.bytes > (download ? 268_435_456 : 33_554_432)) throw new Error(download ? "Use the swarm artifact command for downloads larger than 256 MiB." : "This artifact exceeds the 32 MiB preview limit. Use Download to save it.");
      const response = await authorizedFetch(client.artifactUrl(run.id, artifact.id));
      if (!response.ok) throw new Error(`Artifact request failed (${response.status}).`);
      const bytes = await response.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
      if (hash !== artifact.sha256 || bytes.byteLength !== artifact.bytes) throw new Error("Artifact integrity check failed; review is blocked.");
      if (lifetime.signal.aborted || epoch !== artifactEpoch) return;
      const text = artifact.mediaType.startsWith("text/") || /json|patch|diff/.test(artifact.mediaType) || artifact.kind === "patch";
      if (text || download) {
        previewUrl = URL.createObjectURL(new Blob([bytes], {type:"application/octet-stream"}));
        setPreview({id,label:artifact.name,url:previewUrl,...!download?{text:new TextDecoder().decode(bytes)}:{}});
      }
      else {
        const mediaType = /image\/(png|jpeg|webp|gif)$/.test(artifact.mediaType) ? "image" : /video\/(webm|mp4)$/.test(artifact.mediaType) ? "video" : undefined;
        previewUrl = URL.createObjectURL(new Blob([bytes], { type: mediaType ? artifact.mediaType : "application/octet-stream" }));
        setPreview({ id, label: artifact.name, url: previewUrl, mediaType });
      }
      if(download && previewUrl){const link=document.createElement("a");link.href=previewUrl;link.download=artifact.name;link.click();}
    } catch (cause) { if (!lifetime.signal.aborted && epoch === artifactEpoch) report(cause); }
    finally { if (epoch === artifactEpoch) setArtifactBusy(false); }
  }
  const candidateActions = (candidate: SwarmCandidate) => <>
    <Show when={candidate.patchArtifactId}><Button variant="secondary" size="small" tooltip="Read and verify this candidate's immutable patch" disabled={busy() || artifactBusy()} onClick={() => void inspectArtifact(candidate.patchArtifactId!)}>Review patch</Button></Show>
    <Show when={canControl() && selected()?.status === "AWAITING_APPROVAL"}>
      <Show when={!props.remote}><Button variant="primary" size="small" tooltip={selected()?.outcome && selected()?.outcome?.outcomeSuccess !== "demonstrated" ? "Outcome evidence is not demonstrated; inspect Outcome analysis" : preview()?.id !== candidate.patchArtifactId ? "Review the patch before approval" : "Verify the local base, apply this patch, and rerun its checks"} disabled={busy() || !selected() || !canApproveSwarmCandidate(selected()!, candidate) || preview()?.id !== candidate.patchArtifactId} onClick={() => void controller.action("approve", candidate.id)}>Approve and integrate</Button></Show>
      <Button variant="secondary" size="small" tooltip="Reject this candidate while preserving its evidence" disabled={busy() || candidate.disposition === "rejected"} onClick={() => void controller.action("reject", candidate.id)}>Reject candidate</Button>
    </Show>
  </>;

  return <TaskReviewDialog open presentation={props.presentation} title="Run with Swarm" description={`${props.projectName} · Cloud engineering and reviewed integration`} onClose={props.onClose} selectedId={state().selectedId} runs={state().runs.map(run => ({ value: run.id, label: run.request.goal, description: `${swarmStatusLabel(run)} · ${formatShortTimestamp(run.createdAt)}` }))} allowNew={!props.remote && canControl()} onSelect={id => controller.select(id)} onRefresh={() => void controller.refresh()} busy={busy()} error={localError() || state().error} status={archived() ? "Archived run. Read-only evidence. Execution and integration are unavailable." : state().loading ? "Preparing project context…" : !available() ? `Provider unavailable: ${state().capabilities?.reason ?? state().context?.provider.reason ?? (state().context?.provider.available ? "The configured coordinator could not be reached." : "The cloud coordinator is not configured.")}` : undefined}>
    <Show when={!props.remote&&state().capabilities?.connectionsSupported}><ConnectionAccessLink disabled={busy()} onIssue={()=>client.issueConnectionAccess({projectId:props.projectId,recipientId:props.agentRecipientId??selected()?.request.agentRecipientId??selected()?.request.requestId??"harness-connections"})} onError={report}/></Show>
    <Show when={!selected() && state().capabilities?.modelProfiles}>{profiles => <TaskReviewFacts facts={Object.entries(profiles()).map(([phase, profile]) => ({label: phase, value: `${profile.modelId} / ${profile.reasoning ?? "default reasoning"}`}))} />}</Show>
    <Show when={selected()} fallback={<Show when={!props.remote && canControl()} fallback={<p role="status">Select an authorized run to review its preserved evidence.</p>}><TaskRequestForm fields={fields()} onChange={changed} onSubmit={() => void submit()} actionLabel="Prepare swarm plan" disabled={busy()} submitDisabled={!available()} disabledReason={!available() ? "Configure the cloud coordinator before launching workers" : undefined} /></Show>}>
      {run => <>
        <TaskCampaignConversation phoneUrl={state().cloudAccess?.url} messages={conversation()?.messages??[]} status={swarmStatusLabel(run())} activity={run().connectionWait?.reason??conversation()?.activity??""} connection={state().updates==="live"?"Live coordinator updates":state().updates==="connecting"?"Connecting":"Updates paused"}
          startedAt={run().startedAt} deadlineAt={run().startedAt?run().startedAt!+run().request.budget.maxDurationMs:undefined} completedAt={run().completedAt??(run().status==="AWAITING_APPROVAL"?run().campaign?.rounds.at(-1)?.completedAt??run().updatedAt:undefined)} lastEventAt={conversation()?.lastEventAt??run().updatedAt}
          value={steering()} onInput={setSteering} onSubmit={()=>void controller.steer(steering()).then(()=>{if(!controller.snapshot().error)setSteering("");})} canSteer={canControl()&&["READY","RUNNING","VALIDATING","COMPARING"].includes(run().status)} busy={busy()} onInspect={id=>void inspectArtifact(id)}
          actions={<><Show when={canControl()&&run().status==="READY"&&!run().connectionWait}><Button variant="primary" size="small" tooltip="Launch the reviewed plan with its configured execution backend and budgets" disabled={busy()} onClick={()=>void controller.action("start")}>Launch workers</Button></Show><Show when={canControl()&&["READY","RUNNING","VALIDATING","COMPARING"].includes(run().status)}><Button variant="secondary" size="small" tooltip="Cancel this run and clean up its workers" disabled={busy()} onClick={()=>void controller.action("cancel")}>Cancel run</Button></Show></>} />
        <Show when={run().integration}><p role="status">Integration: {run().integration?.status} · {run().integration?.detail}</p></Show>
        <Show when={canControl() && run().status === "AWAITING_APPROVAL"}><Button variant="secondary" tooltip="Reject all candidates and finish the run while preserving its findings" disabled={busy()} onClick={() => void controller.action("reject")}>Finish without integrating</Button></Show>
        <Show when={run().parentRunId}><p>Follow-up to run {run().parentRunId}. This plan requires its own launch approval.</p></Show>
        <Disclosure title="Completion criteria"><TaskReviewFacts facts={run().completion?.criteria.map(item => ({label:item.criterion, value:`${item.status}: ${item.reason}`})) ?? run().request.doneCriteria.map(criterion => ({label:criterion,value:"Awaiting independent review"}))} /></Disclosure>
        <Show when={description()?.outcome}>{outcome => <TaskReviewOutcome outcome={outcome()} onInspect={id => void inspectArtifact(id)} busy={artifactBusy()} />}</Show>
        <Show when={canControl()}><Disclosure title="Queue a follow-up"><TaskRequestForm fields={[{id:"followUp",label:"Follow-up goal",value:followUp(),kind:"multiline",required:true,maxLength:20000,description:"Uses this run's source, model mode and limits. Creates a linked plan; review and launch it separately."},{id:"followUpCriteria",label:"Follow-up done when",value:followUpCriteria(),kind:"multiline",maxLength:12000,description:"One criterion per line. Leave empty to inherit this run's criteria."}]} onChange={(id,value) => id === "followUp" ? setFollowUp(value) : setFollowUpCriteria(value)} onSubmit={() => void controller.followUp(followUp(), followUpCriteria().trim() ? followUpCriteria().split(/\r?\n/).map(value => value.trim()).filter(Boolean) : undefined).then(() => {if (!controller.snapshot().error) setFollowUp("");})} actionLabel="Queue follow-up plan" disabled={busy() || !available()} /></Disclosure></Show>
        <Show when={props.remote}><p>Integration requires local Harness patch review and checks against your working repository. Open this run in local Harness to apply an approved patch.</p></Show>
        <Show when={!props.remote && canControl()}><Show when={run().id} keyed>{runId=><TaskAccessLink disabled={busy() || !available()} onIssue={access=>client.issueBrowserAccess({runId,access})} onError={report} formatExpiry={formatShortTimestamp} />}</Show></Show>
        <Disclosure title="Source, budgets and usage"><TaskReviewFacts facts={description()?.facts ?? []} /></Disclosure>
        <Disclosure title="Task graph and workers"><TaskReviewProgress items={description()?.tasks ?? []} /></Disclosure>
        <TaskReviewCandidates candidates={(description()?.candidates ?? []).map(item => ({ ...item, actions: candidateActions(run().candidates.find(candidate => candidate.id === item.id)!) }))} conclusion={run().reason} />
        <TaskReviewEvents events={run().messages.map(message => ({ id: message.id, attribution: `${message.agentId} · ${message.taskId} · ${message.kind}`, time: formatShortTimestamp(message.createdAt), text: message.text }))} />
        <TaskReviewArtifacts artifacts={description()?.artifacts ?? []} onInspect={id => void inspectArtifact(id)} onDownload={id=>void inspectArtifact(id,true)} busy={artifactBusy()} />
        <Show when={artifactBusy()}><p role="status">Retrieving and verifying artifact…</p></Show>
        <Show when={preview()}>{value => <TaskReviewArtifactPreview label={value().label} text={value().text} mediaUrl={value().url} mediaType={value().mediaType} downloadUrl={value().url} />}</Show>
      </>}
    </Show>
  </TaskReviewDialog>;
}
