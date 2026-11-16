import type { CombatEvent, CombatSnapshot } from '../../../../combat/state.ts';

type End = 'knockout' | 'recovered' | 'tech' | 'escape' | 'counterhit' | 'trade' | 'interrupted' | 'censored';
type Contact = { eventId: string; moveId: string; frame: number; damage: number };
type Chain = { attacker: string; target: string; startFrame: number; endFrame: number; initialTargetHealth: number | null; damage: number; hits: number; contacts: Contact[]; droppedContacts: number; committedStun: boolean };
type Sample = Chain & { end: End; cause?: string; endingEvent?: { eventId: string; frame: number; moveId: string; kind: CombatEvent['kind'] } };
type Actor = { fighter: string; damageDealt: number; damageTaken: number; attackStarts: number; chainsStarted: number; chainsCompleted: number; chainsBroken: number; chainsEscaped: number; chainsCensored: number };
type Observed = { health: number; frame: number; serial: number; attackFrame: number };

/** Actor-tagged observations only. No counterfactual mistakes or policy rewards are inferred. */
export function createCombatAiExchanges() {
  const actors = new Map<string, Actor>(), observed = new Map<string, Observed>();
  const active: Chain[] = [], samples: Sample[] = [], eventIds = new Set<string>();
  let snapshotFrame = -1, eventFrame = -1;
  let coverage = newCoverage();
  function actor(fighter: string) {
    let row = actors.get(fighter);
    if (!row) {
      if (actors.size === 16) { coverage.droppedActors++;return; }
      row = { fighter, damageDealt: 0, damageTaken: 0, attackStarts: 0, chainsStarted: 0, chainsCompleted: 0, chainsBroken: 0, chainsEscaped: 0, chainsCensored: 0 };
      actors.set(fighter, row);
    }
    return row;
  }
  function finish(chain: Chain, end: End, frame: number, cause?: string, event?: CombatEvent) {
    active.splice(active.indexOf(chain), 1);
    const row = actors.get(chain.attacker);
    if (row) {
      if (end === 'knockout') row.chainsCompleted++;
      else if (end === 'tech' || end === 'escape') row.chainsEscaped++;
      else if (end === 'censored') row.chainsCensored++;
      else row.chainsBroken++;
    }
    if (samples.length === 32) { samples.shift();coverage.droppedSamples++; }
    samples.push({ ...chain, endFrame: frame, end, ...(cause ? { cause } : {}), ...(event ? { endingEvent: { eventId: event.id, frame: event.frame, moveId: event.moveId, kind: event.kind } } : {}) });
  }
  function accept(event: CombatEvent) {
    if (event.frame < eventFrame) { coverage.staleEvents++;return false; }
    if (event.frame > eventFrame) { eventFrame = event.frame;eventIds.clear(); }
    if (eventIds.has(event.id)) { coverage.duplicateEvents++;return false; }
    // Fail closed once a frame exceeds the dedup budget; never double-count evicted IDs.
    if (eventIds.size === 256) { coverage.droppedEvents++;return false; }
    eventIds.add(event.id);return true;
  }
  function contact(event: CombatEvent) {
    const target = observed.get(event.targetId), attacker = actors.get(event.attackerId), defender = actors.get(event.targetId);
    if (!(event.damage > 0) || target?.health === 0) return;
    if (defender) defender.damageTaken += event.damage;
    if (attacker && !event.environmentId) attacker.damageDealt += event.damage;
    const healthBefore = target?.health ?? null;
    if (target) target.health = Math.max(0, target.health - event.damage);
    else coverage.unknownHealthContacts++;
    if (event.environmentId || !attacker || !defender || !['hit', 'guard-break'].includes(event.kind)) {
      if (target?.health === 0) for (const chain of [...active]) if (chain.target === event.targetId) finish(chain, 'censored', event.frame, 'external-damage');
      return;
    }
    let chain = active.find(row => row.attacker === event.attackerId && row.target === event.targetId);
    if (!chain) {
      const oldest = active[0];
      if (active.length === 32 && oldest) finish(oldest, 'censored', event.frame, 'capacity');
      chain = { attacker: event.attackerId, target: event.targetId, startFrame: event.frame, endFrame: event.frame, initialTargetHealth: healthBefore, damage: 0, hits: 0, contacts: [], droppedContacts: 0, committedStun: false };
      active.push(chain);attacker.chainsStarted++;
    }
    chain.endFrame = event.frame;chain.damage += event.damage;chain.hits++;
    if (chain.contacts.length === 32) { chain.droppedContacts++;coverage.droppedContacts++; }
    else chain.contacts.push({ eventId: event.id, moveId: event.moveId, frame: event.frame, damage: event.damage });
    if (target?.health === 0) finish(chain, 'knockout', event.frame);
  }
  return {
    clear() { actors.clear();observed.clear();active.length = samples.length = 0;eventIds.clear();snapshotFrame = eventFrame = -1;coverage = newCoverage(); },
    observe(state: CombatSnapshot, fighter: string, attackMove?: string) {
      if (state.frame > snapshotFrame) {
        snapshotFrame = state.frame;
        for (const self of state.fighters) {
          if (!actor(self.id)) continue;
          const previous = observed.get(self.id);
          observed.set(self.id, { health: self.health, frame: state.frame, serial: previous?.serial ?? self.attackSerial, attackFrame: previous?.attackFrame ?? -1 });
        }
        for (const chain of [...active]) {
          const target = state.fighters.find(row => row.id === chain.target);
          if (!target) { finish(chain, 'censored', state.frame, 'target-missing');continue; }
          // Events are emitted from frame N and committed in snapshot N+1.
          if (state.frame <= chain.endFrame) continue;
          if (target.health <= 0) finish(chain, 'censored', state.frame, 'unattributed-knockout');
          else if (target.stunFrames > 0 && target.stunKind === 'hit') chain.committedStun = true;
          else finish(chain, 'recovered', state.frame);
        }
      }
      const self = state.fighters.find(row => row.id === fighter), prior = observed.get(fighter), row = actors.get(fighter);
      if (self && prior && row && prior.attackFrame !== state.frame) {
        if (attackMove && self.attackSerial !== prior.serial) row.attackStarts++;
        prior.serial = self.attackSerial;prior.attackFrame = state.frame;
      }
    },
    resolve(events: readonly CombatEvent[]) {
      const accepted = events.filter(accept);
      for (const event of accepted) {
        if (event.kind === 'tech' || event.kind === 'escape') {
          for (const chain of [...active]) if (chain.target === event.targetId) finish(chain, event.kind, event.frame, undefined, event);
        } else contact(event);
      }
      for (const event of accepted) {
        if (!(event.damage > 0) || event.environmentId) continue;
        for (const chain of [...active]) if (chain.attacker === event.targetId) {
          const trade = chain.target === event.attackerId && chain.endFrame === event.frame;
          finish(chain, trade ? 'trade' : event.counter ? 'counterhit' : 'interrupted', event.frame, undefined, event);
        }
      }
    },
    boundary(cause: string) { for (const chain of [...active]) finish(chain, 'censored', Math.max(snapshotFrame, chain.endFrame), cause); },
    report() { return structuredClone({ actors: [...actors.values()], samples, open: active, coverage }); },
  };
}

function newCoverage() {
  return { attackStartScope: 'observed-ai-seats', droppedActors: 0, droppedSamples: 0, droppedContacts: 0, droppedEvents: 0, duplicateEvents: 0, staleEvents: 0, unknownHealthContacts: 0 };
}
