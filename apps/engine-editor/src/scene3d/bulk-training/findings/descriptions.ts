/** Only facts encoded in the actual learner's context are described here. */
export function describeTacticalContext(context: string) {
  const parts = /^(near|far):(ground|air):(ground|air):(neutral|guard|committed|stunned)$/.exec(context);
  if (!parts) return;
  const [, distance, self, target, state] = parts;
  const position = self === target ? self === 'ground' ? 'both fighters grounded' : 'both fighters airborne'
    : self === 'ground' ? 'you grounded and the opponent airborne' : 'you airborne and the opponent grounded';
  const opponent = state === 'neutral' ? 'the opponent neutral' : state === 'guard' ? 'the opponent guarding'
    : state === 'stunned' ? 'the opponent in hitstun' : 'the opponent committed to a move';
  return `at ${distance === 'far' ? 'long range (3+ units)' : 'close range (under 3 units)'}, with ${position} and ${opponent}`;
}

export function describeTacticalAction(action: string) {
  const canonical = action.replace(/^forced:/, 'attack:');
  const [kind, ...parts] = canonical.split(':');
  let name = parts.join(':').replace(/^dash-/, '').replaceAll('-', ' ');
  if (kind === 'dash') name = `dash ${name}`;
  else if (kind !== 'attack') name = canonical.replaceAll('-', ' ');
  return name || canonical;
}

/** Short lesson text uses the same observed context as the detailed evidence. */
export function describeTacticalLesson(action: string, context: string, result: string, stamina = 'unknown') {
  const parts = /^(near|far):(ground|air):(ground|air):(neutral|guard|committed|stunned)$/.exec(context);
  if (!parts) return '';
  const [, distance, self, target, state] = parts;
  const name = describeTacticalAction(action);
  const position = self === target ? self === 'ground' ? 'with both fighters grounded' : 'with both fighters airborne'
    : self === 'ground' ? 'when grounded against an airborne opponent' : 'when airborne against a grounded opponent';
  const opponent = state === 'neutral' ? 'in neutral' : state === 'guard' ? 'guarding'
    : state === 'stunned' ? 'in hitstun' : 'committed to a move';
  const condition = self === target ? `${position} and the opponent ${opponent}` : `${position} ${opponent}`;
  const resource = stamina === 'low' ? ' and low on stamina' : stamina === 'medium' ? ' and at moderate stamina' : stamina === 'high' ? ' and high on stamina' : '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${result} at ${distance === 'near' ? 'close' : 'long'} range. Especially ${condition}${resource}.`;
}
