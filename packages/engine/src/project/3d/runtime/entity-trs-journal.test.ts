import { expect, test } from 'bun:test';
import { createEntityTrsValidationJournal3D } from "./entity-trs-journal.ts";
import type { Hyperfocus3DEvaluatedFrame as Frame } from "../../../frame/3d.ts";
import { evaluatedFrameFixture3D } from '../../../test-support/evaluated-frame3d.ts';

test('journal snapshots topology identities and rejects unsupported sample order without numeric authority',()=>{
  const ids=['static','writer'], writers=['writer'], journal=createEntityTrsValidationJournal3D(ids,writers);
  ids[0]='changed';writers[0]='static';
  const sample=(order=['static','writer'])=>{const entities:Frame['entities']=order.map(id=>({id,position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1],visible:true}));entities.forEach((entity,index)=>journal.sample(index,entity));return {...evaluatedFrameFixture3D(),entities};};
  const apply=(frame:Frame)=>{expect(journal.work.retainedFrameReferences).toBe(1);journal.beginApplication(frame.entities);for(let i=0;i<frame.entities.length;i++){if(journal.canReuse(i))journal.reused();else journal.validated(i);}journal.commit();};
  journal.run(sample,apply,'declared-entity-writes');journal.run(sample,apply,'declared-entity-writes');
  expect(journal.work.numericReuses).toBe(1);expect(journal.work.retainedFrameReferences).toBe(0);
  journal.run(()=>sample(['writer','static']),apply,'declared-entity-writes');expect(journal.work.numericReuses).toBe(0);expect(journal.work.fallbackApplications).toBe(1);
  journal.run(()=>sample(['static']),apply,'declared-entity-writes');expect(journal.work.numericReuses).toBe(0);
  expect(()=>createEntityTrsValidationJournal3D(['a','a'],[])).toThrow('unique');expect(()=>createEntityTrsValidationJournal3D(['a'],['missing'])).toThrow('not authored');
});
