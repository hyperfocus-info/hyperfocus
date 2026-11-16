import { circleRectOverlap } from "../math/collision.ts";
import { hashSeed } from "../core/random.ts";
import { createGridNavigator } from "../navigation/grid.ts";
import { chooseActorAction, type ActorChoice, type ActorOpportunity } from "../navigation/actor-choice.ts";

export type AutonomousActor = {
  id: string; cell: number; thirst?: number; helping?: number; preservation?: number;
  speed?: number; endangered?: boolean; reactionSeconds?: number;
  /** Continuous grid coordinates preserve an authored spawn without snapping. */
  position?: { x: number; y: number }; facing?: number;
  /** Optional host-reserved destination; other actors still occupy physical space. */
  exitId?: string;
};
export type ActorPerception = {
  /** Host-confirmed physical support, renewed every tick; never heals injury. */
  supports?: readonly { helper: string; recipient: string }[];
  /** Omitted witnesses means an audible/broadcast alert; an empty list means nobody knows. */
  threats: readonly { id: string; cell: number; strength: number; witnesses?: readonly string[] }[];
  resources: readonly { id: string; cell: number }[];
  exits: readonly { id: string; cell: number; safeCells?: readonly number[] }[];
};

type ActorState = {
  id: string; cell: number; x: number; y: number; facing: number; exitId?: string;
  thirst: number; helping: number; preservation: number; reaction: number;
  supportBy: string | null; supportTo: string | null; attempted: Set<string>;
  speed: number; endangered: boolean; choice: ActorChoice | undefined;
  cleared: boolean; arrived: boolean; stalled: number; bestDistance: number;
  progressTick: number; obstruction: string; blockedReason: string | null;
  since: number; service: number; assisted: boolean; contact: string;
  pushed: number; vx: number; vy: number;
};

/** Fixed-step kinematic discs (.35 cell radius), bounded contact, not rigid-body physics. */
export function createActorAutonomy(options: {
  columns: number; rows: number; blocked?: Uint8Array; actors: readonly AutonomousActor[];
  seed: number; fixedDt?: number; perceptionRadius?: number; commitmentSeconds?: number;
}) {
  const dt = options.fixedDt ?? 0.03333333333333333;
  const radius = options.perceptionRadius ?? 20;
  const commitment = options.commitmentSeconds ?? 0.8;
  if (!Number.isSafeInteger(options.columns) || !Number.isSafeInteger(options.rows)
    || options.columns < 1 || options.rows < 1 || options.columns * options.rows > 65536
    || options.actors.length > 256) throw new Error("Actor world exceeds bounded capacity");
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1 || !Number.isFinite(radius) || radius <= 0
    || !Number.isFinite(commitment) || commitment < 0) throw new Error("Invalid actor timing/perception");
  const nav = createGridNavigator({ columns: options.columns, rows: options.rows, blocked: options.blocked?.slice(), diagonal: true });
  const path = new Int32Array(nav.size);
  const xy = (cell: number) => ({ x: cell % nav.columns + 0.5, y: Math.floor(cell / nav.columns) + 0.5 });
  const validCell = (cell: number) => Number.isSafeInteger(cell) && cell >= 0 && cell < nav.size;
  const distance = (a: number, b: number) => { const p = xy(a), q = xy(b); return Math.hypot(p.x - q.x, p.y - q.y); };
  const bounded = (n: number) => { if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error("Traits/needs must be in [0,1]"); return n; };
  const actors = [...options.actors].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map<ActorState>(a => {
    if (!a.id || !validCell(a.cell) || nav.blocked[a.cell]) throw new Error("Invalid actor spawn");
    const speed = a.speed ?? 2;
    if (!Number.isFinite(a.reactionSeconds ?? 0) || (a.reactionSeconds ?? 0) < 0 || !Number.isFinite(speed) || speed <= 0 || speed > 10) throw new Error("Invalid actor speed");
    const position = a.position ?? xy(a.cell);
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(a.facing ?? 0)
      || position.x < .35 || position.y < .35 || position.x > nav.columns - .35 || position.y > nav.rows - .35
      || Math.floor(position.y) * nav.columns + Math.floor(position.x) !== a.cell) throw new Error("Invalid actor spawn position");
    for (let y = Math.floor(position.y - .35); y <= Math.floor(position.y + .35); y++) {
      for (let x = Math.floor(position.x - .35); x <= Math.floor(position.x + .35); x++) {
        if (nav.blocked[y * nav.columns + x] && circleRectOverlap({ ...position, r: .35 }, { x, y, w: 1, h: 1 })) throw new Error("Actor spawn intersects a wall");
      }
    }
    return {
      id: a.id, cell: a.cell, ...position, facing: a.facing ?? 0, exitId: a.exitId,
      thirst: bounded(a.thirst ?? 0), helping: bounded(a.helping ?? 0), preservation: bounded(a.preservation ?? 1),
      reaction: a.reactionSeconds ?? 0, supportBy: null, supportTo: null, attempted: new Set<string>(),
      speed, endangered: a.endangered ?? false, choice: undefined,
      cleared: false, arrived: false, stalled: 0, bestDistance: Infinity, progressTick: 0, obstruction: "none", blockedReason: null, since: 0, service: 0, assisted: false, contact: "none", pushed: 0, vx: 0, vy: 0
    };
  });
  if (new Set(actors.map(a => a.id)).size !== actors.length || new Set(actors.map(a => a.cell)).size !== actors.length) throw new Error("Duplicate actor identity/spawn");
  for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++) {
    if (Math.hypot(actors[i]!.x - actors[j]!.x, actors[i]!.y - actors[j]!.y) < .7) throw new Error("Actor spawns overlap");
  }
  let tick = 0, searches = 0;
  const routes = new Map<string, { status: string; cost: number; cells: number[] }>();
  let obstacles = "";
  function route(start: number, goal: number) {
    const key = `${start}:${goal}`;
    let result = routes.get(key);
    if (!result) {
      const occupied = actors.filter(a => a.endangered && !a.supportBy && !a.cleared && a.cell !== start).map(a => a.cell);
      for (const cell of occupied) nav.blocked[cell] = 1;
      const found = nav.findPath(start, goal, path); searches++;
      for (const cell of occupied) nav.blocked[cell] = 0;
      result = { status: found.status, cost: found.cost, cells: Array.from(path.slice(0, found.length)) };
      if (routes.size >= 4096) routes.delete(routes.keys().next().value!);
      routes.set(key, result);
    }
    return result;
  }
  function snapshot() {
    return {
      tick, time: tick * dt, searches, actors: actors.map(a => ({
        id: a.id, x: a.x, y: a.y, cell: a.cell,
        arrived: a.arrived, cleared: a.cleared, blockedReason: a.blockedReason, supportBy: a.supportBy, supportTo: a.supportTo, facing: a.facing, velocity: { x: a.vx, y: a.vy }, thirst: a.thirst, endangered: a.endangered, assisted: a.assisted,
        action: a.choice?.action ?? "idle", target: a.choice?.id ?? null, targetCell: a.choice?.cell ?? null,
        reason: a.choice?.reason ?? "initial", contact: a.contact, passiveDisplacement: a.pushed,
        poseIntent: a.vx || a.vy ? "locomote" : a.service > 0 ? a.choice?.action : "stand"
      }))
    };
  }
  return {
    snapshot,
    // Host acknowledgement transfers arrived actors out of this local collision world.
    // Retain their snapshots; no implicit removal or automatic exit clearance.
    clearArrival(id: string) {
      const a = actors.find(a => a.id === id);
      if (!a?.arrived || a.supportBy || a.supportTo) throw new Error("Clearance requires an arrived unbound actor");
      a.cleared = true;
    },
    setBlocked(cell: number, blocked: boolean) {
      const p = xy(cell);
      if (blocked && actors.some(a => !a.cleared && circleRectOverlap({ ...a, r: .35 }, { x: p.x - .5, y: p.y - .5, w: 1, h: 1 }))) throw new Error("Cannot place geometry on an actor");
      nav.setBlocked(cell, blocked); routes.clear();
    },
    step(perception: ActorPerception) {
      for (const list of [perception.threats, perception.resources, perception.exits]) {
        if (list.length > 256 || new Set(list.map(p => p.id)).size !== list.length
          || list.some(p => !p.id || !validCell(p.cell))) throw new Error("Invalid perceived entities");
      }
      for (const e of perception.exits) if (e.safeCells && (e.safeCells.length > nav.size || e.safeCells.some(c => !validCell(c)))) throw new Error("Invalid safe region");
      for (const t of perception.threats) {
        bounded(t.strength);
        if (t.witnesses && (t.witnesses.length > actors.length || new Set(t.witnesses).size !== t.witnesses.length || t.witnesses.some(id => !actors.some(a => a.id === id)))) throw Error('Invalid threat witnesses');
      }
      const previous = new Map(actors.map(a => [a.id, a.supportTo]));
      for (const a of actors) { a.supportBy = a.supportTo = null; }
      if ((perception.supports?.length ?? 0) > 256) throw new Error("Too many support links");
      for (const link of [...(perception.supports ?? [])].sort((a, b) => a.helper.localeCompare(b.helper) || a.recipient.localeCompare(b.recipient))) {
        const a = actors.find(a => a.id === link.helper), b = actors.find(a => a.id === link.recipient);
        if (!a || !b || a === b || a.endangered || !b.endangered || a.cleared || b.cleared || a.supportTo || a.supportBy || b.supportBy || b.supportTo
          || Math.hypot(a.x - b.x, a.y - b.y) > 1.2 || (a.choice?.action !== "assist" || a.choice.id !== b.id) && previous.get(a.id) !== b.id) continue;
        a.supportTo = b.id; b.supportBy = a.id; b.assisted = true;
      }
      for (const a of actors) if (previous.get(a.id) && !a.supportTo && !a.arrived) {
        a.choice = undefined; a.service = 0;
      }
      const occupied = actors.filter(a => a.endangered && !a.supportBy && !a.cleared).map(a => a.cell);
      const obstacleKey = occupied.join(":");
      if (obstacles !== obstacleKey) { routes.clear(); obstacles = obstacleKey; }
      // Decisions read the same pre-movement state, independent of update/input order.
      for (const a of actors) {
        if (a.cleared || a.arrived) continue;
        const threats = perception.threats.filter(t => (!t.witnesses || t.witnesses.includes(a.id)) && distance(a.cell, t.cell) <= radius);
        const danger = Math.max(0, ...threats.map(t => t.strength * (1 - distance(a.cell, t.cell) / (radius + 1))));
        const opportunities: ActorOpportunity[] = [{ action: "idle", id: "idle", cell: a.cell, cost: 0, safety: 0 }];
        const offer = (action: ActorOpportunity["action"], id: string, cell: number) => {
          const found = route(a.cell, cell);
          if (found.status !== "found" && action !== "flee") return;
          const safety = threats.length ? Math.min(...threats.map(t => distance(cell, t.cell))) / Math.max(nav.columns, nav.rows) : 0;
          opportunities.push({ action, id, cell, cost: (found.status === "found" ? found.cost : nav.size + distance(a.cell, cell)) + (actors.some(b => b !== a && !b.cleared && b.arrived && b.cell === cell && b.id !== a.supportBy && b.id !== a.supportTo) ? 8 : 0), safety });
        };
        for (const r of perception.resources) if (a.thirst > 0.1 && distance(a.cell, r.cell) <= radius) offer("drink", r.id, r.cell);
        if (danger > 0) for (const e of perception.exits) if (!a.exitId || e.id === a.exitId) offer("flee", e.id, e.cell);
        for (const other of actors) if (other !== a && !other.cleared && other.endangered && !other.supportBy && !a.attempted.has(other.id) && !a.supportTo && distance(a.cell, other.cell) <= radius) {
          for (const cell of [other.cell - nav.columns, other.cell - 1, other.cell + 1, other.cell + nav.columns]) {
            if (validCell(cell) && distance(cell, other.cell) === 1) offer("assist", other.id, cell);
          }
        }
        const followingThrough = a.assisted || a.attempted.size > 0 || a.supportTo !== null;
        if (followingThrough && danger > 0 && opportunities.some(o => o.action === "flee")) {
          for (let i = opportunities.length - 1; i >= 0; i--) if (opportunities[i]!.action !== "flee") opportunities.splice(i, 1);
        }
        const choice = chooseActorAction({
          thirst: a.thirst, danger, helping: a.helping, preservation: followingThrough ? 1 : a.preservation,
          opportunities, current: a.choice, committed: (tick - a.since) * dt < commitment, hysteresis: 0.15,
          tie: id => hashSeed(JSON.stringify([options.seed, a.id, id]))
        });
        if (choice.id !== a.choice?.id || choice.action !== a.choice?.action || choice.cell !== a.choice?.cell) { a.since = tick; a.service = 0; a.bestDistance = Infinity; a.progressTick = tick; }
        a.choice = choice;
      }
      for (const a of actors) if (a.supportBy) a.choice = actors.find(b => b.id === a.supportBy)!.choice;
      const origins = actors.map(a => ({ x: a.x, y: a.y }));
      const clear = (x: number, y: number) => {
        if (x < .35 || y < .35 || x > nav.columns - .35 || y > nav.rows - .35) return false;
        for (let cy = Math.floor(y - .35); cy <= Math.floor(y + .35); cy++) {
          for (let cx = Math.floor(x - .35); cx <= Math.floor(x + .35); cx++) {
            if (nav.blocked[cy * nav.columns + cx] && circleRectOverlap({ x, y, r: .35 }, { x: cx, y: cy, w: 1, h: 1 })) return false;
          }
        }
        return true;
      };
      // Every proposal reads one substep snapshot. Accepted groups reserve all their
      // endpoints; arbitration rotates each tick. No proposal pushes a second group.
      const substeps = Math.ceil(10 * dt / .05);
      for (const a of actors) { a.vx = a.vy = 0; a.contact = "none"; a.pushed = 0; }
      for (let step = 0; step < substeps; step++) {
        const before = actors.map(a => ({ x: a.x, y: a.y }));
        const proposals: { ids: number[]; points: { x: number; y: number }[] }[] = [];
        for (let i = 0; i < actors.length; i++) {
          const a = actors[i]!;
          if (a.cleared || a.arrived || a.supportBy || tick * dt < a.reaction || a.endangered) continue;
          if (a.choice?.action === 'idle') { a.contact = 'waiting:no-reachable-opportunity'; continue; }
          const partner = actors.findIndex(b => b.id === a.supportTo);
          const b = actors[partner];
          const leader = b ?? a;
          const found = route(leader.cell, a.choice!.cell);
          if (found.status !== "found") { a.contact = `waiting:${found.status}`; continue; }
          let target = xy(found.cells[Math.min(1, found.cells.length - 1)]!);
          // Assistance approaches continuous reach, rather than waiting forever at
          // the centre of an adjacent cell outside the service envelope.
          if (a.choice!.action === "assist") {
            const recipient = actors.find(b => b.id === a.choice!.id)!;
            if (Math.hypot(a.x - recipient.x, a.y - recipient.y) < 1.5) target = recipient;
            if (Math.hypot(a.x - recipient.x, a.y - recipient.y) <= 1.1) continue;
          }
          const length = Math.hypot(target.x - leader.x, target.y - leader.y);
          for (let k = 1; k <= Math.ceil(length / .05); k++) {
            const u = k / Math.ceil(length / .05);
            if (!clear(leader.x + (target.x - leader.x) * u, leader.y + (target.y - leader.y) * u)) { target = xy(leader.cell); break; }
          }
          let dx = target.x - leader.x, dy = target.y - leader.y;
          // Bounded deterministic side yield after sustained body obstruction.
          if (!b && a.stalled > .5 && a.stalled < 2.5 && a.obstruction.startsWith("body:")) {
            const angle = Math.atan2(dy, dx) + (hashSeed(a.id) % 2 ? 1 : -1) * Math.PI / 2;
            dx = Math.cos(angle) * .25; dy = Math.sin(angle) * .25;
          }
          const d = Math.hypot(dx, dy);
          if (d < .001) continue;
          const angle = Math.atan2(dy, dx), turn = Math.atan2(Math.sin(angle - a.facing), Math.cos(angle - a.facing));
          a.facing += Math.max(-4 * dt / substeps, Math.min(4 * dt / substeps, turn));
          if (b) b.facing = a.facing;
          if (Math.abs(turn) > .12) continue;
          const travel = Math.min(d, Math.min(a.speed, b?.speed ?? a.speed) * (b ? .45 : 1) * dt / substeps);
          const delta = { x: dx / d * travel, y: dy / d * travel };
          const ids = b ? [i, partner] : [i];
          const points = ids.map(j => ({ x: before[j]!.x + delta.x, y: before[j]!.y + delta.y }));
          if (points.some(p => !clear(p.x, p.y))) { a.contact = "waiting:wall"; continue; }
          const other = actors.findIndex((c, j) => !c.cleared && !ids.includes(j) && points.some(p => Math.hypot(p.x - before[j]!.x, p.y - before[j]!.y) < 0.699999999));
          if (other >= 0) {
            const c = actors[other]!; a.contact = `body:${c.id}`;
            // Preserve the bounded single mobile-neighbour kinematic push API.
            const point = { x: before[other]!.x + delta.x, y: before[other]!.y + delta.y };
            if (b || c.endangered || c.arrived || c.supportBy || c.supportTo || c.pushed + travel > .5 * dt || !clear(point.x, point.y)) continue;
            ids.push(other); points.push(point);
          }
          if (actors.some((c, j) => !c.cleared && !ids.includes(j) && points.some(p => Math.hypot(p.x - before[j]!.x, p.y - before[j]!.y) < 0.699999999))) continue;
          proposals.push({ ids, points });
        }
        const claimed = new Set<number>();
        for (let offset = 0; offset < proposals.length; offset++) {
          const proposal = proposals[(offset + tick) % proposals.length]!;
          if (proposal.ids.some(i => claimed.has(i))) continue;
          if (actors.some((a, j) => !a.cleared && !proposal.ids.includes(j) && proposal.points.some(p => Math.hypot(p.x - a.x, p.y - a.y) < 0.699999999))) continue;
          for (let k = 0; k < proposal.ids.length; k++) {
            const i = proposal.ids[k]!, a = actors[i]!, p = proposal.points[k]!;
            if (k > 0 && !a.supportBy) a.pushed += Math.hypot(p.x - a.x, p.y - a.y);
            a.x = p.x; a.y = p.y; a.cell = Math.floor(p.y) * nav.columns + Math.floor(p.x); claimed.add(i);
          }
        }
      }
      for (let i = 0; i < actors.length; i++) {
        const a = actors[i]!, old = origins[i]!;
        a.vx = (a.x - old.x) / dt; a.vy = (a.y - old.y) / dt;
        const exit = perception.exits.find(e => a.choice!.action === "flee" && e.id === a.choice!.id);
        const partner = actors.find(b => b.id === (a.supportBy ?? a.supportTo));
        // Default pair region includes one root-spacing around the exit centre;
        // explicit safeCells override it. Singles require the actual exit cell.
        const safe = (b: typeof a) => !!exit && (exit.safeCells ? exit.safeCells.includes(b.cell) : partner ? Math.hypot(b.x - xy(exit.cell).x, b.y - xy(exit.cell).y) <= 1.05 : b.cell === exit.cell);
        a.arrived ||= safe(a) && (!partner || safe(partner));
        const moved = Math.hypot(a.x - old.x, a.y - old.y);
        a.stalled = !a.arrived && moved < 1e-6 ? a.stalled + dt : 0;
        if (a.contact !== "none") a.obstruction = a.contact;
        const goal = xy(a.choice!.cell), remaining = Math.hypot(a.x - goal.x, a.y - goal.y);
        if (remaining < a.bestDistance - .1) { a.bestDistance = remaining; a.progressTick = tick; }
        const queue = exit && actors.find(b => b !== a && !b.cleared && b.arrived && b.cell === exit.cell && b !== partner);
        a.blockedReason = queue && !a.arrived ? `queue:${exit!.id};clearance=${queue.id}` : !a.arrived && (a.choice!.action !== 'idle' || a.thirst > .1 || perception.threats.length > 0) && (tick - a.progressTick) * dt >= 4 ? `${a.obstruction};target=${a.choice!.id};cell=${a.choice!.cell};no-progress=4s` : null;
        if (a.choice!.action === "drink" && a.cell === a.choice!.cell) { a.service += dt; a.thirst = Math.max(0, a.thirst - dt * .5); }
        if (a.choice!.action === "assist" && tick * dt >= a.reaction) {
          const other = actors.find(b => b.id === a.choice!.id)!;
          a.service += dt;
          if (Math.hypot(a.x - other.x, a.y - other.y) <= 1.2) a.contact = "support:awaiting-host";
          // An unconfirmed attempt expires, never heals; then seek safety.
          if (a.service + 1e-9 >= 2) { a.attempted.add(other.id); a.contact = "support:failed"; }
        }
      }
      tick++;
      return snapshot();
    },
  };
}
