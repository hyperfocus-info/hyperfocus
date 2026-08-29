import type { RigidConstraintState3D, RigidDistanceConstraint3D } from "./rigid-3d.ts";

type NumericStorage = Float32Array | Float64Array;

export type RigidConstraintStore3D = {
  add(definition: RigidDistanceConstraint3D): number;
  remove(handleOrId: number | string): boolean;
  get(handleOrId: number | string): RigidConstraintState3D | undefined;
  count(): number;
  removeBody(bodyIndex: number): void;
  solve(): void;
};

export function createRigidConstraintStore3D(options: {
  capacity: number;
  iterations: number;
  alive: Uint8Array;
  positionX: NumericStorage;
  positionY: NumericStorage;
  positionZ: NumericStorage;
  resolveBody(value: number | string): number;
  bodyHandle(index: number): number;
  activeInverseMass(index: number): number;
  updateAabb(index: number): void;
  identifier(value: unknown, label: string): string;
  nonnegative(value: number, label: string): number;
  interval(value: number, minimum: number, maximum: number, label: string): number;
  onCountChanged(count: number): void;
}): RigidConstraintStore3D {
  type StoredConstraint = RigidConstraintState3D & { aIndex: number; bIndex: number };
  const constraints = new Array<StoredConstraint | undefined>(options.capacity);
  const handleById = new Map<string, number>();
  const freeHandles = Array.from({ length: options.capacity }, (_, index) => options.capacity - index - 1);
  let activeCount = 0;

  function handleFor(handleOrId: number | string): number | undefined {
    const handle = typeof handleOrId === "string" ? handleById.get(handleOrId) : handleOrId;
    return typeof handle === "number" && Number.isSafeInteger(handle) && handle >= 0 && handle < constraints.length
      ? handle
      : undefined;
  }

  function remove(handleOrId: number | string): boolean {
    const handle = handleFor(handleOrId);
    if (handle === undefined) return false;
    const item = constraints[handle];
    if (!item) return false;
    handleById.delete(item.id);
    constraints[handle] = undefined;
    freeHandles.push(handle);
    activeCount -= 1;
    options.onCountChanged(activeCount);
    return true;
  }

  return {
    add(definition) {
      if (!definition || typeof definition !== "object") throw new TypeError("Distance constraint definition is required.");
      const id = options.identifier(definition.id, "constraint id");
      if (handleById.has(id)) throw new Error(`Constraint id ${JSON.stringify(id)} already exists.`);
      const handle = freeHandles.pop();
      if (handle === undefined) throw new RangeError(`Rigid constraint capacity ${options.capacity} is exhausted.`);
      const aIndex = options.resolveBody(definition.a);
      const bIndex = options.resolveBody(definition.b);
      if (aIndex === bIndex) throw new Error("Distance constraint bodies must be different.");
      const currentDistance = Math.hypot(
        options.positionX[bIndex] - options.positionX[aIndex],
        options.positionY[bIndex] - options.positionY[aIndex],
        options.positionZ[bIndex] - options.positionZ[aIndex],
      );
      const distance = options.nonnegative(definition.distance ?? currentDistance, "constraint distance");
      const stiffness = options.interval(definition.stiffness ?? 1, 0, 1, "constraint stiffness");
      constraints[handle] = { handle, id, a: options.bodyHandle(aIndex), b: options.bodyHandle(bIndex), aIndex, bIndex, distance, stiffness };
      handleById.set(id, handle);
      activeCount += 1;
      options.onCountChanged(activeCount);
      return handle;
    },
    remove,
    get(handleOrId) {
      const handle = handleFor(handleOrId);
      const item = handle === undefined ? undefined : constraints[handle];
      return item ? { handle: item.handle, id: item.id, a: item.a, b: item.b, distance: item.distance, stiffness: item.stiffness } : undefined;
    },
    count: () => activeCount,
    removeBody(bodyIndex) {
      for (const item of constraints) if (item && (item.aIndex === bodyIndex || item.bIndex === bodyIndex)) remove(item.handle);
    },
    solve() {
      for (let iteration = 0; iteration < options.iterations; iteration += 1) for (const item of constraints) {
        if (!item || options.alive[item.aIndex] === 0 || options.alive[item.bIndex] === 0) continue;
        const a = item.aIndex;
        const b = item.bIndex;
        const dx = options.positionX[b] - options.positionX[a];
        const dy = options.positionY[b] - options.positionY[a];
        const dz = options.positionZ[b] - options.positionZ[a];
        const length = Math.hypot(dx, dy, dz);
        if (length <= 1e-12) continue;
        const inverseA = options.activeInverseMass(a);
        const inverseB = options.activeInverseMass(b);
        const inverseSum = inverseA + inverseB;
        if (inverseSum === 0) continue;
        const correction = (length - item.distance) * item.stiffness / inverseSum;
        const nx = dx / length;
        const ny = dy / length;
        const nz = dz / length;
        options.positionX[a] += nx * correction * inverseA;
        options.positionY[a] += ny * correction * inverseA;
        options.positionZ[a] += nz * correction * inverseA;
        options.positionX[b] -= nx * correction * inverseB;
        options.positionY[b] -= ny * correction * inverseB;
        options.positionZ[b] -= nz * correction * inverseB;
        options.updateAabb(a);
        options.updateAabb(b);
      }
    },
  };
}
