/** Measures acknowledged host replication; clients never submit a latency value. */
export function createQuickPlayLatency(options: { now?: () => number; maximumAgeMs?: number } = {}) {
  const now = options.now ?? Date.now, maximumAgeMs = options.maximumAgeMs ?? 10000;
  const peers = new Map<string, { userId: string; sent: Map<number, number>; probes: Map<string, number>; nextProbe: number; samples: number[]; at: number }>();
  if (!Number.isFinite(maximumAgeMs) || maximumAgeMs <= 0) throw new Error('Invalid connection sample lifetime.');
  return {
    join(userId: string, connectionId: string) {
      for (const [id, peer] of peers) if (peer.userId === userId) peers.delete(id);
      peers.set(connectionId, { userId, sent: new Map(), probes: new Map(), nextProbe: 0, samples: [], at: 0 });
    },
    leave(connectionId: string) { peers.delete(connectionId); },
    probe(connectionId: string) {
      const peer = peers.get(connectionId), at = now();if (!peer || at < peer.nextProbe) return;
      const nonce = crypto.randomUUID();peer.probes.set(nonce, at);
      while (peer.probes.size > 4) peer.probes.delete(peer.probes.keys().next().value!);
      peer.nextProbe = at + (peer.samples.length < 2 ? 500 : 3000);
      return { type: 'tod-latency-probe', nonce };
    },
    reply(connectionId: string, nonce: unknown) {
      const peer = peers.get(connectionId), at = now();if (!peer || typeof nonce !== 'string') return;
      const sent = peer.probes.get(nonce);if (sent === undefined) return;peer.probes.delete(nonce);
      const elapsed = at - sent;if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > maximumAgeMs) return;
      peer.samples.push(elapsed);peer.samples = peer.samples.slice(-5);peer.at = at;
    },
    sent(connectionId: string, sequence: number) {
      const peer = peers.get(connectionId);if (!peer) return;
      if (!peer.sent.has(sequence)) peer.sent.set(sequence, now());
      while (peer.sent.size > 128) peer.sent.delete(peer.sent.keys().next().value!);
    },
    ack(connectionId: string, sequence: number) {
      const peer = peers.get(connectionId), at = now(), sent = peer?.sent.get(sequence);
      if (!peer || sent === undefined) return;
      peer.sent.delete(sequence);const elapsed = at - sent;
      if (!Number.isFinite(elapsed) || elapsed < 0) return;
      peer.samples.push(elapsed);peer.samples = peer.samples.slice(-5);peer.at = at;
    },
    read(userId: string) {
      const peer = [...peers.values()].find(value => value.userId === userId);
      if (!peer || peer.samples.length < 2 || now() - peer.at > maximumAgeMs) return undefined;
      const sorted = [...peer.samples].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    },
  };
}
