import type { CombatEvent, CombatSnapshot } from '../../../combat/state.ts';
import { object, type GameplayPresentation3D } from '../gameplay-contracts.ts';
import { requireText } from '@hyperfocus/utilities/text';
import { readList, readObject, requireBoolean, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';

const reasons = ['guard-not-held', 'outside-guard-arc', 'guard-broken', 'attack-commitment', 'hit-recoil', 'parry-recoil', 'fresh-parry', 'held-block', 'surface-recovery', 'missed-surface-recovery', 'grapple-teched', 'grapple-not-teched', 'traffic-impact', 'fire-exposure', 'out-of-bounds', 'unreported'] as const;
type Reason = typeof reasons[number];
const nextAttempts: Record<Reason, string> = {
  'guard-not-held': 'The defender was caught without guarding. Try holding guard before the opening strike lands.',
  'outside-guard-arc': 'The hit came around the guard. Try turning toward the attacker before contact.',
  'guard-broken': 'The defender’s guard had been broken. Try creating space before the guard gives out.',
  'attack-commitment': 'The defender was caught during an attack. Try waiting for the opponent to miss, then striking.',
  'hit-recoil': 'An earlier hit kept the defender from acting. Retry the opening and try a different direction while being knocked back.',
  'parry-recoil': 'The attacker had been parried and could not act yet. Try delaying the next attack to change its timing.',
  'fresh-parry': 'A well-timed guard press stopped the attack. Try changing the attack timing on the next attempt.',
  'held-block': 'Guard stopped this attack. Try approaching from another angle.',
  'surface-recovery': 'The defender recovered when hitting a surface. Try repeating that recovery timing.',
  'missed-surface-recovery': 'The defender hit a surface without recovering. Try pressing recovery just before impact.',
  'grapple-teched': 'The defender escaped the grab. Try repeating the interaction press just after a grab begins.',
  'grapple-not-teched': 'The grab escape window passed. Try pressing interaction as the grab starts, or recovery before landing.',
  'traffic-impact': 'A vehicle hit the fighter. Try moving out of its lane before it arrives.',
  'fire-exposure': 'The fighter took damage in the fire. Try leaving the burning area sooner.',
  'out-of-bounds': 'The fighter fell off the stage. Try steering back toward safe ground during knockback.',
  unreported: 'The cause of this contact was not recorded. Watch the exchange and compare one different choice on retry.',
};
type Entry = { id: string; frame: number; attackerId: string; targetId: string; moveId: string; kind: CombatEvent['kind']; damage: number; reason: Reason; decisive: boolean; previousId: string };
const kinds = ['hit', 'block', 'parry', 'guard-break', 'tech', 'bounce', 'escape'] as const;
const entryFields: ObjectReaders<Entry> = { id: requireText, frame: requireNumber, attackerId: requireText, targetId: requireText, moveId: requireText, kind: value => requireOneOf(value, kinds), damage: requireNumber, reason: value => requireOneOf(value, reasons), decisive: requireBoolean, previousId: requireText };
export function readCombatExchangeState3D(value: unknown): Entry[] { return structuredClone(readList(value, value => readObject(value, entryFields))); }
const explanations: Record<Reason, string> = {
  'guard-not-held': 'Guard was not held at contact.',
  'outside-guard-arc': 'The attack arrived outside the forward guard arc.',
  'guard-broken': 'Guard was unavailable after a guard break.',
  'attack-commitment': 'The defender was committed to an attack and could not guard.',
  'hit-recoil': 'The defender was still in hit recoil and could not guard.',
  'parry-recoil': 'The defender was recovering from being parried.',
  'fresh-parry': 'A fresh guard press parried the attack.',
  'held-block': 'Held guard covered the incoming attack.',
  'surface-recovery': 'A timed surface recovery ended hit recoil.',
  'missed-surface-recovery': 'No active recovery window was present at surface contact.',
  'grapple-teched': 'A fresh interaction press escaped the grapple before the throw.',
  'grapple-not-teched': 'The initial grapple tech window expired; a timed surface recovery remains available on impact.',
  'traffic-impact': 'A moving vehicle struck the fighter in its path.',
  'fire-exposure': 'The fighter remained in the burning area and took fire damage.',
  'out-of-bounds': 'The fighter fell below the stage boundary and was knocked out.',
  unreported: 'The interaction did not report a defensive cause.',
};

/** Bounded evidence only: never claims an untested alternative would have won. */
export function createCombatExchange3D() {
  let entries: Entry[] = [];
  function capture() { return entries.map(entry => ({ ...entry })); }
  function validate(value: unknown): Entry[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 64) throw new Error('Invalid combat exchange log.');
    const parsed = value.map(item => {
      const row = object(item);
      const { id, frame, attackerId, targetId, moveId, kind, damage, reason, decisive, previousId } = row;
      if (Object.keys(row).some(key => !['id', 'frame', 'attackerId', 'targetId', 'moveId', 'kind', 'damage', 'reason', 'decisive', 'previousId'].includes(key)) || typeof frame !== 'number' || !Number.isSafeInteger(frame) || frame < 0 || typeof damage !== 'number' || !Number.isFinite(damage) || damage < 0 || typeof decisive !== 'boolean') throw new Error('Invalid combat exchange entry.');
      if (typeof id !== 'string' || typeof attackerId !== 'string' || typeof targetId !== 'string' || typeof moveId !== 'string' || typeof previousId !== 'string' || [id, attackerId, targetId, moveId, previousId].some(text => text.length > 512)) throw new Error('Invalid combat exchange identity.');
      const selectedReason = reasons.find(value => value === reason), selectedKind = kinds.find(value => value === kind);
      if (!selectedReason || !selectedKind) throw new Error('Invalid combat exchange cause.');
      return { id, frame, attackerId, targetId, moveId, kind: selectedKind, damage, reason: selectedReason, decisive, previousId };
    });
    if (new Set(parsed.map(row => row.id)).size !== parsed.length || parsed.some((row, index) => index > 0 && row.frame < parsed[index - 1]!.frame)) throw new Error('Combat exchange entries must be unique and chronological.');
    return readCombatExchangeState3D(parsed);
  }
  function summary() {
    let final = entries.at(-1);
    for (const entry of entries) if (entry.decisive) final = entry;
    if (!final) return undefined;
    let opening = final;
    const seen = new Set<string>();
    while (opening.previousId && !seen.has(opening.id)) {
      seen.add(opening.id);
      const previous = entries.find(entry => entry.id === opening.previousId);
      if (!previous) break;
      opening = previous;
    }
    return { frame: final.frame, retryFrame: Math.max(0, opening.frame - 60), targetId: final.targetId, nextAttempt: nextAttempts[opening.reason],
      text: `${final.decisive ? 'Decisive contact' : 'Last contact'} at combat frame ${final.frame}: ${explanations[final.reason]}${opening.id !== final.id ? ` Opening at combat frame ${opening.frame}: ${explanations[opening.reason]}` : ''}` };
  }
  return {
    capture, validate, summary,
    defensePractice(targetId: string) {
      let final: Entry | undefined, last: Entry | undefined;
      for (const entry of entries) if (entry.targetId === targetId) { last = entry;if (entry.decisive) final = entry; }
      const contact = final ?? last;
      if (contact?.reason === 'missed-surface-recovery') return 'tech-drill';
      if (contact?.reason === 'hit-recoil') return 'di-drill';
      if (contact?.reason === 'guard-not-held') return 'parry-drill';
      // No drill currently reproduces grabs, cross-ups, traffic or commitment.
      // Free Practice is honest; never imply a parry would solve those causes.
      return 'neutral';
    },
    reset() { entries = []; },
    restore(value: unknown) { entries = validate(value); },
    observe(before: CombatSnapshot, after: CombatSnapshot, events: readonly CombatEvent[]) {
      for (const [index, event] of events.entries()) {
        if (entries.some(entry => entry.id === event.id)) continue;
        const target = before.fighters.find(fighter => fighter.id === event.targetId);
        let priorContact: Entry | undefined;
        for (const entry of entries) if (entry.targetId === event.targetId) priorContact = entry;
        const previous = (event.kind === 'bounce' || event.defenseReason === 'hit-recoil') && priorContact && ['hit', 'bounce'].includes(priorContact.kind) ? priorContact : undefined;
        const decisive = event.damage > 0 && (target?.health ?? 0) > 0 && after.fighters.find(fighter => fighter.id === event.targetId)?.health === 0 && !events.slice(index + 1).some(other => other.targetId === event.targetId && other.damage > 0);
        entries.push({ id: event.id, frame: event.frame, attackerId: event.attackerId, targetId: event.targetId, moveId: event.moveId, kind: event.kind, damage: event.damage, reason: event.defenseReason ?? 'unreported', decisive, previousId: previous?.id ?? '' });
      }
      entries = entries.slice(-64);
    },
    presentation(base: GameplayPresentation3D): GameplayPresentation3D {
      const result = summary();
      if (base.layout !== 'result' || !result || !base.overlay) return base;
      return { ...base, overlay: { ...base.overlay, body: `${base.overlay.body}\n${result.nextAttempt}\n${result.text}` } };
    },
  };
}
