import { isObject } from "@hyperfocus/utilities/records";
import type { SwarmRun } from "./contracts";

/** Presentation projection; raw attributed messages remain available in review. */
export function describeSwarmConversation(run: SwarmRun) {
  const messages: Array<{id:string;role:"user"|"assistant"|"system";content:string}> = [
    {id:`${run.id}-goal`,role:"user",content:run.request.goal},
  ];
  for (const message of run.messages) {
    const task=run.tasks.find(task=>task.id===message.taskId);
    let text=message.text;
    if(text.startsWith("Command execution receipt: ")) {
      try {
        const receipt:unknown=JSON.parse(text.slice("Command execution receipt: ".length));
        if(!isObject(receipt))continue;
        const value=receipt;
        text=`Remote command ${value.timedOut===true?"timed out":value.exitCode===0?"completed":"failed"}${typeof value.durationMs==="number"?` in ${(value.durationMs/1000).toFixed(1)}s`:""}.`;
      } catch { text="Command evidence was retained. Open its artifact for details."; }
    } else if(message.kind==="modification"&&text.startsWith("Tool: ")) text=text.split("\n")[0]!.slice(6);
    else if(message.kind==="modification"&&text.startsWith("Remote command session "))continue;
    const evidence=message.artifactIds.map(id=>run.artifacts.find(artifact=>artifact.id===id)).filter(value=>value!==undefined)
      .map(artifact=>`[${artifact.name.replace(/[\[\]\\]/g,"")}](#swarm-artifact-${artifact.id})`).join(" · ");
    const title=message.kind==="steering"?"":`**${task?.role.replaceAll("-"," ")??"Coordinator"}${task?.candidateId?` · ${task.candidateId}`:""}**\n\n`;
    messages.push({id:message.id,role:message.kind==="steering"?"user":message.kind==="progress"?"system":"assistant",content:`${title}${text.slice(0,2400)}${text.length>2400?"\n\nFull details are retained in activity and artifacts.":""}${evidence?`\n\n${evidence}`:""}`});
  }
  const active=run.tasks.filter(task=>task.status==="RUNNING");
  const latest=run.messages.at(-1);
  return {messages,activity:active.map(task=>task.title).join(" · ")||run.reason||(run.status==="READY"?"Ready to launch":"Waiting for the next task"),lastEventAt:latest?.createdAt??run.updatedAt};
}
