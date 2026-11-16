import { createFighterEmblem } from './emblem.ts';
import { readFighterBarEntityStrategy, readFighterBarWriteStrategy } from './fighter-bar-strategies.ts';
import type { CanvasGeometry } from '../canvas-geometry';
import type { UploadRaster } from '@hyperfocus/touch-of-death/uploads/raster';
import { placeFighterBar } from './bar-layout.ts';
import { presentedFighterResources } from './recovery-resources.ts';
import { createFrameRecordSelection } from '@hyperfocus/engine/project/runtime-3d';
import { createDefenseMoments } from '@hyperfocus/touch-of-death/presentation/feedback/defense';
import type { CombatProject3D, GameplaySnapshot3D, Hyperfocus3DEvaluatedFrame } from '@hyperfocus/engine/project/runtime-3d';
const profileIcons: Readonly<Record<string, string>> = { fist: '✊', spark: '✦', wave: '≈', leaf: '☘', star: '★', moon: '☾' };

export type FighterBarWriteStrategy = ReturnType<typeof readFighterBarWriteStrategy>;
export type FighterBarEntityStrategy = ReturnType<typeof readFighterBarEntityStrategy>;
export type FighterBarWriteWork = {
  textWrites: number; attributeWrites: number; styleWrites: number; skippedWrites: number;
  inputEntities: number; barsVisited: number; geometryReads: number; projectionCalls: number;
  selectedEntities: number; entityVisits: number; selectionDiscoveryVisits: number; selectionSlotChecks: number;
  selectionIndexVisits: number; selectionIndexBuilds: number; selectionRecordReads: number; selectionSlotBytes: number;
};

/** Count setter calls, including reflected hidden/value properties, not browser
 * layout or paint work. Changed writes compare live owned DOM. Only normalized
 * style strings are retained; no gameplay frames or geometry are cached. */
function createBarWriters(work?: FighterBarWriteWork) {
  const styleValues = new WeakMap<CSSStyleDeclaration, Map<string, { requested: string; applied: string }>>();
  const original = {
    text(node: Node, value: string) { node.textContent = value;if (work) work.textWrites++; },
    attribute(node: Element, name: string, value: string) { node.setAttribute(name, value);if (work) work.attributeWrites++; },
    hidden(node: HTMLElement, value: boolean) { node.hidden = value;if (work) work.attributeWrites++; },
    meter(node: HTMLMeterElement, value: number) { node.value = value;if (work) work.attributeWrites++; },
    style(node: HTMLElement, name: string, value: string) { node.style.setProperty(name, value);if (work) work.styleWrites++; },
  };
  const skip = () => { if (work) work.skippedWrites++; };
  return { original, 'changed-writes': {
    text(node: Node, value: string) { if (node.textContent === value) skip();else original.text(node, value); },
    attribute(node: Element, name: string, value: string) { if (node.getAttribute(name) === value) skip();else original.attribute(node, name, value); },
    hidden(node: HTMLElement, value: boolean) { if (node.hidden === value) skip();else original.hidden(node, value); },
    meter(node: HTMLMeterElement, value: number) { if (node.getAttribute('value') === String(value)) skip();else original.meter(node, value); },
    style(node: HTMLElement, name: string, value: string) {
      const current = node.style.getPropertyValue(name), values = styleValues.get(node.style), prior = values?.get(name);
      if (!node.style.getPropertyPriority(name) && (current === value || prior?.requested === value && prior.applied === current)) { skip();return; }
      original.style(node, name, value);
      const retained = values ?? new Map();if (!values) styleValues.set(node.style, retained);
      if (prior) { prior.requested = value;prior.applied = node.style.getPropertyValue(name); }
      else retained.set(name, { requested: value, applied: node.style.getPropertyValue(name) });
    },
  } };
}

/** Project the head anchor using the exact camera matrix used to draw the fighter. */
export function projectFighterBar(options: { position: readonly number[]; matrix: ArrayLike<number>; width: number; height: number }) {
  const { position: p, matrix: m, width, height } = options;
  const x = p[0]!, y = p[1]!, z = p[2]!;
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  if (w <= 0) return undefined;
  const nx = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w;
  const ny = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w;
  const nz = (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) / w;
  if (nz < -1 || nz > 1 || Math.abs(nx) > 1.1 || Math.abs(ny) > 1.1) return undefined;
  return { x: Math.max(54, Math.min(width - 54, (nx + 1) * width / 2)), y: Math.max(28, Math.min(height - 28, (1 - ny) * height / 2)) };
}

/** App-owned HUD; combat and camera state remain portable and DOM-free. */
export function createFighterBars(options: { canvas: HTMLCanvasElement; definition: CombatProject3D; presentation?: { width: number; headClearance: number };
  writeStrategy?: FighterBarWriteStrategy | (() => FighterBarWriteStrategy);
  entityStrategy?: FighterBarEntityStrategy | (() => FighterBarEntityStrategy);
  /** Complete entity IDs for this authored scene. Recreate the presenter when
   * declaration membership changes. Without this contract, discover membership
   * on every selected render, including same-length mutable replacements. */
  authoredEntityIds?: readonly string[];
  /** Borrowed per-render counters; excludes construction, emblem canvas and disposal. */
  onWriteWork?: (work: Readonly<FighterBarWriteWork>) => void;
}) {
  const { canvas, definition, presentation, onWriteWork } = options;
  const defenseMoments = createDefenseMoments();
  const requestedWrites = options.writeStrategy ?? 'original';
  const validateWrites = readFighterBarWriteStrategy;
  if (typeof requestedWrites !== 'function') validateWrites(requestedWrites);
  const work: FighterBarWriteWork | undefined = onWriteWork ? { textWrites: 0, attributeWrites: 0, styleWrites: 0, skippedWrites: 0, inputEntities: 0, barsVisited: 0, geometryReads: 0, projectionCalls: 0,
    selectedEntities: 0, entityVisits: 0, selectionDiscoveryVisits: 0, selectionSlotChecks: 0, selectionIndexVisits: 0, selectionIndexBuilds: 0, selectionRecordReads: 0, selectionSlotBytes: 0 } : undefined;
  const writers = createBarWriters(work);
  const selectWriter = typeof requestedWrites === 'function' ? () => writers[validateWrites(requestedWrites())] : () => writers[requestedWrites];
  const requestedEntities = options.entityStrategy ?? 'original';
  const validateEntities = readFighterBarEntityStrategy;
  if (typeof requestedEntities !== 'function') validateEntities(requestedEntities);
  const wantedIds = new Set(definition.fighters.flatMap(({ entityId: id }) => [id, ...['', ':art'].flatMap(prefix => ['head', 'left-hand', 'right-hand', 'left-shoe', 'right-shoe', 'left-foot', 'right-foot'].map(part => `${id}${prefix}:${part}`))]));
  const authoredMembership = options.authoredEntityIds !== undefined;
  let selectedIds = options.authoredEntityIds?.filter(id => wantedIds.has(id)) ?? [];
  let selectRecords = createFrameRecordSelection({ ids: selectedIds, diagnostics: !!work });
  const entitySelectors = {
    original: (entities: Hyperfocus3DEvaluatedFrame['entities']) => entities,
    selected: (entities: Hyperfocus3DEvaluatedFrame['entities']) => {
      if (!authoredMembership) {
        const nextIds: string[] = [];
        for (const entity of entities) { if (work) work.selectionDiscoveryVisits++;if (wantedIds.has(entity.id)) nextIds.push(entity.id); }
        if (nextIds.length !== selectedIds.length || nextIds.some((id, index) => id !== selectedIds[index])) {
          selectedIds = nextIds;selectRecords = createFrameRecordSelection({ ids: selectedIds, diagnostics: !!work });
        }
      }
      const selected = selectRecords(entities), read = selectRecords.readWork();
      if (work) { work.selectionSlotChecks = read.slotChecks;work.selectionIndexVisits = read.indexVisits;work.selectionIndexBuilds = read.indexBuilds;work.selectionRecordReads = read.recordReads;work.selectionSlotBytes = read.slotBytes; }
      return selected;
    },
  };
  const selectEntityStrategy = typeof requestedEntities === 'function'
    ? () => entitySelectors[validateEntities(requestedEntities())]
    : () => entitySelectors[requestedEntities];
  const root = document.createElement('div');root.className = 'hf-fighter-bars';
  Object.assign(root.style, { position: 'absolute', pointerEvents: 'none', zIndex: '3', overflow: 'hidden' });
  const style = document.createElement('style');
  style.textContent = '.hf-fighter-bar{position:absolute;width:96px;transform:translate(-50%,-100%);filter:drop-shadow(0 2px 3px #000);display:grid;gap:3px}.hf-fighter-bar[hidden]{display:none}.hf-fighter-bar meter{display:block;box-sizing:border-box;width:100%;height:10px;border:1px solid #101821;border-radius:2px;background:#111b26;appearance:none}.hf-fighter-bar meter::-webkit-meter-bar{background:#111b26;border:0;border-radius:0}.hf-fighter-bar meter::-webkit-meter-optimum-value{background:var(--fighter-color)}.hf-fighter-bar meter::-moz-meter-bar{background:var(--fighter-color)}.hf-fighter-bar meter[data-resource=stamina]{height:5px;width:82%;--fighter-color:#fff1b0}.hf-fighter-bar[data-exhausted=true] meter[data-resource=stamina]{--fighter-color:#ff885f}';
  root.append(style);canvas.parentElement?.append(root);
  style.textContent += '.hf-fighter-name [data-fighter-emblem]{display:inline-block;width:18px;height:18px;vertical-align:middle;margin-right:3px;image-rendering:auto}.hf-fighter-name [data-fighter-emblem][hidden]{display:none}';
  style.textContent += '.hf-fighter-name{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:600 11px/16px system-ui;color:#fff;background:#101821e8;border-radius:2px;padding:0 3px}.hf-fighter-name[hidden]{display:none}';
  style.textContent += '.hf-escape-pip{display:block;width:7px;height:7px;margin:1px 0 0 2px;border:1px solid #d6f5ff;transform:rotate(45deg);background:transparent}.hf-escape-pip[data-ready=true]{background:#d6f5ff;box-shadow:0 0 5px #91e4ff}.hf-escape-pip[data-ready=false]{opacity:.45}';
  style.textContent += '.hf-defense-resources{display:flex;align-items:center;gap:7px;height:12px}.hf-guard-integrity{width:12px;height:13px;display:block;background:conic-gradient(#b3eaff calc(var(--integrity)*1turn),#263341 0);clip-path:polygon(50% 0,100% 18%,90% 68%,50% 100%,10% 68%,0 18%)}.hf-guard-integrity[data-broken=true]{background:conic-gradient(#ffb66b calc(var(--integrity)*1turn),#3d2924 0);clip-path:polygon(50% 0,100% 18%,90% 68%,58% 93%,66% 58%,43% 49%,57% 25%,35% 40%,44% 64%,35% 92%,10% 68%,0 18%)}.hf-fighter-bar[data-dead=true] .hf-defense-resources{filter:grayscale(1);opacity:.4}.hf-fighter-bar[data-exhausted=true] meter[data-resource=stamina]{height:7px;border:2px dashed #ff885f}';
  style.textContent += '.hf-defense-denied{width:10px;height:10px;background:#b5bec7;clip-path:polygon(0 20%,20% 0,50% 30%,80% 0,100% 20%,70% 50%,100% 80%,80% 100%,50% 70%,20% 100%,0 80%,30% 50%)}.hf-defense-resources [hidden]{display:none}';
  style.textContent += '.hf-fighter-bar{filter:drop-shadow(0 2px 4px #000b);gap:3px}.hf-fighter-bar meter{height:9px;border:1px solid #eee9dc70;border-radius:0;background:#111611}.hf-fighter-bar meter::-webkit-meter-bar{background:#111611;box-shadow:inset 0 1px 2px #0009}.hf-fighter-bar meter::-webkit-meter-optimum-value{background:linear-gradient(180deg,#ffffff50,transparent 60%),var(--fighter-color)}.hf-fighter-bar meter[data-resource=stamina]{height:4px;width:82%;border:0;--fighter-color:#e7bb74}.hf-fighter-name{font:700 10px/17px Arial,Helvetica,sans-serif;letter-spacing:.035em;border-radius:0;color:#eee9dc;padding:1px 4px}.hf-defense-resources{gap:6px}.hf-escape-pip[data-ready=true]{background:#eee9dc;box-shadow:0 0 4px #eee9dc50}.hf-escape-pip{border-color:#eee9dc}.hf-fighter-bar[data-dead=true] meter{opacity:.45}';
  style.textContent += '.hf-fighter-bar{width:136px;gap:3px;padding:5px 6px 4px;background:linear-gradient(100deg,#101513f5,#101513d9);border-top:2px solid var(--fighter-color);box-sizing:border-box;filter:drop-shadow(0 3px 5px #0008)}.hf-fighter-identity{display:flex;gap:6px;align-items:center;min-width:0;height:20px}.hf-fighter-name{flex:1;min-width:0;padding:0;font:700 11px/20px Arial,Helvetica,sans-serif;letter-spacing:.035em}.hf-fighter-health-value{font:700 13px/20px Arial,Helvetica,sans-serif;font-variant-numeric:tabular-nums;color:#eee9dc}.hf-fighter-bar meter{height:11px;border:0}.hf-fighter-bar meter::-webkit-meter-optimum-value{background:linear-gradient(180deg,#ffffff40,transparent),var(--fighter-color)}.hf-fighter-bar meter[data-resource=stamina]{height:4px;width:100%}.hf-defense-resources{height:12px;gap:7px;margin-top:1px}.hf-fighter-tether{opacity:.5}.hf-fighter-bar[data-dead=true]{opacity:.55}.hf-fighter-name [data-fighter-emblem]{width:15px;height:15px}.hf-fighter-bar[data-exhausted=true] meter[data-resource=stamina]{height:4px;border:1px dashed #ff885f}';
  style.textContent += '.hf-resource-track{position:relative;display:block;min-width:0}.hf-resource-track[hidden]{display:none}.hf-resource-divider{position:absolute;top:0;bottom:0;width:1px;background:#101513b0;pointer-events:none}';
  style.textContent += '.hf-defense-resources{gap:4px;font:10px/12px Arial,Helvetica,sans-serif;color:#eee9dc}.hf-defense-caption{min-height:14px;font:11px/14px Arial,Helvetica,sans-serif;color:#eee9dc}';
  style.textContent += '.hf-combat-caption[data-defense]{display:block;white-space:pre-line;padding:5px 6px;margin:2px -6px -4px;border-inline-start:3px solid #eee9dc;background:#142620;font:700 11px/15px Arial,Helvetica,sans-serif;color:#eee9dc;box-shadow:0 3px 5px #0008}.hf-combat-caption[data-defense=escape]{border-color:#e7aa63;background:#30281c}.hf-combat-caption[data-defense=di]{border-color:#82e5ef;background:#14282a}.hf-combat-caption[data-defense=tech]{border-style:double;border-inline-start-width:4px}';
  const bars = definition.fighters.map(fighter => {
    const bar = document.createElement('div');bar.className = 'hf-fighter-bar';bar.dataset.fighter = fighter.entityId;
    bar.style.setProperty('--fighter-color', fighter.control === 'player' ? '#60e5e5' : '#ff856e');
    const name = fighter.control === 'player' ? 'You' : 'Opponent';
    const health = document.createElement('meter'), stamina = document.createElement('meter');
    health.min = stamina.min = 0;health.max = definition.config.maxHealth;stamina.max = definition.config.maxStamina ?? 100;
    health.setAttribute('aria-label', `${name} health`);stamina.setAttribute('aria-label', `${name} stamina`);
    stamina.dataset.resource = 'stamina';stamina.hidden = !definition.config.maxStamina;
    const escape = document.createElement('span');escape.className = 'hf-escape-pip';escape.setAttribute('role', 'img');
    escape.hidden = !definition.config.escapeCharges;
    const shield = document.createElement('span');shield.className = 'hf-guard-integrity';shield.setAttribute('role', 'img');shield.hidden = !definition.config.maxGuard;
    const denied = document.createElement('span');denied.className = 'hf-defense-denied';denied.setAttribute('role', 'img');denied.hidden = true;
    const guardLabel = document.createElement('span');guardLabel.textContent = 'Guard';guardLabel.hidden = shield.hidden;
    const escapeLabel = document.createElement('span');escapeLabel.textContent = 'Escape';escapeLabel.hidden = escape.hidden;
    const resources = document.createElement('div');resources.className = 'hf-defense-resources';resources.append(shield, guardLabel, escape, escapeLabel, denied);
    const caption = document.createElement('span');caption.className = 'hf-combat-caption';
    const tether = document.createElement('div');tether.className = 'hf-fighter-tether';tether.setAttribute('aria-hidden', 'true');
    Object.assign(tether.style, { position: 'absolute', height: '2px', transformOrigin: '0 50%', background: fighter.control === 'player' ? '#60e5e5' : '#ff856e', boxShadow: '0 0 0 1px #101821' });root.append(tether);
    const nameplate = document.createElement('span');nameplate.className = 'hf-fighter-name';nameplate.hidden = true;
    const emblem = createFighterEmblem(), nameText = document.createElement('span');nameText.dataset.fighterNameText = '';nameplate.append(emblem.canvas, nameText);
    const identity = document.createElement('div'), value = document.createElement('span');identity.className = 'hf-fighter-identity';value.className = 'hf-fighter-health-value';value.setAttribute('aria-hidden', 'true');identity.append(nameplate, value);
    bar.append(identity, segmentedTrack(health), segmentedTrack(stamina), resources, caption);root.append(bar);return { tether, id: fighter.entityId, name, nameplate, nameText, emblem, bar, health, value, stamina, escape, shield, denied, caption };
  });
  return {
    render(input: { snapshot: GameplaySnapshot3D; frame: Hyperfocus3DEvaluatedFrame; matrix: ArrayLike<number>; geometry?: Readonly<CanvasGeometry>; hidden?: boolean; localFighterId?: string; spectator?: boolean; phase?: string; fighterNames?: Record<string, { name: string; icon?: string; card?: string }>; emblem?(actorId: string): Readonly<UploadRaster> | undefined }) {
      const write = selectWriter(), selectEntities = selectEntityStrategy();
      if (work) {
        work.textWrites = work.attributeWrites = work.styleWrites = work.skippedWrites = 0;
        work.barsVisited = work.geometryReads = work.projectionCalls = 0;work.inputEntities = input.frame.entities.length;
        work.selectedEntities = work.entityVisits = work.selectionDiscoveryVisits = work.selectionSlotChecks = work.selectionIndexVisits = work.selectionIndexBuilds = work.selectionRecordReads = 0;
        work.selectionSlotBytes = selectRecords.readWork().slotBytes;
      }
      const combat = input.snapshot.combat;
      const phase = input.phase ?? combat?.match?.phase;
      write.hidden(root, input.hidden === true || !combat || (phase !== undefined && !['fighting', 'round-result', 'countdown', 'practice'].includes(phase)));
      if (root.hidden) { for (const bar of bars) bar.emblem.render();if (work) onWriteWork!(work);return; }
      const width = input.geometry?.width ?? canvas.clientWidth, height = input.geometry?.height ?? canvas.clientHeight;
      write.style(root, 'left', `${input.geometry?.left ?? canvas.offsetLeft}px`);write.style(root, 'top', `${input.geometry?.top ?? canvas.offsetTop}px`);write.style(root, 'width', `${width}px`);write.style(root, 'height', `${height}px`);
      if (work) { work.geometryReads = input.geometry ? 0 : 4;work.barsVisited = bars.length; }
      const entities = selectEntities(input.frame.entities);if (work) work.selectedEntities = entities.length;
      const placed: Array<{ x: number; y: number }> = [];
      const renderedHead=(id:string)=>entities.find(entity=>{if(work)work.entityVisits++;return entity.id===`${id}:art:head`&&entity.visible;})??entities.find(entity=>{if(work)work.entityVisits++;return entity.id===`${id}:head`;});
      const bodies = bars.flatMap(({ id }) => {
        const directed=entities.some(entity=>{if(work)work.entityVisits++;return entity.id===`${id}:art:head`&&entity.visible;}),prefix=directed?`${id}:art`:id;
        const points = entities.filter(e => {if(work)work.entityVisits++;return e.visible && [id, `${prefix}:head`, `${prefix}:left-hand`, `${prefix}:right-hand`, `${prefix}:left-shoe`, `${prefix}:right-shoe`, `${prefix}:left-foot`, `${prefix}:right-foot`].includes(e.id);}).flatMap(e => {
          if (work) work.projectionCalls++;const p = projectFighterBar({ position: e.position, matrix: input.matrix, width, height });return p ? [p] : [];
        });
        return points.length ? [{ left: Math.min(...points.map(p => p.x)) - 18, right: Math.max(...points.map(p => p.x)) + 18, top: Math.min(...points.map(p => p.y)) - 18, bottom: Math.max(...points.map(p => p.y)) + 18 }] : [];
      });
      const barWidth = Math.min(presentation?.width ?? 136, width < 600 ? 112 : 136);
      for (const { id, name: authoredName, nameplate, nameText, emblem, bar, health, value, stamina, escape, shield, denied, tether, caption } of bars) {
        const role = input.spectator || combat?.match?.theater ? `Fighter ${definition.fighters.findIndex(fighter => fighter.entityId === id) + 1}` : input.localFighterId === undefined ? authoredName : input.localFighterId === id ? 'You' : 'Opponent';
        const profile = combat?.match?.theater ? undefined : input.fighterNames?.[id], name = profile && profile.name !== role ? `${profile.name} (${role})` : role;
        write.attribute(nameplate, 'data-card', profile?.card ?? 'classic');
        write.style(nameplate, 'background', profile?.card === 'sunrise' ? 'linear-gradient(110deg,#502719,#241727)' : profile?.card === 'night' ? 'linear-gradient(110deg,#142b4b,#291b42)' : 'transparent');
        write.style(nameplate, 'border-inline-start', profile?.card === 'sunrise' ? '3px solid #ffd28c' : profile?.card === 'night' ? '3px solid #cbb9ff' : '3px solid transparent');
        const hasEmblem = emblem.render(profile ? input.emblem?.(id) : undefined);
        write.hidden(nameplate, false);write.text(nameText, profile ? `${hasEmblem ? '' : profileIcons[profile.icon ?? ''] ?? ''} ${profile.name}${role === 'You' && profile.name !== role ? ' (You)' : ''}`.trim() : role);write.attribute(nameplate, 'title', `${name} · ${id}`);
        write.attribute(health, 'aria-label', `${name} health`);write.attribute(stamina, 'aria-label', `${name} stamina`);
        const fighter = combat!.state.fighters.find(item => item.id === id);
        const head = renderedHead(id);
        const position = head ? [head.position[0], head.position[1] + (presentation?.headClearance ?? .65), head.position[2]] : fighter ? [fighter.position.x, fighter.position.y + 1.6, fighter.position.z] : undefined;
        if (position && work) work.projectionCalls++;
        const screen = position && projectFighterBar({ position, matrix: input.matrix, width, height });
        write.hidden(bar, !screen || !fighter);write.hidden(tether, bar.hidden === true);
        if (!screen || !fighter) continue;
        write.style(bar, 'width', `${barWidth}px`);
        const positioned = placeFighterBar({ anchor: screen, bodies, placed, width, height, barHeight: 88, barWidth });
        placed.push(positioned);write.style(bar, 'left', `${positioned.x}px`);write.style(bar, 'top', `${positioned.y}px`);
        const dx = screen.x - positioned.x, dy = screen.y - positioned.y;
        write.hidden(tether, Math.hypot(dx, dy) < 4);
        write.style(tether, 'left', `${positioned.x}px`);write.style(tether, 'top', `${positioned.y}px`);write.style(tether, 'width', `${Math.hypot(dx, dy)}px`);write.style(tether, 'transform', `rotate(${Math.atan2(dy, dx)}rad)`);
        const shown = presentedFighterResources({ snapshot: input.snapshot, definition, fighter });
        write.meter(health, shown.health);write.meter(stamina, shown.stamina);write.text(value, String(Math.ceil(shown.health)));
        write.attribute(escape, 'data-ready', String(fighter.escapeCharges > 0));
        write.attribute(escape, 'aria-label', `${name} armored escape: ${fighter.escapeCharges > 0 ? `${fighter.escapeCharges} ready` : 'spent'}`);
        const broken = fighter.guardBrokenFrames > 0;
        const integrity = Math.max(0, Math.min(1, broken ? 1 - fighter.guardBrokenFrames / (definition.config.guardBreakFrames ?? 600) : fighter.guardMeter / (definition.config.maxGuard ?? 100)));
        write.style(shield, '--integrity', String(integrity));write.attribute(shield, 'data-broken', String(broken));
        write.attribute(shield, 'aria-label', `${name} shield: ${broken ? 'broken, rebuilding' : 'integrity'} ${Math.round(integrity * 100)}%`);
        const events = combat!.exchange ?? [];let contact: typeof events[number] | undefined;
        for (let index = events.length - 1; index >= 0; index--) {
          const event = events[index]!, age = combat!.state.frame - event.frame;
          if (event.targetId === id && age >= 0 && age < 90) { contact = event;break; }
        }
        const cue = contact?.kind === 'parry' ? 'Parry' : contact?.kind === 'block' ? contact.damage > 0 ? 'Blocked · chip' : 'Blocked' : contact?.kind === 'tech' ? 'Recovery timed' : contact?.kind === 'escape' ? 'Armored escape' : contact?.kind === 'bounce' ? 'Missed recovery' : '';
        const moment = defenseMoments(combat!, id);
        write.text(caption, fighter.health <= 0 ? '' : moment ? `${moment.symbol} ${moment.label}\n${moment.detail}` : broken ? `Guard broken · ${Math.ceil(fighter.guardBrokenFrames / 60)}s` : cue);
        if (moment) write.attribute(caption, 'data-defense', moment.kind);else if (caption.hasAttribute('data-defense')) caption.removeAttribute('data-defense');
        write.attribute(bar, 'data-dead', String(shown.health <= 0));
        const attempt = combat!.defenseFeedback.find(item => item.id === id)?.lastAttempt;
        const attemptAge = attempt ? combat!.state.frame - attempt.inputFrame : -1;
        write.hidden(denied, fighter.health <= 0 || attempt?.timing !== 'unavailable' || attemptAge < 0 || attemptAge > 18);
        if (!denied.hidden) write.attribute(denied, 'aria-label', `${name} ${attempt!.kind} unavailable`);
        write.attribute(bar, 'data-exhausted', String(shown.stamina < (definition.config.maxStamina ?? 100) * .2));
      }
      if (work) onWriteWork!(work);
    },
    dispose() { for (const bar of bars) bar.emblem.render();root.remove(); },
  };
}

/** Dividers belong to the full track, never the browser's shrinking value pseudo-element. */
function segmentedTrack(meter: HTMLMeterElement) {
  const track = document.createElement('span');track.className = 'hf-resource-track';track.hidden = meter.hidden;
  track.append(meter);
  for (const percent of [25, 50, 75]) {
    const divider = document.createElement('span');divider.className = 'hf-resource-divider';divider.setAttribute('aria-hidden', 'true');
    divider.style.left = `${percent}%`;track.append(divider);
  }
  return track;
}
