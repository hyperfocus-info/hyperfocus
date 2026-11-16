/** Bounded alternatives: compare at the same contact frame, never randomize. */
export const impactCandidates = [
  { id: 'a', name: 'Contact cut', lightCount: 3, heavyCount: 5, radius: .32, length: .13, life: 9, impulse: .018 },
  { id: 'b', name: 'Radial burst', lightCount: 4, heavyCount: 8, radius: .48, length: .19, life: 12, impulse: .035 },
  { id: 'c', name: 'Short scatter', lightCount: 2, heavyCount: 4, radius: .22, length: .07, life: 7, impulse: .010 },
] as const;
