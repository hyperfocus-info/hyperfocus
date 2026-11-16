import { createSwarmRequestSchema, swarmRunSchema, swarmSteeringSchema, swarmFollowUpSchema, type SwarmRun, type SwarmTask, type SwarmModelProfiles, type SwarmInvestigationInstrument } from "@hyperfocus/ai-core/swarm";
import type { ExecutionProvider } from "@hyperfocus/ai-core/swarm";
import { createHash } from "node:crypto";
import { planSwarm } from "./plan";
import { taskAttemptKey, terminalSwarmStatuses, transitionSwarm, type SwarmStore } from "./persistence/store";
import { swarmTaskDuration, swarmTaskComputeReservation } from "./outcome/resources";
import { isSwarmModelBudgetError } from "./model-budget";

export type SwarmTaskHandler=(options:{run:SwarmRun;task:SwarmTask;signal:AbortSignal})=>Promise<void>;
export function createSwarmCoordinator(options:{store:SwarmStore;provider:ExecutionProvider;handleTask:SwarmTaskHandler;modelProfiles?:SwarmModelProfiles;executionKind?:(projectId:string)=>"performance"|"engineering";investigationInstruments?:(projectId:string)=>SwarmInvestigationInstrument[];deploymentExpiresAt?:number;maxWorkers?:number;leaseMs?:number;computeUsdPerTask?:number;beforeDispatch?:(run:SwarmRun)=>Promise<{available:boolean;reason?:string;waitingForConnection?:boolean}>}) {
  const {store,provider}=options, owner=crypto.randomUUID(),leaseMs=options.leaseMs??30_000;
  const active=new Map<string,{runId:string;task:SwarmTask;controller:AbortController;promise:Promise<void>;settled:boolean}>();
  let timer:ReturnType<typeof setInterval>|undefined,tickPromise:Promise<void>|undefined,closed=false;
  const cleanups=new Set<Promise<void>>();
  function assertDeployment(){if(options.deploymentExpiresAt!==undefined&&Date.now()>=options.deploymentExpiresAt)throw Error("The authorized deployment lifetime has expired; new work is disabled.");}
  let workspaceHeartbeatAt=0;
  function create(input:unknown,parentRunId?:string) {
    if(closed)throw Error("Swarm coordinator is closed.");
    assertDeployment();
    const request=createSwarmRequestSchema.parse(input);if(request.backend!==provider.kind)throw Error("Requested execution backend is unavailable; local fallback is disabled.");
    const executionKind=options.executionKind?.(request.projectId)??"performance";
    if(request.executionKind&&request.executionKind!==executionKind)throw Error(`Project ${request.projectId} supports ${executionKind} work, not the requested ${request.executionKind} work. Select a project with the matching execution kind from capabilities; the host recipe cannot be overridden by a request.`);
    const id=crypto.randomUUID();const now=Date.now();
    const run=swarmRunSchema.parse({id,request,parentRunId,status:"CREATED",createdAt:now,updatedAt:now,tasks:[],candidates:[],artifacts:[],messages:[],metrics:{}});
    transitionSwarm(run,"PLANNING");Object.assign(run,planSwarm({id,request,modelProfiles:options.modelProfiles,executionKind,investigationInstruments:options.investigationInstruments?.(request.projectId)}));transitionSwarm(run,"READY");
    if(request.executionMode==="campaign"){
      if((!run.outcome&&run.executionKind!=="engineering")||!run.modelPlan)throw Error("Adaptive campaigns require trusted engineering verification or executable instruments, plus planning/review profiles.");
      run.campaign={round:1,finalizationReserveMs:Math.min(60_000,Math.floor(request.budget.maxDurationMs/10)),rounds:[{number:1,candidateIds:run.candidates.map(candidate=>candidate.id),compareTaskId:run.tasks.find(task=>task.kind==="compare")!.id,startedAt:now}]};
    }
    const saved=store.create(run);if(!request.reviewPlan&&saved.status==="READY")return start(saved.id);return saved;
  }
  function start(id:string){if(closed)throw Error("Swarm coordinator is closed.");assertDeployment();const run=store.change(id,run=>{transitionSwarm(run,"RUNNING");run.startedAt??=Date.now();});void tick().catch(()=>{});return run;}
  function steer(id:string,input:unknown){if(closed)throw Error("Swarm coordinator is closed.");const instruction=swarmSteeringSchema.parse(input);return store.change(id,run=>{const messageId=`human-${createHash("sha256").update(instruction.requestId).digest("hex")}`;const existing=run.messages.find(message=>message.id===messageId);const taskId=instruction.taskId??`${run.id}-human`;if(existing){if(existing.text!==instruction.text||existing.taskId!==taskId||existing.kind!=="steering")throw Error("Steering idempotency key already used for another instruction.");return;}if(!["READY","RUNNING","VALIDATING","COMPARING"].includes(run.status))throw Error("This run no longer accepts steering; queue a follow-up.");if(instruction.taskId&&!run.tasks.some(task=>task.id===instruction.taskId&&["PENDING","RUNNING"].includes(task.status)))throw Error("Steering target is not an active task.");run.messages.push({id:messageId,swarmId:run.id,taskId,agentId:"human",sourceRevision:run.request.repository.revision,kind:"steering",text:instruction.text,artifactIds:[],createdAt:Date.now()});run.metrics.humanInterventions++;});}
  function followUp(id:string,input:unknown){if(closed)throw Error("Swarm coordinator is closed.");const next=swarmFollowUpSchema.parse(input);const parent=store.get(id);if(!parent)throw Error("Unknown parent swarm.");return create({...parent.request,requestId:next.requestId,goal:next.goal,doneCriteria:next.doneCriteria??parent.request.doneCriteria,hypotheses:undefined,reviewPlan:true},id);}
  function cancel(id:string){const run=store.change(id,run=>{if(terminalSwarmStatuses.has(run.status))return;transitionSwarm(run,"CANCELLED","Cancelled by user.");run.metrics.humanInterventions++;for(const task of run.tasks)if(task.status==="PENDING")task.status="CANCELLED";});for(const task of run.tasks)active.get(task.id)?.controller.abort(new Error("Swarm cancelled."));void cleanup(id);return run;}
  function reject(id:string,candidateId?:string){return store.change(id,run=>{if(run.status!=="AWAITING_APPROVAL")throw Error("Run is not awaiting review.");if(run.integration?.status==="approved")throw Error("Integration is already approved; cancel the run to stop it.");run.metrics.humanInterventions++;if(candidateId){const candidate=run.candidates.find(c=>c.id===candidateId);if(!candidate)throw Error("Unknown candidate.");candidate.disposition="rejected";}else{for(const candidate of run.candidates)candidate.disposition="rejected";transitionSwarm(run,"COMPLETED","All candidates rejected; findings retained.");}});}
  function approve(id:string,candidateId:string){return store.change(id,run=>{if(run.status!=="AWAITING_APPROVAL")throw Error("Run is not awaiting review.");if(run.modelPlan&&run.completion?.status!=="met")throw Error("Explicit completion criteria were not satisfied by the independent review.");if(run.outcome&&run.outcome.outcomeSuccess!=="demonstrated")throw Error("The desired outcome lacks independent demonstration; task completion alone cannot authorize integration.");if(run.integration?.status==="approved")throw Error("Integration is already approved.");const candidate=run.candidates.find(c=>c.id===candidateId);if(!candidate||candidate.disposition==="rejected"||candidate.correctness!=="passed"||candidate.blockers.length||candidate.comparison?.decision!==(run.executionKind==="engineering"?"VERIFIED":"IMPROVED")||!candidate.patchArtifactId)throw Error("Candidate does not satisfy correctness, performance and regression gates.");run.metrics.humanInterventions++;run.integration={candidateId,status:"approved",detail:"Human approved the verified patch; target host must verify its source and apply it.",at:Date.now()};});}
  function integrated(id:string,input:{candidateId:string;status:"integrated"|"conflict";detail:string}){return store.change(id,run=>{if(run.integration?.status!=="approved"||run.integration.candidateId!==input.candidateId)throw Error("Integration was not approved.");run.integration={...input,at:Date.now()};if(input.status==="integrated"){run.candidates.find(c=>c.id===input.candidateId)!.disposition="accepted";transitionSwarm(run,"COMPLETED");}});}
  function cleanup(runId?:string){const operation=cleanupWorkspaces(runId).finally(()=>cleanups.delete(operation));cleanups.add(operation);return operation;}
  async function cleanupWorkspaces(runId?:string){for(const workspace of store.workspaces(runId)){const worker=active.get(workspace.taskId);if(worker&&!worker.settled&&worker.runId===workspace.swarmId)continue;const run=store.get(workspace.swarmId);const task=run?.tasks.find(t=>t.id===workspace.taskId);const current=task?.workspaceId===workspace.id;const running=current&&task?.status==="RUNNING"&&(task.leaseUntil??0)>Date.now();if(run?.integration?.status==="approved"&&running)continue;if(run&&!terminalSwarmStatuses.has(run.status)&&run.status!=="AWAITING_APPROVAL"&&(running||current&&task?.kind==="baseline"&&task.status==="SUCCEEDED"))continue;
    try{await provider.destroyWorkspace({workspaceId:workspace.id});store.destroyed(workspace.id);}catch{if(run)store.change(run.id,value=>{value.metrics.orphanedResources=store.workspaces(run.id).length;});}
  }}
  async function recoverTasks(){
    store.recover();
    const stopping:Promise<void>[]=[];
    for(const worker of active.values()){
      try{const run=store.get(worker.runId);if(!run||terminalSwarmStatuses.has(run.status))throw Error("Run stopped.");store.owned(run,worker.task.id,worker.task.leaseOwner!,worker.task.leaseFence);}
      catch(error){worker.controller.abort(error);stopping.push(worker.promise);}
    }
    // A lease fence blocks publication immediately; process settlement and
    // workspace destruction must also complete before a retry is eligible.
    await Promise.allSettled(stopping);await cleanup();
  }
  async function recoverOrphans(){
    await recoverTasks();const known=new Set(store.workspaces().map(w=>w.id));
    for(const workspace of await provider.listWorkspaces()){
      if(known.has(workspace.id))continue;
      const run=store.get(workspace.swarmId),task=run?.tasks.find(t=>taskAttemptKey(t)===workspace.taskId);
      let adopted=false;
      if(run&&task&&!terminalSwarmStatuses.has(run.status)){
        try{store.change(run.id,current=>{const live=store.owned(current,task.id,task.leaseOwner!,task.leaseFence);if(live.workspaceId&&live.workspaceId!==workspace.id)return;store.workspace({...workspace,taskId:task.id});live.workspaceId=workspace.id;adopted=true;});}catch{/* An expired attempt is not an adoptable owner. */}
      }
      if(!adopted)await provider.destroyWorkspace({workspaceId:workspace.id});
    }
    await cleanup();
  }
  function tick(){if(closed)return Promise.resolve();return tickPromise??=dispatch().finally(()=>{tickPromise=undefined;});}
  async function dispatch(){
    await recoverTasks();
    if(closed)return;
    if(provider.heartbeatWorkspace&&Date.now()-workspaceHeartbeatAt>60_000){workspaceHeartbeatAt=Date.now();for(const workspace of store.workspaces()){const run=store.get(workspace.swarmId);if(run&&["RUNNING","VALIDATING","COMPARING"].includes(run.status))await provider.heartbeatWorkspace({workspaceId:workspace.id}).catch(()=>{});}}
    for(const run of store.activeRuns()){
      if(closed||active.size>=(options.maxWorkers??3))break;
      if(!["RUNNING","VALIDATING","COMPARING"].includes(run.status))continue;
      while(!closed&&active.size<(options.maxWorkers??3)){
        if(options.deploymentExpiresAt!==undefined&&Date.now()>=options.deploymentExpiresAt){store.change(run.id,value=>{if(!terminalSwarmStatuses.has(value.status))transitionSwarm(value,"TIMED_OUT","Authorized deployment lifetime expired.");});for(const worker of active.values())if(worker.runId===run.id)worker.controller.abort(new Error("Authorized deployment lifetime expired."));break;}
        if(!store.readyTask({runId:run.id,capabilities:["execution","reasoning","benchmark"]}))break;
        if(options.beforeDispatch){
          let admission:{available:boolean;reason?:string;waitingForConnection?:boolean};
          try{admission=await options.beforeDispatch(store.get(run.id)!);}catch(error){admission={available:false,reason:error instanceof Error?error.message:String(error)};}
          if(closed)return;
          if(!admission.available){
            const reason=(admission.reason??"Required subscription or execution provider is unavailable.").slice(0,4000);
            if(admission.waitingForConnection){if(store.get(run.id)?.reason!==reason)store.change(run.id,value=>{value.reason=reason;});break;}
            store.change(run.id,value=>{if(!terminalSwarmStatuses.has(value.status))transitionSwarm(value,"BLOCKED",reason);});
            const stopping=[...active.values()].filter(worker=>worker.runId===run.id);for(const worker of stopping)worker.controller.abort(new Error(reason));
            await Promise.allSettled(stopping.map(worker=>worker.promise));await cleanup(run.id);break;
          }
        }
        // Reserve the full possible workspace lifetime, including the prepared
        // baseline retained until comparison. Prices are declared estimates.
        const latest=store.get(run.id)!;
        const task=store.claim({runId:run.id,owner,ttlMs:leaseMs,capabilities:["execution","reasoning","benchmark"],computeReservationUsd:0,reservationForTask:task=>options.computeUsdPerTask??swarmTaskComputeReservation(latest,task)});if(!task)break;
        const controller=new AbortController();
        const reserve=latest.campaign&&["plan","experiment","investigate","repair"].includes(task.kind)?latest.campaign.finalizationReserveMs:0;
        const deadline=setTimeout(()=>controller.abort(new Error("TASK_TIMED_OUT")),Math.min(swarmTaskDuration(latest,task),Math.max(1,(run.startedAt??Date.now())+run.request.budget.maxDurationMs-reserve-Date.now()),Math.max(1,(options.deploymentExpiresAt??Infinity)-Date.now())));
        const heartbeat=setInterval(()=>{try{store.heartbeat(run.id,task.id,owner,task.leaseFence,leaseMs);}catch(error){controller.abort(error);}},Math.max(10,Math.floor(leaseMs/3)));
        const worker={runId:run.id,task,controller,promise:Promise.resolve(),settled:false};active.set(task.id,worker);
        worker.promise=Promise.resolve().then(async()=>{
          try{await options.handleTask({run:store.get(run.id)!,task,signal:controller.signal});controller.signal.throwIfAborted();store.finish({runId:run.id,taskId:task.id,owner,fence:task.leaseFence});}
          catch(error){const message=error instanceof Error?error.message:String(error);try{store.finish({runId:run.id,taskId:task.id,owner,fence:task.leaseFence,error:message,retryable:!message.includes("MODEL_BUDGET_EXHAUSTED")});if(isSwarmModelBudgetError(error)&&error.rejection.scope==="run")store.change(run.id,value=>{if(!terminalSwarmStatuses.has(value.status)){value.budgetExhausted=true;transitionSwarm(value,"BLOCKED",message);}});}catch{/* A recovered owner has fenced this completion. */}}
          finally{clearTimeout(deadline);clearInterval(heartbeat);worker.settled=true;await cleanup(run.id);if(active.get(task.id)===worker)active.delete(task.id);}
        });
      }
    }
    await cleanup();
  }
  return {create,start,steer,followUp,cancel,reject,approve,integrated,tick,cleanup,recoverOrphans,
    async startLoop(){await recoverOrphans();timer=setInterval(()=>{void tick().catch(()=>{});},250);await tick();},
    async close(){closed=true;clearInterval(timer);for(const task of active.values())task.controller.abort(new Error("Coordinator stopping."));await Promise.allSettled([...(tickPromise?[tickPromise]:[]),...Array.from(active.values(),task=>task.promise)]);await Promise.allSettled([...cleanups]);await cleanup();},
    async drain(){while(active.size||store.activeRuns().some(run=>["RUNNING","VALIDATING","COMPARING"].includes(run.status))){await tick();await Promise.allSettled([...active.values()].map(task=>task.promise));await new Promise(resolve=>setTimeout(resolve,1));}},
  };
}
export type SwarmCoordinator=ReturnType<typeof createSwarmCoordinator>;
