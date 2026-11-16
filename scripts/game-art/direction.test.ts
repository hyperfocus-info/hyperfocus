import { expect, test } from 'bun:test';
import { compileArtDirection, compareMotionSignatures, validateDirectionEvidence, type ArtDirectionGrammar } from '@hyperfocus/artifact-review/direction';

const grammar: ArtDirectionGrammar = { id: 'test-grammar', owner: 'fixture-direction.md', requiredEvidence: ['neutral', 'gameplay', 'contact', 'strip'], recipes: [
  { id: 'load-smash', family: 'weighted', intent: 'punish', motion: 'overhead', strength: 'high impact', weakness: 'long exposed recovery' },
] };
test('material, voxel and playful character treatments need no combat vocabulary or generic fallback',()=>{
 const recipes=[
  {id:'scanned-stone',family:'surface',intent:'photoreal-closeup',treatment:'Owned scanned albedo/normal/roughness set at measured scale',strength:'Material response',weakness:'Requires licensed source maps and a proven lighting path'},
  {id:'voxel-blocks',family:'world',intent:'editable-grid',treatment:'Chunk-meshed blocks with stable semantic faces',strength:'Edit readability',weakness:'Requires edit/remesh/persistence integration'},
  {id:'playful-reader',family:'character',intent:'friendly-readability',treatment:'Large round shapes with sparse saturated accents',strength:'Readable silhouette',weakness:'Age and motion preferences still need owner comparison'},
 ];
 const plan=compileArtDirection({...grammar,recipes},recipes.map(r=>({id:r.id,family:r.family,intent:r.intent})));
 expect(plan.assignments.map(a=>a.treatment)).toEqual(recipes.map(r=>r.treatment));
 expect(()=>compileArtDirection({...grammar,recipes},[{id:'new-world',family:'world',intent:'unknown'}])).toThrow('No directed recipe');
 expect(()=>compileArtDirection({...grammar,recipes:[{...recipes[0]!,motion:'contradictory'}]},[{id:'stone',family:'surface',intent:'photoreal-closeup'}])).toThrow('Conflicting');
 expect(compileArtDirection(grammar,[{id:'tool',family:'weighted',intent:'punish'}]).assignments[0]!.motion).toBe('overhead');
});
test('a new asset can select established grammar but cannot invent its missing slot', () => {
  expect(() => compileArtDirection(grammar, [])).toThrow('actual asset requests');
  const plan = compileArtDirection(grammar, [{ id: 'new-tool', family: 'weighted', intent: 'punish' }]);
  expect(plan.assignments[0]?.recipe).toBe('load-smash');
  expect(() => compileArtDirection(grammar, [{ id: 'invented', family: 'weighted', intent: 'anti-air' }])).toThrow('No directed recipe');
  const alternatives = { ...grammar, recipes: [...grammar.recipes, { ...grammar.recipes[0]!, id: 'sweep', motion: 'horizontal' }] };
  expect(() => compileArtDirection(alternatives, [{ id: 'new-tool', family: 'weighted', intent: 'punish' }])).toThrow('Select a bounded recipe');
});
test('relabeling a recycled trajectory cannot defeat comparison and coverage is not approval', () => {
  expect(compareMotionSignatures([[0, 1], [2, 1]], [[0, 1], [2, 1]]).mean).toBe(0);
  expect(() => compareMotionSignatures([[NaN]], [[0]])).toThrow();
  const plan = compileArtDirection(grammar, [{ id: 'new-tool', family: 'weighted', intent: 'punish' }]);
  expect(validateDirectionEvidence(plan, []).stage).toBe('ROUGH');
  const row = { id: 'new-tool', media: { neutral: 'n.webm', gameplay: 'g.webm', contact: 'c.webm', strip: 's.png' }, checks: [{ name: 'rig', passed: true }] };
  expect(validateDirectionEvidence(plan, [row])).toEqual({ stage: 'CANDIDATE', failures: [] });
  expect(validateDirectionEvidence(plan, [{ ...row, media: { strip: 's.png' } }]).stage).toBe('ROUGH');
});

test('evidence follows the asset family; old saved plans retain their default requirements',()=>{
 const mixed:ArtDirectionGrammar={...grammar,recipes:[...grammar.recipes,{id:'stone',family:'material',intent:'weathered',treatment:'Measured map set',strength:'Surface response',weakness:'Lighting dependent'}],evidenceByFamily:{material:['neutral-light','grazing-light']}};
 const plan=compileArtDirection(mixed,[{id:'move',family:'weighted',intent:'punish'},{id:'stone',family:'material',intent:'weathered'}]);
 const checks=[{name:'bindings',passed:true}];
 const rows:Parameters<typeof validateDirectionEvidence>[1]=[{id:'move',media:{neutral:'n',gameplay:'g',contact:'c',strip:'s'},checks},{id:'stone',media:{'neutral-light':'n','grazing-light':'g'},checks}];
 expect(validateDirectionEvidence(plan,rows).stage).toBe('CANDIDATE');
 expect(validateDirectionEvidence(plan,[rows[0]!,{...rows[1]!,media:{'neutral-light':'n'}}]).failures).toContain('stone: missing grazing-light');
 expect(()=>compileArtDirection({...mixed,evidenceByFamily:{unknown:['image']}},[{id:'stone',family:'material',intent:'weathered'}])).toThrow('unknown family');
 expect(()=>compileArtDirection({...mixed,evidenceByFamily:{material:[]}},[{id:'stone',family:'material',intent:'weathered'}])).toThrow('unique required');
 const legacy=compileArtDirection(grammar,[{id:'move',family:'weighted',intent:'punish'}]);delete legacy.assignments[0]!.requiredEvidence;
 expect(validateDirectionEvidence(legacy,[rows[0]!]).stage).toBe('CANDIDATE');
});
