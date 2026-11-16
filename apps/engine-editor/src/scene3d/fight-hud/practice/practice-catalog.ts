/** Player intent and truthful preset behavior; commands remain engine-owned. */
export const practicePresets = [
  { id: 'neutral', label: 'Still dummy', purpose: 'Explore movement and attacks against a standing target.' },
  { id: 'guard', label: 'Guarding dummy', purpose: 'Test pressure against a dummy that holds guard.' },
  { id: 'random', label: 'Mixed recovery', purpose: 'Read changing launch directions and tech attempts.' },
  { id: 'outward', label: 'Outward drift', purpose: 'Chase a dummy that steers away when launched.' },
  { id: 'sideways', label: 'Sideways drift', purpose: 'Adjust your follow-up to a dummy that steers sideways.' },
  { id: 'tech', label: 'Tech recovery', purpose: 'Follow a dummy that attempts a tech at floor or wall contact.' },
  { id: 'escape', label: 'Armored escape', purpose: 'Read the dummy’s armored escape during your conversion.' },
  { id: 'parry-drill', label: 'Parry timing', purpose: 'Release guard, then press as the attack reaches you.' },
  { id: 'tech-drill', label: 'Recover from a launch', purpose: 'Time a tech at floor or wall contact.' },
  { id: 'di-drill', label: 'Steer your launch', purpose: 'Change your launch path during the impact window.' },
  { id: 'arena-lesson', label: 'Use the arena', purpose: 'Pick up, attack with, and throw an arena item.' },
  { id: 'combo-lesson', label: 'Build a combo', purpose: 'Launch, chase, then follow the opponent’s defensive response.' },
] as const;

export function practicePreset(id: string) { return practicePresets.find(preset => preset.id === id); }

export const practiceInstruments = [
  { id: 'timing', label: 'Frame timing', group: 'timing', purpose: 'See startup, active and recovery time for both fighters.' },
  { id: 'timing-inputs', label: 'Timing + inputs', group: 'timing', purpose: 'Compare the last contact, move timing and your recent presses in one readout.' },
  { id: 'history', label: 'Input history', group: 'timing', purpose: 'Check the order of your presses and releases. Newest input comes first.' },
  { id: 'combos', label: 'Combo attempts', group: 'attempts', purpose: 'Find missed attacks, expired inputs and unavailable follow-ups.' },
  { id: 'attempts', label: 'Last defensive attempt', group: 'attempts', purpose: 'Compare your parry or tech press with the actual impact.' },
  { id: 'causality', label: 'Physical interaction history', group: 'arena', purpose: 'Inspect the most recent arena contacts and their effects.' },
  { id: 'volumes', label: 'Hitboxes and hurtboxes', group: 'arena', purpose: 'Green: body. Coral: active attack. Dashed: protected. Drawn directly on the arena.' },
] as const;
