import { mkdir } from "node:fs/promises";
import { z } from "zod";
import type { ConnectionAdapter } from "../connections";
import { readCodexSubscription } from "./codex-account";
import { openCodexAccountSession } from "./codex-account-session";

export { openCodexAccountSession } from "./codex-account-session";

const loginSchema=z.object({type:z.literal("chatgptDeviceCode"),loginId:z.string(),
  verificationUrl:z.string().url().refine(value=>{const url=new URL(value);return url.origin==="https://auth.openai.com"&&url.pathname==="/codex/device"&&!url.search&&!url.hash;}),
  userCode:z.string().min(1).max(64).regex(/^[A-Z0-9-]+$/)});
const completedSchema=z.object({loginId:z.string().nullable(),success:z.boolean()});

export function createCodexConnectionAdapter(options:{ownerId:string;executable:string;codexHome:string;cwd?:string;env?:NodeJS.ProcessEnv;readSubscription?:typeof readCodexSubscription}):ConnectionAdapter{
  return {
    descriptor:{id:"codex-account",providerId:"codex-account",label:"Codex",ownerId:options.ownerId,capabilities:["inference"],
      authorizationScope:"ChatGPT subscription on this remote host. Credentials stay in its private volume and are never sent to workers.",
      authentication:"device-code",billingMode:"subscription"},
    async inspect(signal){
      // The official app-server exits before initialize when a fresh CODEX_HOME
      // does not exist. The host owns this private directory, including before login.
      await mkdir(options.codexHome,{recursive:true,mode:0o700});
      const status=await (options.readSubscription??readCodexSubscription)({...options,signal});
      return {state:status.available?"ready":status.authenticated?"unavailable":"disconnected",credentialSource:status.authenticated?"ambient":"missing",
        summary:status.available?"ChatGPT subscription verified. Separately billed inference is disabled.":status.reason??"Connect your ChatGPT subscription."};
    },
    async connect({signal,onAction}){
      await mkdir(options.codexHome,{recursive:true,mode:0o700});
      let loginId:string|undefined;const observed=new Map<string,boolean>();
      let complete:(value:boolean)=>void=()=>{};
      const completion=new Promise<boolean>(resolve=>{complete=resolve;});
      const session=await openCodexAccountSession({...options,signal,onNotification:(method,input)=>{
        if(method!=="account/login/completed")return;
        const value=completedSchema.parse(input);if(!value.loginId)return;
        if(observed.size<8)observed.set(value.loginId,value.success);
        if(value.loginId===loginId)complete(value.success);
      }});
      try{
        const login=loginSchema.parse(await session.request("account/login/start",{type:"chatgptDeviceCode"}));loginId=login.loginId;
        onAction({kind:"device-code",verificationUrl:login.verificationUrl,userCode:login.userCode,expiresAt:Date.now()+900000});
        if(observed.has(loginId))complete(observed.get(loginId)!);
        const success=await Promise.race([completion,session.exited.then(()=>false)]);
        signal.throwIfAborted();if(!success)throw Error("Codex sign-in did not complete.");
      }finally{await session.close();}
    },
    async revoke(signal){const session=await openCodexAccountSession({...options,signal});try{await session.request("account/logout");}finally{await session.close();}},
  };
}
