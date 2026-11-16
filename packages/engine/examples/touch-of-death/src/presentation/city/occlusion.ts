/** Cosmetic pieces follow the solid they are mounted on, including its camera fade. */
export function cityTrimOwner(id: string) {
  const infill = /^tod:city:infill:(-?1):(-?\d+):crack:/.exec(id);
  if (infill) return `tod:city:door-jamb:${infill[1]}:${infill[2]}`;
  const detail = /^tod:city:detail:(?:wall-course|door-post|door-foot):(-?1):(-?\d+)/.exec(id);
  if (detail) return `tod:city:door-jamb:${detail[1]}:${detail[2]}`;
  const workshop = /^tod:city:architecture:workshop-(?:painted-base|base-cap|pier):(-?1):(-?\d+)/.exec(id);
  if (workshop) return `tod:city:door-jamb:${Number(workshop[2]) < 0 ? -1 : 1}:${workshop[1] === '-1' ? -6 : 4}`;
  const header = /^tod:city:architecture:door-(?:header|header-ink|lamp):(-?1)$/.exec(id);
  if (header) return `tod:city:door-lintel:${header[1]}`;
  if (/^tod:city:detail:(?:fracture|fracture-branch|exposed-masonry):/.test(id)) return 'tod:city:weak-wall';
  const stair = /^tod:city:detail:stair-(?:nosing|riser):(\d+)$/.exec(id);
  return stair ? `tod:city:stair:${stair[1]}` : undefined;
}
