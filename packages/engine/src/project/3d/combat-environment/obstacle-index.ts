import type { CombatObstacleBounds } from './obstacle-bounds.ts';

type Bounds = Pick<CombatObstacleBounds, 'minX' | 'maxX' | 'minZ' | 'maxZ'>;
type Node = Bounds & { left: number; right: number; start: number; end: number };

/** Per-query immutable broadphase. Preserves the caller's obstacle/corner order. */
export function createObstacleIndex(bounds: readonly CombatObstacleBounds[]) {
  const boxes = bounds.slice(), nodes: Node[] = [];
  const build = (start: number, end: number): number => {
    const node: Node = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, left: -1, right: -1, start, end };
    for (let i = start; i < end; i++) {
      const box = boxes[i]!;node.minX = Math.min(node.minX, box.minX);node.maxX = Math.max(node.maxX, box.maxX);
      node.minZ = Math.min(node.minZ, box.minZ);node.maxZ = Math.max(node.maxZ, box.maxZ);
    }
    const index = nodes.push(node) - 1;
    if (end - start > 4) {
      const x = node.maxX - node.minX >= node.maxZ - node.minZ;
      const sorted = boxes.slice(start, end).sort((a, b) => x ? (a.minX + a.maxX) - (b.minX + b.maxX) : (a.minZ + a.maxZ) - (b.minZ + b.maxZ));
      for (let i = 0; i < sorted.length; i++) boxes[start + i] = sorted[i]!;
      const middle = (start + end) >>> 1;node.left = build(start, middle);node.right = build(middle, end);
    }
    return index;
  };
  if (boxes.length) build(0, boxes.length);
  // One synchronous visitor owns this stack; it is never returned or retained by a frame.
  const stack = new Int32Array(nodes.length);
  return {
    some(ax: number, az: number, bx: number, bz: number, radius: number, visit: (box: CombatObstacleBounds) => boolean): boolean {
      if (!nodes.length) return false;
      const minX = Math.min(ax, bx), maxX = Math.max(ax, bx), minZ = Math.min(az, bz), maxZ = Math.max(az, bz), padding = radius + 1e-8;
      let count = 1;stack[0] = 0;
      while (count) {
        const node = nodes[stack[--count]!]!;
        // Same subtraction/addition order and grazing margin as the leaf test.
        // AABB rejection alone cannot remove a segment accepted by any child.
        if (maxX < node.minX - padding || minX > node.maxX + padding || maxZ < node.minZ - padding || minZ > node.maxZ + padding) continue;
        if (node.left < 0) { for (let i = node.start; i < node.end; i++) if (visit(boxes[i]!)) return true; }
        else { stack[count++] = node.right;stack[count++] = node.left; }
      }
      return false;
    },
  };
}
