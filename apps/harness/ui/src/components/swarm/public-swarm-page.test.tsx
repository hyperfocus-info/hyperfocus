import { afterEach, beforeEach, expect, test } from "bun:test";
import { render } from "solid-js/web";
import { swarmCandidateSchema, swarmRunSchema, type SwarmFetch } from "@hyperfocus/ai-core/swarm";
import { PublicSwarmPage } from "./public-swarm-page";
import { createPublicSwarmFetch, type PublicSwarmSession } from "./public-session";
import { setTestUrl } from "../../utils/tests/test-harness";

beforeEach(()=>setTestUrl("http://localhost/"));
afterEach(()=>{document.body.replaceChildren();history.replaceState(null,"","/");});
const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
const revision="a".repeat(40);
function fixture(access:"view"|"control") {
  const context={projectId:"project",name:"SIMULATED PUBLIC UI FIXTURE",repository:{url:"",revision},dirty:false,sourceSnapshotRequired:false,provider:{available:true}};
  const capabilities={available:true,backends:["local" as const],maxWorkers:3,projects:[{id:"project",name:context.name}]};
  const session:PublicSwarmSession={csrfToken:"scoped-csrf",access:{id:"access",runId:"run",projectId:"project",access,expiresAt:Date.now()+60_000},context,capabilities};
  let run=swarmRunSchema.parse({id:"run",request:{requestId:"request",projectId:"project",goal:"SIMULATED UI review",repository:{revision}},status:"READY",createdAt:1,updatedAt:1,tasks:[],candidates:[],artifacts:[],messages:[],metrics:{}});
  const calls:Array<{path:string;method:string;body?:unknown}>=[];
  const request:SwarmFetch=async(input,init)=>{
    const path=new URL(String(input),location.origin).pathname;const method=init?.method ?? "GET";calls.push({path,method,...(init?.body ? {body:JSON.parse(String(init.body))} : {})});
    const headers=new Headers(init?.headers);expect(headers.has("authorization")).toBe(false);expect(headers.has("x-harness-session-token")).toBe(false);
    if(path.endsWith("/session")){if(method==="DELETE"){expect(headers.get("x-swarm-csrf-token")).toBe("scoped-csrf");return new Response(null,{status:204});}return Response.json(session);}
    if(method!=="GET")expect(headers.get("x-swarm-csrf-token")).toBe("scoped-csrf");
    if(path.endsWith("/context"))return Response.json(context);
    if(path.endsWith("/capabilities"))return Response.json(capabilities);
    if(path.endsWith("/follow-up")){run={...run,id:"child",parentRunId:"run",status:"READY"};return Response.json(run);}
    if(path.endsWith("/cancel")){run={...run,status:"CANCELLED"};return Response.json(run);}
    if(path.endsWith("/steer"))return Response.json(run);
    return Response.json([run]);
  };
  return {session,request,calls,setReview(){run={...run,status:"AWAITING_APPROVAL",candidates:[swarmCandidateSchema.parse({id:"candidate",agentId:"agent",hypothesis:"Retain evidence",sourceRevision:revision,patchArtifactId:"patch",correctness:"passed",disposition:"recommended",comparison:{decision:"IMPROVED",reasons:[]}})]};}};
}

test("public view consumes its one-use fragment and exposes evidence without host credentials or mutations",async()=>{
  const state=fixture("view");state.setReview();history.replaceState(null,"","/swarm#code=one-use");
  const host=document.createElement("div");document.body.append(host);const dispose=render(()=><PublicSwarmPage fetch={state.request}/>,host);
  try {
    await settle();expect(location.hash).toBe("");expect(state.calls[0]?.body).toEqual({code:"one-use"});
    expect(host.textContent).toContain("Read-only access");expect(host.textContent).toContain("Integration requires local Harness");
    const labels=[...host.querySelectorAll("button")].map(button=>button.textContent);
    expect(labels).not.toContain("Approve and integrate");expect(labels).not.toContain("Finish without integrating");expect(labels).not.toContain("Queue follow-up plan");
    expect(labels).not.toContain("Create cloud link");
    expect(host.querySelector('[aria-label="Engineering goal"]')).toBeNull();
  }finally{dispose();}
});

test("public control sends scoped steering and queues a child without launching it",async()=>{
  const state=fixture("control");history.replaceState(null,"","/swarm");
  const host=document.createElement("div");document.body.append(host);const dispose=render(()=><PublicSwarmPage fetch={state.request}/>,host);
  try {
    await settle();
    const steer=host.querySelector<HTMLTextAreaElement>('[aria-label="Steer this run"]')!;
    steer.value="Retain blockers";steer.dispatchEvent(new Event("input",{bubbles:true}));steer.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));await settle();
    [...host.querySelectorAll("summary")].find(summary=>summary.textContent==="Queue a follow-up")!.click();
    const fill=(label:string,text:string)=>{const field=host.querySelector<HTMLTextAreaElement>(`[aria-label="${label}"]`)!;field.value=text;field.dispatchEvent(new Event("input",{bubbles:true}));field.closest("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));};
    fill("Follow-up goal","Document remaining evidence");await settle();
    expect(state.calls.some(call=>call.path.endsWith("/steer"))).toBe(true);expect(state.calls.some(call=>call.path.endsWith("/follow-up"))).toBe(true);
    expect(state.calls.some(call=>call.path.endsWith("/start"))).toBe(false);expect(host.textContent).toContain("Follow-up to run run");
    [...host.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent==="Close session")!.click();await settle();
    expect(host.textContent).toContain("This browser session is closed");
  }finally{dispose();}
});

test("public transport refuses cross-origin and unscoped destinations",()=>{
  const state=fixture("view");const request=createPublicSwarmFetch({session:state.session,origin:location.origin,request:state.request});
  expect(()=>request("https://outside.invalid/api/swarm/v1/browser/runs")).toThrow("scoped API");
  expect(()=>request("/api/swarm/v1/admin/browser-access")).toThrow("scoped API");
});

test("public transport preserves Request bodies, cancellation and ordinary headers while removing owner authority",async()=>{
  const state=fixture("control"), lifetime=new AbortController();
  let forwarded:Request|undefined;
  const request=createPublicSwarmFetch({session:state.session,origin:location.origin,request:async(resource,init)=>{
    expect(init?.credentials).toBe("same-origin");expect(init?.redirect).toBe("error");
    forwarded=new Request(resource,init);return Response.json({ok:true});
  }});
  const original=new Request(`${location.origin}/api/swarm/v1/browser/runs/run/steer`,{
    method:"POST",body:JSON.stringify({text:"Preserve the request"}),signal:lifetime.signal,
    headers:{"content-type":"application/json","x-request-id":"bounded-request","authorization":"Bearer forbidden","x-harness-session-token":"forbidden"},
  });
  await request(original);
  if(!forwarded)throw Error("Missing forwarded request");
  expect(forwarded.method).toBe("POST");expect(await forwarded.json()).toEqual({text:"Preserve the request"});
  expect(forwarded.headers.get("x-request-id")).toBe("bounded-request");
  expect(forwarded.headers.get("x-swarm-csrf-token")).toBe(state.session.csrfToken);
  expect(forwarded.headers.has("authorization")).toBe(false);expect(forwarded.headers.has("x-harness-session-token")).toBe(false);
  lifetime.abort();expect(forwarded.signal.aborted).toBe(true);
});
