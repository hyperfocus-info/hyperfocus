import { resolve } from 'node:path';
import { mkdir, open, stat } from 'node:fs/promises';
import { Database } from 'bun:sqlite';
import { planWorkflow, hashFiles, ownedPath, expand } from './workflow.ts';
import { execute, managedSurface } from './execute.ts';

type Completion={id:string;outputs:Record<string,string>;elapsedMs:number};
export async function runWorkflow(options:{root:string;file:string;version:string;resume?:boolean;plan?:boolean;stopAfter?:string}){
 const plan=await planWorkflow(options);
 if(options.stopAfter&&!plan.steps.some(s=>s.id===options.stopAfter))throw new Error('Unknown stopping step');
 if(options.plan)return {status:plan.workflow.blockers.length?'blocked':'planned',id:plan.workflow.id,owner:plan.workflow.owner,version:plan.version,blockers:plan.workflow.blockers,sourceFiles:Object.keys(plan.inputs).length,fingerprint:plan.fingerprint,artifacts:plan.artifacts,steps:plan.steps};
 if(plan.workflow.blockers.length)throw new Error('Workflow blocked before generation: '+plan.workflow.blockers.join('; '));
 const runRoot=resolve(options.root,'.local/game-art/runs',plan.workflow.id,options.version);
 await mkdir(runRoot,{recursive:true});
 // An empty transaction is an OS-released mutex, not another review database.
 const lock=new Database(resolve(runRoot,'lock.sqlite'));
 try{lock.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE;');}catch{lock.close();throw new Error('This workflow version is already running');}
 let server:Awaited<ReturnType<typeof managedSurface>>|undefined;
 try{
  const receipt=Bun.file(resolve(runRoot,'run.json'));
  let completed:Completion[]=[],startedAt=new Date().toISOString(),savedServer:{id:string;url:string;mode:string}|null=null;
  if(await receipt.exists()){
   if(!options.resume)throw new Error('Run exists; use --resume for unchanged inputs or a new version');
   const previous=await receipt.json();if(previous.fingerprint!==plan.fingerprint)throw new Error('Workflow/source inputs changed; create a new version');
   completed=previous.completed;startedAt=previous.startedAt;savedServer=previous.server??null;
   for(const step of completed){const actual=await hashFiles(options.root,Object.keys(step.outputs));if(JSON.stringify(actual)!==JSON.stringify(step.outputs))throw new Error('Completed evidence changed: '+step.id);}
  }else for(const path of plan.artifacts)if(await Bun.file(ownedPath(options.root,path)).exists()||await directoryExists(ownedPath(options.root,path)))throw new Error('Artifact version already exists: '+path);
  const save=async(status:string,failed?:string)=>Bun.write(receipt,JSON.stringify({schemaVersion:1,id:plan.workflow.id,version:options.version,fingerprint:plan.fingerprint,inputs:plan.inputs,startedAt,updatedAt:new Date().toISOString(),status,failed,completed,server:server?{id:server.id,url:server.url,mode:server.mode}:savedServer,model:null,usage:null,approval:false},null,2));
  if(options.stopAfter&&plan.steps.slice(0,plan.steps.findIndex(s=>s.id===options.stopAfter)+1).every(s=>completed.some(c=>c.id===s.id)))return {status:completed.length===plan.steps.length?'complete':'paused',runRoot,completed:completed.length,url:savedServer?.url};
  for(const step of plan.steps){
   if(completed.some(c=>c.id===step.id))continue;
   // Never overwrite a partial submission. A failed stage with no output can resume.
   if(Object.keys(await hashFiles(options.root,step.outputs,true)).length)throw new Error('Partial evidence exists; preserve it and use a new version: '+step.id);
   if(step.args.some(arg=>arg.includes('{url}'))&&!server)server=await managedSurface({root:options.root,surface:plan.workflow.surface!});
   await save('running');const start=Date.now();
   console.log(`[${plan.workflow.id}] ${step.id}`);
   await event(runRoot,{type:'step-started',step:step.id,kind:step.kind});
   try{
    const result=await execute({root:options.root,args:[step.entry,...step.args.map(arg=>expand(arg,options.version,server?.url))],timeoutSeconds:step.timeoutSeconds});
    const log=resolve(runRoot,`${step.id}-${start}.log`);await Bun.write(log,result.stdout+result.stderr);
    if(result.code!==0)throw new Error(`Step ${step.id} exited ${result.code}; see ${log}`);
    const outputs=await hashFiles(options.root,step.outputs);
    if(!Object.keys(outputs).length)throw new Error('Step produced no evidence');
    completed.push({id:step.id,outputs,elapsedMs:Date.now()-start});
    await event(runRoot,{type:'step-completed',step:step.id,kind:step.kind,elapsedMs:Date.now()-start});
    await save('running');
   }catch(error){await event(runRoot,{type:'step-failed',step:step.id,kind:step.kind,elapsedMs:Date.now()-start,error:String(error)});await save('failed',step.id);throw error;}
   if(options.stopAfter===step.id){await save('paused');return {status:'paused',runRoot,completed:completed.length};}
  }
  const fresh=await planWorkflow(options);if(fresh.fingerprint!==plan.fingerprint){await save('source-changed');throw new Error('Sources changed during capture; evidence retained, rerun a fresh version');}
  await save('complete');return {status:'complete',runRoot,completed:completed.length,url:server?.url??savedServer?.url,artifacts:plan.artifacts,approval:false};
 }finally{try{await server?.close();}finally{lock.close();}}
}
async function directoryExists(path:string){try{return (await stat(path)).isDirectory();}catch{return false;}}
async function event(root:string,value:Record<string,unknown>){const file=await open(resolve(root,'events.jsonl'),'a');try{await file.write(JSON.stringify({at:new Date().toISOString(),...value})+'\n');}finally{await file.close();}}
if(import.meta.main){
 const [file,version,...args]=process.argv.slice(2);
 if(!file||!version)throw new Error('Usage: bun run art:run <consumer-workflow.json> <new-version> [--plan] [--resume] [--stop-after <step>]');
 const stop=args.indexOf('--stop-after');
 for(const arg of args.filter((_,i)=>i!==stop+1||stop<0))if(!['--plan','--resume','--stop-after'].includes(arg))throw new Error('Unknown workflow flag '+arg);
 console.log(JSON.stringify(await runWorkflow({root:process.cwd(),file,version,plan:args.includes('--plan'),resume:args.includes('--resume'),stopAfter:stop>=0?args[stop+1]:undefined}),null,2));
}
