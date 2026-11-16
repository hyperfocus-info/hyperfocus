import { expect,test } from "bun:test";
import { Database } from "bun:sqlite";
import { createConnectionClient } from "@hyperfocus/ai-core/connections";
import { createAgentEventStore } from "@hyperfocus/ai-runtime/agent-events";
import { createOperationStore } from "@hyperfocus/ai-runtime/operations";
import { createConnectionManager,type ConnectionAdapter } from "@hyperfocus/ai-runtime/connections";
import { createConnectionHttpHandler } from "./http";

test("connection capabilities isolate providers and reject cross-origin, replay and CSRF without exposing owner credentials",async()=>{
  const db=new Database(":memory:"),events=createAgentEventStore(db),operations=createOperationStore(db,events);
  let calls=0;
  const adapter=(id:string):ConnectionAdapter=>({descriptor:{id,providerId:id,label:id,ownerId:"host",capabilities:["compute"],authorizationScope:"Test",authentication:"host-managed",billingMode:"none"},
    async inspect(){return {state:"ready",credentialSource:"environment",summary:"Ready"};},async revoke(){calls++;}});
  const manager=createConnectionManager({adapters:[adapter("allowed"),adapter("private")],operations});
  const origin="https://connections.example.test",token="fixture-owner-secret",prefix=origin+"/api/connections/v1";
  const http=createConnectionHttpHandler({db,manager,operations,token,publicOrigin:origin,authorizeProject:id=>{if(id!=="project")throw Error("Forbidden");}});
  const grant=http.mint({projectId:"project",recipientId:"thread",connectionIds:["allowed"]});
  const code=new URLSearchParams(new URL(grant.url).hash.slice(1)).get("code");
  const exchange=()=>http.handle(new Request(prefix+"/browser/session",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({code})}));
  try{
    const first=(await exchange())!;expect(first.status).toBe(200);const session=await first.json();
    const cookie=first.headers.get("set-cookie")!.split(";")[0]!;expect(first.headers.get("set-cookie")).toContain("HttpOnly");
    expect((await exchange())!.status).toBe(403);
    const list=(await http.handle(new Request(prefix+"/browser/connections",{headers:{cookie}})))!;
    expect((await list.json()).map((value:{id:string})=>value.id)).toEqual(["allowed"]);
    const request=(id:string,extra:Record<string,string>={})=>http.handle(new Request(prefix+`/browser/connections/${id}/revoke`,{method:"POST",headers:{cookie,origin,"content-type":"application/json","x-connections-csrf":session.csrfToken,...extra},body:"{}"}));
    expect((await request("private"))!.status).toBe(403);expect((await request("allowed",{origin:"https://evil.example"}))!.status).toBe(403);
    expect((await request("allowed",{"x-connections-csrf":"wrong"}))!.status).toBe(403);expect(calls).toBe(0);
    expect((await request("allowed"))!.status).toBe(200);expect(calls).toBe(1);
    await http.handle(new Request(prefix+`/access/${grant.accessId}`,{method:"DELETE",headers:{authorization:`Bearer ${token}`}}));
    expect((await request("allowed"))!.status).toBe(403);
    expect(JSON.stringify(session)).not.toContain(token);
    const client=createConnectionClient({baseUrl:prefix+"/connections",fetch:async(input,init)=>{
      const response=await http.handle(new Request(input,{...init,headers:{...Object.fromEntries(new Headers(init?.headers)),authorization:`Bearer ${token}`}}));
      if(!response)throw Error("Client used an unknown route.");return response;
    }});
    const scope={projectId:"project",recipientId:"thread",requestId:"owner-action"};
    expect(await client.cancel("allowed",scope)).toEqual({completed:true});
    expect(await client.revoke("allowed",scope)).toEqual({completed:true});expect(calls).toBe(2);
    await expect(client.revoke("allowed",{...scope,projectId:"foreign"})).rejects.toThrow();expect(calls).toBe(2);
  }finally{await manager.close();db.close();}
});
