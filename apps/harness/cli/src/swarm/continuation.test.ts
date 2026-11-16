import { expect,test } from "bun:test";
import { loadSwarmContinuation } from "./continuation";
import { nativeAgentEventsConfig } from "../agent-runtimes/native-agent-events";

const env={HYPERFOCUS_SWARM_URL:"https://swarm.example.test",HYPERFOCUS_SWARM_TOKEN:"fixture-private-owner-token"};
test("continue retrieves the thread inbox once and acknowledges only after the host persists it",async()=>{
  const calls:Array<{route:string;body:unknown}>=[];
  const event={schema:"hyperfocus-agent-event-v1",id:"result-1",projectId:"project",subject:{type:"swarm",id:"run"},kind:"swarm.result.ready",occurredAt:1,summary:"Verified checks; approval pending.",resultPath:"/api/swarm/v1/runs/run",artifacts:[]};
  const result=await loadSwarmContinuation({content:"continue",projectId:"project",rootPath:process.cwd(),threadId:"thread",environment:env,fetch:async(input,init)=>{
    calls.push({route:String(input),body:JSON.parse(String(init?.body))});
    return Response.json(String(input).endsWith("resume")?{events:[event],waiting:[],hasMore:false}:{acknowledged:true});
  }});
  expect(calls).toHaveLength(1);expect(calls[0]?.body).toEqual({projectId:"project",recipientId:"thread"});
  expect(result?.context).toContain("result-1");expect(result?.context).not.toContain(env.HYPERFOCUS_SWARM_TOKEN);
  await result?.acknowledge();expect(calls).toHaveLength(2);expect(calls[1]?.route).toEndWith("/acknowledge");
});
test("unrelated chat and unconfigured hosts do not start event listeners or network calls",async()=>{
  let calls=0;const input={content:"Edit the title",projectId:"project",rootPath:process.cwd(),threadId:"thread",environment:env,fetch:async()=>{calls++;throw Error("Unexpected network call");}};
  expect(await loadSwarmContinuation(input)).toBeUndefined();
  expect(await loadSwarmContinuation({...input,content:"continue",environment:{}})).toBeUndefined();expect(calls).toBe(0);
});

test("bounded continuation leaves events omitted from the prompt unacknowledged",async()=>{
  const events=Array.from({length:6},(_,index)=>({schema:"hyperfocus-agent-event-v1",id:`event-${index}`,projectId:"project",subject:{type:"swarm",id:`run-${index}`},kind:"swarm.result.ready",occurredAt:1,summary:"Result retained",resultPath:`/api/swarm/v1/runs/${index}`,artifacts:[]}));
  const acknowledged:string[]=[];
  const result=await loadSwarmContinuation({content:"continue",projectId:"project",rootPath:process.cwd(),threadId:"thread",environment:env,fetch:async(input,init)=>{
    if(String(input).endsWith("resume"))return Response.json({events,waiting:[],hasMore:false});
    acknowledged.push(JSON.parse(String(init?.body)).eventId);return Response.json({acknowledged:true});
  }});
  expect(result?.context).toContain('"hasMore":true');expect(result?.context).not.toContain("event-5");
  await result?.acknowledge();expect(acknowledged).toEqual(events.slice(0,5).map(event=>event.id));
});
test("Codex uses official HTTP MCP and environment authentication without a local helper or inline secret",()=>{
  const config=nativeAgentEventsConfig(env);expect(JSON.stringify(config)).toContain("/agent-events/v1/mcp");
  expect(JSON.stringify(config)).toContain("HYPERFOCUS_SWARM_TOKEN");expect(JSON.stringify(config)).not.toContain(env.HYPERFOCUS_SWARM_TOKEN);
  expect(JSON.stringify(config)).not.toContain("command");expect(nativeAgentEventsConfig({...env,HYPERFOCUS_SWARM_URL:"http://localhost:8787"})).toEqual({});
});
