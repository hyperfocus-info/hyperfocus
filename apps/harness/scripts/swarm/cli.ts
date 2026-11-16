import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createSwarmRequestSchema, swarmRunSchema } from "@hyperfocus/ai-core/swarm";
import { createSwarmSourceSnapshot } from "@hyperfocus/ai-runtime/swarm";
import { createPublicSwarmSite, revokePublicSwarmSite, startSwarmSite } from "./site";
import { launchRemoteSwarm } from "./launch";
import { createAgentEventClient } from "@hyperfocus/ai-core/agent-events";
const [command, ...args] = process.argv.slice(2);
function flag(name: string) { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; }
function required(value: string | undefined, label: string) {
  if (!value)
    throw Error(`${label} is required.`); return value;
}
if (!command || command === "help") {
  console.log(`Hyperfocus Swarm
  status                             Provider capability and configured projects
  site [--project ID] [--run ID] [--host-url URL]  Start/reuse the native streaming swarm website
  site --public --run ID [--access view|control] [--expires-minutes 60]  Issue a private one-use public URL
  site-revoke --access-id ID          Revoke a public link and its browser sessions
  source-check --root REPOSITORY      Verify an immutable upload without starting cloud work
  list [--project ID]                Durable runs
  submit --file REQUEST.json [--root REPOSITORY]  Upload immutable working source and create a run
  launch --file REQUEST.json --root REPOSITORY  Start a cloud-owned adaptive campaign and return phone access
  inspect --run ID                   Run, tasks, evidence and budgets
  continue --project ID --agent ID  Resume the durable agent inbox; does not start local work
  wait --project ID --agent ID      Await one native event callback, at most 55s; disconnect is safe
  acknowledge --project ID --agent ID --event ID  Mark a durably incorporated result consumed
  start --run ID                     Execute a reviewed plan
  cancel --run ID                    Propagate cancellation and cleanup
  steer --run ID --text TEXT [--task ID]  Persist bounded instructions for the next reasoning turn
  follow-up --run ID --goal TEXT [--done TEXT]  Queue a linked reviewable plan on the same source
  reject --run ID [--candidate ID]    Reject a candidate or finish without integration
  compare --run ID                   Candidate evidence summaries
  artifacts --run ID                 Immutable artifact index
  artifact --run ID --artifact ID --out PATH  Retrieve and hash-check evidence
  cleanup                           Remove owned orphaned execution environments

Set HYPERFOCUS_SWARM_URL and HYPERFOCUS_SWARM_TOKEN. Integration approval uses
the Harness/Editor review UI, which verifies the local source before applying.
Submission JSON supports mode auto/value/max-intelligence, difficulty auto/bounded/complex,
doneCriteria, maxWorkers, and budget maxTotalTokens/maxWeeklyQuotaPercent/maxDurationMs.
The site uses existing host configuration and never starts cloud workloads by itself.
Public links need a deployed coordinator with SWARM_PUBLIC_ORIGIN configured; view is
the default. Control permits only this run and its linked follow-ups, not source uploads
or integration. Browser sessions default to seven days and never outlive the deployment.`);
}
else if (command === "site") {
  const result = args.includes("--public")
    ? await createPublicSwarmSite({ runId: required(flag("--run"), "--run"), access: flag("--access"), ...(flag("--expires-minutes") ? { expiresInMs: Number(flag("--expires-minutes")) * 60_000 } : {}) })
    : await startSwarmSite({ projectId: flag("--project"), runId: flag("--run"), hostUrl: flag("--host-url") });
  console.log(JSON.stringify(result, null, 2));
}
else if (command === "site-revoke") {
  console.log(JSON.stringify(await revokePublicSwarmSite({ accessId: required(flag("--access-id"), "--access-id") }), null, 2));
}
else if (command === "source-check") {
  const root=required(flag("--root"),"--root"),started=performance.now();
  const { bytes, ...snapshot } = await createSwarmSourceSnapshot({ root });const coldMs=performance.now()-started;
  let reuseCheck:unknown;
  if(args.includes("--reuse-check")){
    const warmStart=performance.now(),cached=await createSwarmSourceSnapshot({root,findExisting:async identity=>identity.revision===snapshot.revision?{id:"a".repeat(64),sha256:snapshot.sha256,bytes:bytes.length}:undefined});
    reuseCheck={localAcknowledgementFixture:true,captureMs:performance.now()-warmStart,bundleBytesAvoided:cached.existingSource?bytes.length:0,sourceUnchanged:cached.revision===snapshot.revision};
  }
  console.log(JSON.stringify({ ...snapshot, bytes: bytes.length,coldCaptureMs:coldMs,reuseCheck,uploaded: false, workloadsStarted: false }, null, 2));
}
else if(command==="launch"){
  const input=JSON.parse(await readFile(required(flag("--file"),"--file"),"utf8"));
  if(flag("--agent"))input.agentRecipientId=flag("--agent");
  const result=await launchRemoteSwarm({input,root:required(flag("--root"),"--root"),coordinatorUrl:required(process.env.HYPERFOCUS_SWARM_URL,"HYPERFOCUS_SWARM_URL"),token:required(process.env.HYPERFOCUS_SWARM_TOKEN,"HYPERFOCUS_SWARM_TOKEN"),onStage:stage=>console.error(JSON.stringify({stage:stage.name,elapsedMs:stage.elapsedMs}))});
  console.log(JSON.stringify(result,null,2));
}
else {
  const url = new URL(required(process.env.HYPERFOCUS_SWARM_URL, "HYPERFOCUS_SWARM_URL"));
  if (url.protocol !== "https:" && !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    throw Error("Remote coordinator requires HTTPS.");
  const token = required(process.env.HYPERFOCUS_SWARM_TOKEN, "HYPERFOCUS_SWARM_TOKEN");
  async function request(route: string, body?: unknown) {
    const response = await fetch(new URL(`/api/swarm/v1${route}`, url), { method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "error", signal: AbortSignal.timeout(120000) }); if (!response.ok)
      throw Error(await response.text()); return response.json();
  }
  let result: unknown;
  if (["continue","wait","acknowledge"].includes(command)) {
    const recipient={projectId:required(flag("--project"),"--project"),recipientId:required(flag("--agent"),"--agent")};
    const events=createAgentEventClient({baseUrl:new URL("/api/agent-events/v1",url).href,
      fetch:(input,init)=>fetch(input,{...init,headers:{...Object.fromEntries(new Headers(init?.headers)),authorization:`Bearer ${token}`}})});
    if(command==="acknowledge") {await events.acknowledge(recipient,required(flag("--event"),"--event"));result={acknowledged:true};}
    else result=command==="wait"?await events.wait(recipient,{signal:AbortSignal.timeout(60000)}):await events.resume(recipient);
  }
  else if (command === "status")
    result = await request("/capabilities");
  else if (command === "list")
    result = await request(`/runs${flag("--project") ? `?projectId=${encodeURIComponent(flag("--project")!)}` : ""}`);
  else if (command === "cleanup")
    result = await request("/cleanup", {});
  else if (command === "submit") {
    const input = createSwarmRequestSchema.parse(JSON.parse(await readFile(required(flag("--file"), "--file"), "utf8")));
    const root = flag("--root");
    if (root) {
      const snapshot = await createSwarmSourceSnapshot({ root });
      const upload = await fetch(new URL(`/api/swarm/v1/sources?projectId=${encodeURIComponent(input.projectId)}&revision=${snapshot.revision}`, url), { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream", "x-content-sha256": snapshot.sha256 }, body: snapshot.bytes, redirect: "error" });
      if (!upload.ok)
        throw Error(await upload.text());
      const value: unknown = await upload.json();
      if (typeof value !== "object" || !value || !("id" in value) || typeof value.id !== "string")
        throw Error("Invalid source receipt.");
      input.repository = { ...input.repository, revision: snapshot.revision, baseRevision: snapshot.baseRevision, sourceArtifactId: value.id };
    }
    result = await request("/runs", input);
  }
  else {
    const runId = encodeURIComponent(required(flag("--run"), "--run"));
    if (command === "steer")
      result = await request(`/runs/${runId}/steer`, { requestId: flag("--request-id") ?? crypto.randomUUID(), text: required(flag("--text"), "--text"), taskId: flag("--task") });
    else if (command === "follow-up")
      result = await request(`/runs/${runId}/follow-up`, { requestId: flag("--request-id") ?? crypto.randomUUID(), goal: required(flag("--goal"), "--goal"), ...(flag("--done") ? { doneCriteria: [flag("--done")] } : {}) });
    else if (["start", "cancel", "reject"].includes(command))
      result = await request(`/runs/${runId}/${command}`, { candidateId: flag("--candidate") });
    else {
      const run = swarmRunSchema.parse(await request(`/runs/${runId}`));
      if (command === "inspect")
        result = run;
      else if (command === "compare")
        result = { runId: run.id, status: run.status, candidates: run.candidates, selectedCandidateId: run.selectedCandidateId };
      else if (command === "artifacts")
        result = run.artifacts;
      else if (command === "artifact") {
        const artifact = run.artifacts.find(value => value.id === flag("--artifact"));
        if (!artifact)
          throw Error("Unknown artifact.");
        const response = await fetch(new URL(`/api/swarm/v1/runs/${runId}/artifacts/${artifact.id}`, url), { headers: { authorization: `Bearer ${token}` }, redirect: "error" });
        if (!response.ok)
          throw Error("Artifact retrieval failed.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256)
          throw Error("Artifact integrity failure.");
        const output = path.resolve(required(flag("--out"), "--out"));
        await mkdir(path.dirname(output), { recursive: true });
        await writeFile(output, bytes, { flag: "wx" });
        result = { ...artifact, path: output };
      }
      else
        throw Error(`Unknown swarm command: ${command}`);
    }
  }
  console.log(JSON.stringify(result, null, 2));
}
