import { createCpuPreparationWorkload } from "./workload.ts";

const hash = (value: unknown) => new Bun.CryptoHasher('sha256').update(JSON.stringify(value)).digest('hex');

/** Untimed interventions on the real seeded city. Counts come from the engine owner. */
export async function probeCpuPreparation() {
  const workload = await createCpuPreparationWorkload({ diagnostics: true });
  const diagnostics = workload.diagnostics;
  if (!diagnostics) throw new Error('Structural probe requires enabled engine counters.');
  workload.frame();
  const { runtime, game } = diagnostics, gameplayBefore = hash(workload.checkpoint());
  const frame = runtime.sampleFrame({ viewport: workload.configuration.viewport });
  game.presentFrame(frame);
  const apply = () => {
    runtime.applyFrame(frame);
    return { ...runtime.readEntityApplicationWork() };
  };
  const first = apply(), frameBefore = hash(frame), unchanged = apply();
  const unchangedFrame = frameBefore === hash(frame);
  const entity = frame.entities[0];
  if (!entity) throw new Error('Structural probe requires an authored entity.');
  const position = entity.position[0];
  entity.position[0] = position + 0.125;
  const changedFrame = hash(frame), changed = apply();
  entity.position[0] = position;
  const restored = apply();
  // Corrupt one live render coordinate without changing detached input. The
  // checked application must notice this independently of producer dirtiness.
  const transform = runtime.scene.transforms.active.findIndex(active => active !== 0);
  if (transform < 0) throw new Error('Structural probe requires a live transform.');
  const offset = transform * 3, livePosition = runtime.scene.transforms.positions[offset]!;
  runtime.scene.transforms.positions[offset] = livePosition + 0.25;
  const livePerturbationObserved = runtime.scene.transforms.positions[offset] !== livePosition;
  const repaired = apply(), liveStorageRestored = Object.is(runtime.scene.transforms.positions[offset], livePosition);
  const gameplayAfter = hash(workload.checkpoint()), frameAfter = hash(frame);
  const gameplayStateUnchanged = gameplayBefore === gameplayAfter;
  return {
    schema: 'touch-of-death-application-probe-v1', scenario: workload.configuration.schema,
    workloadHash: hash(workload.configuration), entityCount: frame.entities.length,
    first, unchanged, changed, restored, repaired,
    hashes: { gameplayBefore, gameplayAfter, frameBefore, changedFrame, frameAfter },
    unchangedFrame, gameplayStateUnchanged, livePerturbationObserved, liveStorageRestored,
    redundantUnchangedTraversal: unchangedFrame && gameplayStateUnchanged
      ? unchanged.entityTransformComparisons === frame.entities.length && unchanged.entityTransformComparisons > 0 && unchanged.entityTransformWrites === 0
      : undefined,
    singleChangeStillScansScene: changedFrame !== frameBefore && frameAfter === frameBefore && gameplayStateUnchanged
      ? changed.entityTransformComparisons === frame.entities.length && changed.entityTransformWrites === 1 && restored.entityTransformWrites === 1
      : undefined,
    liveStorageRequiresValidation: livePerturbationObserved && frameAfter === frameBefore && gameplayStateUnchanged
      ? liveStorageRestored && repaired.entityTransformWrites === 1 : undefined,
    limitations: [
      'A repeated detached frame isolates application work; it is not a repeated full presentation or a timing comparison.',
      'Comparisons can be necessary for live-storage repair. These counts do not authorize removing validation or prove a dirty-propagation speedup.',
      'No allocation rate, GC, browser main-thread, image parity, interpolation or display freshness measurement.',
    ],
  };
}
