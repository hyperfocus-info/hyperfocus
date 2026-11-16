import type { SwarmRun, SwarmTask, SwarmInvestigationInstrument } from "@hyperfocus/ai-core/swarm";
import { planSwarm } from "./plan";
import { transitionSwarm } from "./persistence/store";

export function campaignCandidateIds(run:SwarmRun) {
  return run.campaign?.rounds.at(-1)?.candidateIds ?? run.candidates.map(candidate=>candidate.id);
}

/** Mutate within the caller's fenced transaction. The source, deadline and ledgers never reset. */
export function advanceSwarmCampaign(run:SwarmRun, task:SwarmTask, instruments:SwarmInvestigationInstrument[], now=Date.now()) {
  const campaign=run.campaign;
  if(!campaign)return false;
  const round=campaign.rounds.at(-1)!;
  // A replay of the compare task cannot append the same round twice.
  if(round.compareTaskId!==task.id)return true;
  if(round.completedAt!==undefined)return false;
  round.completedAt=now;
  round.summary=run.completion?.summary??"Independent review did not establish the requested outcome.";
  const engineering=run.executionKind==="engineering";
  if((run.outcome?.outcomeSuccess==="demonstrated"||engineering)&&run.completion?.status==="met")return false;
  const remaining=(run.startedAt??run.createdAt)+run.request.budget.maxDurationMs-now;
  const noSelection=!engineering&&!run.outcome?.hypotheses.some(hypothesis=>round.candidateIds.includes(hypothesis.candidateId));
  const reason=remaining<=campaign.finalizationReserveMs?"Campaign entered its finalization reserve; retained evidence does not establish outcome success."
    :campaign.round>=run.request.budget.maxCampaignRounds?"Campaign iteration budget reached; no independently verified outcome."
    :noSelection?"No admissible investigation was selected. Inspect the outcome limitations and missing instruments."
    :undefined;
  if(reason){transitionSwarm(run,remaining<=campaign.finalizationReserveMs?"TIMED_OUT":"BLOCKED",reason);return true;}
  if(!run.modelPlan||!engineering&&!run.outcome){transitionSwarm(run,"BLOCKED","Adaptive campaigns require trusted verification and planning/review profiles.");return true;}
  const next=planSwarm({id:run.id,request:{...run.request,hypotheses:undefined},executionKind:run.executionKind,modelProfiles:{planning:run.modelPlan.planning,implementation:run.modelPlan.valueImplementation,review:run.modelPlan.review},investigationInstruments:instruments,round:campaign.round+1,baselineTaskId:run.tasks.find(value=>value.kind==="baseline")!.id,previousTaskId:task.id});
  campaign.round++;
  campaign.rounds.push({number:campaign.round,candidateIds:next.candidates.map(candidate=>candidate.id),compareTaskId:next.tasks.find(task=>task.kind==="compare")!.id,startedAt:now});
  run.tasks.push(...next.tasks);run.candidates.push(...next.candidates);
  if(run.outcome){run.outcome.phase="proposed";run.outcome.taskSuccess="pending";run.outcome.outcomeSuccess="pending";}
  run.completion=undefined;run.selectedCandidateId=undefined;
  transitionSwarm(run,"RUNNING",`Round ${campaign.round}: choosing the next useful investigation from retained evidence.`);
  run.messages.push({id:`${run.id}-round-${campaign.round}`,swarmId:run.id,taskId:task.id,agentId:task.agentId,sourceRevision:run.request.repository.revision,kind:"progress",text:run.reason!,artifactIds:[],createdAt:now});
  return true;
}
