/** Host capability and queue commitments determine picture access; never infer support from profiles. */
export function roomUploadsEnabled(state: { roomType?: string; quickPlay?: { uploadsEnabled: boolean }; roomImages?: { enabled: boolean } }) {
  return state.roomType === 'tod-community' || state.roomType === 'tod-quick-play' && state.quickPlay?.uploadsEnabled === true
    || ['combat-relay', 'tod-training'].includes(state.roomType ?? '') && state.roomImages?.enabled === true;
}
export function quickPlayCanEquip(phase?: string) { return phase === 'idle' || phase === 'result'; }

export function roomUploadIdentity(state?: { active: boolean; reconnecting?: boolean; status: string; playerId: string; roomType?: string; quickPlay?: { uploadsEnabled: boolean; matchId: string; users: string[] }; roomImages?: { enabled: boolean }; matchId?: string; matchSeats?: string[]; profileBindings?: Array<{ playerId: string; userId: string }> }) {
  const audience = state && ['combat-relay', 'tod-training'].includes(state.roomType ?? '')
    ? JSON.stringify([state.matchId, (state.matchSeats ?? []).map(playerId => [playerId, state.profileBindings?.find(binding => binding.playerId === playerId)?.userId])]) : '';
  return state?.active && !state.reconnecting && roomUploadsEnabled(state) && !['interrupted', 'desynced'].includes(state.status)
    ? `${state.playerId}:${state.roomType}:${state.quickPlay?.matchId ?? ''}:${state.quickPlay?.users.join(',') ?? ''}:${audience}` : '';
}
