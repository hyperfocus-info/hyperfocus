import { createAabb, createCollisionBroadphase, type CollisionAabb, type CollisionBroadphaseEntry } from "../../math/broadphase.ts";

export type PhysicsBody = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  vx?: number;
  vy?: number;
  mass?: number;
  static?: boolean;
  onGround?: boolean;
};

export type PhysicsContact = {
  a: string;
  b: string;
};

export type ServerPhysicsWorld = {
  upsert(body: PhysicsBody): void;
  remove(id: string): boolean;
  body(id: string): PhysicsBody | undefined;
  step(dt: number): PhysicsContact[];
  bodies(): PhysicsBody[];
};

export function createServerPhysicsWorld(options: { gravityY?: number; maxVelocity?: number } = {}): ServerPhysicsWorld {
  const bodies = new Map<string, PhysicsBody>();
  const broadphase = createCollisionBroadphase<string>();
  const rebuildEntries: CollisionBroadphaseEntry<string>[] = [];
  const resyncIds: string[] = [];
  const resyncMembership = new Set<string>();
  const gravityY = options.gravityY ?? 0;
  const maxVelocity = options.maxVelocity ?? 2000;

  function bounds(body: PhysicsBody): CollisionAabb {
    return createAabb(body.x, body.y, body.w, body.h);
  }

  function sync(id: string) {
    const current = bodies.get(id);
    if (current) broadphase.upsert(id, bounds(current));
  }

  function syncAll() {
    rebuildEntries.length = 0;
    for (const body of bodies.values()) rebuildEntries.push({ id: body.id, ...bounds(body) });
    broadphase.rebuild(rebuildEntries);
  }

  function clampVelocity(value: number) {
    return Math.max(-maxVelocity, Math.min(maxVelocity, value));
  }

  return {
    upsert(body) {
      bodies.set(body.id, { ...body });
      sync(body.id);
    },
    remove(id) {
      bodies.delete(id);
      return broadphase.remove(id);
    },
    body(id) {
      const body = bodies.get(id);
      return body ? { ...body } : undefined;
    },
    step(dt) {
      const contacts: PhysicsContact[] = [];
      for (const body of bodies.values()) {
        body.onGround = false;
        if (body.static) continue;
        body.vy = clampVelocity((body.vy ?? 0) + gravityY * dt);
        body.vx = clampVelocity(body.vx ?? 0);
        body.x += body.vx * dt;
        body.y += body.vy * dt;
      }
      syncAll();

      resyncIds.length = 0;
      resyncMembership.clear();
      broadphase.forEachPair((aId, bId) => {
        const a = bodies.get(aId);
        const b = bodies.get(bId);
        if (!a || !b) return;
        contacts.push({ a: a.id, b: b.id });
        if (a.static === b.static) return;
        const dynamic = a.static ? b : a;
        const solid = a.static ? a : b;
        const overlapX = Math.min(dynamic.x + dynamic.w - solid.x, solid.x + solid.w - dynamic.x);
        const overlapY = Math.min(dynamic.y + dynamic.h - solid.y, solid.y + solid.h - dynamic.y);
        if (overlapX <= 0 || overlapY <= 0) return;
        if (overlapY <= overlapX) {
          const fromAbove = dynamic.y + dynamic.h / 2 < solid.y + solid.h / 2;
          dynamic.y += fromAbove ? -overlapY : overlapY;
          dynamic.vy = 0;
          dynamic.onGround = fromAbove;
        } else {
          const fromLeft = dynamic.x + dynamic.w / 2 < solid.x + solid.w / 2;
          dynamic.x += fromLeft ? -overlapX : overlapX;
          dynamic.vx = 0;
        }
        if (!resyncMembership.has(dynamic.id)) {
          resyncMembership.add(dynamic.id);
          resyncIds.push(dynamic.id);
        }
      });
      for (const id of resyncIds) sync(id);
      return contacts;
    },
    bodies() {
      return [...bodies.values()].map((body) => ({ ...body }));
    }
  };
}
