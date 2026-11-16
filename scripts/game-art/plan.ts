import { resolve } from 'node:path';
import { compileArtDirection, type ArtDirectionGrammar, type DirectionRequest } from '@hyperfocus/artifact-review/direction';

const input = process.argv[2], output = process.argv[3];
if (!input || !output) throw new Error('Usage: bun scripts/game-art/plan.ts <brief.json> <plan.json>');
const brief: { grammar: ArtDirectionGrammar; requests: DirectionRequest[] } = await Bun.file(resolve(input)).json();
const plan = compileArtDirection(brief.grammar, brief.requests);
await Bun.write(resolve(output), JSON.stringify(plan, null, 2));
console.log(JSON.stringify({ grammar: plan.grammar, assignments: plan.assignments.length, stage: 'planned', approval: false }));
