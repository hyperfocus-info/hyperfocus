type Sample = { at: number; rollback: number; ping: number; loss: number; stall: boolean };
type Peer = { pending: Map<string, number>; rtt: number; probes: Array<{ at: number; lost: boolean }>; samples: Sample[]; badSince?: number; frame: number; inputAt: number };

/** Host-observed delivery quality, scoped to one immutable two-player battle.
 * WebSocket does not expose physical packet loss or rendered corrections. Here
 * loss is a one-second probe deadline miss; rollback is attributable input debt.
 * No browser can name a loser or provide a metric for the other connection.
 */
export function createConnectionQuality(options: { matchId: string; seats: readonly string[]; now: () => number }) {
  const { now, seats, matchId } = options;
  if (seats.length !== 2 || new Set(seats).size !== 2) throw new Error('Quality requires two distinct seats.');
  const peers: Peer[] = seats.map(() => ({ pending: new Map(), rtt: 0, probes: [], samples: [], frame: -1, inputAt: now() }));
  let lastTick = now(), nextTick = now(), result: { noContest: boolean; reason: string } | undefined;
  const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1] ?? 0;
  function bad(peer: Peer) {
    const values = peer.samples;
    return values.length >= 4 && (p95(values.map(value => value.rollback)) > 3 || p95(values.map(value => value.loss)) > 1
      || p95(values.map(value => value.ping)) > 200 && p95(values.map(value => value.rollback)) > 2
      || values.filter(value => value.stall).length >= 2);
  }
  return {
    ack(playerId: string, raw: unknown) {
      if (!raw || typeof raw !== 'object' || !('type' in raw) || raw.type !== 'tod-quality-ack') return false;
      const seat = seats.indexOf(playerId);
      if (seat < 0 || !('matchId' in raw) || raw.matchId !== matchId) return false;
      if (!('nonce' in raw) || typeof raw.nonce !== 'string') return true;
      const peer = peers[seat]!, sent = peer.pending.get(raw.nonce);
      if (sent !== undefined) { peer.pending.delete(raw.nonce);peer.rtt = now() - sent;peer.probes.push({ at: now(), lost: peer.rtt > 1000 }); }
      return true;
    },
    tick(input: { frames: readonly number[]; recovering?: boolean; send(playerId: string, probe: { type: 'tod-quality-probe'; matchId: string; nonce: string }): void }) {
      const at = now();
      if (result || at < nextTick) return result;
      const hostGap = at - lastTick > 750 || at < lastTick;
      lastTick = at;nextTick = at + 250;
      if (hostGap || input.recovering) {
        for (const peer of peers) { peer.samples = [];peer.probes = [];peer.pending.clear();peer.badSince = undefined;peer.inputAt = at; }
        return;
      }
      for (const [seat, peer] of peers.entries()) {
        const frame = input.frames[seat] ?? -1, other = input.frames[1 - seat] ?? -1;
        if (frame > peer.frame) { peer.frame = frame;peer.inputAt = at; }
        for (const [nonce, sent] of peer.pending) if (at - sent > 1000) { peer.pending.delete(nonce);peer.probes.push({ at, lost: true }); }
        peer.probes = peer.probes.filter(value => at - value.at <= 1000);
        const loss = peer.probes.length ? peer.probes.filter(value => value.lost).length / peer.probes.length * 100 : 0;
        peer.samples.push({ at, rollback: Math.max(0, other - frame), ping: peer.rtt, loss, stall: other > frame && at - peer.inputAt >= 500 });
        peer.samples = peer.samples.filter(value => at - value.at < 1000);
        if (bad(peer)) peer.badSince ??= at;else peer.badSince = undefined;
        const nonce = crypto.randomUUID();peer.pending.set(nonce, at);input.send(seats[seat]!, { type: 'tod-quality-probe', matchId, nonce });
      }
      const failed = peers.map(peer => peer.badSince !== undefined && at - peer.badSince >= 10000);
      if (failed.every(Boolean)) result = { noContest: true, reason: 'Both connections exceeded delivery limits for 10 seconds. No contest; ratings unchanged.' };
      else if (failed.some(Boolean)) return { noContest: false, reason: 'Connection delivery has been degraded for 10 seconds. Waiting for recovery; no loss is attributed.' };
      return result;
    },
  };
}
