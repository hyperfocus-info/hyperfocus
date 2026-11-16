import { expect, test } from 'bun:test';
import { describeTaskProgress } from './progress';
test('a running worker has indeterminate progress until measured and cannot claim completion',()=>{
  const task={status:'running' as const,label:'Rendering'};
  expect(describeTaskProgress({task}).percentage).toBeNull();
  expect(describeTaskProgress({task:{...task,completed:120,total:120}}).percentage).toBe(99);
  expect(describeTaskProgress({task:{...task,status:'succeeded',completed:120,total:120}}).percentage).toBe(100);
});
test('missing heartbeats stop the active indication without inventing failure or success',()=>{
  const view=describeTaskProgress({task:{status:'running',label:'Authoring',updatedAt:'2026-10-25T10:00:00Z'},now:Date.parse('2026-10-25T10:01:00Z')});
  expect(view.status).toBe('interrupted');expect(view.active).toBe(false);expect(view.label).toBe('Progress unavailable');
});
