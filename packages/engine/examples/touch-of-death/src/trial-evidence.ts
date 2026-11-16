import { isRecord } from "@hyperfocus/utilities/records";
import type { createGameplay3D } from '@hyperfocus/engine/project/runtime-3d';

type Report = NonNullable<ReturnType<ReturnType<typeof createGameplay3D>['aiReport']>>;
type Actor = Report['exchanges']['actors'][number];
type Sample = Report['exchanges']['samples'][number];
const limits = { retainedTrials: 8, sequencesPerTrial: 2, contactsPerSequence: 32, actorsPerTrial: 16, policiesPerTrial: 16 } as const;

/** Exact, bounded observations for review. These are not policy rewards. */
export function collectTrialEvidence({ seed, ticks, status, winner, report }: {
  seed: number; ticks: number; status: 'completed' | 'capped'; winner?: 'player' | 'opponent' | 'draw'; report: Report;
}) {
  const actors = new Map<string, Actor>(), policies: { fighter: string; policyId?: string }[] = [], samples: Sample[] = [];
  let droppedSamples = 0, droppedContacts = 0, droppedActors = 0, droppedEvents = 0, staleEvents = 0;
  let unknownHealthContacts = 0, duplicateEvents = 0, censoredOpenChains = 0, excludedRestoredSegments = 0, droppedPolicies = 0;
  for (const segment of [...report.segments, report]) {
    if (segment.source !== 'live') { excludedRestoredSegments++;continue; }
    for (const fighter of segment.context?.fighters ?? []) {
      if (policies.some(row => row.fighter === fighter.id && row.policyId === fighter.policyId)) continue;
      if (policies.length === limits.policiesPerTrial) { droppedPolicies++;continue; }
      policies.push({ fighter: fighter.id, ...(fighter.policyId === undefined ? {} : { policyId: fighter.policyId }) });
    }
    const evidence = segment.exchanges, coverage = evidence.coverage;
    droppedSamples += coverage.droppedSamples;droppedContacts += coverage.droppedContacts;
    droppedActors += coverage.droppedActors;droppedEvents += coverage.droppedEvents;staleEvents += coverage.staleEvents;
    unknownHealthContacts += coverage.unknownHealthContacts;duplicateEvents += coverage.duplicateEvents;
    for (const row of evidence.actors) {
      const prior = actors.get(row.fighter);
      if (!prior) {
        if (actors.size === limits.actorsPerTrial) { droppedActors++;continue; }
        actors.set(row.fighter, { ...row });continue;
      }
      prior.damageDealt += row.damageDealt;prior.damageTaken += row.damageTaken;prior.attackStarts += row.attackStarts;
      prior.chainsStarted += row.chainsStarted;prior.chainsCompleted += row.chainsCompleted;
      prior.chainsBroken += row.chainsBroken;prior.chainsEscaped += row.chainsEscaped;prior.chainsCensored += row.chainsCensored;
    }
    const pending: Sample[] = evidence.open.map(chain => {
      censoredOpenChains++;
      const actor = actors.get(chain.attacker);if (actor) actor.chainsCensored++;
      const endFrame = segment === report ? Math.max(chain.endFrame, report.choices.at(-1)?.frame ?? chain.endFrame) : chain.endFrame;
      return { ...chain, endFrame, end: 'censored', cause: status === 'capped' ? 'trial-cap' : 'trial-complete' };
    });
    for (const sample of [...evidence.samples, ...pending]) {
      if (sample.droppedContacts > 0) { droppedSamples++;continue; }
      if (samples.length === limits.sequencesPerTrial) { samples.shift();droppedSamples++; }
      samples.push(structuredClone(sample));
    }
  }
  return { seed, ticks, status, ...(winner === undefined ? {} : { winner }), policies, actors: [...actors.values()], samples,
    droppedSamples, droppedSegments: report.droppedSegments, droppedContacts, droppedActors, droppedEvents, staleEvents,
    unknownHealthContacts, duplicateEvents, censoredOpenChains, excludedRestoredSegments, droppedPolicies,
    limits: { ...limits }, attackStartScope: 'observed-ai-seats' as const };
}

export type TrialEvidence = ReturnType<typeof collectTrialEvidence>;

/** Reject malformed persisted evidence and discard unknown fields rather than trusting JSON. */
export function readTrialEvidenceList(value: unknown): TrialEvidence[] {
  if (value === undefined) return [];
  return list(value, limits.retainedTrials).map(item => {
    const row = record(item), status = option(row.status, ['completed', 'capped']);
    const winner = row.winner === undefined ? undefined : option(row.winner, ['player', 'opponent', 'draw']);
    if (status === 'capped' && winner !== undefined) throw Error('Capped trials cannot have a winner.');
    if (status === 'completed' && winner === undefined) throw Error('Completed trials require an outcome.');
    const actors = list(row.actors, limits.actorsPerTrial).map(readActor), policies = list(row.policies, limits.policiesPerTrial).map(item => {
      const policy = record(item);
      return { fighter: text(policy.fighter, 128), ...(policy.policyId === undefined ? {} : { policyId: text(policy.policyId, 160) }) };
    });
    if (new Set(actors.map(actor => actor.fighter)).size !== actors.length) throw Error('Duplicate trial actors.');
    const ticks = count(row.ticks);if (!ticks) throw Error('Trial evidence requires at least one tick.');
    return { seed: count(row.seed, 0xffffffff), ticks, status, ...(winner === undefined ? {} : { winner }),
      policies, actors, samples: list(row.samples, limits.sequencesPerTrial).map(readSample), droppedSamples: count(row.droppedSamples),
      droppedSegments: count(row.droppedSegments), droppedContacts: count(row.droppedContacts), droppedActors: count(row.droppedActors),
      droppedEvents: count(row.droppedEvents), staleEvents: count(row.staleEvents), unknownHealthContacts: count(row.unknownHealthContacts),
      duplicateEvents: count(row.duplicateEvents), censoredOpenChains: count(row.censoredOpenChains),
      excludedRestoredSegments: count(row.excludedRestoredSegments), droppedPolicies: count(row.droppedPolicies),
      limits: { ...limits }, attackStartScope: 'observed-ai-seats' };
  });
}

function readActor(value: unknown): Actor {
  const row = record(value);
  return { fighter: text(row.fighter, 128), damageDealt: amount(row.damageDealt), damageTaken: amount(row.damageTaken),
    attackStarts: count(row.attackStarts), chainsStarted: count(row.chainsStarted), chainsCompleted: count(row.chainsCompleted),
    chainsBroken: count(row.chainsBroken), chainsEscaped: count(row.chainsEscaped), chainsCensored: count(row.chainsCensored) };
}

function readSample(value: unknown): Sample {
  const row = record(value), startFrame = count(row.startFrame), endFrame = count(row.endFrame), hits = count(row.hits);
  const contacts = list(row.contacts, limits.contactsPerSequence).map(item => {
    const contact = record(item);
    return { eventId: text(contact.eventId, 512), moveId: text(contact.moveId, 128, true), frame: count(contact.frame), damage: amount(contact.damage) };
  });
  if (new Set(contacts.map(contact => contact.eventId)).size !== contacts.length || contacts.some(contact => !contact.damage))
    throw Error('Exchange contacts must be distinct damaging events.');
  if (!hits || hits !== contacts.length || row.droppedContacts !== 0 || typeof row.committedStun !== 'boolean'
    || endFrame < startFrame || contacts[0]?.frame !== startFrame || contacts.some((contact, index) => contact.frame > endFrame || contact.frame < (contacts[index - 1]?.frame ?? startFrame))) throw Error('Invalid complete exchange.');
  const damage = amount(row.damage);
  if (contacts.reduce((total, contact) => total + contact.damage, 0) !== damage) throw Error('Exchange damage does not match contacts.');
  const end = option(row.end, ['knockout', 'recovered', 'tech', 'escape', 'counterhit', 'trade', 'interrupted', 'censored']);
  let endingEvent: Sample['endingEvent'];
  if (row.endingEvent !== undefined) {
    const event = record(row.endingEvent);
    endingEvent = { eventId: text(event.eventId, 512), frame: count(event.frame), moveId: text(event.moveId, 128, true),
      kind: option(event.kind, ['hit', 'block', 'parry', 'guard-break', 'tech', 'bounce', 'escape']) };
    if (endingEvent.frame !== endFrame) throw Error('Invalid ending-event frame.');
  }
  return { attacker: text(row.attacker, 128), target: text(row.target, 128), startFrame, endFrame,
    initialTargetHealth: row.initialTargetHealth === null ? null : amount(row.initialTargetHealth), damage, hits, contacts,
    droppedContacts: 0, committedStun: row.committedStun, end, ...(row.cause === undefined ? {} : { cause: text(row.cause, 128) }),
    ...(endingEvent === undefined ? {} : { endingEvent }) };
}


function record(value: unknown) { if (!isRecord(value)) throw Error('Invalid trial evidence object.');return value; }
function list(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) throw Error('Invalid trial evidence list.');return value; }
function amount(value: unknown) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) throw Error('Invalid trial evidence amount.');return value; }
function count(value: unknown, max = Number.MAX_SAFE_INTEGER) { const result = amount(value);if (!Number.isSafeInteger(result) || result > max) throw Error('Invalid trial evidence count.');return result; }
function text(value: unknown, max: number, empty = false) { if (typeof value !== 'string' || !empty && !value.length || value.length > max) throw Error('Invalid trial evidence identifier.');return value; }
function option<const T extends string>(value: unknown, options: readonly T[]): T { const result = options.find(item => item === value);if (result === undefined) throw Error('Invalid trial evidence enum.');return result; }
