import { expect, test } from "bun:test";
import { createSwarmClient } from "./client";
import { createSwarmReviewController } from "./review-controller";
import { canApproveSwarmCandidate, describeSwarmRun } from "./review-model";
import { swarmCandidateSchema, swarmRunSchema, swarmTaskSchema } from "./contracts";

const revision = "a".repeat(40);

test("cloud ownership requires a phone link before start; public sessions reuse their scoped access",async()=>{
  const run={...fixture(),status:"READY" as const};let starts=0,links=0,failLink=true;
  const client=createSwarmClient({fetch:async(input)=>{
    const path=String(input);
    if(path.endsWith("/capabilities"))return Response.json({available:true,executionAuthority:"cloud",backends:["railway"],maxWorkers:3,projects:[]});
    if(path.includes("/context"))return Response.json({projectId:"project-1",name:"Project",repository:{revision},dirty:false,sourceSnapshotRequired:false,provider:{available:true}});
    if(path.endsWith("/browser-access")){links++;return failLink?Response.json({error:"Link unavailable"},{status:503}):Response.json({url:`https://swarm.example.test/swarm#code=${"a".repeat(64)}`,accessId:crypto.randomUUID(),expiresAt:Date.now()+1000});}
    if(path.endsWith("/start")){starts++;return Response.json({...run,status:"RUNNING"});}
    return Response.json([run]);
  }});
  const controller=createSwarmReviewController({client,projectId:"project-1",selectLatest:true});
  try{await controller.refresh();await controller.action("start");expect(starts).toBe(0);expect(controller.selected()?.status).toBe("READY");
    failLink=false;await controller.action("start");expect(starts).toBe(1);expect(controller.snapshot().cloudAccess?.url).toContain("https:");
  }finally{controller.dispose();}
  const phone=createSwarmReviewController({client,projectId:"project-1",selectLatest:true,issueAccessOnStart:false});
  try{await phone.refresh();await phone.action("start");expect(links).toBe(2);expect(starts).toBe(2);}finally{phone.dispose();}
});

test("dropped event streams reconnect without resubmitting or relaunching work",async()=>{
  const run={...fixture(),status:"RUNNING" as const};let attempts=0;
  const client=createSwarmClient({fetch:async input=>String(input).includes("context")?Response.json({projectId:"project-1",name:"Project",repository:{revision},dirty:false,sourceSnapshotRequired:false,provider:{available:true}}):String(input).endsWith("capabilities")?Response.json({available:true,backends:["railway"],maxWorkers:3,projects:[]}):Response.json([run])});
  client.watch=async(_id,onRun)=>{attempts++;if(attempts===1)throw Error("Connection lost");onRun({...run,status:"COMPLETED",updatedAt:run.updatedAt+1});};
  const controller=createSwarmReviewController({client,projectId:"project-1",selectLatest:true,stream:true,pollMs:1});
  try{await controller.refresh();await Bun.sleep(25);expect(attempts).toBe(2);expect(controller.selected()?.status).toBe("COMPLETED");expect(controller.snapshot().error).toBe("");}
  finally{controller.dispose();}
});
function fixture() { return swarmRunSchema.parse({ id: "run-1", request: { requestId: "request-1", projectId: "project-1", goal: "Investigate current performance", repository: { revision } }, status: "READY", createdAt: 1, updatedAt: 1, tasks: [], candidates: [], artifacts: [], messages: [], metrics: {} }); }

test("review controller reports provider failure without pretending the task completed", async () => {
  const errors: string[] = [];
  const client = createSwarmClient({ fetch: async () => Response.json({ error: "Cloud service unavailable" }, { status: 503 }) });
  const controller = createSwarmReviewController({ client, projectId: "project-1", onError: message => errors.push(message) });
  await controller.refresh();
  expect(controller.snapshot().loading).toBe(false);
  expect(controller.snapshot().error).toBe("Cloud service unavailable");
  expect(controller.snapshot().runs).toEqual([]);
  expect(errors).toEqual(["Cloud service unavailable"]);
  controller.dispose();
});

test("an unavailable project provider reports its status without duplicate upstream errors", async () => {
  const errors:string[]=[];
  const client=createSwarmClient({fetch:async input=>String(input).includes("/context") ? Response.json({projectId:"project-1",name:"Project",repository:{revision},dirty:false,sourceSnapshotRequired:true,provider:{available:false,reason:"The configured coordinator could not be reached."}}) : Response.json({message:"Application unavailable"},{status:404})});
  const controller=createSwarmReviewController({client,projectId:"project-1",onError:message=>errors.push(message)});
  await controller.refresh();
  expect(controller.snapshot().context?.provider.available).toBe(false);
  expect(controller.snapshot().error).toBe("");expect(errors).toEqual([]);
  expect(controller.snapshot().runs).toEqual([]);controller.dispose();
});

test("an unconfigured provider skips live run queries but retains archived evidence", async () => {
  for (const archive of [false, true]) {
    let lists = 0;
    const client = createSwarmClient({ fetch: async input => {
      const route = String(input);
      if (route.includes('/context')) return Response.json({ projectId: 'project-1', name: 'Project', repository: { revision }, dirty: false, sourceSnapshotRequired: false, provider: { available: false } });
      if (route.endsWith('/capabilities')) return Response.json({ available: false, ...(archive ? {archive:{sha256:'a'.repeat(64)}} : {}), backends: [], maxWorkers: 1, projects: [] });
      lists++;
      return Response.json([fixture()]);
    } });
    const controller = createSwarmReviewController({ client, projectId: 'project-1' });
    try {
      await controller.refresh();
      expect(lists).toBe(archive ? 1 : 0);
      expect(controller.snapshot().runs).toHaveLength(archive ? 1 : 0);
      expect(controller.snapshot().error).toBe('');
    } finally { controller.dispose(); }
  }
});

test("cancellation uses the existing run and updates only from the server response", async () => {
  const run = fixture();
  const requests: string[] = [];
  const client = createSwarmClient({ fetch: async (input) => {
    const path = String(input); requests.push(path);
    if (path.endsWith("/cancel")) return Response.json({ ...run, status: "CANCELLED" });
    if (path.includes("/context")) return Response.json({ projectId: "project-1", name: "Project", repository: { revision }, dirty: false, sourceSnapshotRequired: true, provider: { available: true } });
    if (path.endsWith("/capabilities")) return Response.json({ available: true, backends: ["railway"], maxWorkers: 3, projects: [] });
    return Response.json([run]);
  } });
  const controller = createSwarmReviewController({ client, projectId: "project-1", selectLatest:true });
  await controller.refresh();
  controller.select(run.id);
  await controller.action("cancel");
  expect(requests).toContain("/api/swarm/v1/runs/run-1/cancel");
  expect(controller.selected()?.status).toBe("CANCELLED");
  expect(controller.snapshot().pending).toBe(false);
  controller.select("");await controller.refresh();
  expect(controller.snapshot().selectedId).toBe("");
  controller.dispose();
});

test("disposing prevents an in-flight refresh from repopulating a closed review", async () => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const client = createSwarmClient({ fetch: async () => { await gate; return Response.json({ error: "late response" }, { status: 503 }); } });
  const controller = createSwarmReviewController({ client, projectId: "project-1" });
  let notifications = 0;
  controller.subscribe(() => notifications++);
  const refresh = controller.refresh();
  controller.dispose();
  release?.();
  await refresh;
  expect(notifications).toBe(1);
  expect(controller.snapshot().error).toBe("");
});

test("noisy and incorrect candidates cannot expose integration as available", () => {
  const candidate = swarmCandidateSchema.parse({ id: "candidate-1", agentId: "agent-1", hypothesis: "Reduce dirty work", sourceRevision: revision, patchArtifactId: "patch-1", correctness: "passed", comparison: { decision: "INCONCLUSIVE — ENVIRONMENT NOISE", reasons: ["Variance exceeded the qualification limit"] } });
  const run = { ...fixture(), status: "AWAITING_APPROVAL" as const, candidates: [candidate] };
  expect(canApproveSwarmCandidate(run, candidate)).toBe(false);
  expect(canApproveSwarmCandidate(run, { ...candidate, disposition: "recommended" })).toBe(false);
  expect(canApproveSwarmCandidate(run, { ...candidate, correctness: "failed", disposition: "recommended" })).toBe(false);
  expect(canApproveSwarmCandidate(run, { ...candidate, comparison: { decision: "IMPROVED", reasons: [] }, disposition: "recommended" })).toBe(true);
  expect(describeSwarmRun(run).candidates[0]?.facts).toContainEqual({ label: "Performance", value: "INCONCLUSIVE — ENVIRONMENT NOISE" });
});

test("a cancelled run keeps refreshing until active workers acknowledge cleanup", async () => {
  const task = swarmTaskSchema.parse({ id: "task-1", swarmId: "run-1", agentId: "agent-1", title: "Cleanup", kind: "baseline", role: "validator", capability: "execution", dependencies: [], acceptanceCriteria: [], status: "RUNNING", attempt: 1, maxAttempts: 1, artifactIds: [] });
  const run = { ...fixture(), status: "CANCELLED" as const, tasks: [task] };
  const client = createSwarmClient({ fetch: async (input) => {
    const path = String(input);
    if (path.endsWith("/run-1")) return Response.json({ ...run, tasks: [{ ...task, status: "CANCELLED" }] });
    if (path.includes("/context")) return Response.json({ projectId: "project-1", name: "Project", repository: { revision }, dirty: false, sourceSnapshotRequired: true, provider: { available: true } });
    if (path.endsWith("/capabilities")) return Response.json({ available: true, backends: ["railway"], maxWorkers: 3, projects: [] });
    return Response.json([run]);
  } });
  const controller = createSwarmReviewController({ client, projectId: "project-1", pollMs: 500 });
  try {
    await controller.refresh(); controller.select(run.id);
    await new Promise(resolve => setTimeout(resolve, 650));
    expect(controller.selected()?.tasks[0]?.status).toBe("CANCELLED");
  } finally { controller.dispose(); }
});

test("streamed status survives view unsubscribe and stops only when its owner disposes", async () => {
  const run = {...fixture(),status:"RUNNING" as const};
  let send: ((value:typeof run)=>void) | undefined;
  let signal: AbortSignal | undefined;
  const client = createSwarmClient({ fetch:async input => {
    if (String(input).includes("/context")) return Response.json({projectId:"project-1",name:"Project",repository:{revision},dirty:false,sourceSnapshotRequired:true,provider:{available:true}});
    if (String(input).endsWith("/capabilities")) return Response.json({available:true,backends:["railway"],maxWorkers:3,projects:[]});
    return Response.json([run]);
  }});
  client.watch = async (_id,onRun,abort) => { send=onRun;signal=abort;await new Promise<void>(resolve=>abort.addEventListener("abort",()=>resolve(),{once:true})); };
  const controller=createSwarmReviewController({client,projectId:"project-1",stream:true,selectLatest:true});
  try {
    await controller.refresh();
    const unsubscribe=controller.subscribe(()=>{}); unsubscribe();
    send?.({...run,updatedAt:2,reason:"Independent finding preserved"});
    expect(controller.selected()?.reason).toBe("Independent finding preserved");
    expect(controller.snapshot().updates).toBe("live");
    send?.({...run,updatedAt:1,reason:"Stale response"});
    expect(controller.selected()?.updatedAt).toBe(2);
    controller.dispose(); expect(signal?.aborted).toBe(true);
  } finally {controller.dispose();}
});

test("review-state streams observe another owner's launch and approval without leaking superseded watches", async () => {
  const run=fixture(), watches:Array<{signal:AbortSignal;send:(run:ReturnType<typeof fixture>)=>void}>=[];
  let reads=0;
  const client=createSwarmClient({fetch:async input=>{
    reads++;
    if(String(input).includes("/context"))return Response.json({projectId:"project-1",name:"Project",repository:{revision},dirty:false,sourceSnapshotRequired:true,provider:{available:true}});
    if(String(input).endsWith("/capabilities"))return Response.json({available:true,backends:["railway"],maxWorkers:3,projects:[]});
    return Response.json([run]);
  }});
  client.watch=async(_id,onRun,signal)=>{watches.push({signal,send:onRun});await new Promise<void>(resolve=>signal.addEventListener("abort",()=>resolve(),{once:true}));};
  const controller=createSwarmReviewController({client,projectId:"project-1",stream:true,selectLatest:true,pollMs:500});
  try{
    await controller.refresh();expect(watches).toHaveLength(1);
    watches[0]?.send({...run,status:"RUNNING",updatedAt:2});
    expect(controller.selected()?.status).toBe("RUNNING");expect(controller.snapshot().updates).toBe("live");
    watches[0]?.send({...run,status:"AWAITING_APPROVAL",updatedAt:3});
    controller.select(run.id);expect(watches[0]?.signal.aborted).toBe(true);expect(watches).toHaveLength(2);
    watches[0]?.send({...run,status:"FAILED",updatedAt:100});expect(controller.selected()?.status).toBe("AWAITING_APPROVAL");
    watches[1]?.send({...run,status:"COMPLETED",updatedAt:4});expect(controller.selected()?.status).toBe("COMPLETED");
    expect(watches[1]?.signal.aborted).toBe(true);expect(controller.snapshot().updates).toBe("idle");
    controller.dispose();expect(watches.every(watch=>watch.signal.aborted)).toBe(true);
    const count=reads;await new Promise(resolve=>setTimeout(resolve,550));expect(reads).toBe(count);
  }finally{controller.dispose();}
});

test("a terminal stream waits for worker cleanup acknowledgement before closing",async()=>{
  const task=swarmTaskSchema.parse({id:"task-1",swarmId:"run-1",agentId:"agent-1",title:"Cleanup",kind:"baseline",role:"validator",capability:"execution",dependencies:[],acceptanceCriteria:[],status:"RUNNING",attempt:1,maxAttempts:1,artifactIds:[]});
  const run={...fixture(),status:"CANCELLED" as const,tasks:[task]};
  let send:((value:ReturnType<typeof fixture>)=>void)|undefined,signal:AbortSignal|undefined;
  const client=createSwarmClient({fetch:async input=>{
    if(String(input).includes("/context"))return Response.json({projectId:"project-1",name:"Project",repository:{revision},dirty:false,sourceSnapshotRequired:true,provider:{available:true}});
    if(String(input).endsWith("/capabilities"))return Response.json({available:true,backends:["railway"],maxWorkers:3,projects:[]});
    return Response.json([run]);
  }});
  client.watch=async(_id,onRun,abort)=>{send=onRun;signal=abort;await new Promise<void>(resolve=>abort.addEventListener("abort",()=>resolve(),{once:true}));};
  const controller=createSwarmReviewController({client,projectId:"project-1",stream:true,selectLatest:true});
  try{
    await controller.refresh();send?.({...run,updatedAt:2});expect(signal?.aborted).toBe(false);expect(controller.snapshot().updates).toBe("live");
    send?.({...run,updatedAt:3,tasks:[{...task,status:"CANCELLED"}]});expect(signal?.aborted).toBe(true);expect(controller.snapshot().updates).toBe("idle");
  }finally{controller.dispose();}
});

test("steering and follow-up preserve server authority and link a separately reviewed plan", async () => {
  const run=fixture();
  const bodies:Record<string,unknown>[]=[];
  const client=createSwarmClient({fetch:async(input,init)=>{
    const route=String(input);
    if (route.includes("/context")) return Response.json({projectId:"project-1",name:"Project",repository:{revision},dirty:false,sourceSnapshotRequired:true,provider:{available:true}});
    if (route.endsWith("/capabilities")) return Response.json({available:true,backends:["railway"],maxWorkers:3,projects:[]});
    if (init?.method === "POST") {bodies.push(JSON.parse(String(init.body)));return Response.json(route.endsWith("/follow-up")?{...run,id:"next-run",parentRunId:run.id}:run);}
    return Response.json([run]);
  }});
  const controller=createSwarmReviewController({client,projectId:"project-1"});
  try {
    await controller.refresh();controller.select(run.id);
    await controller.steer("Keep the renderer contract exact");
    expect(bodies[0]?.text).toBe("Keep the renderer contract exact");
    await controller.followUp("Investigate the remaining allocation tail",["Retain a validated diagnosis"]);
    expect(controller.selected()?.parentRunId).toBe(run.id);
    expect(controller.selected()?.status).toBe("READY");
    expect(bodies[1]?.doneCriteria).toEqual(["Retain a validated diagnosis"]);
  } finally {controller.dispose();}
});
