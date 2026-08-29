export type PhysicsContact2D = {
  aIndex: number;
  bIndex: number;
  aId: string;
  bId: string;
  normalX: number;
  normalY: number;
  penetration: number;
  pointX: number;
  pointY: number;
  trigger: boolean;
};

export type PhysicsRaycastHit2D = {
  index: number;
  id: string;
  distance: number;
  x: number;
  y: number;
  normalX: number;
  normalY: number;
};

export type PhysicsShapeCastHit2D = {
  index: number;
  id: string;
  fraction: number;
  x: number;
  y: number;
  normalX: number;
  normalY: number;
};

export function createContactTarget(): PhysicsContact2D {
  return {
    aIndex: -1,
    bIndex: -1,
    aId: "",
    bId: "",
    normalX: 0,
    normalY: 0,
    penetration: 0,
    pointX: 0,
    pointY: 0,
    trigger: false
  };
}

export function createRaycastTarget(): PhysicsRaycastHit2D {
  return { index: -1, id: "", distance: 0, x: 0, y: 0, normalX: 0, normalY: 0 };
}

export function createShapeCastTarget(): PhysicsShapeCastHit2D {
  return { index: -1, id: "", fraction: 0, x: 0, y: 0, normalX: 0, normalY: 0 };
}
