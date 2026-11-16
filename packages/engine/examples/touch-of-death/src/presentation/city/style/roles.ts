const styled = new Set(['structure', 'route', 'canvas', 'canvas-stripe', 'residential', 'residential-floor', 'transit', 'utility', 'public-paint', 'test-blue', 'active-blue', 'danger']);

/** Stable IDs supply art direction without coupling it to a random generation order. */
export function cityVisualRole(id: string, source: string | undefined) {
  if (!source) return;
  if (styled.has(source)) return source;
  if (id.includes(':danger-cue:')) return 'danger';
  if (/^tod:city:neighborhood:route:.*:edge:/.test(id)) return 'paving-edge';
  if (/^tod:city:expanded:court:[1-4]:lift-edge$|^tod:city:detail:lift:edge-[xz]:/.test(id)) return 'route';
  if (id.includes(':hazards:')) {
    if (/(?:supply|control|valve|handle|foot|warning)/.test(id)) return 'warning';
    return;
  }
  if (/(?:observation|secured|simulation|experiment).*?(?:lens|status|screen|indicator)/.test(id)) return 'active-blue';
  if (/(?:observation|simulation|experiment).*?(?:glass|panel|equipment)/.test(id)) return 'test-blue';
  if (/(?:observation|experiment).*?(?:camera|housing|bracket)/.test(id)) return 'structure';
  if (/:neighborhood:station:/.test(id)) {
    if (/exercise.*mat/.test(id)) return 'residential';
    if (/equipment-rack.*(?:band|sign)/.test(id)) return 'test-blue';
    if (/(?:handle|band|label|grip)/.test(id)) return 'warning';
    if (source === 'warning' || source === 'paint') return 'public-paint';
  }
  if (/:traffic:/.test(id)) {
    if (/:light:-?1:-1$/.test(id)) return 'danger';
    if (source === 'lamp') return 'chalk';
    if (source === 'train' || source === 'paint') return 'transit';
    if (source === 'warning' && /(?:edge|route|pole|band)/.test(id)) return 'route';
  }
  if (/:overhaul:market:/.test(id)) {
    if (/(?:stripe|valance|cloth)/.test(id)) return source === 'warning' ? 'canvas' : 'canvas-stripe';
    if (/(?:awning|canopy)/.test(id)) return 'canvas-stripe';
    if (/(?:sign|front|public-band)/.test(id)) return 'public-paint';
    if (/(?:serving-shelf|counter:top|serving-top)/.test(id)) return 'concrete-light';
  }
  if (/:overhaul:residential:/.test(id)) {
    if (/(?:floor|wing|roof)/.test(id) && /^(?:concrete|concrete-light|brick)$/.test(source)) return 'residential-floor';
    if (source === 'plaster' || source === 'brick') return 'residential';
    if (source === 'lamp') return 'glass-lit';
    if (source === 'warning') return /(?:entry-band|door|screen-mark)/.test(id) ? 'route' : 'public-paint';
    if (source === 'paint') return 'utility';
  }
  if (/:overhaul:depot:/.test(id)) {
    if (source === 'warning' || source === 'paint') return /(?:mark|line|sign|edge)/.test(id) ? 'route' : 'transit';
  }
  if (/:overhaul:utility:/.test(id)) {
    if (/control-gate:.*(?:flow-band|flange)/.test(id)) return 'utility';
    if (source === 'warning') return /(?:control|handle|valve)/.test(id) ? 'warning' : 'utility';
    if (source === 'paint') return 'utility';
  }
  if (/:overhaul:construction:/.test(id) && source === 'warning') return /(?:hook|formwork|offcut)/.test(id) ? 'public-paint' : 'structure';
  if (/architecture:transit-spandrel|workshop-painted-base|expanded:court:\d+:header/.test(id)) return 'structure';
  if (/(?:exercise|gym).*mat/.test(id)) return 'residential';
  if (source === 'warning') {
    if (/demolition-(?:tool|lamp|stripe)|demolition:.*(?:tool|lamp)/.test(id)) return 'warning';
    if (/(?:handle|control|grip|switch)/.test(id)) return 'warning';
    if (/(?:edge|line|nosing|stripe|road|header|fascia|band|entry|seam)/.test(id)) return /(?:stair|landing|entry|threshold)/.test(id) ? 'route' : 'structure';
    return 'public-paint';
  }
  if (source === 'paint') return 'structure';
}
