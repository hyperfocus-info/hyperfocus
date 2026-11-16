import type { createGameplay3D, GameplaySnapshot3D } from '@hyperfocus/engine/project/runtime-3d';

type Game = ReturnType<typeof createGameplay3D>;
export type StandaloneWorldPort = {
  snapshot(): Promise<GameplaySnapshot3D>;
  restore(snapshot: GameplaySnapshot3D): Promise<void>;
  reset(): Promise<GameplaySnapshot3D>;
  policies(input: Parameters<Game['queueCombatAiPolicies']>[0]): Promise<void>;
  learning(input: Parameters<Game['queueCombatAiLearning']>[0]): Promise<void>;
};

/** App-owned authority for saves and AI updates; transport and frame scheduling stay with the owner. */
export function createStandaloneWorldAuthority(options: { local: Game; current(): Game }) {
  let remote: StandaloneWorldPort | undefined, pending = 0;
  let lane: Promise<unknown> = Promise.resolve();
  function serial<T>(run: () => Promise<T>): Promise<T> {
    if (pending >= 32) return Promise.reject(Error('World operation capacity exceeded'));
    pending++;
    const result = lane.catch(() => {}).then(run).finally(() => { pending--; });
    lane = result;return result;
  }
  return {
    get remote() { return !!remote; },
    attach(port: StandaloneWorldPort) {
      if (remote) throw Error('A remote world already owns this session.');
      // Attach only after initialization succeeds. Never detach to an obsolete
      // local world: a future handoff must transfer a complete checkpoint first.
      remote = port;
    },
    snapshotSync() {
      if (remote) throw Error('World snapshots are asynchronous; use snapshotAsync().');
      return options.current().snapshot();
    },
    snapshot(): Promise<GameplaySnapshot3D> {
      const owner = remote;
      return owner ? serial(() => owner.snapshot()) : Promise.resolve(options.current().snapshot());
    },
    restore(snapshot: GameplaySnapshot3D): Promise<void> {
      const owner = remote;
      if (owner) { const saved = structuredClone(snapshot);return serial(() => owner.restore(saved)); }
      options.current().restore(snapshot);return Promise.resolve();
    },
    reset() { const owner = remote;return owner ? serial(() => owner.reset()) : options.current().reset(); },
    policies(input: Parameters<Game['queueCombatAiPolicies']>[0]): Promise<void> {
      const owner = remote;
      if (owner) { const saved = structuredClone(input);return serial(() => owner.policies(saved)); }
      options.local.queueCombatAiPolicies(input);return Promise.resolve();
    },
    learning(input: Parameters<Game['queueCombatAiLearning']>[0]): Promise<void> {
      const owner = remote;
      if (owner) { const saved = structuredClone(input);return serial(() => owner.learning(saved)); }
      options.local.queueCombatAiLearning(input);return Promise.resolve();
    },
    async settled() { await lane; },
  };
}
