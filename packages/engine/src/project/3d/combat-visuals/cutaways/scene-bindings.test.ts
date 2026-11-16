import { expect, test } from 'bun:test';
import { createCutawayTopologyWork3D, cutawaySceneBindings } from './scene-bindings.ts';

test('cutaway topology is retained across detached poses and shared by camera and obstruction consumers', () => {
  const ids = new Map([['wall', 'wall:occlusion'], ['trim', 'wall:occlusion-follow:trim']]);
  const frame = { entities: ['wall', 'trim', 'fighter:left-shin'].map(id => ({ id })), materials: [...ids.values()].map(id => ({ id })) };
  const first = cutawaySceneBindings(frame, ids);
  for (let i = 0; i < 100; i++) expect(cutawaySceneBindings(structuredClone(frame), ids)).toBe(first);
  expect([...first.fading]).toEqual(['wall', 'trim']);expect(first.limbs).toEqual([2]);
  expect(first.followers.get('wall:occlusion-follow:trim')).toEqual([1]);
  frame.entities.reverse();const reordered = cutawaySceneBindings(frame, ids);
  expect(reordered).not.toBe(first);expect(reordered.limbs).toEqual([0]);
  expect(first.entities.get('wall')).toBe(0);expect(reordered.entities.get('wall')).toBe(2);
  frame.materials.pop();const removed = cutawaySceneBindings(frame, ids);expect([...removed.fading]).toEqual(['wall']);
  ids.set('wall', 'opaque');expect([...cutawaySceneBindings(frame, ids).fading]).toEqual([]);
  frame.entities = [];expect(cutawaySceneBindings(frame, ids).entities.size).toBe(0);
});

test('transient topology replaces cached slots instead of accumulating identities', () => {
  const authored = new Map([['authored', 'surface']]);
  let last = cutawaySceneBindings({}, authored);
  for (let index = 0; index < 1000; index++) {
    last = cutawaySceneBindings({ entities: [{ id: `effect:${index}` }], materials: [] }, authored);
    expect(last.entities.size).toBe(1);expect(last.entityIds.length).toBe(1);
  }
  expect(last.entities.has('effect:0')).toBe(false);
});

test('optional work counts actual validation visits and separates complete rebuilds', () => {
  const authored = new Map([['a', 'a:occlusion'], ['b', 'b:occlusion']]);
  const frame = { entities: [{ id: 'a' }, { id: 'b' }], materials: [{ id: 'a:occlusion' }, { id: 'b:occlusion' }] }, work = createCutawayTopologyWork3D();
  cutawaySceneBindings(frame, authored, work);
  expect(work).toEqual({ calls: 1, validationEntityVisits: 0, validationMaterialVisits: 0, builds: 1, builtEntities: 2, builtMaterials: 2 });
  cutawaySceneBindings(frame, authored, work);
  expect(work.validationEntityVisits).toBe(2);expect(work.validationMaterialVisits).toBe(2);
  frame.entities.reverse();cutawaySceneBindings(frame, authored, work);
  expect(work.validationEntityVisits).toBe(3);expect(work.validationMaterialVisits).toBe(2);
  frame.materials.reverse();cutawaySceneBindings(frame, authored, work);
  expect(work.validationEntityVisits).toBe(5);expect(work.validationMaterialVisits).toBe(3);
  expect(work.calls).toBe(4);expect(work.builds).toBe(3);
  expect(work.builtEntities).toBe(6);expect(work.builtMaterials).toBe(6);
});
