import { spawnBackgroundProcess, terminateProcessTree } from '@hyperfocus/desktop-runtime/process';

export async function execute(options:{root:string;args:string[];timeoutSeconds:number;onOutput?:(text:string)=>void}){
 const child=spawnBackgroundProcess({cmd:[process.execPath,...options.args],cwd:options.root,timeout:options.timeoutSeconds*1000,maxBuffer:4194304,stdout:'pipe',stderr:'pipe'});
 let stdout='',stderr='';
 async function drain(stream:ReadableStream<Uint8Array>,error:boolean){const reader=stream.getReader(),decoder=new TextDecoder();try{while(true){const row=await reader.read();if(row.done)break;const text=decoder.decode(row.value,{stream:true});if(error)stderr+=text;else stdout+=text;options.onOutput?.(text);}}finally{reader.releaseLock();}}
 try{const [code]=await Promise.all([child.exited,drain(child.stdout,false),drain(child.stderr,true)]);return {code,stdout,stderr};}
 finally{if(child.exitCode===null)await terminateProcessTree({process:child});}
}

/** The supervisor still owns ports, shared reuse and isolated-server lifetime. */
export async function managedSurface(options:{root:string;surface:string}){
 const entry='.agents/skills/dev-server/scripts/dev.ts';
 const child=spawnBackgroundProcess({cmd:[process.execPath,entry,'start',options.surface,'--json'],cwd:options.root,stdout:'pipe',stderr:'pipe',maxBuffer:1048576});
 let buffer='',stderr='',settled=false;
 let accept:(value:{id:string;url:string;mode:string})=>void=()=>{},reject:(reason:unknown)=>void=()=>{};
 const ready=new Promise<{id:string;url:string;mode:string}>((yes,no)=>{accept=yes;reject=no;});
 async function drain(stream:ReadableStream<Uint8Array>,error:boolean){const reader=stream.getReader(),decoder=new TextDecoder();try{while(true){const row=await reader.read();if(row.done)break;const chunk=decoder.decode(row.value,{stream:true});if(error){stderr+=chunk;continue;}buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(settled||!line.trim().startsWith('{'))continue;const record=JSON.parse(line);if(typeof record.id==='string'&&typeof record.url==='string'&&['shared','isolated'].includes(record.mode)){settled=true;accept(record);}}}}catch(error){reject(error);}finally{reader.releaseLock();}}
 const streams=Promise.all([drain(child.stdout,false),drain(child.stderr,true)]);
 void child.exited.then(code=>{if(!settled)reject(new Error(`Managed server exited ${code}: ${stderr}`));},reject);
 const deadline=setTimeout(()=>reject(new Error('Managed server readiness timed out')),75000);
 try{
  const server=await ready;
  const began=Date.now();while(true){try{if((await fetch(server.url+'/healthz',{signal:AbortSignal.timeout(2000)})).ok)break;}catch{}if(Date.now()-began>60000)throw new Error('Managed surface health timed out');await new Promise(r=>setTimeout(r,250));}
  return {...server,close:async()=>{if(server.mode==='isolated'){await execute({root:options.root,args:[entry,'stop',server.id,'--json'],timeoutSeconds:20});await terminateProcessTree({process:child});}await streams;}};
 }catch(error){await terminateProcessTree({process:child});await streams;throw error;}
 finally{clearTimeout(deadline);}
}
