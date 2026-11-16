import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { createAgentEventClient } from "@hyperfocus/ai-core/agent-events";
import { createSwarmStore } from "./persistence/store";
import { createSwarmClient, createSwarmRequestSchema, swarmRunSchema, type SwarmRun } from "@hyperfocus/ai-core/swarm";
import { createSwarmHttpFixture } from "./test-fixture";
import { createSwarmHttpHandler } from "./http";

let directory = "";
let fixture: ReturnType<typeof createSwarmHttpFixture>;
const fixtureParent = resolve(import.meta.dir, "../../../.local/swarm-http-tests");
beforeEach(async () => { await mkdir(fixtureParent, { recursive: true }); directory = await mkdtemp(join(fixtureParent, "run-")); fixture = createSwarmHttpFixture({ directory }); });
afterEach(async () => { await fixture.close(); if (!resolve(directory).startsWith(fixtureParent + "/") && !resolve(directory).startsWith(fixtureParent + "\\")) throw new Error("Fixture cleanup escaped its owned directory."); await rm(directory, { recursive: true, force: true }); });
const revision = "a".repeat(40);
const input = (goal = "SIMULATED TEST WORKLOAD: review") => createSwarmRequestSchema.parse({ requestId: crypto.randomUUID(), projectId: "fixture-project", goal, strategy: "tournament", repository: { revision }, backend: "local", reviewPlan: true, budget: { maxRetries: 0 } });
function request(route: string, body?: unknown, headers: Record<string, string> = {}) { return fixture.handler(new Request(`http://127.0.0.1/api/swarm/v1${route}`, { method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${fixture.token}`, ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })); }

test("coordinator HTTP authenticates callers, rejects direct browser access and authorizes projects", async () => {
  expect((await fixture.handler(new Request("http://127.0.0.1/api/swarm/v1/capabilities"))).status).toBe(401);
  expect((await request("/capabilities", undefined, { origin: "http://127.0.0.1" })).status).toBe(403);
  expect((await request("/runs?projectId=unknown")).status).toBe(400);
  const available = await request("/capabilities"); expect(available.status).toBe(200); expect((await available.json()).backends).toEqual(["local"]);
  expect((await request("/runs", { ...input(), backend: "railway" })).status).toBe(400);
});

test("capabilities expose the trusted project work kind and instrument scope without executable commands",async()=>{
  const client=createSwarmClient({baseUrl:"http://127.0.0.1/api/swarm/v1",fetch:(url,init)=>fixture.handler(new Request(url,{...init,headers:{authorization:`Bearer ${fixture.token}`}}))});
  const capabilities=await client.capabilities(),project=capabilities.projects.find(project=>project.id==='fixture-project');
  expect(project).toMatchObject({executionKind:'performance',investigationInstruments:[],blockedPromotionReasons:[]});
  expect(JSON.stringify(project)).not.toContain('preparationCommand');
  expect(JSON.stringify(project)).not.toContain('validationCommands');
});

test("agent callback receives preserved results after offline completion, then acknowledges without local work",async()=>{
  const submitted={...input(),agentRecipientId:"agent-session"};
  const run=swarmRunSchema.parse(await(await request("/runs",submitted)).json());
  const recipient={projectId:submitted.projectId,recipientId:submitted.agentRecipientId};
  const client=createAgentEventClient({baseUrl:"http://127.0.0.1/api/swarm/v1/agent-events",fetch:async(url,init)=>
    fixture.handler(new Request(url,{...init,headers:{...Object.fromEntries(new Headers(init?.headers)),authorization:`Bearer ${fixture.token}`}}))});
  expect((await client.resume(recipient)).waiting).toEqual([{type:"swarm",id:run.id}]);
  // The initiating agent is absent throughout execution. No local monitor is involved.
  await request(`/runs/${run.id}/start`,{});await fixture.coordinator.drain();
  const recovered=createSwarmStore({db:fixture.store.db});
  expect(recovered.agentEvents.resume(recipient).events).toHaveLength(1);
  const callbacks:string[]=[];
  const inbox=await client.wait(recipient,{onEvent:event=>{callbacks.push(event.id);}});
  expect(callbacks).toEqual([`swarm:${run.id}:AWAITING_APPROVAL`]);
  const event=inbox.events[0]!;expect(event.kind).toBe("swarm.result.ready");
  const artifact=event.artifacts[0]!;
  const downloaded=await request(artifact.path.replace("/api/swarm/v1",""));
  expect(downloaded.headers.get("content-disposition")).toStartWith("attachment;");
  expect(createHash("sha256").update(new Uint8Array(await downloaded.arrayBuffer())).digest("hex")).toBe(artifact.sha256);
  expect((await client.resume(recipient)).events).toHaveLength(1);
  await client.acknowledge(recipient,event.id);expect((await client.resume(recipient)).events).toEqual([]);
  expect(fixture.store.workspaces()).toEqual([]);
  expect((await request("/agent-events/resume",{...recipient,projectId:"unknown"})).status).toBe(400);
});

test("an online agent waits for the native completion event without repeated run inspection",async()=>{
  const submitted=input(),run=swarmRunSchema.parse(await(await request("/runs",submitted)).json());
  const waiting=request("/agent-events/wait",{projectId:submitted.projectId,recipientId:submitted.requestId,timeoutMs:1000});
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(fixture.store.agentEvents.waitingConnections).toBe(1);
  await request(`/runs/${run.id}/cancel`,{});
  expect((await(await waiting).json()).events[0].kind).toBe("swarm.cancelled");
  expect(fixture.store.agentEvents.waitingConnections).toBe(0);
});

test("native MCP event tools deliver the same durable callback with authentication and project boundaries",async()=>{
  const submitted=input(),run=swarmRunSchema.parse(await(await request("/runs",submitted)).json());
  const call=(method:string,params?:unknown)=>request("/agent-events/mcp",{jsonrpc:"2.0",id:1,method,params});
  expect((await(await call("initialize",{protocolVersion:"2025-11-25"})).json()).result.protocolVersion).toBe("2025-11-25");
  expect((await(await call("tools/list")).json()).result.tools.map((tool:{name:string})=>tool.name)).toContain("agent_events_wait");
  const args={projectId:submitted.projectId,recipientId:submitted.requestId};
  const pending=call("tools/call",{name:"agent_events_wait",arguments:{...args,timeoutMs:1000}});
  await new Promise(resolve=>setTimeout(resolve,0));await request(`/runs/${run.id}/cancel`,{});
  const result=(await(await pending).json()).result;
  expect(result.isError).toBe(false);expect(result.structuredContent.events[0].kind).toBe("swarm.cancelled");
  expect((await(await call("tools/call",{name:"agent_events_resume",arguments:{...args,projectId:"unrelated"}})).json()).result.isError).toBe(true);
  expect((await(await call("tools/call",{name:"agent_events_wait",arguments:{...args,timeoutMs:60000}})).json()).result.isError).toBe(true);
  expect((await fixture.handler(new Request("http://127.0.0.1/api/swarm/v1/agent-events/mcp",{method:"POST",body:"{}"}))).status).toBe(401);
});

test("real coordinator HTTP preserves independent candidate artifacts through review and rejection", async () => {
  const submitted = input();
  const created = swarmRunSchema.parse(await (await request("/runs", submitted)).json());
  expect(created.status).toBe("READY"); expect(created.candidates).toHaveLength(3);
  expect(swarmRunSchema.parse(await (await request("/runs", submitted)).json()).id).toBe(created.id);
  expect((await request(`/runs/${created.id}/start`, {})).status).toBe(200);
  await fixture.coordinator.drain();
  const completed = swarmRunSchema.parse(await (await request(`/runs/${created.id}`)).json());
  expect(completed.status, JSON.stringify(completed.tasks.map(task => ({ kind: task.kind, status: task.status, error: task.error })))).toBe("AWAITING_APPROVAL");
  expect(new Set(completed.candidates.map(candidate => candidate.patchArtifactId)).size).toBe(3);
  expect(completed.candidates[1]?.correctness).toBe("failed");
  expect(completed.candidates[2]?.comparison?.decision).toBe("INCONCLUSIVE — ENVIRONMENT NOISE");
  expect((await request(`/runs/${created.id}/approve`, { candidateId: "candidate-2" })).status).toBe(400);
  const artifact = completed.artifacts.find(value => value.kind === "patch")!;
  const response = await request(`/runs/${created.id}/artifacts/${artifact.id}`);
  expect(response.headers.get("content-security-policy")).toContain("sandbox");
  const bytes = await response.arrayBuffer(); expect(createHash("sha256").update(new Uint8Array(bytes)).digest("hex")).toBe(artifact.sha256);
  expect((await request(`/runs/${created.id}/artifacts/unknown`)).status).toBe(400);
  const rejected = swarmRunSchema.parse(await (await request(`/runs/${created.id}/reject`, {})).json());
  expect(rejected.status).toBe("COMPLETED"); expect(rejected.artifacts).toHaveLength(completed.artifacts.length);
});

test("coordinator HTTP returns durable failed and cancelled states without successful-work claims", async () => {
  const failed = swarmRunSchema.parse(await (await request("/runs", input("SIMULATED TEST WORKLOAD [fail]"))).json());
  await request(`/runs/${failed.id}/start`, {}); await fixture.coordinator.drain();
  expect(swarmRunSchema.parse(await (await request(`/runs/${failed.id}`)).json()).status).toBe("FAILED");
  const waiting = swarmRunSchema.parse(await (await request("/runs", input("SIMULATED TEST WORKLOAD [cancel]"))).json());
  await request(`/runs/${waiting.id}/start`, {});
  const cancelled = swarmRunSchema.parse(await (await request(`/runs/${waiting.id}/cancel`, {})).json());
  expect(cancelled.status).toBe("CANCELLED");
  await fixture.coordinator.drain(); expect(fixture.store.workspaces()).toEqual([]);
});

test("HTTP enforces the configured subscription profile and zero separately billed inference", async () => {
  const handler=createSwarmHttpHandler({...fixture,backend:"local",profile:{agentId:"codex-cli",providerId:"codex-account",modelId:"default",approvalPolicy:"never"}});
  const send=(body:unknown)=>handler(new Request("http://127.0.0.1/api/swarm/v1/runs",{method:"POST",headers:{authorization:`Bearer ${fixture.token}`},body:JSON.stringify(body)}));
  expect((await send({...input(),profile:{agentId:"direct",providerId:"openai",modelId:"paid"}})).status).toBe(400);
  expect((await send({...input(),budget:{maxModelUsd:0.01}})).status).toBe(400);
  const accepted=await send(input());expect(accepted.status).toBe(200);expect((await accepted.json()).request.profile.providerId).toBe("codex-account");
});

test("identical source bytes remain independently attributable across authorized projects", async () => {
  fixture.recipes.set("second-project",fixture.recipes.get("fixture-project")!);
  const bytes=new TextEncoder().encode("# v2 git bundle\nfixture");const hash=createHash("sha256").update(bytes).digest("hex");
  const ids:string[]=[];
  for(const projectId of ["fixture-project","second-project"]){const response=await fixture.handler(new Request(`http://127.0.0.1/api/swarm/v1/sources?projectId=${projectId}&revision=${revision}`,{method:"POST",headers:{authorization:`Bearer ${fixture.token}`,"x-content-sha256":hash},body:bytes}));expect(response.status).toBe(200);ids.push((await response.json()).id);}
  expect(new Set(ids).size).toBe(2);
});

test("shutdown archives require service authentication and return hash-verified stored bytes", async () => {
  let exports=0;
  const archive=await fixture.artifacts.put({name:"archive.sqlite",mediaType:"application/vnd.sqlite3",bytes:new Uint8Array(fixture.store.db.serialize())});
  const handler=createSwarmHttpHandler({...fixture,backend:"local",exportState:async()=>{exports++;return{archive};}});
  const url="http://127.0.0.1/api/swarm/v1/admin/export";
  expect((await handler(new Request(url,{method:"POST"}))).status).toBe(401);expect(exports).toBe(0);
  expect((await handler(new Request(url,{method:"POST",headers:{authorization:`Bearer ${fixture.token}`}}))).status).toBe(200);expect(exports).toBe(1);
  const result=await handler(new Request(`http://127.0.0.1/api/swarm/v1/admin/artifacts/${archive.sha256}`,{headers:{authorization:`Bearer ${fixture.token}`}}));expect(result.status).toBe(200);expect(createHash("sha256").update(new Uint8Array(await result.arrayBuffer())).digest("hex")).toBe(archive.sha256);
});

test("HTTP stream reconstructs live steering and reconnects from an authoritative snapshot", async () => {
  const run = swarmRunSchema.parse(await (await request("/runs", input())).json());
  const client = createSwarmClient({baseUrl:"http://127.0.0.1/api/swarm/v1",fetch:async(url,init)=>fixture.handler(new Request(url,{...init,headers:{authorization:`Bearer ${fixture.token}`,"last-event-id":"obsolete-connection"}}))});
  const received: SwarmRun[] = [], controller = new AbortController();
  await client.watch(run.id, value => {
    received.push(value);
    if (received.length === 1) fixture.coordinator.steer(run.id,{requestId:"stream-steering",text:"Retain the original measurement inputs."});
    else controller.abort();
  }, AbortSignal.any([controller.signal,AbortSignal.timeout(4000)]));
  expect(received).toHaveLength(2);
  expect(received[1]?.messages.some(message=>message.kind==="steering")).toBe(true);
  const reconnect = new AbortController(), current: SwarmRun[] = [];
  await client.watch(run.id,value=>{current.push(value);reconnect.abort();},reconnect.signal);
  expect(current).toEqual([fixture.store.get(run.id)!]);
});
