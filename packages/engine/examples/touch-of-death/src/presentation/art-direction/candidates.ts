/** Cheap shape explorations, not approved production proportions. Metres. */
export const fighterCandidates = [
  { id: 'a', name: 'Balanced striker', intent: 'Short fitted jacket, athletic shoulders, tapered trousers.', height: 1.9, shoulder: .30, waist: .195, hip: .205, head: .255, legs: .94, hand: .105, trouser: .115, hem: .94 },
  { id: 'b', name: 'Compact pressure', intent: 'Deeper ribcage, strong forearms, lower compact base.', height: 1.82, shoulder: .33, waist: .22, hip: .22, head: .26, legs: .86, hand: .12, trouser: .13, hem: .90 },
  { id: 'c', name: 'Long-line counter', intent: 'Long legs, narrow waist, economical upper mass.', height: 1.98, shoulder: .285, waist: .175, hip: .185, head: .25, legs: 1.05, hand: .10, trouser: .10, hem: 1.02 },
  { id: 'd', name: 'Courtyard workwear', intent: 'Square cropped overshirt, straight trousers, grounded boots.', height: 1.91, shoulder: .315, waist: .235, hip: .23, head: .26, legs: .94, hand: .11, trouser: .135, hem: .88 },
  { id: 'e', name: 'Wrapped martial artist', intent: 'Nipped waist above broad trouser masses and short sleeves.', height: 1.9, shoulder: .31, waist: .18, hip: .24, head: .255, legs: .95, hand: .11, trouser: .16, hem: .98 },
  { id: 'f', name: 'Long training tunic', intent: 'Longer torso garment, quiet narrow lower leg, broad upper back.', height: 1.93, shoulder: .32, waist: .20, hip: .23, head: .26, legs: .96, hand: .105, trouser: .115, hem: .80 },
] as const;

export const arenaCandidates = [
  { id: 'a', name: 'Open service court', intent: 'Balanced side wings frame a recessed service opening. Clearest central negative space.' },
  { id: 'b', name: 'Offset balcony court', intent: 'One tall left wing, low right service mass and an offset exit. Asymmetric depth.' },
  { id: 'c', name: 'Bridge court', intent: 'A high service bridge frames the fight beneath a strong horizontal silhouette.' },
] as const;

export type FighterCandidate = typeof fighterCandidates[number];
export type ArenaCandidate = typeof arenaCandidates[number];
