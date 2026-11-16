import type { Hyperfocus3DDeclaration } from '../project/runtime-3d.ts';
import type { Hyperfocus3DEvaluatedFrame, Hyperfocus3DVec3 } from './3d.ts';
import type { MaterialLook3D } from '../render/materials/3d-presets.ts';
import { matchesAuthoredMaterialLook3D, retainImmutableMaterialLook3D } from './immutable-material-3d.ts';

type Entity = Hyperfocus3DEvaluatedFrame['entities'][number];
type Authored = Hyperfocus3DDeclaration['scenes'][number]['entities'][number];
type Material = Hyperfocus3DDeclaration['materials'][number];
type Pose = { position: Hyperfocus3DVec3; rotationY: number; rotation?: readonly [number, number, number, number] };

/** Private storage for one synchronous render owner. Every authored/current
 * scalar is reread; no tick-only cache assumes that paused edits cannot happen.
 * Buffers are borrowed until the next sample/reset, never detached snapshots.
 * Resource liveness remains the responsibility of checked runtime application.
 */
export function createOwnedFrameStorage3D() {
  const entities: Entity[] = [], materials: Hyperfocus3DEvaluatedFrame['materials'] = [];
  const transforms: Array<{ position: Hyperfocus3DVec3; rotation: [number, number, number, number]; scale: Hyperfocus3DVec3 }> = [];
  const looks: MaterialLook3D[] = [];
  const work = { generation: 0, samples: 0, fallbackSamples: 0, entityVisits: 0, materialVisits: 0, entityRecordsCreated: 0, materialRecordsCreated: 0, materialLooksCreated: 0, materialLooksReused: 0, vectorArraysCreated: 0, retainedEntities: 0, retainedMaterials: 0 };
  const sampleEntity = (entity: Authored, index: number, pose?: Pose): Entity => {
    work.entityVisits++;
    let output = entities[index], vectors = transforms[index];
    if (!output || !vectors) {
      vectors = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };transforms[index] = vectors;
      output = { id: entity.id, ...vectors, visible: true };entities[index] = output;
      work.entityRecordsCreated++;work.vectorArraysCreated += 3;
    }
    output.id = entity.id;output.position = vectors.position;output.rotation = vectors.rotation;output.scale = vectors.scale;output.visible = true;
    delete output.variantId;delete output.renderMaterialId;
    const position = pose?.position ?? entity.position;
    for (let axis = 0; axis < 3; axis++) { vectors.position[axis] = position[axis]!;vectors.scale[axis] = entity.scale[axis]!; }
    if (pose?.rotation) for (let axis = 0; axis < 4; axis++) vectors.rotation[axis] = pose.rotation[axis]!;
    else { const half = (pose?.rotationY ?? entity.rotationY) / 2;vectors.rotation[0] = 0;vectors.rotation[1] = Math.sin(half);vectors.rotation[2] = 0;vectors.rotation[3] = Math.cos(half); }
    return output;
  };
  const sampleMaterial = (source: Material, index: number, original: () => MaterialLook3D) => {
    work.materialVisits++;
    let record = materials[index], look = looks[index];
    if (!look || !matchesAuthoredMaterialLook3D(source, look)) {
      look = retainImmutableMaterialLook3D(original());looks[index] = look;
      work.materialLooksCreated++;work.vectorArraysCreated += 4 + (source.toon ? 3 : 0);
    } else work.materialLooksReused++;
    if (!record) { record = { id: source.id, look };materials[index] = record;work.materialRecordsCreated++; }
    record.id = source.id;record.look = look;
    return record;
  };
  return { work, sampleEntity, sampleMaterial,
    begin(entityCount: number, materialCount: number) {
      work.generation++;work.samples++;entities.length = transforms.length = entityCount;materials.length = looks.length = materialCount;
      work.retainedEntities = entityCount;work.retainedMaterials = materialCount;
    },
    entities, materials,
    reset() { entities.length = materials.length = transforms.length = looks.length = 0;work.generation++;work.retainedEntities = work.retainedMaterials = 0; },
  };
}
