import { resolve, relative, isAbsolute } from 'node:path';
import { stat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

function object(value:unknown){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Expected workflow object');return value;}
function text(value:unknown){if(typeof value!=='string'||!value.trim())throw new Error('Expected nonempty workflow text');return value;}
function list(value:unknown){if(!Array.isArray(value)||!value.length)throw new Error('Expected nonempty workflow list');return value;}
function strings(value:unknown){return list(value).map(text);}
function id(value:unknown){const result=text(value);if(!/^[a-z0-9][a-z0-9-]*$/.test(result))throw new Error('Use a bounded lowercase id/version');return result;}
export function readWorkflow(value:unknown){
 const w=object(value);if(!('schemaVersion' in w)||w.schemaVersion!==1)throw new Error('Unknown art workflow version');
 if(!('id' in w&&'owner' in w&&'sources' in w&&'steps' in w&&'artifacts' in w&&'prerequisites' in w))throw new Error('Incomplete art workflow');
 const steps=list(w.steps).map(value=>{
  const s=object(value);if(!('id' in s&&'entry' in s&&'args' in s&&'outputs' in s&&'kind' in s&&'timeoutSeconds' in s))throw new Error('Incomplete workflow step');
  const kind=text(s.kind);if(!['generate','check','capture','review'].includes(kind))throw new Error('Unknown workflow step kind');
  if(!Number.isSafeInteger(s.timeoutSeconds)||Number(s.timeoutSeconds)<1||Number(s.timeoutSeconds)>1800)throw new Error('Bound each step to 1–1800 seconds');
  if(!Array.isArray(s.args))throw new Error('Step args must be an array, never shell text');
  return {id:id(s.id),entry:text(s.entry),args:s.args.map(text),outputs:strings(s.outputs),kind,timeoutSeconds:Number(s.timeoutSeconds)};
 });
 if(new Set(steps.map(s=>s.id)).size!==steps.length)throw new Error('Duplicate workflow step');
 const prerequisites=list(w.prerequisites).map(value=>{const p=object(value);if(!('path' in p))throw new Error('Missing prerequisite path');return {path:text(p.path),...('sha256' in p?{sha256:text(p.sha256)}:{})};});
 const artifacts=strings(w.artifacts);if(artifacts.some(p=>!p.includes('{version}')))throw new Error('Artifacts must have an immutable version path');
 const blockers='blockers' in w?Array.isArray(w.blockers)?w.blockers.map(text):strings(w.blockers):[];
 return {schemaVersion:1,id:id(w.id),owner:text(w.owner),sources:strings(w.sources),artifacts,prerequisites,steps,blockers,surface:'surface' in w?id(w.surface):null};
}
export function expand(value:string,version:string,url?:string){
 id(version);const result=value.replaceAll('{version}',version).replaceAll('{url}',url??'{url}');
 if(/\{(?!url\})[^}]+\}/.test(result)||result.includes('{url}')&&url!==undefined)throw new Error('Unknown workflow token');
 return result;
}
export function ownedPath(root:string,path:string){
 if(isAbsolute(path))throw new Error('Workflow paths must be repository relative');
 const result=resolve(root,path),local=relative(root,result);
 if(!local||local.startsWith('..')||isAbsolute(local))throw new Error('Workflow path escapes repository');
 return result;
}
export async function hashFiles(root:string,paths:readonly string[],optional=false){
 const result:Record<string,string>={};
 async function visit(path:string){
  const absolute=ownedPath(root,path),info=await stat(absolute);
  if(info.isDirectory())for(const child of (await readdir(absolute)).sort())await visit(path+'/'+child);
  else if(info.isFile())result[path.replaceAll('\\','/')]=createHash('sha256').update(await Bun.file(absolute).bytes()).digest('hex');
  else throw new Error('Unsupported workflow input '+path);
 }
 for(const path of paths){
  ownedPath(root,path);
  if(path.includes('*')){const matches:string[]=[];for await(const match of new Bun.Glob(path).scan(root))matches.push(match);if(!matches.length&&!optional)throw new Error('Missing workflow output '+path);for(const match of matches.sort())await visit(match);}
  else try{await visit(path);}catch(error){if(!optional||!(error instanceof Error&&'code' in error&&error.code==='ENOENT'))throw error;}
 }
 return result;
}
export async function planWorkflow(options:{root:string;file:string;version:string}){
 const workflow=readWorkflow(await Bun.file(ownedPath(options.root,options.file)).json());
 const steps=workflow.steps.map(s=>({...s,args:s.args.map(arg=>expand(arg,options.version)),outputs:s.outputs.map(path=>expand(path,options.version))}));
 const artifacts=workflow.artifacts.map(path=>expand(path,options.version));
 if(new Set(artifacts).size!==artifacts.length)throw new Error('Duplicate artifact roots');
 for(const artifact of artifacts)ownedPath(options.root,artifact);
 for(const step of steps){
  if(!step.entry.endsWith('.ts'))throw new Error('Workflow entry must be a Bun TypeScript script');
  ownedPath(options.root,step.entry);
  for(const output of step.outputs)if(!artifacts.some(root=>{const path=relative(ownedPath(options.root,root),ownedPath(options.root,output));return path&&!path.startsWith('..')&&!isAbsolute(path);}))throw new Error('Step output must stay in versioned artifact roots');
  if(step.args.some(arg=>arg.includes('{url}'))&&!workflow.surface)throw new Error('URL token requires a managed surface');
 }
 const inputs=await hashFiles(options.root,[options.file,workflow.owner,...workflow.sources,...steps.map(s=>s.entry),...workflow.prerequisites.map(p=>p.path)]);
 for(const p of workflow.prerequisites)if(p.sha256&&inputs[p.path]!==p.sha256)throw new Error('Prerequisite hash changed: '+p.path);
 return {workflow,version:options.version,artifacts,steps,inputs,fingerprint:createHash('sha256').update(JSON.stringify(inputs)).digest('hex')};
}
export type WorkflowPlan=Awaited<ReturnType<typeof planWorkflow>>;
