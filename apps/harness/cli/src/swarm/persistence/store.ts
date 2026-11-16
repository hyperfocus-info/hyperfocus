import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { swarmRunSchema, swarmMessageSchema, type SwarmRun, type SwarmTask, type SwarmMessage, type SwarmStatus } from "@hyperfocus/ai-core/swarm";
import { executionWorkspaceSchema, type ExecutionWorkspace } from "@hyperfocus/ai-core/swarm";
import type { AiRunResult } from "@hyperfocus/ai-core/runtime";
import type { SwarmBudgetRejection } from "@hyperfocus/ai-core/swarm";
import { createSwarmModelBudgetError } from "../model-budget";
import { createAgentEventStore } from "@hyperfocus/ai-runtime/agent-events";
import { recordSwarmAgentEvent } from "../agent-events";

const terminal = new Set<SwarmStatus>(["COMPLETED","FAILED","CANCELLED","TIMED_OUT","BLOCKED"]);
const WEEKLY_QUOTA_WINDOW_MINUTES = 10_080;
const transitions:Record<SwarmStatus,SwarmStatus[]> = {
  CREATED:["PLANNING"],PLANNING:["READY"],READY:["RUNNING"],RUNNING:["VALIDATING","COMPARING"],VALIDATING:["COMPARING"],COMPARING:["AWAITING_APPROVAL","RUNNING"],AWAITING_APPROVAL:["COMPLETED"],COMPLETED:[],FAILED:[],CANCELLED:[],TIMED_OUT:[],BLOCKED:[],
};
/** Stable for one lease attempt, distinct after recovery even if the provider retries creation. */
export function taskAttemptKey(task:SwarmTask) {return `${createHash("sha256").update(`${task.swarmId}/${task.id}`).digest("hex").slice(0,32)}-attempt-${task.attempt}-fence-${task.leaseFence}`;}
export function transitionSwarm(run:SwarmRun,status:SwarmStatus,reason?:string) {
  if(run.status===status) return;
  if(run.status==="COMPARING"&&status==="RUNNING"&&!run.campaign)throw Error("Only an adaptive campaign may append another round.");
  if(terminal.has(run.status) || !(transitions[run.status].includes(status) || ["FAILED","CANCELLED","TIMED_OUT","BLOCKED"].includes(status))) throw new Error(`Invalid swarm transition ${run.status} -> ${status}`);
  run.status=status; run.reason=reason;
  if(terminal.has(status)) run.completedAt=Date.now();
}
export function createSwarmReader(db: Database) {
  function get(id:string) {const row=db.query<{data:string},[string]>("SELECT data FROM swarm_runs WHERE id=?").get(id);return row?swarmRunSchema.parse(JSON.parse(row.data)):undefined;}
  function list(projectId?:string) {return db.query<{data:string},[string|null,string|null]>("SELECT data FROM swarm_runs WHERE (? IS NULL OR project_id=?) ORDER BY priority DESC,rowid DESC LIMIT 200").all(projectId??null,projectId??null).map(row=>swarmRunSchema.parse(JSON.parse(row.data)));}
  return {get,list};
}
export type SwarmReader = ReturnType<typeof createSwarmReader>;
export function createSwarmStore(options:{db:Database;now?:()=>number}) {
  const db=options.db,now=options.now??Date.now;
  const agentEvents=createAgentEventStore(db);
  db.exec(`CREATE TABLE IF NOT EXISTS swarm_runs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, request_id TEXT NOT NULL, status TEXT NOT NULL, priority INTEGER NOT NULL, data TEXT NOT NULL, UNIQUE(project_id,request_id));
    CREATE TABLE IF NOT EXISTS swarm_workspaces (id TEXT PRIMARY KEY, swarm_id TEXT NOT NULL, task_id TEXT NOT NULL, data TEXT NOT NULL, destroyed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS swarm_leases (resource TEXT PRIMARY KEY, owner TEXT NOT NULL, fence INTEGER NOT NULL, until_ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS swarm_model_usage (task_id TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0,tokens INTEGER NOT NULL DEFAULT 0,cost REAL NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS swarm_source_artifacts (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,sha256 TEXT NOT NULL,revision TEXT NOT NULL,bytes INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS swarm_workspace_task ON swarm_workspaces(swarm_id,task_id,destroyed);`);
  const {get,list}=createSwarmReader(db);
  function save(run:SwarmRun) {run.updatedAt=Math.max(now(),run.updatedAt+1);const valid=swarmRunSchema.parse(run);
    const prior=db.query<{status:string},[string]>("SELECT status FROM swarm_runs WHERE id=?").get(valid.id);
    db.query("INSERT INTO swarm_runs(id,project_id,request_id,status,priority,data) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data").run(valid.id,valid.request.projectId,valid.request.requestId,valid.status,valid.request.priority,JSON.stringify(valid));
    recordSwarmAgentEvent(agentEvents,valid,prior?.status);return valid;}
  function change(id:string,mutation:(run:SwarmRun)=>void) {return db.transaction(()=>{const run=get(id);if(!run)throw Error("Unknown swarm run.");mutation(run);return save(run);}).immediate();}
  // UI history is bounded; scheduling and recovery must visit every active run.
  function activeRuns() {return db.query<{data:string},[]>("SELECT data FROM swarm_runs WHERE status NOT IN ('COMPLETED','FAILED','CANCELLED','TIMED_OUT','BLOCKED') ORDER BY priority DESC,rowid ASC").all().map(row=>swarmRunSchema.parse(JSON.parse(row.data)));}
  function create(run:SwarmRun) {return db.transaction(()=>{const existing=db.query<{id:string},[string,string]>("SELECT id FROM swarm_runs WHERE project_id=? AND request_id=?").get(run.request.projectId,run.request.requestId);if(existing){const prior=get(existing.id)!;if(JSON.stringify(prior.request)!==JSON.stringify(run.request))throw Error("Idempotency key already used for a different request.");return prior;}return save(run);}).immediate();}
  function eligibleTask(run:SwarmRun,capabilities:SwarmTask["capability"][]) {
      if(!["RUNNING","VALIDATING","COMPARING"].includes(run.status))return;
      if(now()-(run.startedAt??run.createdAt)>run.request.budget.maxDurationMs){transitionSwarm(run,"TIMED_OUT","Run deadline exceeded.");return;}
      const active=run.tasks.filter(t=>t.status==="RUNNING");if(active.length>=run.request.maxWorkers)return;
      // Measurement admission is durable across runs and coordinator restarts.
      // Separate sandboxes do not establish freedom from our own contention.
      const running=activeRuns().flatMap(value=>value.tasks.filter(task=>task.status==="RUNNING"&&!["plan","review","compare"].includes(task.kind)));
      for(const task of run.tasks){
        if(task.status!=="PENDING"||!capabilities.includes(task.capability))continue;
        if(run.campaign&&["plan","experiment","investigate","repair"].includes(task.kind)&&
          now()>=(run.startedAt??run.createdAt)+run.request.budget.maxDurationMs-run.campaign.finalizationReserveMs){
          task.status="BLOCKED";task.error="Campaign is preserving its finalization reserve; no new exploratory work admitted.";continue;
        }
        if(!["plan","review","compare"].includes(task.kind)&&running.some(task=>task.capability==="benchmark"||task.kind==="baseline"))continue;
        if((task.capability==="benchmark"||task.kind==="baseline")&&running.length)continue;
        if(db.query("SELECT 1 FROM swarm_workspaces WHERE swarm_id=? AND task_id=? AND destroyed=0 LIMIT 1").get(run.id,task.id))continue;
        const deps=task.dependencies.map(id=>run.tasks.find(t=>t.id===id)!);
        const join=task.kind==="benchmark"||task.kind==="compare"||task.kind==="review";
        if(deps.some(t=>["PENDING","RUNNING"].includes(t.status)))continue;
        if(!join&&deps.some(t=>t.status!=="SUCCEEDED")){task.status="BLOCKED";task.error="Dependency did not succeed.";continue;}
        return task;
      }
  }
  function readyTask(options:{runId:string;capabilities:SwarmTask["capability"][]}) {
    let ready:SwarmTask|undefined;
    // Resolve failed dependencies and deadlines without reserving or claiming.
    // Claim rechecks the same durable eligibility after external admission.
    change(options.runId,run=>{const task=eligibleTask(run,options.capabilities);if(task)ready=structuredClone(task);});
    return ready;
  }
  function claim(options:{runId:string;owner:string;ttlMs:number;capabilities:SwarmTask["capability"][];computeReservationUsd:number;reservationForTask?:(task:SwarmTask)=>number}) {
    if(!Number.isFinite(options.computeReservationUsd)||options.computeReservationUsd<0||!Number.isFinite(options.ttlMs)||options.ttlMs<=0)throw Error("Invalid task reservation.");
    let claimed:SwarmTask|undefined;
    change(options.runId,run=>{
        const task=eligibleTask(run,options.capabilities);if(!task)return;
        const active=run.tasks.filter(value=>value.status==="RUNNING");
        const usesWorkspace=!["plan","review","compare"].includes(task.kind);
        const reservation=options.reservationForTask?.(task)??options.computeReservationUsd;
        if(!Number.isFinite(reservation)||reservation<0)throw Error("Invalid task compute reservation.");
        if(usesWorkspace&&run.metrics.computeEstimatedUsd+reservation>run.request.budget.maxComputeUsd){run.budgetExhausted=true;transitionSwarm(run,"BLOCKED","Compute budget exhausted before provisioning.");return;}
        if(usesWorkspace)run.metrics.computeEstimatedUsd+=reservation;
        task.status="RUNNING";task.attempt++;task.leaseFence++;task.leaseOwner=options.owner;task.leaseUntil=now()+options.ttlMs;task.heartbeatAt=now();task.startedAt=now();task.error=undefined;
        run.metrics.peakConcurrentTasks=Math.max(run.metrics.peakConcurrentTasks,active.length+1);
        if(task.kind==="validate"&&run.status==="RUNNING"&&run.tasks.filter(t=>t.kind==="investigate").every(t=>!["RUNNING","PENDING"].includes(t.status)))transitionSwarm(run,"VALIDATING");
        if(task.kind==="compare")transitionSwarm(run,"COMPARING");
        claimed=structuredClone(task);return;
    });return claimed;
  }
  function owned(run:SwarmRun,taskId:string,owner:string,fence:number) {const task=run.tasks.find(t=>t.id===taskId);if(!task||task.status!=="RUNNING"||task.leaseOwner!==owner||task.leaseFence!==fence||!task.leaseUntil||task.leaseUntil<=now())throw Error("Stale task lease.");return task;}
  function heartbeat(runId:string,taskId:string,owner:string,fence:number,ttlMs:number) {change(runId,run=>{const task=owned(run,taskId,owner,fence);if(terminal.has(run.status))throw Error("Run stopped.");task.heartbeatAt=now();task.leaseUntil=now()+ttlMs;});}
  function finish(options:{runId:string;taskId:string;owner:string;fence:number;error?:string;retryable?:boolean;mutation?:(run:SwarmRun,task:SwarmTask)=>void}) {return change(options.runId,run=>{const task=owned(run,options.taskId,options.owner,options.fence);options.mutation?.(run,task);db.query("UPDATE swarm_leases SET until_ms=0 WHERE owner=?").run(task.id);task.completedAt=now();task.leaseUntil=undefined;task.leaseOwner=undefined;
    if(terminal.has(run.status)){task.status="CANCELLED";return;}
    if(options.error){task.error=options.error.slice(0,4_000);if(run.messages.length<2_000)run.messages.push({id:`${task.id}-failure-${task.attempt}-${task.leaseFence}`,swarmId:run.id,taskId:task.id,agentId:task.agentId,sourceRevision:run.request.repository.revision,kind:"blocker",text:`Attempt ${task.attempt} failed: ${task.error}`,artifactIds:[],createdAt:now()});run.metrics.failedTasks++;task.status=options.retryable!==false&&task.attempt<task.maxAttempts?"PENDING":"FAILED";task.workspaceId=undefined;if(task.kind==="baseline"&&task.status==="FAILED")transitionSwarm(run,"FAILED","Baseline preparation failed.");}else task.status="SUCCEEDED";
  });}
  function recover(){const recovered:string[]=[];for(const run of activeRuns()){change(run.id,value=>{for(const task of value.tasks){if(task.status==="RUNNING"&&(task.leaseUntil??0)<=now()){db.query("UPDATE swarm_leases SET until_ms=0 WHERE owner=?").run(task.id);task.status=task.attempt<task.maxAttempts?"PENDING":"FAILED";task.error="Worker lease expired; restarting from durable evidence in a fresh workspace.";task.leaseOwner=undefined;task.leaseUntil=undefined;task.workspaceId=undefined;task.leaseFence++;recovered.push(task.id);if(task.kind==="baseline"&&task.status==="FAILED")transitionSwarm(value,"FAILED","Baseline worker expired and exhausted its retry limit.");}}});}return recovered;}
  function message(input:SwarmMessage,lease?:{owner:string;fence:number}) {const message=swarmMessageSchema.parse(input);return change(message.swarmId,run=>{if(lease){owned(run,message.taskId,lease.owner,lease.fence);if(terminal.has(run.status))throw Error("Run stopped.");}if(run.messages.some(m=>m.id===message.id))return;if(run.messages.length>=2_000)throw Error("Message limit exceeded.");if(!run.tasks.some(t=>t.id===message.taskId&&t.agentId===message.agentId))throw Error("Unknown message actor.");if(message.sourceRevision!==run.request.repository.revision)throw Error("Message revision mismatch.");run.messages.push(message);if(message.kind==="evidence")run.metrics.firstFindingAt??=now();});}
  function lease(resource:string,owner:string,ttlMs:number) {return db.transaction(()=>{const prior=db.query<{owner:string;fence:number;until_ms:number},[string]>("SELECT owner,fence,until_ms FROM swarm_leases WHERE resource=?").get(resource);if(prior&&prior.until_ms>now())throw Error("Resource lease is occupied.");const fence=(prior?.fence??0)+1;db.query("INSERT INTO swarm_leases VALUES(?,?,?,?) ON CONFLICT(resource) DO UPDATE SET owner=excluded.owner,fence=excluded.fence,until_ms=excluded.until_ms").run(resource,owner,fence,now()+ttlMs);return{resource,owner,fence};}).immediate();}
  function assertLease(value:{resource:string;owner:string;fence:number}) {const row=db.query<{owner:string;fence:number;until_ms:number},[string]>("SELECT owner,fence,until_ms FROM swarm_leases WHERE resource=?").get(value.resource);if(!row||row.owner!==value.owner||row.fence!==value.fence||row.until_ms<=now())throw Error("Exclusive resource lease lost.");}
  function renewLease(value:{resource:string;owner:string;fence:number},ttlMs:number){db.transaction(()=>{assertLease(value);db.query("UPDATE swarm_leases SET until_ms=? WHERE resource=? AND owner=? AND fence=?").run(now()+ttlMs,value.resource,value.owner,value.fence);}).immediate();}
  function releaseLease(value:{resource:string;owner:string;fence:number}){db.query("UPDATE swarm_leases SET until_ms=0 WHERE resource=? AND owner=? AND fence=?").run(value.resource,value.owner,value.fence);}
  function workspace(value:ExecutionWorkspace){const valid=executionWorkspaceSchema.parse(value);db.query("INSERT INTO swarm_workspaces(id,swarm_id,task_id,data) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING").run(valid.id,valid.swarmId,valid.taskId,JSON.stringify(valid));}
  function workspaces(runId?:string){return db.query<{data:string},[string|null,string|null]>("SELECT data FROM swarm_workspaces WHERE destroyed=0 AND (? IS NULL OR swarm_id=?)").all(runId??null,runId??null).map(row=>executionWorkspaceSchema.parse(JSON.parse(row.data)));}
  function destroyed(id:string){db.query("UPDATE swarm_workspaces SET destroyed=1 WHERE id=?").run(id);}
  function taskModelUsage(taskId:string){return db.query<{calls:number;tokens:number;cost:number},[string]>("SELECT calls,tokens,cost FROM swarm_model_usage WHERE task_id=?").get(taskId)??{calls:0,tokens:0,cost:0};}
  function totalModelTokens(run:SwarmRun){return run.tasks.reduce((total,task)=>total+taskModelUsage(task.id).tokens,0);}
  function modelUsage(runId:string,taskId:string){const run=get(runId);if(!run||!run.tasks.some(task=>task.id===taskId))throw Error("Unknown model task.");return{...taskModelUsage(taskId),totalTokens:totalModelTokens(run)};}
  function admitWeeklyQuota(runId:string,observation:{usedPercent:number;resetsAt?:number;windowDurationMins?:number}){
    let admission:{available:boolean;reason?:string}={available:true};
    change(runId,run=>{
      if(!Number.isFinite(observation.usedPercent)||observation.usedPercent<0||!Number.isFinite(observation.resetsAt)||!observation.windowDurationMins||observation.windowDurationMins<WEEKLY_QUOTA_WINDOW_MINUTES){admission={available:false,reason:"Verified weekly quota usage and reset identity are required before work starts."};return;}
      const resetsAt=observation.resetsAt;
      if(resetsAt===undefined)throw Error("Weekly reset identity is required.");
      const prior=run.weeklyQuota;
      if(prior&&resetsAt<prior.windowResetsAt){admission={available:false,reason:"Weekly quota reset identity moved backwards; refresh provider usage before continuing."};return;}
      if(prior&&resetsAt===prior.windowResetsAt&&observation.usedPercent<prior.lastUsedPercent){admission={available:false,reason:"Weekly quota usage decreased without a verified reset; consumption cannot be qualified."};return;}
      const consumedPercent=prior?prior.consumedPercent+(resetsAt===prior.windowResetsAt?observation.usedPercent-prior.lastUsedPercent:observation.usedPercent):0;
      run.weeklyQuota={initialUsedPercent:prior?.initialUsedPercent??observation.usedPercent,lastUsedPercent:observation.usedPercent,consumedPercent,windowResetsAt:resetsAt,observedAt:now()};
      if(consumedPercent>=run.request.budget.maxWeeklyQuotaPercent){run.budgetExhausted=true;admission={available:false,reason:"Configured weekly quota allocation exhausted (observed shared-account percentage-point consumption)."};}
    });return admission;
  }
  function reserveModel(runId:string,taskId:string,tokens:number,cost:number){
    if(!Number.isSafeInteger(tokens)||tokens<0||!Number.isFinite(cost)||cost<0)throw Error("Invalid model budget reservation.");
    let rejection:SwarmBudgetRejection|undefined;
    change(runId,run=>{
      if(!run.tasks.some(task=>task.id===taskId))throw Error("Unknown task for model reservation.");
      if(terminal.has(run.status))throw Error("Run stopped; inference admission is closed.");
      const budget=run.request.budget,usage=taskModelUsage(taskId);
      const task=run.tasks.find(task=>task.id===taskId)!;
      const finalizationReserve=run.campaign&&!['review','compare'].includes(task.kind)?Math.min(80_000,Math.floor(budget.maxTotalTokens/10)):0;
      const limits:Array<{scope:SwarmBudgetRejection["scope"];dimension:SwarmBudgetRejection["dimension"];requested:number;used:number;limit:number}>=[
        {scope:"run",dimension:"tokens",requested:tokens,used:totalModelTokens(run),limit:budget.maxTotalTokens},
        {scope:"run",dimension:"model-usd",requested:cost,used:run.metrics.modelEstimatedUsd,limit:budget.maxModelUsd},
        {scope:"task",dimension:"calls",requested:1,used:usage.calls,limit:budget.maxCallsPerAgent},
        {scope:"task",dimension:"tokens",requested:tokens,used:usage.tokens,limit:budget.maxTokensPerAgent},
        ...(finalizationReserve?[{scope:"task" as const,dimension:"finalization-tokens" as const,requested:tokens,used:totalModelTokens(run),limit:budget.maxTotalTokens-finalizationReserve}]:[]),
      ];
      const failed=limits.find(value=>value.used+value.requested>value.limit);
      if(failed){rejection={...failed,taskId,phase:"reservation",remaining:Math.max(0,failed.limit-failed.used),at:now()};run.budgetRejection=rejection;return;}
      db.query("INSERT INTO swarm_model_usage(task_id,calls,tokens,cost) VALUES(?,1,?,?) ON CONFLICT(task_id) DO UPDATE SET calls=calls+1,tokens=swarm_model_usage.tokens+excluded.tokens,cost=swarm_model_usage.cost+excluded.cost").run(taskId,tokens,cost);
      run.metrics.modelCalls++;run.metrics.modelEstimatedUsd+=cost;
      run.metrics.modelUnsettledTokens=Math.max(0,totalModelTokens(run)-run.metrics.inputTokens-run.metrics.outputTokens);
    });
    // Throw after committing the refusal, so diagnostics survive restart.
    if(rejection)throw createSwarmModelBudgetError(rejection);
  }
  function settleModel(options:{runId:string;taskId:string;reservedTokens:number;reservedCost:number}&NonNullable<AiRunResult["usage"]>) {
    let rejection:SwarmBudgetRejection|undefined;
    change(options.runId,run=>{
      const actualTokens=options.inputTokens+options.outputTokens;
      const actualCost=options.costUsd??options.reservedCost;
      if([options.inputTokens,options.outputTokens,options.reservedTokens].some(value=>!Number.isSafeInteger(value)||value<0)||!Number.isFinite(options.reservedCost)||options.reservedCost<0||!Number.isFinite(actualCost)||actualCost<0)throw Error("Invalid provider usage receipt.");
      const usage=db.query<{tokens:number;cost:number},[string]>("SELECT tokens,cost FROM swarm_model_usage WHERE task_id=?").get(options.taskId);if(!usage)throw Error("No model reservation for task.");
      const settledTokens=Math.max(0,usage.tokens-options.reservedTokens)+actualTokens;
      db.query("UPDATE swarm_model_usage SET tokens=?,cost=? WHERE task_id=?").run(settledTokens,Math.max(0,usage.cost-options.reservedCost)+actualCost,options.taskId);
      run.metrics.inputTokens+=options.inputTokens;run.metrics.outputTokens+=options.outputTokens;
      run.metrics.modelEstimatedUsd=Math.max(0,run.metrics.modelEstimatedUsd-options.reservedCost)+actualCost;
      run.metrics.modelUnsettledTokens=Math.max(0,totalModelTokens(run)-run.metrics.inputTokens-run.metrics.outputTokens);
      if(options.costUsd!==undefined&&options.costSource!=="estimated")run.metrics.modelReportedUsd=(run.metrics.modelReportedUsd??0)+options.costUsd;
      const budget=run.request.budget;
      const failed=totalModelTokens(run)>budget.maxTotalTokens?{scope:"run" as const,dimension:"tokens" as const,used:totalModelTokens(run),limit:budget.maxTotalTokens}
        :run.metrics.modelEstimatedUsd>budget.maxModelUsd?{scope:"run" as const,dimension:"model-usd" as const,used:run.metrics.modelEstimatedUsd,limit:budget.maxModelUsd}
        :settledTokens>budget.maxTokensPerAgent?{scope:"task" as const,dimension:"tokens" as const,used:settledTokens,limit:budget.maxTokensPerAgent}:undefined;
      if(failed){
        rejection={...failed,taskId:options.taskId,phase:"reported-usage",requested:0,remaining:0,at:now()};run.budgetRejection=rejection;
        if(failed.scope==="run"){run.budgetExhausted=true;if(!terminal.has(run.status))transitionSwarm(run,"BLOCKED",createSwarmModelBudgetError(rejection).message);}
      }
    });
    if(rejection)throw createSwarmModelBudgetError(rejection);
  }
  return {get,list,activeRuns,create,change,readyTask,claim,owned,heartbeat,finish,recover,message,lease,assertLease,renewLease,releaseLease,workspace,workspaces,destroyed,modelUsage,admitWeeklyQuota,reserveModel,settleModel,db,agentEvents};
}
export type SwarmStore=ReturnType<typeof createSwarmStore>;
export { terminal as terminalSwarmStatuses };
