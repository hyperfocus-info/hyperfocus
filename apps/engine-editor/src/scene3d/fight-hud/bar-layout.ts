export type FighterScreenPoint = { x: number; y: number };
export type FighterScreenBounds = { left: number; right: number; top: number; bottom: number };

/** Resolve HUD collisions without rotating the camera or changing input meaning. */
export function placeFighterBar(options: { anchor: FighterScreenPoint; bodies: readonly FighterScreenBounds[]; placed: readonly FighterScreenPoint[]; width: number; height: number; barHeight?: number; barWidth?: number }) {
  const { anchor, bodies, placed, width, height } = options;
  let best = { ...anchor }, score = Infinity;
  const barHeight = options.barHeight ?? 40;
  const half = (options.barWidth ?? 96) / 2, step = half * 2 + 16;
  const occupied = [...bodies, ...placed.map(p => ({ left: p.x - half - 4, right: p.x + half + 4, top: p.y - barHeight - 2, bottom: p.y + 5 }))];
  for (const dy of [0, -1, -2, -3].map(step => step * (barHeight + 4))) for (const dx of [0, -step, step, -2 * step, 2 * step]) {
    const x = Math.max(half + 6, Math.min(width - half - 6, anchor.x + dx)), y = Math.max(barHeight + 4, Math.min(height - 10, anchor.y + dy));
    let overlap = 0;
    for (const box of occupied) overlap += Math.max(0, Math.min(x + half + 2, box.right) - Math.max(x - half - 2, box.left)) * Math.max(0, Math.min(y + 3, box.bottom) - Math.max(y - barHeight, box.top));
    const cost = overlap * 10000 + (x - anchor.x) ** 2 + (y - anchor.y) ** 2;
    if (cost < score) { score = cost;best = { x, y }; }
  }
  return best;
}

/** Keep read-only coaching off the fight; retain its position while it is clear. */
export function placeCombatGuidance(options: { current: FighterScreenBounds; bodies: readonly FighterScreenBounds[]; width: number; height: number }) {
  const { current, bodies, width, height } = options;
  const panelWidth = current.right - current.left, panelHeight = current.bottom - current.top;
  const overlap = (box: FighterScreenBounds) => bodies.reduce((sum, body) => sum
    + Math.max(0, Math.min(box.right, body.right) - Math.max(box.left, body.left))
    * Math.max(0, Math.min(box.bottom, body.bottom) - Math.max(box.top, body.top)), 0);
  const inside = current.left >= 0 && current.top >= 0 && current.right <= width && current.bottom <= height;
  if (inside && !overlap(current)) return current;
  let best = current, score = inside ? overlap(current) : Infinity;
  for (const top of [Math.min(98, Math.max(12, height - panelHeight - 80)), Math.max(12, height - panelHeight - 80)]) {
    for (const left of [12, Math.max(12, width - panelWidth - 12)]) {
      const candidate = { left, right: left + panelWidth, top, bottom: top + panelHeight };
      const cost = overlap(candidate);
      if (cost < score) { score = cost;best = candidate; }
    }
  }
  return best;
}
