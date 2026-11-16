import { resolve } from 'node:path';

const directory = resolve('.local/touch-of-death/tactical-evaluation');
const controller = resolve('packages/engine/src/project/3d/combat-ai.ts');

/** Freeze once before changing behavior. Subsequent evaluations never overwrite it. */
export async function preserveBaseline() {
  const path = `${directory}/baseline/controller.js`;
  if (await Bun.file(path).exists()) return path;
  const result = await Bun.build({ entrypoints: [controller], outdir: `${directory}/baseline`, naming: 'controller.js', target: 'bun' });
  if (!result.success) throw new AggregateError(result.logs, 'Could not freeze tactical baseline.');
  return path;
}

/** Evaluation-only injection leaves production gameplay and action execution intact. */
export async function loadEvaluationEngine(options: { checkpoint?: string; sourceOverrides?: Record<string, string> } = {}) {
  if (options.checkpoint) return import(resolve(options.checkpoint));
  const baseline = await preserveBaseline();
  const previous = resolve(directory, 'pre-default-adaptive/controller.js');
  const hasPrevious = await Bun.file(previous).exists();
  const runtime = resolve('packages/engine/src/project/runtime-3d.ts').replaceAll('\\', '/');
  const project = resolve('packages/engine/src/project/index.ts').replaceAll('\\', '/');
  const combat = resolve(import.meta.dir, '../../src/combat/preset.ts').replaceAll('\\', '/');
  const brains = resolve(import.meta.dir, 'brains.ts');
  const learning = resolve('packages/engine/src/project/3d/combat-ai/learning/model.ts').replaceAll('\\', '/');
  const validation = resolve('packages/engine/src/project/3d/combat-ai/learning/validation.ts').replaceAll('\\', '/');
  const selection = resolve('packages/engine/src/project/3d/combat-ai/policy/selection.ts').replaceAll('\\', '/');
  const result = await Bun.build({ entrypoints: ['evaluation-entry'], outdir: directory, naming: 'engine.js', target: 'bun', plugins: [{
    name: 'tactical-evaluation', setup(builder) {
      builder.onResolve({ filter: /^evaluation-entry$/ }, () => ({ path: 'evaluation-entry', namespace: 'evaluation' }));
      builder.onLoad({ filter: /.*/, namespace: 'evaluation' }, () => ({ loader: 'js', contents:
        `export {createGameplay3D,createHyperfocus3DRuntime,createCombatAiPolicy} from ${JSON.stringify(runtime)};\n` +
        `export {openHyperfocusProjectFiles} from ${JSON.stringify(project)};\n` +
        `export {createTouchOfDeathPreset} from ${JSON.stringify(combat)};\n` +
        `export {learningAdjustment} from ${JSON.stringify(learning)};\n` +
        `export {readLearning} from ${JSON.stringify(validation)};\n` +
        `export {candidateProbabilities} from ${JSON.stringify(selection)};\n` +
        `export {configureBrains} from ${JSON.stringify(brains)};` }));
      builder.onResolve({ filter: /combat-ai\.ts$/ }, args => args.importer.endsWith('combat-gameplay.ts') ? { path: brains } : undefined);
      builder.onResolve({ filter: /^frozen-tactical-baseline$/ }, () => ({ path: baseline }));
      builder.onResolve({ filter: /^current-tactical-controller$/ }, () => ({ path: controller }));
      builder.onResolve({ filter: /^previous-tactical-controller$/ }, () => hasPrevious ? { path: previous } : { path: 'previous-unavailable', namespace: 'previous' });
      builder.onLoad({ filter: /.*/, namespace: 'previous' }, () => ({ loader: 'js', contents: 'export function createCombatAi3D(){throw Error("Previous adaptive checkpoint is unavailable; run freeze-previous.ts with the retained pre-steering source.");}' }));
      builder.onLoad({ filter: /\.ts$/ }, args => {
        const contents = options.sourceOverrides?.[resolve(args.path)];
        return contents === undefined ? undefined : { loader: 'ts', contents };
      });
    },
  }] });
  if (!result.success) throw new AggregateError(result.logs, 'Could not bundle evaluation engine.');
  return import(`${directory}/engine.js?run=${Date.now()}`);
}

export async function evaluationDigests(options: { checkpoint?: string } = {}) {
  const digest = async (path: string) => new Bun.CryptoHasher('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex');
  const enginePath = options.checkpoint ? resolve(options.checkpoint) : `${directory}/engine.js`;
  const engineSha256 = await digest(enginePath), checkpoint = `${directory}/checkpoints/${engineSha256}.js`;
  if (!await Bun.file(checkpoint).exists()) await Bun.write(checkpoint, Bun.file(enginePath));
  const previous = `${directory}/pre-default-adaptive/controller.js`;
  return { engineSha256, baselineSha256: await digest(`${directory}/baseline/controller.js`), previousAdaptiveSha256: await Bun.file(previous).exists() ? await digest(previous) : null, checkpoint };
}

if (import.meta.main) console.log(await preserveBaseline());
