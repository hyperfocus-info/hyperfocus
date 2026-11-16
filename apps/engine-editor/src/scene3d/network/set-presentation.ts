import type { createNetworkCombatSession, GameplayPresentation3D } from '@hyperfocus/engine/project/runtime-3d';

type ConfirmedMatch = ReturnType<typeof createNetworkCombatSession>['confirmedMatch'];

/** Let native Enter/Space activate result buttons without feeding combat bindings. */
export function isOnlineSetButtonKey(options: { result: boolean; key: string; target: EventTarget | null }): boolean {
  return options.result && (options.key === 'Enter' || options.key === ' ')
    && options.target instanceof HTMLButtonElement && !options.target.disabled && Boolean(options.target.dataset.gameplayAction);
}

/** Results and scores come exclusively from the runner's confirmed match state. */
export function onlineSetPresentation(options: { match: ConfirmedMatch; localSeat: number; spectator?: boolean; community?: boolean; quickPlay?: boolean }): GameplayPresentation3D {
  const match = options.match;
  if (!match && (options.community || options.quickPlay)) return { layout: 'fight', title: '', actions: [] };
  if (!match) return { layout: 'countdown', title: '', overlay: { title: 'Getting ready', body: 'Waiting for both fighters.' }, actions: [] };
  const playerWins = match.playerWins + Number(match.phase === 'round-result' && match.winner === 'player');
  const otherWins = match.opponentWins + Number(match.phase === 'round-result' && match.winner === 'opponent');
  const localWins = options.localSeat === 0 ? playerWins : otherWins;
  const opponentWins = options.localSeat === 0 ? otherWins : playerWins;
  const score = options.spectator ? `Fighter 1 ${playerWins} - ${otherWins} Fighter 2` : `You ${localWins} - ${opponentWins} Opponent`;
  if (match.phase === 'countdown') return { layout: 'countdown', title: '', objective: score,
    overlay: { title: String(Math.max(1, Math.ceil(match.ticks / 60))), body: `${score}\nFirst to three rounds` }, actions: [] };
  // The earned point is visible in the HUD while post-KO combat and recovery
  // remain unobstructed, just as in local play. Only the completed set overlays it.
  if (match.phase === 'round-result') return { layout: 'fight', title: '', objective: score, actions: [] };
  if (match.phase !== 'match-result') return { layout: 'fight', title: '', objective: score, actions: [] };
  if (options.quickPlay) return { layout: 'result', title: '', objective: score,
    overlay: { title: localWins > opponentWins ? 'You win the set' : 'Opponent wins the set', body: score }, actions: [] };
  if (options.community) return { layout: 'result', title: '', objective: score,
    overlay: { title: options.spectator ? `Fighter ${playerWins > otherWins ? 1 : 2} wins the set` : localWins > opponentWins ? 'You win the set' : 'Opponent wins the set', body: `${score}\nNext pairing shortly. Your queue choice stays in place.` }, actions: [] };
  if (options.spectator) return { layout: 'result', title: '', objective: score,
    overlay: { title: `Fighter ${playerWins > otherWins ? 1 : 2} wins the set`, body: `${score}\nWaiting for the fighters to decide on a rematch.` },
    actions: [{ action: 'match:leave', label: 'Return to local play' }] };
  const requested = Boolean(match.rematchVotes?.[options.localSeat]), invited = Boolean(match.rematchVotes?.[1 - options.localSeat]);
  const invitation = requested ? 'Rematch requested. Waiting for your opponent.' : invited ? 'Your opponent wants a rematch.' : 'Play another set or return to local play.';
  return { layout: 'result', title: '', objective: score,
    overlay: { title: localWins > opponentWins ? 'You win the set' : 'Opponent wins the set', body: `${score}\n${invitation}` },
    actions: [{ action: 'match:rematch', label: requested ? 'Rematch requested' : invited ? 'Accept rematch' : 'Rematch', disabled: requested },
      { action: 'match:share', label: 'Share this exchange' },
      { action: 'match:review', label: 'Leave and retry the exchange' },
      { action: 'match:leave', label: 'Return to local play' }] };
}
