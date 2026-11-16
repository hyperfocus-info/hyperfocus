import { expect, test } from 'bun:test';
import { compareTableValues, normalizeTablePreferences } from './model';

test('saved layouts survive new columns, reject stale IDs and preserve required columns', () => {
  const columns=[{id:'title',label:'Track',hideable:false},{id:'lufs',label:'LUFS'},{id:'actions',label:'Actions',sortable:false}];
  expect(normalizeTablePreferences({columns,value:{order:['gone','lufs','lufs'],hidden:['title','gone','lufs'],sort:{id:'actions',direction:'asc'}}})).toEqual({version:1,order:['lufs','title','actions'],hidden:['lufs'],sort:null});
});
test('measurements sort numerically with missing values last in either direction', () => {
  const values=[null,-3,-14,NaN,-8];
  expect([...values].sort((a,b)=>compareTableValues(a,b,'asc')).slice(0,3)).toEqual([-14,-8,-3]);
  expect([...values].sort((a,b)=>compareTableValues(a,b,'desc')).slice(0,3)).toEqual([-3,-8,-14]);
  expect(compareTableValues('Track 2','Track 10','asc')).toBeLessThan(0);
});
