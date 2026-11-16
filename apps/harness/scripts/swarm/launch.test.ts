import { expect,test } from "bun:test";
import { mkdir,mkdtemp,rm,writeFile } from "node:fs/promises";
import { join,resolve,sep } from "node:path";
import { createHash } from "node:crypto";
import { swarmGit,createSwarmSourceSnapshot } from "@hyperfocus/ai-runtime/swarm";
import { createSwarmRequestSchema } from "@hyperfocus/ai-core/swarm";
import { swarmFixture } from "../../cli/src/swarm/test-fixtures";
import { launchRemoteSwarm } from "./launch";

test("remote handoff returns after source acknowledgement and phone access, with no local monitor",async()=>{
  const owner=resolve(import.meta.dir,"../../.local/swarm-launch-tests");await mkdir(owner,{recursive:true});const root=await mkdtemp(join(owner,"run-"));
  const fixture=swarmFixture();
  try{
    await writeFile(join(root,"demo.txt"),"immutable fixture\n");
    for(const args of [["init"],["add","."],["-c","user.name=Fixture","-c","user.email=fixture@localhost","commit","-m","fixture"]])await swarmGit({root,args});
    const snapshot=await createSwarmSourceSnapshot({root}),calls:string[]=[];
    let reuse=false,linkFails=false,started=0;
    let run=fixture.run;
    const input={...fixture.request,backend:"railway",agentRecipientId:"originating-thread"};
    const options={input,root,coordinatorUrl:"https://swarm.example.test",token:"fixture-token-".padEnd(40,"x"),
      request:async(url:string|URL|Request,init?:RequestInit)=>{
        const path=new URL(String(url)).pathname,method=init?.method??"GET";calls.push(`${method} ${path}`);
        if(path.endsWith("capabilities"))return Response.json({available:true,executionAuthority:"cloud",backends:["railway"],maxWorkers:3,projects:[{id:input.projectId,name:"Fixture",campaign:true}],inference:{provider:"codex-account",credentialSource:"device-login",separatelyBilledUsd:0}});
        if(path.endsWith("sources")){
          if(method==="GET")return reuse?Response.json({id:"b".repeat(64),sha256:snapshot.sha256,bytes:snapshot.bytes.length}):Response.json({error:"missing"},{status:404});
          const bytes=new Uint8Array(await new Response(init?.body).arrayBuffer());
          return Response.json({id:"b".repeat(64),sha256:createHash("sha256").update(bytes).digest("hex"),bytes:bytes.length});
        }
        if(path.endsWith("/runs")){run={...fixture.run,status:"READY",request:createSwarmRequestSchema.parse(JSON.parse(String(init?.body)))};return Response.json(run);}
        if(path.endsWith("/start")){started++;run={...run,status:"RUNNING",startedAt:Date.now()};return Response.json(run);}
        throw Error(`Unexpected request ${path}`);
      },
      issueAccess:async()=>{calls.push("phone-access");if(linkFails)throw Error("link unavailable");return {url:"https://swarm.example.test/swarm#code=fixture",expiresAt:Date.now()+604800000,accessId:crypto.randomUUID(),access:"control" as const,workloadsStarted:false,authentication:"Fixture only"};}};
    const cold=await launchRemoteSwarm(options);expect(cold.cloudOwned).toBe(true);expect(cold.laptopMayDisconnect).toBe(true);
    expect(cold.continuation).toMatchObject({recipientId:"originating-thread",laptopProcessRequired:false});
    expect(calls.at(-2)).toBe("phone-access");expect(calls.at(-1)).toEndWith("/start");expect(cold.source.reused).toBe(false);
    calls.length=0;reuse=true;expect((await launchRemoteSwarm(options)).source.reused).toBe(true);
    expect(calls.filter(value=>value==="POST /api/swarm/v1/sources")).toEqual([]);
    linkFails=true;await expect(launchRemoteSwarm(options)).rejects.toThrow("link unavailable");expect(started).toBe(2);expect(run.status).toBe("READY");
  }finally{fixture.db.close();if(!resolve(root).startsWith(owner+sep))throw Error("Fixture escaped owner");await rm(root,{recursive:true,force:true});}
},30000);

test("launch rejects a laptop owner and separately billed inference before source access",async()=>{
  const fixture=swarmFixture();
  try{for(const values of [{executionAuthority:"local",separatelyBilledUsd:0},{executionAuthority:"cloud",separatelyBilledUsd:1}]){
    let calls=0;await expect(launchRemoteSwarm({input:{...fixture.request,backend:"railway"},root:"missing",coordinatorUrl:"https://swarm.example.test",token:"x".repeat(40),
      request:async()=>{calls++;return Response.json({available:true,executionAuthority:values.executionAuthority,backends:["railway"],maxWorkers:3,projects:[{id:fixture.request.projectId,name:"Fixture",campaign:true}],inference:{provider:"fixture",credentialSource:"fixture",separatelyBilledUsd:values.separatelyBilledUsd}});}})).rejects.toThrow();expect(calls).toBe(1);
  }}finally{fixture.db.close();}
});

test("explicit engineering requests cannot spend a source upload on a performance-only or unidentified recipe",async()=>{
  const fixture=swarmFixture();
  try{
    for(const kind of ["performance",undefined]){
      let captured=0,requests=0;
      await expect(launchRemoteSwarm({input:{...fixture.request,backend:"railway",executionKind:"engineering"},root:"unused",coordinatorUrl:"https://swarm.example.test",token:"x".repeat(40),
        capture:async()=>{captured++;throw Error("Source capture must not run");},
        request:async()=>{requests++;return Response.json({available:true,executionAuthority:"cloud",backends:["railway"],maxWorkers:3,
          projects:[{id:fixture.request.projectId,name:"CPU fixture",campaign:true,executionKind:kind},{id:"engineering-project",name:"Engineering",campaign:true,executionKind:"engineering"}],
          inference:{provider:"fixture",credentialSource:"fixture",separatelyBilledUsd:0}});},
      })).rejects.toThrow(kind?"engineering-project":"does not advertise an execution kind");
      expect(captured).toBe(0);expect(requests).toBe(1);
    }
  }finally{fixture.db.close();}
});
