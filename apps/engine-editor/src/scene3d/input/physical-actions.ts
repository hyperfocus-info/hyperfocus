/** Practice exits through its visible menu control; combat remaps may reuse old Back keys. */
export function acceptsPhysicalCombatAction(action: string, practice: boolean) {
  return !practice || action !== 'match:menu';
}

/** Use the match's accepted edge, after the host has removed blocked input. */
export function practiceResetPressed(actions: ReadonlySet<string>, match: { phase: string; held: readonly string[] } | undefined, playerReset: string) {
  return match?.phase === 'practice' && !match.held.includes('practice:reset')
    && !actions.has('match:quit') && !actions.has('match:menu')
    && (actions.has('practice:reset') || actions.has(playerReset));
}
