import { browserExecutable,connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { chromium } from "playwright";
import { mkdir,mkdtemp,rm,writeFile } from "node:fs/promises";
import { resolve,join,sep } from "node:path";
import { createConnectionManager,type ConnectionAdapter } from "@hyperfocus/ai-runtime/connections";
import { createOperationStore } from "@hyperfocus/ai-runtime/operations";
import { createConnectionHttpHandler } from "../cli/src/connections/http";
import { createSwarmHttpFixture } from "../cli/src/swarm/test-fixture";
import { createSwarmConnectionGate } from "../cli/src/swarm/connection-gate";
import { createSwarmSiteHandler } from "../cli/src/swarm/browser/site";
import { buildSwarmSite } from "./swarm/build-site";
import { createSwarmRequestSchema } from "@hyperfocus/ai-core/swarm";

const root=resolve(import.meta.dir,"../../.."),output=resolve(root,".local/swarm/campaign-repair/connections-ui"),scratch=resolve(root,"apps/harness/.local/connections-ui");
await mkdir(output,{recursive:true});await mkdir(scratch,{recursive:true});const directory=await mkdtemp(join(scratch,"run-"));
const fixture=createSwarmHttpFixture({directory}),operations=createOperationStore(fixture.store.db,fixture.store.agentEvents);
let connected=false,complete=()=>{},starts=0;
const codex:ConnectionAdapter={descriptor:{id:"codex-account",providerId:"codex-account",label:"Codex",ownerId:"fixture-host",capabilities:["inference"],authorizationScope:"SIMULATED provider. No account credentials or inference.",authentication:"device-code",billingMode:"subscription"},
  async inspect(){return {state:connected?"ready":"disconnected",credentialSource:connected?"ambient":"missing",summary:connected?"Simulated subscription verified.":"Connect the simulated subscription."};},
  async connect({signal,onAction}){starts++;onAction({kind:"device-code",verificationUrl:"https://auth.openai.com/codex/device",userCode:"FIXTURE-ONLY",expiresAt:Date.now()+60000});
    await new Promise<void>((resolve,reject)=>{const abort=()=>reject(Error("Cancelled"));signal.addEventListener("abort",abort,{once:true});complete=()=>{signal.removeEventListener("abort",abort);connected=true;resolve();};});},
  async revoke(){connected=false;}};
const railway:ConnectionAdapter={descriptor:{...codex.descriptor,id:"railway",providerId:"railway",label:"Railway",authentication:"host-managed",billingMode:"metered",capabilities:["compute"],authorizationScope:"SIMULATED private bridge. No cloud allocation."},async inspect(){return {state:"ready",credentialSource:"environment",summary:"Simulated private bridge and storage reachable."};}};
const manager=createConnectionManager({operations,adapters:[codex,railway]});
const gate=createSwarmConnectionGate({store:fixture.store,coordinator:fixture.coordinator,connections:manager,operations,requiredIds:["codex-account","railway"],ready:async()=>({available:true})});
const built=await buildSwarmSite();let handler=async(_request:Request)=>new Response("Starting",{status:503});
// Disposable browser fixture: real grants, operation persistence and launch gate; provider authentication is simulated.
const server=Bun.serve({hostname:"127.0.0.1",port:0,idleTimeout:60,fetch:request=>handler(request)});
const origin=server.url.origin;
const http=createConnectionHttpHandler({db:fixture.store.db,manager,operations,token:fixture.token,publicOrigin:origin,authorizeProject:id=>{if(id!=="fixture-project")throw Error("Denied");}});
handler=createSwarmSiteHandler({directory:built.output,publicOrigin:origin,handler:async request=>await http.handle(request)??fixture.handler(request)});
const owned=await connectHeadlessBrowser({executable:browserExecutable(),connect:endpoint=>chromium.connectOverCDP(endpoint)});
const context=await owned.browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
let page=await context.newPage();const errors:string[]=[],requests:string[]=[];
context.on("page",value=>value.on("pageerror",error=>errors.push(error.message)));page.on("pageerror",error=>errors.push(error.message));
context.on("request",request=>{if(request.headers().authorization||request.headers()["x-harness-session-token"])requests.push(request.url());});
try{
  const run=fixture.coordinator.create(createSwarmRequestSchema.parse({requestId:crypto.randomUUID(),projectId:"fixture-project",agentRecipientId:"fixture-agent",goal:"SIMULATED connection-dependent campaign",repository:{revision:"a".repeat(40)},backend:"local",reviewPlan:true}));
  await gate.start(run.id);if(fixture.store.get(run.id)?.startedAt)throw Error("Workers started before authorization.");
  const grant=http.mint({projectId:"fixture-project",recipientId:"fixture-agent",connectionIds:["codex-account","railway"]});
  await page.goto(grant.url,{waitUntil:"domcontentloaded"});await page.getByRole("button",{name:"Connect Codex",exact:true}).click();
  await page.getByText("FIXTURE-ONLY",{exact:true}).waitFor();
  if(new URL(page.url()).hash)throw Error("Bootstrap credential remained in URL.");
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(overflow)throw Error("Connections overflows the phone viewport.");
  await page.screenshot({path:join(output,"phone-authorization.png"),fullPage:true});
  await page.close();complete();
  for(let attempt=0;attempt<50&&!fixture.store.get(run.id)?.startedAt;attempt++)await new Promise(resolve=>setTimeout(resolve,20));
  if(!fixture.store.get(run.id)?.startedAt)throw Error("Authorization did not resume the saved cloud-owned launch.");
  page=await context.newPage();await page.goto(origin+"/connections",{waitUntil:"domcontentloaded"});await page.getByText("Simulated subscription verified.",{exact:true}).waitFor();
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:join(output,"connected-desktop.png"),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.fontSize="20px");
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error("Connections overflows enlarged phone text.");
  await page.screenshot({path:join(output,"connected-phone-enlarged.png"),fullPage:true});
  const inbox=fixture.store.agentEvents.resume({projectId:"fixture-project",recipientId:"fixture-agent"});
  if(!inbox.events.some(value=>value.kind==="operation.succeeded")||JSON.stringify(inbox).includes("FIXTURE-ONLY"))throw Error("Durable callback is missing or leaked the sign-in code.");
  if(errors.length||requests.length||starts!==1)throw Error(JSON.stringify({errors,credentialRequests:requests,starts}));
  const receipt={providerAuthentication:"simulated",realCloudVerified:false,realBrowser:true,phoneWidth:390,bootstrapRemoved:true,ownerCredentialSent:false,observerDisconnectedBeforeCompletion:true,
    resumedWithoutLaptopObserver:true,loginStarts:starts,durableAgentEvents:inbox.events.map(value=>value.kind),pageErrors:errors};
  await writeFile(join(output,"results.json"),JSON.stringify(receipt,null,2));console.log(JSON.stringify({output,...receipt},null,2));
}catch(error){await page.screenshot({path:join(output,"failure.png"),fullPage:true}).catch(()=>{});throw error;}
finally{
  await context.close();await owned.close();server.stop(true);await gate.close();await manager.close();await fixture.close();
  if(!directory.startsWith(scratch+sep))throw Error("Fixture cleanup escaped owned directory.");await rm(directory,{recursive:true,force:true});
}
