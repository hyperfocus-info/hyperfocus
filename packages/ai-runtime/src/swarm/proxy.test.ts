import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { createSwarmRequestSchema, swarmRunSchema, type SwarmFetch } from "@hyperfocus/ai-core/swarm";
import { createSwarmProxyHandler } from "./proxy";
import { createSwarmSourceSnapshot, swarmGit } from "./source";

const owner=resolve(import.meta.dir,"../../../../.local/swarm-proxy-tests");
const directories:string[]=[];
afterEach(async()=>{for(const directory of directories.splice(0)){if(!resolve(directory).startsWith(owner+sep))throw Error("Fixture cleanup escaped its owner.");await rm(directory,{recursive:true,force:true});}});
async function fixture() {
  await mkdir(owner,{recursive:true});const root=await mkdtemp(join(owner,"run-"));directories.push(root);
  await swarmGit({root,args:["init"]});await swarmGit({root,args:["config","core.autocrlf","false"]});await writeFile(join(root,"demo.txt"),"baseline\n");await swarmGit({root,args:["add","."]});
  await swarmGit({root,args:["-c","user.name=Fixture","-c","user.email=fixture@localhost","commit","-m","fixture"]});
  const source=await createSwarmSourceSnapshot({root});
  const patch=new TextEncoder().encode("diff --git a/demo.txt b/demo.txt\n--- a/demo.txt\n+++ b/demo.txt\n@@ -1 +1 @@\n-baseline\n+candidate\n");
  const hash=createHash("sha256").update(patch).digest("hex");
  let run=swarmRunSchema.parse({id:"run-1",request:{requestId:"request-1",projectId:"project-1",goal:"Verify reviewed integration",repository:{revision:source.revision,baseRevision:source.baseRevision}},status:"AWAITING_APPROVAL",createdAt:1,updatedAt:1,tasks:[],candidates:[{id:"candidate-1",agentId:"agent-1",hypothesis:"Bounded fixture",sourceRevision:source.revision,correctness:"passed",patchArtifactId:"patch-1",disposition:"recommended",comparison:{decision:"IMPROVED",reasons:["Simulated fixture evidence"]}}],artifacts:[{id:"patch-1",swarmId:"run-1",taskId:"task-1",agentId:"agent-1",sourceRevision:source.revision,name:"candidate.patch",mediaType:"text/x-diff",sha256:hash,bytes:patch.length,kind:"patch",createdAt:1}],messages:[],metrics:{}});
  let beforeApprove=async()=>{};let approvalCount=0;const receipts:string[]=[];
  const fetcher:SwarmFetch=async(input,init)=>{
    const route=new URL(String(input)).pathname;
    if(route.endsWith("/artifacts/patch-1"))return new Response(patch);
    if(route.endsWith("/approve")){approvalCount++;await beforeApprove();return Response.json(run);}
    if(route.endsWith("/integration")){const body=JSON.parse(String(init?.body));receipts.push(body.status);run={...run,status:body.status==="integrated"?"COMPLETED":"BLOCKED",updatedAt:run.updatedAt+1,integration:{candidateId:"candidate-1",status:body.status,detail:body.detail,at:Date.now()}};return Response.json(run);}
    if(route.endsWith("/runs"))return Response.json([run]);
    return Response.json(run);
  };
  const options={resolveProject:async(id:string)=>id==="project-1"?{id,name:"Fixture",rootPath:root}:undefined,baseUrl:"http://127.0.0.1:1",token:"fixture-token",fetch:fetcher};
  return {root,source,options,receipts,get run(){return run;},get approvalCount(){return approvalCount;},setBeforeApprove(callback:()=>Promise<void>){beforeApprove=callback;}};
}
const approve=()=>new Request("http://localhost/api/swarm/v1/runs/run-1/approve",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({candidateId:"candidate-1"})});

test("native public-link issuance checks project ownership and binds authority to the selected run", async () => {
  const run = swarmRunSchema.parse({ id: "run-1", request: { requestId: "request-1", projectId: "project-1", goal: "Inspect evidence", repository: { revision: "a".repeat(40) } }, status: "READY", createdAt: 1, updatedAt: 1, tasks: [], candidates: [], artifacts: [], messages: [], metrics: {} });
  const receipt = { url: `https://coordinator.example/swarm#code=${"a".repeat(64)}`, accessId: crypto.randomUUID(), expiresAt: Date.now() + 3_600_000 };
  const issued: unknown[] = [];
  let allowed = true;
  const handler = createSwarmProxyHandler({ baseUrl: "https://coordinator.example", token: "owner-secret",
    resolveProject: id => allowed && id === "project-1" ? { id, name: "Fixture", rootPath: "unused" } : undefined,
    fetch: async (input, init) => {
      if (String(input).endsWith("/admin/browser-access")) {
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer owner-secret");
        expect(new Headers(init?.headers).get("origin")).toBeNull();
        issued.push(JSON.parse(String(init?.body))); return Response.json(receipt);
      }
      return Response.json(run);
    },
  });
  const request = (body: unknown) => new Request("http://localhost/api/swarm/v1/runs/run-1/browser-access", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify(body) });
  const response = await handler(request({ access: "control" }));
  expect(response?.status).toBe(200);
  expect(response?.headers.get("cache-control")).toBe("no-store");
  expect(await response?.json()).toEqual(receipt);
  expect(issued).toEqual([{ runId: "run-1", access: "control", expiresInMs: 604_800_000 }]);
  for (const body of [{ access: "owner" }, { access: "view", expiresInMs: 2_592_000_001 }, { access: "view", runId: "other-run" }]) expect((await handler(request(body)))?.status).toBe(400);
  allowed = false;
  expect((await handler(request({ access: "view" })))?.status).toBe(400);
  expect(issued).toHaveLength(1);
  expect((await handler(new Request("http://localhost/api/swarm/v1/admin/browser-access", { method: "POST" })))?.status).toBe(404);
});

test("native Connections issuance resolves the host project and keeps the owner credential server-side",async()=>{
  let issued=0;
  const receipt={url:`https://coordinator.example/connections#code=${"a".repeat(64)}`,accessId:crypto.randomUUID(),expiresAt:Date.now()+60000};
  const handler=createSwarmProxyHandler({baseUrl:"https://coordinator.example",token:"owner-secret",resolveProject:id=>id==="local-project"?{id:"remote-project",name:"Fixture",rootPath:"unused"}:undefined,
    fetch:async(input,init)=>{issued++;expect(String(input)).toBe("https://coordinator.example/api/swarm/v1/connection-access");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer owner-secret");expect(new Headers(init?.headers).get("origin")).toBeNull();
      expect(JSON.parse(String(init?.body))).toEqual({projectId:"remote-project",recipientId:"thread"});return Response.json(receipt);}});
  const request=(projectId:string)=>new Request("http://localhost/api/swarm/v1/connection-access",{method:"POST",headers:{"content-type":"application/json",origin:"http://localhost"},body:JSON.stringify({projectId,recipientId:"thread"})});
  const response=await handler(request("local-project"));expect(response?.status).toBe(200);expect(response?.headers.get("cache-control")).toBe("no-store");
  expect(await response?.json()).toEqual(receipt);expect((await handler(request("foreign-project")))?.status).toBe(400);expect(issued).toBe(1);
});

test("decoded upstream responses discard obsolete compression and hop headers", async () => {
  const payload = { available: false, reason: "Subscription login required", backends: ["railway"], maxWorkers: 3, projects: [] };
  const handler = createSwarmProxyHandler({
    baseUrl: "https://coordinator.example", token: "fixture-token", resolveProject: () => undefined,
    fetch: async () => new Response(JSON.stringify(payload), { headers: {
      "content-type": "application/json", "content-encoding": "gzip", "content-length": "37",
      connection: "keep-alive, x-upstream-only", "x-upstream-only": "private framing", "x-evidence-id": "preserved",
    } }),
  });
  const response = await handler(new Request("http://localhost/api/swarm/v1/capabilities"));
  expect(response?.status).toBe(200);
  for (const header of ["content-encoding", "content-length", "connection", "x-upstream-only"]) expect(response?.headers.get(header)).toBeNull();
  expect(response?.headers.get("x-evidence-id")).toBe("preserved");
  expect(await response!.json()).toEqual(payload);
});

test("concurrent host handlers cannot integrate the same repository and a completed approval is idempotent",async()=>{
  const value=await fixture();let release!:()=>void;let entered!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});const ready=new Promise<void>(resolve=>{entered=resolve;});
  value.setBeforeApprove(async()=>{entered();await gate;});
  const first=createSwarmProxyHandler(value.options);const second=createSwarmProxyHandler(value.options);
  const pending=first(approve());await ready;
  try {expect((await second(approve()))?.status).toBe(409);}finally {release();}
  expect((await pending)?.status).toBe(200);
  expect((await second(approve()))?.status).toBe(200);expect(value.approvalCount).toBe(1);expect(value.receipts).toEqual(["integrated"]);
  expect(await readFile(join(value.root,"demo.txt"),"utf8")).toBe("candidate\n");
},30000);

test("project memory failure leaves verified integration successful and refresh retries the note",async()=>{
  const value=await fixture();let attempts=0;
  const handler=createSwarmProxyHandler({...value.options,onDisposition:async()=>{if(++attempts===1)throw Error("Fixture memory unavailable");}});
  const response=await handler(approve());expect(response?.status).toBe(200);expect(response?.headers.get("x-hyperfocus-swarm-memory-status")).toBe("retry-needed");
  const integrated=await response!.json();expect(integrated.status).toBe("COMPLETED");expect(integrated.integration.status).toBe("integrated");expect(integrated.reason).toContain("Project memory update failed");
  expect(value.receipts).toEqual(["integrated"]);expect(await readFile(join(value.root,"demo.txt"),"utf8")).toBe("candidate\n");
  const refreshed=await handler(new Request("http://localhost/api/swarm/v1/runs?projectId=project-1"));expect(refreshed?.status).toBe(200);expect(refreshed?.headers.get("x-hyperfocus-swarm-memory-status")).toBeNull();
  expect((await refreshed!.json())[0].reason).toBeUndefined();expect(attempts).toBe(2);
},30000);

test("repeated submission preserves the request and source identity",async()=>{
  const value=await fixture();const bodies:string[]=[];const hashes:string[]=[];
  const fetcher:SwarmFetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.pathname.endsWith("/sources")){if(init?.method!=="POST")return Response.json({error:"Not cached"},{status:404});const hash=new Headers(init?.headers).get("x-content-sha256")!;hashes.push(hash);return Response.json({id:`source-${hash}`,sha256:hash,bytes:new Uint8Array(await new Response(init.body).arrayBuffer()).length});}
    bodies.push(String(init?.body));return Response.json({...value.run,request:JSON.parse(String(init?.body)),status:"READY"});
  };
  const handler=createSwarmProxyHandler({...value.options,fetch:fetcher});
  const request=createSwarmRequestSchema.parse({...value.run.request,repository:{revision:value.source.baseRevision}});
  const submit=()=>new Request("http://localhost/api/swarm/v1/runs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(request)});
  expect((await handler(submit()))?.status).toBe(200);expect((await handler(submit()))?.status).toBe(200);
  expect(hashes).toHaveLength(2);expect(hashes[0]).toBe(hashes[1]);expect(bodies[0]).toBe(bodies[1]);
},30000);

test("a host-authorized alias uses the canonical project for listing, upload and submission", async () => {
  const value = await fixture();
  const calls: Array<{ route: string; projectId?: string }> = [];
  const handler = createSwarmProxyHandler({
    ...value.options,
    resolveProject: async id => ["editor-workspace", "project-1"].includes(id)
      ? { id: "project-1", name: "Fixture", rootPath: value.root } : undefined,
    fetch: async (input, init) => {
      const url = new URL(String(input));
      const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ route: url.pathname, projectId: url.searchParams.get("projectId") ?? body?.projectId });
      if (url.pathname.endsWith("/sources")) return init?.method!=="POST"?Response.json({error:"Not cached"},{status:404}):Response.json({ id: "source-1",sha256:new Headers(init.headers).get("x-content-sha256"),bytes:new Uint8Array(await new Response(init.body).arrayBuffer()).length });
      if (url.pathname.endsWith("/runs") && init?.method !== "POST") return Response.json([value.run]);
      return Response.json(body ? { ...value.run, request: body, status: "READY" } : value.run);
    },
  });
  const context = await handler(new Request("http://localhost/api/swarm/v1/context?projectId=editor-workspace"));
  expect((await context!.json()).projectId).toBe("project-1");
  expect((await handler(new Request("http://localhost/api/swarm/v1/runs?projectId=editor-workspace")))?.status).toBe(200);
  const request = createSwarmRequestSchema.parse({ ...value.run.request, projectId: "editor-workspace", repository: { revision: value.source.baseRevision } });
  const submitted = await handler(new Request("http://localhost/api/swarm/v1/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) }));
  expect(submitted?.status).toBe(200);
  expect((await submitted!.json()).request.projectId).toBe("project-1");
  expect(calls.map(call => call.projectId)).toEqual(["project-1", "project-1", "project-1", "project-1"]);
  expect((await handler(new Request("http://localhost/api/swarm/v1/runs/run-1")))?.status).toBe(200);
  const callCount = calls.length;
  expect((await handler(new Request("http://localhost/api/swarm/v1/runs?projectId=arbitrary")))?.status).toBe(400);
  expect(calls).toHaveLength(callCount);
}, 30000);

test("canonical mapping does not authorize an old alias-owned or unrelated run", async () => {
  const value = await fixture();
  for (const projectId of ["editor-workspace", "unrelated-project"]) {
    const handler = createSwarmProxyHandler({
      ...value.options,
      resolveProject: async id => ["editor-workspace", "project-1"].includes(id)
        ? { id: "project-1", name: "Fixture", rootPath: value.root } : undefined,
      fetch: async () => Response.json({ ...value.run, request: { ...value.run.request, projectId } }),
    });
    const response = await handler(new Request("http://localhost/api/swarm/v1/runs/run-1"));
    expect(response?.status).toBe(400);
    expect((await response!.json()).error).toBe("Project access denied.");
  }
}, 30000);


test("archive proxy blocks host mutation and memory writes before local or provider access", async () => {
  let reads = 0, memory = 0;
  const run = swarmRunSchema.parse({id:"archive-run",request:{requestId:"archive-request",projectId:"remote-project",goal:"Inspect archive",repository:{revision:"a".repeat(40)}},status:"COMPLETED",createdAt:1,updatedAt:1,tasks:[],candidates:[],artifacts:[],messages:[],metrics:{}});
  const handler = createSwarmProxyHandler({ archive: true, baseUrl: "http://127.0.0.1:1", token: "ephemeral-archive-owner", resolveProject: id => ["local-project", "remote-project"].includes(id) ? {id:"remote-project",name:"Archived project",rootPath:"nonexistent-no-local-source-read"} : undefined,
    onDisposition: () => { memory++; }, fetch: async(input, init) => { reads++; expect(init?.method ?? "GET").toBe("GET"); const url = new URL(String(input));
      if(url.pathname.endsWith("/context")) { expect(url.searchParams.get("projectId")).toBe("remote-project"); return Response.json({projectId:"remote-project",repository:run.request.repository}); }
      if(url.pathname.endsWith("/runs")) return Response.json([run]);
      return Response.json(run);
    } });
  for(const route of ["/runs", "/runs/archive-run/approve", "/runs/archive-run/browser-access", "/runs/archive-run/follow-up"])
    expect((await handler(new Request(`http://localhost/api/swarm/v1${route}`, {method:"POST"})))?.status).toBe(403);
  expect(reads).toBe(0);
  for(const route of ["/context?projectId=local-project", "/runs?projectId=local-project", "/runs/archive-run"])
    expect((await handler(new Request(`http://localhost/api/swarm/v1${route}`)))?.status).toBe(200);
  expect(reads).toBe(3); expect(memory).toBe(0);
});
