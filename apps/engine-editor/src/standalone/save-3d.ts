import { isHyperfocus3DSnapshot, type GameplaySnapshot3D, type Hyperfocus3DSnapshot } from '@hyperfocus/engine/project/runtime-3d';
import type { SaveJsonValue } from '@hyperfocus/engine/save';

export function readSaved3DSnapshot(data: SaveJsonValue): Hyperfocus3DSnapshot {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error('Saved slot is not a Hyperfocus 3D snapshot.');
  const schema = Reflect.get(data, 'schema'), snapshot = Reflect.get(data, 'snapshot');
  if (schema !== 'hyperfocus-3d-snapshot-v1' || !isHyperfocus3DSnapshot(snapshot)) throw new Error('Saved slot is not a Hyperfocus 3D snapshot.');
  return snapshot;
}

export function create3DSaveData(snapshot: GameplaySnapshot3D): SaveJsonValue {
  return {
    schema: 'hyperfocus-3d-snapshot-v1',
    snapshot: {
      version: snapshot.version, sceneId: snapshot.sceneId, tick: snapshot.tick,
      ...(snapshot.motionSeed !== undefined ? { motionSeed: snapshot.motionSeed } : {}),
      entities: snapshot.entities.map(entity => ({ id: entity.id, position: [...entity.position], rotationY: entity.rotationY, ...(entity.rotation ? { rotation: [...entity.rotation] } : {}) })),
      ...(snapshot.combat ? { combat: snapshot.combat } : {}),
      ...(snapshot.play ? { play: snapshot.play } : {}),
      ...(snapshot.gameplay ? { gameplay: snapshot.gameplay } : {}),
    },
  };
}
