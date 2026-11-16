import type { CombatAiPolicy } from '@hyperfocus/engine/project/runtime-3d';
import type { createPolicyStore } from './store.ts';

/** Durable revisions queue for the next match; a running fight keeps its checkpoint policy. */
export function createPolicyActivation(options: {
  store: ReturnType<typeof createPolicyStore>;
  queue: (policies: readonly [CombatAiPolicy | undefined, CombatAiPolicy | undefined]) => void;
}) {
  let revision = -1, disposed = false;
  let active: CombatAiPolicy | undefined;
  function accept(value: ReturnType<typeof options.store.snapshot>) {
    if (disposed || value.error || value.stale || value.revision <= revision) return;
    options.queue([value.active, value.active]);
    active = value.active;revision = value.revision;
  }
  const unsubscribe = options.store.subscribe(accept);
  accept(options.store.snapshot());
  const refresh = async () => { if (!disposed) accept(await options.store.read()); };
  // Also catches missed cross-tab notifications. Store reads remain TTL-cached.
  const timer = setInterval(() => { void refresh(); }, 1800000);
  return {
    refresh,
    reapply() { if (!disposed && revision >= 0) options.queue([active, active]); },
    dispose() { disposed = true;clearInterval(timer);unsubscribe(); },
  };
}
