import type { AppearanceCatalog3D, AppearanceColor3D } from '@hyperfocus/engine/project/runtime-3d';

/** Existing swatch identities, composed as cloth/utility accents rather than saturated primary blocks. */
export const clothPalette: Array<[string, string, AppearanceColor3D]> = [
  ['teal', 'Lagoon', [.12, .38, .43, 1]], ['red', 'Ember', [.56, .20, .16, 1]],
  ['purple', 'Orchid', [.30, .24, .37, 1]], ['gold', 'Marigold', [.58, .39, .18, 1]],
  ['cream', 'Ivory', [.68, .65, .55, 1]], ['navy', 'Midnight', [.10, .14, .19, 1]],
  ['slate', 'Slate', [.22, .27, .31, 1]], ['moss', 'Moss', [.25, .32, .23, 1]],
  ['clay', 'Clay', [.43, .29, .23, 1]], ['plum', 'Plum', [.34, .19, .29, 1]],
  ['cobalt', 'Cobalt', [.16, .27, .43, 1]], ['ash', 'Ash', [.46, .48, .45, 1]],
];
const legacyColors = [[.08,.66,.7,1], [.82,.18,.16,1], [.53,.28,.75,1], [.9,.62,.13,1], [.84,.81,.7,1], [.12,.17,.29,1]];
export function clothColorForRole(color: AppearanceColor3D, role: string): AppearanceColor3D {
  const factor = role === 'bottom' ? .85 : role === 'shoes' ? .60 : 1;
  return [color[0] * factor, color[1] * factor, color[2] * factor, 1];
}
/** Only replace exact generated placeholders. User-authored palette overrides are not recipes. */
export function migrateCosmeticPalette(catalog: AppearanceCatalog3D) {
  for (const role of ['top', 'bottom', 'shoes', 'belt']) {
    const slot = catalog.slots.find(slot => slot.id === `${role}-color`);
    if (slot?.options.some(option => option.colors?.some(patch => patch.materialSuffix === `:appearance:${role}`))) {
      for (const [id, label, color] of clothPalette.slice(6)) if (!slot.options.some(option => option.id === id)) {
        slot.options.push({ id, label, rarity: 'common', colors: [{ materialSuffix: `:appearance:${role}`, baseColor: clothColorForRole(color, role) }] });
      }
    }
    for (const option of slot?.options ?? []) {
      const index = clothPalette.findIndex(color => color[0] === option.id), patch = option.colors?.[0];
      if (index >= 0 && patch) {
        const earlyFactor = role === 'bottom' ? .52 : role === 'shoes' ? .30 : 1, selected = clothPalette[index]![2];
        const early = [selected[0] * earlyFactor, selected[1] * earlyFactor, selected[2] * earlyFactor, 1];
        if ([legacyColors[index], early].some(color => JSON.stringify(patch.baseColor) === JSON.stringify(color))) patch.baseColor = clothColorForRole(selected, role);
      }
    }
  }
}
