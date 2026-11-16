import {expect,test} from 'bun:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readLocalCapability} from './local-capability';

test('local authoring reconnects after restart without sharing authority across workspaces',async()=>{
  const root=await mkdtemp(join(tmpdir(),'author-capability-'));
  try {
    const [first,concurrent]=await Promise.all([readLocalCapability(join(root,'one')),readLocalCapability(join(root,'one'))]);
    expect(concurrent).toBe(first);expect(await readLocalCapability(join(root,'one'))).toBe(first);
    expect(await readLocalCapability(join(root,'two'))).not.toBe(first);
  }finally{await rm(root,{recursive:true,force:true});}
});
