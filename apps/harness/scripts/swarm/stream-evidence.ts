import { applySwarmRunFrame,createSwarmRunFrame,swarmRunSchema } from "@hyperfocus/ai-core/swarm";
import { createPerformanceEvidenceReport,readBenchmarkEnvironment } from "@hyperfocus/performance";
import { mkdir,writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createSwarmEventResponse } from "../../cli/src/swarm/stream/response";
import { distribution } from "./evidence-distribution";

// Bounded synthetic transport calibration; no game workload, model call or cloud resource.
const run = swarmRunSchema.parse({ id:"stream-fixture",request:{requestId:"fixture-request",projectId:"fixture-project",goal:"SIMULATED transport evidence",repository:{revision:"a".repeat(40)}},status:"RUNNING",createdAt:1,updatedAt:1,tasks:[],candidates:[],artifacts:[],metrics:{},messages:Array.from({length:500},(_,index)=>({id:`message-${index}`,swarmId:"stream-fixture",taskId:"investigate",agentId:"fixture-agent",sourceRevision:"a".repeat(40),kind:"evidence",text:`SIMULATED finding ${index}: ${"bounded attributable evidence ".repeat(25)}`,artifactIds:[],createdAt:index}))});
const state = applySwarmRunFrame({frame:createSwarmRunFrame({run}),runId:run.id});
const next = swarmRunSchema.parse({...run,updatedAt:2,messages:[...run.messages,{...run.messages[0],id:"new-message",text:"One additional finding"}],metrics:{...run.metrics,modelCalls:1}});
const frame = createSwarmRunFrame({previous:state,run:next});
const full = JSON.stringify(next), delta = JSON.stringify(frame);
if (JSON.stringify(applySwarmRunFrame({previous:state,frame:JSON.parse(delta),runId:run.id}).run)!==full) throw Error("Stream parity failed.");
const fullLoop = () => swarmRunSchema.parse(JSON.parse(JSON.stringify(next)));
const deltaLoop = () => applySwarmRunFrame({previous:state,frame:JSON.parse(JSON.stringify(createSwarmRunFrame({previous:state,run:next}))),runId:run.id});
const samples: {full:number[];delta:number[]} = {full:[],delta:[]};
for(let trial=0;trial<24;trial++) for(const kind of trial%2===0 ? ["full","delta"] : ["delta","full"]) {
  const start=performance.now(); if(kind==="full")fullLoop();else deltaLoop();
  if(trial>=4)(kind==="full"?samples.full:samples.delta).push(performance.now()-start);
}

async function compressedTransport(values:string[]){const text=values.map(value=>`event: swarm\ndata: ${value}\n\n`).join("");const body=new ReadableStream<Uint8Array>({start(controller){for(const value of values)controller.enqueue(new TextEncoder().encode(`event: swarm\ndata: ${value}\n\n`));controller.close();}});const start=performance.now();const response=createSwarmEventResponse(new Request("https://fixture.invalid/events",{headers:{"accept-encoding":"gzip"}}),body);const bytes=new Uint8Array(await response.arrayBuffer());if(new TextDecoder().decode(Bun.gunzipSync(bytes))!==text)throw Error("Compressed transport parity failed.");return{bytes:bytes.length,elapsedMs:performance.now()-start,parity:true};}
const initial=JSON.stringify(createSwarmRunFrame({run}));
const transport={snapshotThenFull:await compressedTransport([initial,full]),snapshotThenDelta:await compressedTransport([initial,delta])};
const report=createPerformanceEvidenceReport({benchmark:"swarm-run-stream",environment:readBenchmarkEnvironment({name:"Bun",version:Bun.version}),config:{fixture:true,retainedFindings:500,newFindings:1,warmups:4,pairedTrials:20,order:"AB/BA",scope:"serialize/parse/validate/reconstruct in memory; not a measured network round trip",compression:"Equal gzip defaults for isolated byte comparison; actual HTTP helper also measured at level 1 with sync flush per frame. Helper timings are single samples, not latency evidence."},structuralEvidence:{parity:true,fullJsonBytes:Buffer.byteLength(full),deltaJsonBytes:Buffer.byteLength(delta),fullGzipBytes:gzipSync(full).byteLength,deltaGzipBytes:gzipSync(delta).byteLength,compressedTransport:transport,maximumFrameBytes:8_000_000,reconnect:"fresh snapshot",slowReader:"bounded queues; coalesce pending updates"},measurements:{full:distribution(samples.full),delta:distribution(samples.delta),conclusion:"Bandwidth reduction demonstrated for this fixture. Local CPU calibration only; no cloud latency or CPU improvement claim."}});
const directory=path.resolve(import.meta.dir,"../../.local/swarm-stream-evidence");await mkdir(directory,{recursive:true});const file=path.join(directory,"report.json");await writeFile(file,JSON.stringify(report,null,2));console.log(JSON.stringify({file,evidence:report.evidence}));
