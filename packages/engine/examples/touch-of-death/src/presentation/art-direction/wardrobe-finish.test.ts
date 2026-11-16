import {expect,test} from 'bun:test';
import {outwardFighterShell} from './wardrobe-finish.ts';
import {block} from '../city/weapons/geometry.ts';
import {cookDirectedFighters} from './integration/assets.ts';

test('closed finish geometry rejects the inward-facing hand regression before cooking',()=>{
  const faces=block(0,0,0,.04,.06,.025);
  expect(()=>outwardFighterShell(faces)).not.toThrow();
  expect(()=>outwardFighterShell(faces.map(face=>[...face].reverse()))).toThrow('inverted');
  expect(()=>outwardFighterShell([])).toThrow('empty');
  expect(()=>cookDirectedFighters()).not.toThrow();
});
