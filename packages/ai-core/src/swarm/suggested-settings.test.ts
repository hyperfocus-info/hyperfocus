import {expect,test} from "bun:test";
import {applySwarmSuggestedFields,suggestSwarmSettings} from "./suggested-settings";
import {describeSwarmActivity,describeSwarmRun,swarmStatusLabel} from "./review-model";
import {createSwarmRequestSchema,swarmCandidateSchema,swarmRunSchema} from "./contracts";

test("auto suggestions bound small investigations and recognize explicit comparisons",()=>{
  expect(suggestSwarmSettings("Fix one malformed label")).toMatchObject({strategy:"investigation",maxWorkers:1,budget:{maxDurationMs:1_800_000,maxTotalTokens:250_000,maxTokensPerAgent:250_000}});
  expect(suggestSwarmSettings("Produce three independent performance candidates")).toMatchObject({strategy:"tournament",maxWorkers:3,budget:{maxDurationMs:3_600_000,maxTotalTokens:1_000_000,maxTokensPerAgent:400_000}});
  expect(suggestSwarmSettings("Fix one malformed label","complex").maxWorkers).toBe(3);
  expect(suggestSwarmSettings("Investigate performance","bounded").maxWorkers).toBe(1);
});
test("goal changes preserve explicit strategy and all edited ceilings",()=>{
  const current={goal:"Compare performance candidates",strategy:"investigation",maxWorkers:"2",minutes:"17",totalTokens:"90000",tokens:"40000",compute:"3",weeklyQuota:"8",mode:"max-intelligence"};
  expect(applySwarmSuggestedFields(current,new Set(["strategy","maxWorkers","minutes","totalTokens","tokens"]))).toEqual(current);
  expect(applySwarmSuggestedFields(current,new Set(["minutes"]))).toMatchObject({strategy:"tournament",maxWorkers:"3",minutes:"17",totalTokens:"1000000",tokens:"400000",compute:"3",weeklyQuota:"8",mode:"max-intelligence"});
});
test("native status prefers active work over a cancelled queued follow-up",()=>{
  const run=swarmRunSchema.parse({id:"parent",request:{requestId:"request",projectId:"project",goal:"Investigate performance",repository:{revision:"a".repeat(40)}},status:"RUNNING",createdAt:1,updatedAt:1,tasks:[],candidates:[],artifacts:[],messages:[],metrics:{}});
  const child={...run,id:"child",parentRunId:run.id,status:"CANCELLED" as const};
  expect(describeSwarmActivity([child,run],child.id)).toMatchObject({runId:"parent",activeCount:1,label:"Swarm: Running (0/0)"});
});

test("API and CLI request parsing apply goal defaults without replacing explicit or saved limits",()=>{
  const input={requestId:"request",projectId:"project",goal:"Fix one malformed label",repository:{revision:"a".repeat(40)}};
  const bounded=createSwarmRequestSchema.parse(input);
  expect(bounded).toMatchObject({strategy:"investigation",maxWorkers:1,budget:{maxDurationMs:1_800_000,maxTotalTokens:250_000,maxTokensPerAgent:250_000,maxComputeUsd:5,maxModelUsd:0,maxWeeklyQuotaPercent:20}});
  expect(createSwarmRequestSchema.parse({...input,goal:"Compare performance candidates"})).toMatchObject({strategy:"tournament",maxWorkers:3,budget:{maxDurationMs:3_600_000,maxTotalTokens:1_000_000,maxTokensPerAgent:400_000}});
  expect(createSwarmRequestSchema.parse({...input,strategy:"tournament"}).maxWorkers).toBe(3);
  const explicit={...bounded,goal:"Compare performance candidates",maxWorkers:2,budget:{...bounded.budget,maxDurationMs:12_000,maxTotalTokens:700_000,maxTokensPerAgent:100_000,maxComputeUsd:3,maxWeeklyQuotaPercent:8}};
  expect(createSwarmRequestSchema.parse(explicit)).toEqual(explicit);
  expect(createSwarmRequestSchema.safeParse({...input,budget:null}).success).toBe(false);
  expect(createSwarmRequestSchema.safeParse({...input,strategy:null}).success).toBe(false);
  expect(createSwarmRequestSchema.safeParse({...input,budget:{unknown:true}}).success).toBe(false);
});

test("finished lifecycle retains unmet completion and distinguishes absent patches from failed validation",()=>{
  const candidate=swarmCandidateSchema.parse({id:"candidate",agentId:"agent",hypothesis:"Measure first",sourceRevision:"a".repeat(40),correctness:"failed"});
  const run=swarmRunSchema.parse({id:"run",request:{requestId:"request",projectId:"project",goal:"Investigate performance",repository:{revision:"a".repeat(40)}},status:"COMPLETED",createdAt:1,updatedAt:1,tasks:[],candidates:[candidate],artifacts:[],messages:[],metrics:{},completion:{status:"unmet",summary:"Browser correctness remains unverified",criteria:[],artifactId:"report"}});
  expect(swarmStatusLabel(run)).toBe("Completed · criteria unmet");
  expect(describeSwarmActivity([run]).label).toContain("criteria unmet");
  expect(describeSwarmRun(run).candidates[0]?.facts).toContainEqual({label:"Correctness",value:"Not run — no patch"});
  expect(describeSwarmRun({...run,candidates:[{...candidate,validationArtifactIds:["validation"]}]}).candidates[0]?.facts).toContainEqual({label:"Correctness",value:"failed"});
});
