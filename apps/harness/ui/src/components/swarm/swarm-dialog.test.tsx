import { afterEach, expect, spyOn, test } from "bun:test";
import { render } from "solid-js/web";
import { createSwarmClient, createSwarmReviewController, createSwarmRequestSchema, swarmRunSchema, type SwarmFetch } from "@hyperfocus/ai-core/swarm";
import { HarnessSwarmDialog } from "./swarm-dialog";
import { SwarmReviewProvider } from "./review-context";

afterEach(() => { document.body.replaceChildren(); document.head.querySelector('meta[name="harness-session-token"]')?.remove(); });
const settle = () => new Promise(resolve => setTimeout(resolve, 10));

test("Harness submits the project task and budgets, reviews the plan, starts and cancels through the API", async () => {
  const meta = document.createElement("meta"); meta.name = "harness-session-token"; meta.content = "test-session"; document.head.append(meta);
  const host = document.createElement("div"); document.body.append(host);
  const revision = "a".repeat(40);
  const request = createSwarmRequestSchema.parse({ requestId: "request-1", projectId: "project-1", goal: "Investigate frame preparation", repository: { revision }, reviewPlan: true });
  let run = swarmRunSchema.parse({ id: "run-1", request, status: "READY", createdAt: 1, updatedAt: 1, tasks: [], candidates: [], artifacts: [], messages: [], metrics: {}, outcome: {
    phase: "proposed", intendedOutcome: "Verify frame preparation independently", observedSymptoms: ["Preparation takes too long"], constraints: ["Exact images"], assumptions: [], acceptanceCriteria: [{ criterion: "Retain raw evidence", metric: "Paired observations", evaluatorMethodId: "review" }], downstreamConsequences: [], methods: [], hypotheses: [], experiments: [], evaluations: [], knowledge: [], taskSuccess: "pending", outcomeSuccess: "blocked", limitations: ["Baseline not measured"],
  } });
  const operations: string[] = [];
  const fetcher: SwarmFetch = async (input, init) => {
    const route = String(input); operations.push(`${init?.method ?? "GET"} ${route}`);
    expect(new Headers(init?.headers).get("x-harness-session-token")).toBe("test-session");
    if (route.includes("/context")) return Response.json({ projectId: "project-1", name: "Project", repository: { revision }, dirty: true, sourceSnapshotRequired: true, provider: { available: true } });
    if (route.endsWith("/capabilities")) return Response.json({ available: true, backends: ["railway"], maxWorkers: 3, projects: [], inference: { provider: "Codex", credentialSource: "Existing subscription", separatelyBilledUsd: 0 } });
    if (route.endsWith("/runs") && init?.method === "POST") {
      const submitted = createSwarmRequestSchema.parse(JSON.parse(String(init.body)));
      expect(submitted.projectId).toBe("project-1"); expect(submitted.goal).toBe(request.goal); expect(submitted.backend).toBe("railway"); expect(submitted.reviewPlan).toBe(true);
      expect(submitted.budget.maxComputeUsd).toBe(5); expect(submitted.budget.maxModelUsd).toBe(0);
      expect(submitted.mode).toBe("auto"); expect(submitted.difficulty).toBe("auto");
      expect(submitted.budget.maxTotalTokens).toBe(250_000); expect(submitted.maxWorkers).toBe(1); expect(submitted.strategy).toBe("investigation"); expect(submitted.budget.maxWeeklyQuotaPercent).toBe(20);
      expect(submitted.doneCriteria).toHaveLength(2);
      expect(submitted.profile).toBeUndefined();
      return Response.json(run);
    }
    if (route.endsWith("/start")) { run = { ...run, status: "RUNNING" }; return Response.json(run); }
    if (route.endsWith("/cancel")) { run = { ...run, status: "CANCELLED" }; return Response.json(run); }
    if (route.endsWith("/steer")) { expect(JSON.parse(String(init?.body)).text).toBe("Preserve exact image correctness"); return Response.json(run); }
    if (route.endsWith("/follow-up")) { const body=JSON.parse(String(init?.body));expect(body.goal).toBe("Investigate the remaining tail");expect(body.doneCriteria).toEqual(["Retain a browser validation checklist"]); run = {...run,id:"follow-up-1",parentRunId:run.id,status:"READY"};return Response.json(run); }
    return Response.json([]);
  };
  const dispose = render(() => <HarnessSwarmDialog projectId="project-1" projectName="Project" goal={request.goal} onClose={() => {}} fetch={fetcher} />, host);
  try {
    await settle();
    expect(document.body.textContent).toContain("Codex · Existing subscription");
    expect(document.querySelector<HTMLInputElement>('[aria-label="Cloud compute budget (USD)"]')?.max).toBe("10");
    expect(document.querySelector<HTMLInputElement>('[aria-label="Separate inference billing limit (USD)"]')?.max).toBe("0");
    document.querySelector<HTMLFormElement>("[data-test-task-request-form]")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle();
    const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(element => element.textContent === label)!;
    expect(button("Launch workers")).toBeDefined(); button("Launch workers").click(); await settle();
    expect(document.querySelector("[data-test-task-review-outcome]")?.textContent).toContain("Verify frame preparation independently");
    expect(document.querySelector("[data-test-task-review-outcome]")?.textContent).toContain("Baseline not measured");
    expect(document.body.textContent).toContain("Running");
    const steer=document.querySelector<HTMLTextAreaElement>('[aria-label="Steer this run"]')!;
    steer.value="Preserve exact image correctness";steer.dispatchEvent(new Event("input",{bubbles:true}));
    steer.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));await settle();
    button("Cancel run").click(); await settle();
    expect(document.body.textContent).toContain("Cancelled");
    expect(operations).toContain("POST /api/swarm/v1/runs/run-1/start");
    expect(operations).toContain("POST /api/swarm/v1/runs/run-1/cancel");
    expect(operations).toContain("POST /api/swarm/v1/runs/run-1/steer");
    [...document.querySelectorAll("summary")].find(summary => summary.textContent === "Queue a follow-up")!.click();
    const follow=document.querySelector<HTMLTextAreaElement>('[aria-label="Follow-up goal"]')!;
    follow.value="Investigate the remaining tail";follow.dispatchEvent(new Event("input",{bubbles:true}));
    const criteria=document.querySelector<HTMLTextAreaElement>('[aria-label="Follow-up done when"]')!;
    criteria.value="Retain a browser validation checklist";criteria.dispatchEvent(new Event("input",{bubbles:true}));
    follow.closest("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));await settle();
    expect(operations).toContain("POST /api/swarm/v1/runs/run-1/follow-up");
    expect(document.body.textContent).toContain("Follow-up to run run-1");
    expect(button("Launch workers")).toBeDefined();
  } finally { dispose(); }
});


test("native archived review preserves evidence and removes every mutation control", async () => {
  const host=document.createElement("div"); document.body.append(host);
  const run=swarmRunSchema.parse({id:"archived-run",request:{requestId:"archived-request",projectId:"project-1",goal:"Archived evidence",repository:{revision:"a".repeat(40)}},status:"AWAITING_APPROVAL",createdAt:1,updatedAt:1,tasks:[],candidates:[],artifacts:[],messages:[],metrics:{}});
  const fetcher:SwarmFetch=async(input,init)=>{expect(init?.method ?? "GET").toBe("GET");const route=String(input);
    if(route.includes("/context"))return Response.json({projectId:"project-1",name:"Archive",repository:run.request.repository,dirty:false,sourceSnapshotRequired:false,provider:{available:false}});
    if(route.endsWith("/capabilities"))return Response.json({available:false,archive:{sha256:"b".repeat(64)},backends:[],maxWorkers:0,projects:[{id:"project-1",name:"Archive"}]});
    return Response.json([run]);
  };
  const controller=createSwarmReviewController({client:createSwarmClient({fetch:fetcher}),projectId:"project-1",selectLatest:true});
  const dispose=render(()=><SwarmReviewProvider value={controller}><HarnessSwarmDialog projectId="project-1" projectName="Archive" goal="" onClose={()=>{}} fetch={fetcher}/></SwarmReviewProvider>,host);
  try {await settle();expect(document.body.textContent).toContain("Archived run. Read-only evidence. Execution and integration are unavailable.");expect(document.body.textContent).toContain("Execution and integration are unavailable");
    expect(document.querySelector('[data-test-task-request-form]')).toBeNull();
    for(const text of ["New run","Launch workers","Cancel run","Finish without integrating","Queue a follow-up","Create review link"])expect(document.body.textContent).not.toContain(text);
    await controller.action("cancel");expect(controller.snapshot().error).toBe("Archived evidence is read-only.");
  } finally {dispose();controller.dispose();}
});

test("scoped review injection isolates commands and leaves disposal with each caller", async () => {
  const reviews = ["project-a", "project-b"].map(projectId => {
    let run = swarmRunSchema.parse({ id: `run-${projectId}`, request: { requestId: `request-${projectId}`, projectId, goal: `Review ${projectId}`, repository: { revision: "a".repeat(40) } }, status: "RUNNING", createdAt: 1, updatedAt: 1, tasks: [], candidates: [], artifacts: [], messages: [], metrics: {} });
    const operations: string[] = [];
    const fetcher: SwarmFetch = async (input, init) => {
      const route = String(input);
      operations.push(`${init?.method ?? "GET"} ${route}`);
      if (route.includes("/context")) return Response.json({ projectId, name: projectId, repository: run.request.repository, dirty: false, sourceSnapshotRequired: true, provider: { available: true } });
      if (route.endsWith("/capabilities")) return Response.json({ available: true, backends: ["railway"], maxWorkers: 3, projects: [] });
      if (route.endsWith("/cancel")) { run = { ...run, status: "CANCELLED" }; return Response.json(run); }
      return Response.json([run]);
    };
    const controller = createSwarmReviewController({ client: createSwarmClient({ fetch: fetcher }), projectId, selectLatest: true });
    const disposeController = spyOn(controller, "dispose");
    const host = document.createElement("div"); document.body.append(host);
    const unmount = render(() => <SwarmReviewProvider value={controller}><HarnessSwarmDialog projectId={projectId} projectName={projectId} goal="" presentation="page" onClose={() => {}} fetch={fetcher} /></SwarmReviewProvider>, host);
    return { controller, disposeController, host, unmount, operations };
  });
  const [first, second] = reviews;
  if (!first || !second) throw new Error("Expected two scoped reviews.");
  try {
    await settle();
    expect(first.host.textContent).toContain("Review project-a");
    expect(second.host.textContent).toContain("Review project-b");
    const cancel = [...first.host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Cancel run");
    expect(cancel).toBeDefined(); cancel!.click(); await settle();
    expect(first.operations).toContain("POST /api/swarm/v1/runs/run-project-a/cancel");
    expect(second.operations.some(operation => operation.startsWith("POST"))).toBe(false);
    expect(second.controller.selected()?.status).toBe("RUNNING");
    first.unmount();
    expect(first.disposeController).not.toHaveBeenCalled();
    const previousRequests = first.operations.length;
    await first.controller.refresh();
    expect(first.operations.length).toBeGreaterThan(previousRequests);
    second.unmount();
    expect(second.disposeController).not.toHaveBeenCalled();
  } finally {
    for (const review of reviews) { review.unmount(); review.controller.dispose(); review.disposeController.mockRestore(); }
  }
});

test("standalone page creates and aborts its own review stream on unmount", async () => {
  const meta = document.createElement("meta"); meta.name = "harness-session-token"; meta.content = "test-session"; document.head.append(meta);
  const run = swarmRunSchema.parse({ id: "page-run", request: { requestId: "page-request", projectId: "page-project", goal: "Page-owned review", repository: { revision: "a".repeat(40) } }, status: "RUNNING", createdAt: 1, updatedAt: 1, tasks: [], candidates: [], artifacts: [], messages: [], metrics: {} });
  let streamSignal: AbortSignal | null | undefined;
  let requestSignal: AbortSignal | null | undefined;
  const fetcher: SwarmFetch = async (input, init) => {
    const route = String(input);
    if (route.endsWith("/events")) {
      streamSignal = init?.signal;
      return new Response(new ReadableStream({ start(controller) { init?.signal?.addEventListener("abort", () => controller.close(), { once: true }); } }), { headers: { "content-type": "text/event-stream" } });
    }
    if (route.includes("/context")) { requestSignal = init?.signal; return Response.json({ projectId: "page-project", name: "Page", repository: run.request.repository, dirty: false, sourceSnapshotRequired: true, provider: { available: true } }); }
    if (route.endsWith("/capabilities")) return Response.json({ available: true, backends: ["railway"], maxWorkers: 3, projects: [] });
    return Response.json([run]);
  };
  const host = document.createElement("div"); document.body.append(host);
  const dispose = render(() => <HarnessSwarmDialog projectId="page-project" projectName="Page" goal="" initialRunId="page-run" presentation="page" onClose={() => {}} fetch={fetcher} />, host);
  try {
    await settle();
    expect(host.textContent).toContain("Page-owned review");
    expect(streamSignal?.aborted).toBe(false);
    expect(requestSignal?.aborted).toBe(false);
  } finally { dispose(); }
  expect(streamSignal?.aborted).toBe(true);
  expect(requestSignal?.aborted).toBe(true);
});

test("a closed borrowed dialog cannot select a run when its refresh finishes", async () => {
  let resolveContext: ((response: Response) => void) | undefined;
  const fetcher: SwarmFetch = async input => {
    if (String(input).includes("/context")) return new Promise(resolve => { resolveContext = resolve; });
    if (String(input).endsWith("/capabilities")) return Response.json({ available: true, backends: ["railway"], maxWorkers: 3, projects: [] });
    return Response.json([]);
  };
  const controller = createSwarmReviewController({ client: createSwarmClient({ fetch: fetcher }), projectId: "project-1" });
  const select = spyOn(controller, "select");
  const host = document.createElement("div"); document.body.append(host);
  const dispose = render(() => <SwarmReviewProvider value={controller}><HarnessSwarmDialog projectId="project-1" projectName="Project" goal="" initialRunId="stale-run" onClose={() => {}} /></SwarmReviewProvider>, host);
  try {
    await settle(); dispose();
    expect(resolveContext).toBeDefined();
    resolveContext!(Response.json({ projectId: "project-1", name: "Project", repository: { revision: "a".repeat(40) }, dirty: false, sourceSnapshotRequired: true, provider: { available: true } }));
    await settle();
    expect(select).not.toHaveBeenCalled();
    expect(controller.snapshot().selectedId).toBe("");
  } finally { dispose(); controller.dispose(); select.mockRestore(); }
});
