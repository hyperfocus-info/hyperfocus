import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planWorkflow, readWorkflow } from './workflow.ts';
import { runWorkflow } from './run.ts';
import { spawnBackgroundProcess, terminateProcessTree } from '@hyperfocus/desktop-runtime/process';

async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'art-workflow-'));
 await Bun.write(join(root,'ART.md'),'Fixture direction; no visual acceptance');
 await Bun.write(join(root,'input.json'),'[1,2,3]');
 await Bun.write(join(root,'build.ts'),"await Bun.write(process.argv[2]!, 'generated');");
 await Bun.write(join(root,'capture.ts'),"if(await Bun.file('fail.flag').exists())throw new Error('synthetic renderer failure');await Bun.write(process.argv[2]!, 'captured');");
 const workflow={schemaVersion:1,id:'fixture',owner:'ART.md',sources:['build.ts','capture.ts'],prerequisites:[{path:'input.json'}],artifacts:['out/{version}'],blockers:[],steps:[
  {id:'build',kind:'generate',entry:'build.ts',args:['out/{version}/build.json'],outputs:['out/{version}/build.json'],timeoutSeconds:10},
  {id:'capture',kind:'capture',entry:'capture.ts',args:['out/{version}/capture.json'],outputs:['out/{version}/capture.json'],timeoutSeconds:10},
 ]};
 await Bun.write(join(root,'workflow.json'),JSON.stringify(workflow));
 return {root,workflow,file:'workflow.json',version:'v1',close:()=>rm(root,{recursive:true,force:true})};
}
test('one run executes ordered commands; unchanged resume does not rewrite evidence',async()=>{
 const f=await fixture();try{
  expect((await runWorkflow({...f,stopAfter:'build'})).status).toBe('paused');
  expect((await runWorkflow({...f,stopAfter:'build',resume:true})).status).toBe('paused');
  expect(await Bun.file(join(f.root,'out/v1/capture.json')).exists()).toBe(false);
  const before=await Bun.file(join(f.root,'out/v1/build.json')).bytes();
  expect((await runWorkflow({...f,resume:true})).status).toBe('complete');
  expect(await Bun.file(join(f.root,'out/v1/build.json')).bytes()).toEqual(before);
  expect((await runWorkflow({...f,resume:true})).status).toBe('complete');
  await expect(runWorkflow(f)).rejects.toThrow('Run exists');
 }finally{await f.close();}
});
test('failed stage resumes after an external fault; failures and prior submission remain recorded',async()=>{
 const f=await fixture();try{
  await Bun.write(join(f.root,'fail.flag'),'simulate unavailable capture');
  await expect(runWorkflow(f)).rejects.toThrow('capture exited');
  await rm(join(f.root,'fail.flag'));
  expect((await runWorkflow({...f,resume:true})).status).toBe('complete');
  const history=await Bun.file(join(f.root,'.local/game-art/runs/fixture/v1/events.jsonl')).text();
  expect(history).toContain('step-failed');expect(history.match(/"step":"build","kind":"generate","elapsedMs"/g)).toHaveLength(1);
 }finally{await f.close();}
});
test('changed sources and changed completed media cannot be silently reused',async()=>{
 const f=await fixture();try{
  await runWorkflow({...f,stopAfter:'build'});
  await Bun.write(join(f.root,'input.json'),'changed');
  await expect(runWorkflow({...f,resume:true})).rejects.toThrow('inputs changed');
  await Bun.write(join(f.root,'input.json'),'[1,2,3]');
  await Bun.write(join(f.root,'out/v1/build.json'),'tampered');
  await expect(runWorkflow({...f,resume:true})).rejects.toThrow('evidence changed');
 }finally{await f.close();}
});
test('partial capture is preserved instead of being overwritten on resume',async()=>{
 const f=await fixture();try{
  await runWorkflow({...f,stopAfter:'build'});
  await Bun.write(join(f.root,'out/v1/capture.json'),'partial');
  await expect(runWorkflow({...f,resume:true})).rejects.toThrow('Partial evidence');
  expect(await Bun.file(join(f.root,'out/v1/capture.json')).text()).toBe('partial');
 }finally{await f.close();}
});
test('unknown versions, unsafe paths, missing prerequisites and unimplemented capabilities fail before generation',async()=>{
 const f=await fixture();try{
  await expect(planWorkflow({...f,version:'../escape'})).rejects.toThrow('bounded');
  f.workflow.steps[0]!.entry='../outside.ts';await Bun.write(join(f.root,'workflow.json'),JSON.stringify(f.workflow));
  await expect(planWorkflow(f)).rejects.toThrow('escapes');
  f.workflow.steps[0]!.entry='build.ts';
  const blocked={...f.workflow,blockers:['Voxel edit/remesh/save integration has no implementation']};
  await Bun.write(join(f.root,'workflow.json'),JSON.stringify(blocked));
  await expect(runWorkflow(f)).rejects.toThrow('blocked before generation');
  await Bun.write(join(f.root,'workflow.json'),JSON.stringify(f.workflow));await rm(join(f.root,'input.json'));
  await expect(planWorkflow(f)).rejects.toThrow();
  expect(()=>readWorkflow({...f.workflow,steps:[f.workflow.steps[0],f.workflow.steps[0]]})).toThrow('Duplicate');
 }finally{await f.close();}
});

test('versioned output paths cannot escape through parent segments',async()=>{
 const f=await fixture();try{
  f.workflow.steps[0]!.outputs=['out/{version}/../../other.json'];await Bun.write(join(f.root,'workflow.json'),JSON.stringify(f.workflow));
  await expect(planWorkflow(f)).rejects.toThrow('versioned artifact roots');
 }finally{await f.close();}
});
test('glob evidence is hashed and a missing required family fails',async()=>{
 const f=await fixture();try{
  f.workflow.steps[0]!.outputs=['out/{version}/*.png'];await Bun.write(join(f.root,'workflow.json'),JSON.stringify(f.workflow));
  await expect(runWorkflow(f)).rejects.toThrow('Missing workflow output');
 }finally{await f.close();}
});

test('same-version concurrency is rejected and a dead runner does not strand its lock',async()=>{
 const f=await fixture();let child:ReturnType<typeof spawnBackgroundProcess>|undefined;
 try{
  await runWorkflow({...f,stopAfter:'build'});
  // A live process alone does not retain the connection: GC can release its lock.
  await Bun.write(join(f.root,'hold-lock.ts'),"import { Database } from 'bun:sqlite';const db=new Database(process.argv[2]!);db.exec('BEGIN EXCLUSIVE;');console.log('locked');setInterval(()=>{void db.inTransaction;},1000);");
  child=spawnBackgroundProcess({cmd:[process.execPath,'hold-lock.ts','.local/game-art/runs/fixture/v1/lock.sqlite'],cwd:f.root,stdout:'pipe',stderr:'pipe',timeout:5000});
  if(!child.stdout)throw new Error('Missing lock-holder pipe');
  const reader=child.stdout.getReader();
  try{const ready=await Promise.race([reader.read(),child.exited.then(()=>{throw new Error('Lock holder exited before readiness');})]);expect(new TextDecoder().decode(ready.value)).toContain('locked');}finally{reader.releaseLock();}
  await expect(runWorkflow({...f,resume:true})).rejects.toThrow('already running');
  await terminateProcessTree({process:child});await child.exited;
  expect((await runWorkflow({...f,resume:true})).status).toBe('complete');
 }finally{if(child?.exitCode===null)await terminateProcessTree({process:child});await f.close();}
},15000);
