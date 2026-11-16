import { afterEach, expect, spyOn, test } from "bun:test";
import { render } from "solid-js/web";
import { swarmRunSchema, type SwarmFetch } from "@hyperfocus/ai-core/swarm";
import { HarnessSwarmLauncher } from "./swarm-launcher";
import { ChatPanel } from "../chat-panel";
import { harnessStore } from "../../harness-store";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../../utils/tests/test-fixtures";
import { mountTestUiProviders } from "../../utils/tests/test-ui-providers";

afterEach(()=>{document.body.replaceChildren();document.head.querySelector('meta[name="harness-session-token"]')?.remove();});
const settle=()=>new Promise(resolve=>setTimeout(resolve,20));
test("native status keeps receiving coordinator updates after its dialog closes",async()=>{
  const meta=document.createElement("meta");meta.name="harness-session-token";meta.content="test-session";document.head.append(meta);
  const run=swarmRunSchema.parse({id:"run-1",request:{requestId:"request-1",projectId:"project-1",goal:"Investigate performance",repository:{revision:"a".repeat(40)}},status:"RUNNING",createdAt:1,updatedAt:1,tasks:[],candidates:[],messages:[],artifacts:[],metrics:{}});
  let stream:ReadableStreamDefaultController<Uint8Array>|undefined;
  let streamSignal:AbortSignal|null|undefined;
  const request:SwarmFetch=async(input,init)=>{
    const route=String(input);
    if (route.endsWith("/events")) {streamSignal=init?.signal;return new Response(new ReadableStream({start(controller){stream=controller;init?.signal?.addEventListener("abort",()=>controller.close(),{once:true});}}),{headers:{"content-type":"text/event-stream"}});}
    if (route.includes("/context")) return Response.json({projectId:"project-1",name:"Project",repository:run.request.repository,dirty:false,sourceSnapshotRequired:true,provider:{available:true}});
    if (route.endsWith("/capabilities")) return Response.json({available:true,backends:["railway"],maxWorkers:3,projects:[]});
    return Response.json([run]);
  };
  const host=document.createElement("div");document.body.append(host);
  const dispose=render(()=><HarnessSwarmLauncher projectId="project-1" projectName="Project" goal="" fetch={request}/>,host);
  try {
    await settle();
    const launcher=host.querySelector<HTMLButtonElement>("[data-test-harness-run-with-swarm]")!;
    expect(launcher.textContent).toContain("Swarm: Running");launcher.click();await settle();
    document.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!.click();await settle();
    expect(streamSignal?.aborted).toBe(false);
    stream!.enqueue(new TextEncoder().encode(`event: swarm\ndata: ${JSON.stringify({...run,status:"VALIDATING",updatedAt:2})}\n\n`));await settle();
    expect(launcher.textContent).toContain("Swarm: Validating");
  } finally {dispose();}
  expect(streamSignal?.aborted).toBe(true);
});

test("the real chat header retains same-project ownership and remounts the launcher on project change", async () => {
  mountTestUiProviders();
  clearBrowserStateForTests();
  const meta = document.createElement("meta"); meta.name = "harness-session-token"; meta.content = "test-session"; document.head.append(meta);
  const projects = [createViewProjectFixture({ id: "project-a", name: "Project A" }), createViewProjectFixture({ id: "project-b", name: "Project B" })];
  const runs = projects.map(project => swarmRunSchema.parse({ id: `run-${project.id}`, request: { requestId: `request-${project.id}`, projectId: project.id, goal: `Review ${project.name}`, repository: { revision: "a".repeat(40) } }, status: "RUNNING", createdAt: 1, updatedAt: 1, tasks: [], candidates: [], messages: [], artifacts: [], metrics: {} }));
  const streams = new Map<string, { signal: AbortSignal | null | undefined; send: ReadableStreamDefaultController<Uint8Array> }>();
  const request = spyOn(globalThis, "fetch").mockImplementation(Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const route = new URL(String(input), "http://localhost");
    if (route.pathname.endsWith("/events")) {
      const runId = route.pathname.split("/").at(-2)!;
      return new Response(new ReadableStream({ start(send) { streams.set(runId, { signal: init?.signal, send }); init?.signal?.addEventListener("abort", () => send.close(), { once: true }); } }), { headers: { "content-type": "text/event-stream" } });
    }
    const projectId = route.searchParams.get("projectId");
    if (route.pathname.endsWith("/context")) return Response.json({ projectId, name: projectId, repository: { revision: "a".repeat(40) }, dirty: false, sourceSnapshotRequired: true, provider: { available: true } });
    if (route.pathname.endsWith("/capabilities")) return Response.json({ available: true, backends: ["railway"], maxWorkers: 3, projects: [] });
    return Response.json(runs.filter(run => run.request.projectId === projectId));
  }, { preconnect: fetch.preconnect }));
  seedHarnessStoreForTests(createHarnessStateFixture({ workspace: { activeProjectId: "project-a", projects } }));
  const host = document.createElement("div"); document.body.append(host);
  const dispose = render(() => <ChatPanel />, host);
  try {
    await settle();
    const originalLauncher = host.querySelector<HTMLButtonElement>("[data-test-harness-run-with-swarm]");
    expect(originalLauncher?.textContent).toContain("Swarm: Running");
    const first = streams.get("run-project-a");
    expect(first?.signal?.aborted).toBe(false);
    harnessStore.replaceStateForTests(createHarnessStateFixture({ workspace: { activeProjectId: "project-a", projects: projects.map(project => ({ ...project, name: `${project.name} renamed` })) } }));
    await settle();
    expect(host.querySelector("[data-test-harness-run-with-swarm]")).toBe(originalLauncher);
    expect(first?.signal?.aborted).toBe(false);
    harnessStore.replaceStateForTests(createHarnessStateFixture({ workspace: { activeProjectId: "project-b", projects } }));
    await settle();
    const nextLauncher = host.querySelector<HTMLButtonElement>("[data-test-harness-run-with-swarm]");
    expect(nextLauncher).not.toBe(originalLauncher);
    expect(first?.signal?.aborted).toBe(true);
    const second = streams.get("run-project-b");
    expect(second?.signal?.aborted).toBe(false);
    second!.send.enqueue(new TextEncoder().encode(`event: swarm\ndata: ${JSON.stringify({ ...runs[1], status: "VALIDATING", updatedAt: 2 })}\n\n`));
    await settle();
    expect(nextLauncher?.textContent).toContain("Swarm: Validating");
  } finally { dispose(); request.mockRestore(); clearBrowserStateForTests(); }
  expect(streams.get("run-project-b")?.signal?.aborted).toBe(true);
});
