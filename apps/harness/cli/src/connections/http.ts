import { z } from "zod";
import type { Database } from "bun:sqlite";
import { connectionAccessRequestSchema,connectionRequestSchema } from "@hyperfocus/ai-core/connections";
import { createBrowserGrantStore,sameSecret,secureBrowserCookie } from "@hyperfocus/ai-runtime/browser-grants";
import type { createConnectionManager } from "@hyperfocus/ai-runtime/connections";
import type { createOperationStore } from "@hyperfocus/ai-runtime/operations";

const prefix="/api/connections/v1",cookie="__Host-hyperfocus-connections",csrf="x-connections-csrf";
const grantSchema=connectionAccessRequestSchema.omit({expiresInMs:true}).extend({id:z.string().uuid(),expiresAt:z.number()});
export function createConnectionHttpHandler(options:{db:Database;manager:ReturnType<typeof createConnectionManager>;
  operations:ReturnType<typeof createOperationStore>;token:string;publicOrigin:string;authorizeProject:(id:string)=>void;signal?:AbortSignal}){
  const origin=new URL(options.publicOrigin);
  if(origin.origin!==options.publicOrigin||origin.protocol!=="https:"&&!(["localhost","127.0.0.1"].includes(origin.hostname)&&origin.protocol==="http:"))throw Error("Connections require an exact trusted HTTPS origin.");
  const grants=createBrowserGrantStore({db:options.db,namespace:"connection_browser",cookieName:cookie,csrfContext:"hyperfocus-connections-v1",parse:input=>grantSchema.parse(input),bootstrapMs:3600000});
  const reply=(data:unknown,status=200,headers?:HeadersInit)=>Response.json(data,{status,headers:{"cache-control":"no-store","referrer-policy":"no-referrer","x-content-type-options":"nosniff",...Object.fromEntries(new Headers(headers))}});
  function mint(input:unknown){const {expiresInMs,...scope}=connectionAccessRequestSchema.parse(input);options.authorizeProject(scope.projectId);
    for(const id of scope.connectionIds)if(!options.manager.has(id))throw Error("Unknown connection.");
    const {access,code}=grants.mint(scope,expiresInMs);return {url:`${origin.origin}/connections#code=${code}`,accessId:access.id,expiresAt:access.expiresAt};}
  function checkOrigin(request:Request,mutation=false){const url=new URL(request.url),supplied=request.headers.get("origin");
    if(url.host!==origin.host||supplied!==null&&supplied!==origin.origin||mutation&&supplied===null||["cross-site","none"].includes(request.headers.get("sec-fetch-site")??""))throw Error("Browser origin is not authorized.");}
  function authenticate(request:Request){checkOrigin(request,request.method!=="GET");const session=grants.authenticate(request.headers.get("cookie"));options.authorizeProject(session.access.projectId);
    if(request.method!=="GET"&&!sameSecret(request.headers.get(csrf)??"",session.csrfToken))throw Error("Browser CSRF check failed.");return session;}
  async function visible(ids?:string[]){const values=await options.manager.list();return ids?values.filter(value=>ids.includes(value.id)):values;}
  return {mint,async handle(request:Request):Promise<Response|undefined>{
    const url=new URL(request.url);if(!url.pathname.startsWith(prefix+"/"))return;
    const route=url.pathname.slice(prefix.length),browser=route.startsWith("/browser/");
    try{
      if(!browser){
        if(request.headers.has("origin")||!sameSecret(request.headers.get("authorization")??"",`Bearer ${options.token}`))return reply({error:"Trusted host authentication required."},401);
        if(route==="/access"&&request.method==="POST")return reply(mint(await body(request)));
        if(route.startsWith("/access/")&&request.method==="DELETE"){grants.revoke(route.slice(8));return reply({revoked:true});}
        if(route==="/connections"&&request.method==="GET")return reply(await visible());
        if(route.startsWith("/operations/")&&request.method==="GET"){
          const operation=options.operations.get(route.slice(12));if(!operation)return reply({error:"Unknown operation."},404);
          options.authorizeProject(operation.projectId);return reply(operation);
        }
        const match=/^\/connections\/([a-zA-Z0-9_.:-]+)\/(connect|cancel|revoke)$/.exec(route);
        if(match&&request.method==="POST"){
          const input=connectionRequestSchema.parse(await body(request));options.authorizeProject(input.projectId);
          if(match[2]==="connect")return reply(options.manager.connect(match[1]!,input));
          if(match[2]==="cancel")await options.manager.cancel(match[1]!);else await options.manager.revoke(match[1]!);
          return reply({completed:true});
        }
        return reply({error:"Unknown connection route."},404);
      }
      if(route==="/browser/session"&&request.method==="POST"){
        checkOrigin(request,true);const {code}=z.object({code:z.string().max(128)}).strict().parse(await body(request));
        const session=grants.exchange(code);options.authorizeProject(session.access.projectId);
        return reply({access:session.access,csrfToken:session.csrfToken},200,{"set-cookie":secureBrowserCookie(cookie,{token:session.token,expiresAt:session.access.expiresAt})});
      }
      const session=authenticate(request);
      if(route==="/browser/session"&&request.method==="GET")return reply({access:session.access,csrfToken:session.csrfToken});
      if(route==="/browser/session"&&request.method==="DELETE"){grants.logout(session.token);return reply({closed:true},200,{"set-cookie":secureBrowserCookie(cookie,{token:"",expiresAt:0})});}
      if(route==="/browser/connections"&&request.method==="GET"){
        const result=await visible(session.access.connectionIds);authenticate(request);return reply(result);
      }
      if(route==="/browser/events"&&request.method==="GET"){
        const signal=options.signal?AbortSignal.any([request.signal,options.signal]):request.signal;
        let release=()=>{};
        const stream=new ReadableStream<Uint8Array>({start(controller){
          let stopped=false,pending=false,previous="";const encoder=new TextEncoder();
          const stop=()=>{if(stopped)return;stopped=true;clearInterval(timer);unsubscribe();signal.removeEventListener("abort",stop);try{controller.close();}catch{}};
          const emit=async()=>{if(stopped||pending)return;pending=true;try{
            authenticate(request);const data=JSON.stringify(await visible(session.access.connectionIds));authenticate(request);
            if(!stopped&&data!==previous){controller.enqueue(encoder.encode(`event: connections\ndata: ${data}\n\n`));previous=data;}
          }catch{stop();}finally{pending=false;}};
          const unsubscribe=options.manager.subscribe(()=>void emit());
          const timer=setInterval(()=>{try{authenticate(request);if(!stopped)controller.enqueue(encoder.encode(": heartbeat\n\n"));}catch{stop();}},15000);
          release=stop;signal.addEventListener("abort",stop,{once:true});if(signal.aborted)stop();else void emit();
        },cancel(){release();}});
        return new Response(stream,{headers:{"content-type":"text/event-stream","cache-control":"no-store","x-accel-buffering":"no"}});
      }
      const match=/^\/browser\/connections\/([a-zA-Z0-9_.:-]+)\/(connect|cancel|revoke)$/.exec(route);
      if(!match||request.method!=="POST"||!session.access.connectionIds.includes(match[1]!))return reply({error:"Connection access denied."},403);
      const input=z.object({requestId:z.string().uuid().optional()}).strict().parse(await body(request));authenticate(request);
      if(match[2]==="connect")return reply(options.manager.connect(match[1]!,{projectId:session.access.projectId,recipientId:session.access.recipientId,requestId:input.requestId??crypto.randomUUID()}));
      if(match[2]==="cancel")await options.manager.cancel(match[1]!);else await options.manager.revoke(match[1]!);
      authenticate(request);return reply({completed:true});
    }catch{return reply({error:"Connection request rejected. Check access, provider state and request fields."},browser?403:400);}
  }};
}
async function body(request:Request){
  if(!request.headers.get("content-type")?.startsWith("application/json"))throw Error("JSON required.");
  const reader=request.body?.getReader();if(!reader)return {};
  let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const value=await reader.read();if(value.done)break;size+=value.value.length;if(size>16384)throw Error("Body too large.");chunks.push(value.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");
}
