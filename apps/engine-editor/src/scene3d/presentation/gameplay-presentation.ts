import type { GameplayPresentation3D } from '@hyperfocus/engine/project/runtime-3d';
import type { CanvasGeometry } from '../canvas-geometry';
import { fightScreenStyles } from '../fight-hud/fight-screen.ts';
import { createCombatReference } from '../fight-hud/combat-reference.ts';
import { createFightMenuDock } from '../fight-hud/menu-dock.ts';
import { createPracticePages } from '../fight-hud/practice/practice-pages.ts';
import { createGameplayRange } from '../input/gameplay-range.ts';
import { createMenuComposition } from '../menu-convergence/presentation.ts';
import type { MenuRecipe } from '../menu-convergence/contracts.ts';
import { parseMenuRecipe } from '../menu-convergence/composition.ts';
import { createTitleNavigation } from '../game-menu/navigation.ts';
import { createContextMenu } from '../game-menu/context.ts';

export type ReticleGeometryStrategy = 'original' | 'visible-only';
export type ReticleGeometryWork = { geometryReads: number; positionWrites: number; hiddenSkipped: number };

/** One accessible projection of portable gameplay presentation for Play and delivery. */
export function createGameplayPresentation3D(options: { canvas: HTMLCanvasElement; onInteract: () => void; constrainHost?: boolean; menuComposition?: MenuRecipe;
  /** Original is the control. Visible-only skips positioning an invisible reticle;
   * visible renders still read live geometry, including moves without a resize. */
  reticleGeometry?: ReticleGeometryStrategy | (() => ReticleGeometryStrategy);
  /** Borrowed counts for this render only; copy them before retaining. */
  onReticleGeometryWork?: (work: Readonly<ReticleGeometryWork>) => void;
}) {
  const requestedGeometry = options.reticleGeometry ?? 'original';
  const validateGeometry = (strategy: ReticleGeometryStrategy) => {
    if (strategy !== 'original' && strategy !== 'visible-only') throw Error(`Unsupported reticle geometry strategy: ${strategy}`);
    return strategy;
  };
  if (typeof requestedGeometry !== 'function') validateGeometry(requestedGeometry);
  const menuComposition = options.menuComposition ? parseMenuRecipe(options.menuComposition) : undefined;
  const parent = options.canvas.parentElement;if (!parent) throw new Error('3D gameplay canvas needs a host.');
  const root = document.createElement('section');root.className = 'hyperfocus-gameplay-3d';root.setAttribute('aria-label', 'Game information');
  const reticle = document.createElement('span');reticle.textContent = '+';reticle.setAttribute('aria-hidden', 'true');reticle.hidden = true;reticle.style.cssText = 'position:absolute;z-index:4;pointer-events:none;transform:translate(-50%,-50%);color:white;font:24px/1 monospace;text-shadow:0 0 3px #000,0 0 3px #000';parent.append(reticle);
  const geometryWork = options.onReticleGeometryWork ? { geometryReads: 0, positionWrites: 0, hiddenSkipped: 0 } : undefined;
  const originalPosition = (geometry?: Readonly<CanvasGeometry>) => {
    reticle.style.left = `${(geometry?.left ?? options.canvas.offsetLeft) + (geometry?.width ?? options.canvas.clientWidth) / 2}px`;reticle.style.top = `${(geometry?.top ?? options.canvas.offsetTop) + (geometry?.height ?? options.canvas.clientHeight) / 2}px`;
    if (geometryWork) { geometryWork.geometryReads = geometry ? 0 : 4;geometryWork.positionWrites = 2; }
  };
  const positionStrategies = { original: (_visible: boolean, geometry?: Readonly<CanvasGeometry>) => originalPosition(geometry), 'visible-only': (visible: boolean, geometry?: Readonly<CanvasGeometry>) => {
    if (visible) originalPosition(geometry);else if (geometryWork) geometryWork.hiddenSkipped = 1;
  } };
  const positionReticle = typeof requestedGeometry === 'function'
    ? (visible: boolean, geometry?: Readonly<CanvasGeometry>) => positionStrategies[validateGeometry(requestedGeometry())](visible, geometry)
    : positionStrategies[requestedGeometry];
  const style = document.createElement('style');style.textContent = `.hyperfocus-gameplay-3d{position:absolute;pointer-events:none;z-index:4;color:#fff;font:14px/1.45 system-ui;box-sizing:border-box;padding:clamp(12px,2vw,28px);display:flex;flex-direction:column;justify-content:space-between;overflow:hidden}.hyperfocus-gameplay-3d *{box-sizing:border-box}.hf3d-heading{align-self:flex-start;max-width:min(520px,100%);padding:14px 18px;border:1px solid #ffffff36;border-radius:12px;background:#0c162bdb;box-shadow:0 6px 24px #0003}.hf3d-heading h1{font-size:clamp(18px,2.2vw,28px);line-height:1.15;margin:0 0 6px}.hf3d-heading p{margin:5px 0;max-width:60ch}.hf3d-status{color:#ffe2a0}.hf3d-metrics{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px}.hf3d-bottom{align-self:center;max-width:100%;text-align:center;padding:10px 14px;border-radius:12px;background:#0c162be8}.hf3d-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}.hf3d-actions button{pointer-events:auto;min-height:44px;padding:10px 16px;background:#f4eee1;color:#132335;border:2px solid transparent;border-radius:8px;font:700 14px system-ui;cursor:pointer}.hf3d-actions button:focus-visible{outline:3px solid #65d9ff;outline-offset:3px}.hf3d-actions button:disabled{opacity:.5;cursor:pointer}.hf3d-overlay{align-self:center;max-width:min(560px,100%);border:1px solid #ffffff45;background:#102139ed;border-radius:16px;padding:clamp(16px,3vw,32px);text-align:center;box-shadow:0 16px 70px #0007}.hf3d-overlay h2{font-size:clamp(24px,3vw,38px);line-height:1.1;margin:0 0 12px}.hf3d-overlay p{margin:0;white-space:pre-line}.hf3d-hint{margin:0 0 8px;font-size:13px}@media(max-width:500px){.hyperfocus-gameplay-3d{padding:10px;font-size:12px}.hf3d-heading{padding:10px 12px}.hf3d-heading h1{font-size:18px}.hf3d-overlay{padding:15px}.hf3d-overlay h2{font-size:25px}.hf3d-actions button{padding:8px 12px;font-size:12px}.hf3d-bottom{padding:8px}.hf3d-metrics{gap:4px 10px}}`;
  const heading = document.createElement('header'), title = document.createElement('h1'), objective = document.createElement('p'), status = document.createElement('p'), metrics = document.createElement('div');
  heading.className = 'hf3d-heading';status.className = 'hf3d-status';status.setAttribute('role', 'status');metrics.className = 'hf3d-metrics';heading.append(title, objective, status, metrics);
  const overlay = document.createElement('div'), overlayTitle = document.createElement('h2'), overlayBody = document.createElement('p');overlay.className = 'hf3d-overlay';overlay.append(overlayTitle, overlayBody);
  const bottom = document.createElement('footer'), hint = document.createElement('p'), buttons = document.createElement('div');bottom.className = 'hf3d-bottom';hint.className = 'hf3d-hint';buttons.className = 'hf3d-actions';bottom.append(hint, buttons);root.append(style, heading, overlay, bottom);
  const priorPosition = parent.style.position;if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';options.canvas.insertAdjacentElement('afterend', root);root.hidden = true;
  const menuDock = createFightMenuDock({ host: parent, footer: bottom, playerOnly: true });
  const practicePages = createPracticePages({ actions: buttons });
  const controlReference = createCombatReference(), reference = controlReference.element;parent.append(reference);
  const priorRows = parent.style.gridTemplateRows, priorMinHeight = options.canvas.style.minHeight;
  if (options.constrainHost) { parent.style.gridTemplateRows = 'minmax(0, 1fr) auto';options.canvas.style.minHeight = '0'; }
  style.textContent += '.hyperfocus-gameplay-3d[data-layout=flow]{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;overflow:visible;background:#0c162b;padding:12px}.hyperfocus-gameplay-3d[data-layout=flow] .hf3d-heading{background:transparent;border:0;padding:6px}.hyperfocus-gameplay-3d[data-layout=flow] .hf3d-heading h1{font-size:20px}.hyperfocus-gameplay-3d[data-layout=flow] .hf3d-bottom{align-self:center;background:transparent;padding:6px}.hyperfocus-gameplay-3d[data-layout=overlay]{justify-content:center;align-items:center;gap:0}.hyperfocus-gameplay-3d[data-layout=overlay] .hf3d-overlay{width:min(560px,100%);border-bottom:0;border-radius:16px 16px 0 0;box-shadow:none}.hyperfocus-gameplay-3d[data-layout=overlay] .hf3d-bottom{width:min(560px,100%);border:1px solid #ffffff45;border-top:0;border-radius:0 0 16px 16px;background:#102139ed;padding:0 24px 24px}.hyperfocus-gameplay-3d[data-overlay=true][data-layout=flow]{grid-template-columns:1fr}@media(max-width:600px){.hyperfocus-gameplay-3d[data-layout=flow]{grid-template-columns:1fr}}.hyperfocus-gameplay-3d[data-layout=flow]>*{width:100%;max-width:100%}.hyperfocus-gameplay-3d[data-layout=flow] .hf3d-heading,.hyperfocus-gameplay-3d[data-layout=flow] .hf3d-overlay,.hyperfocus-gameplay-3d[data-layout=flow] .hf3d-bottom{box-shadow:none}.hyperfocus-gameplay-3d[hidden],.hyperfocus-gameplay-3d [hidden]{display:none}';
  const actions = new Set<string>(), heldActions = new Set<string>();let signature = '', actionSignature = '';
  const navigation = menuComposition ? undefined : createTitleNavigation({ host: parent, root, command(action) { actions.add(action);options.onInteract(); } });
  const contextMenu = menuComposition ? undefined : createContextMenu({ host: parent, root, command(action) { actions.add(action);options.onInteract(); } });
  const renderMenus = (presentation: GameplayPresentation3D) => {
    const titleActive = navigation?.render(presentation), contextActive = contextMenu?.render(presentation);
    const active = !!(titleActive || contextActive);
    root.dataset.gameMenu = String(active);
    bottom.hidden = active || !presentation.hint && !presentation.actions?.length;
    overlay.hidden = active || !presentation.overlay;
    heading.hidden = active || !!presentation.overlay || !(presentation.title || presentation.objective || presentation.status || presentation.metrics?.length);
  };
  const ranges = new Map<string, ReturnType<typeof createGameplayRange>>();
  style.textContent += '.hf3d-actions .hf3d-action-range{pointer-events:auto;display:flex;flex-direction:column;gap:4px;min-width:0;width:100%;padding:6px 0;grid-column:1/-1;order:3;font-size:13px}.hf3d-action-range input{width:100%;min-width:0;min-height:32px;accent-color:#e7aa63}.hf3d-action-range input:focus-visible{outline:2px solid #e7aa63;outline-offset:3px}';
  style.textContent += fightScreenStyles;
  const composition = menuComposition ? createMenuComposition({ root, recipe: menuComposition }) : undefined;
  const controlDisclosure = document.createElement('details'), controlSummary = document.createElement('summary');
  controlDisclosure.className = 'hf3d-control-disclosure';controlSummary.textContent = 'Controls';controlDisclosure.append(controlSummary);
  let returnFocus: ReturnType<typeof setTimeout> | undefined;
  controlSummary.addEventListener('click', () => {
    if (!controlDisclosure.open) return;
    clearTimeout(returnFocus);
    // Wait for native disclosure activation; closing settings resumes canvas controls.
    returnFocus = setTimeout(() => {
      if (!controlDisclosure.open && document.activeElement === controlSummary && root.isConnected && !root.hidden && root.dataset.stage === 'fight') options.canvas.focus({ preventScroll: true });
    }, 0);
  });
  style.textContent += '.hyperfocus-gameplay-3d[data-practice=true] .hf3d-bottom{max-width:calc(100% - 24px)!important;width:min(680px,100%);max-height:38%;overflow:auto;margin-bottom:48px;align-self:flex-start}.hyperfocus-gameplay-3d[data-practice=true] .hf3d-hint{white-space:pre-line;text-align:left}.hyperfocus-gameplay-3d[data-practice=true] .hf3d-actions{gap:5px}.hyperfocus-gameplay-3d[data-practice=true] .hf3d-actions button{min-height:36px;padding:6px 10px;font-size:12px}';
  const releaseHeld = () => { heldActions.clear();for (const button of buttons.querySelectorAll('[data-held=true]')) button.setAttribute('aria-pressed', 'false'); };
  window.addEventListener('blur', releaseHeld);
  style.textContent += '.hf3d-metrics>span{display:flex;flex-direction:column;gap:3px;min-width:120px}.hf3d-metrics meter{width:100%;height:14px;accent-color:#65d9ff}.hf3d-actions button[data-held=true]{touch-action:none}.hf3d-actions button[aria-pressed=true]{background:#65d9ff}';
  const layout = () => { const flow = !root.dataset.stage && (options.canvas.clientWidth < 600 || root.dataset.overlay !== 'true');root.dataset.layout = flow ? 'flow' : 'overlay';root.style.position = flow ? 'relative' : 'absolute';root.style.left = flow ? '0' : `${options.canvas.offsetLeft}px`;root.style.top = flow ? '0' : `${options.canvas.offsetTop}px`;root.style.width = `${options.canvas.clientWidth}px`;root.style.height = flow ? 'auto' : `${options.canvas.clientHeight}px`; };
  const observer = new ResizeObserver(layout);observer.observe(options.canvas);layout();
  return {
    openPracticeSetup() { contextMenu?.openPracticeSetup(); },
    setResultStatus(text: string) { contextMenu?.setResultStatus(text); },
    command(action: string) { actions.add(action);options.onInteract(); },
    readActions() { return new Set([...actions, ...heldActions]); },
    acknowledgeActions() { actions.clear(); },
    render(presentation: GameplayPresentation3D | undefined, geometry?: Readonly<CanvasGeometry>) {
      reticle.hidden = !presentation?.reticle;
      if (geometryWork) geometryWork.geometryReads = geometryWork.positionWrites = geometryWork.hiddenSkipped = 0;
      positionReticle(!!presentation?.reticle, geometry);
      if (geometryWork) options.onReticleGeometryWork!(geometryWork);
      if (!presentation) { root.hidden = true;menuDock.render(false);heldActions.clear();return; }root.hidden = false;
      const titleScreen = !!navigation && presentation.layout === 'menu' && !!presentation.actions?.some(item => item.action === 'match:start');
      const dockActive = !navigation && !titleScreen && parent.classList.contains('hf-fight-stage') && ['menu', 'result'].includes(presentation.layout ?? '') && !presentation.actions?.some(item => item.action.startsWith('guide:') && item.action !== 'guide:start');
      const next = JSON.stringify(presentation);if (next === signature) { menuDock.render(dockActive);renderMenus(presentation);return; }signature = next;
      const practice = presentation.actions?.some(action => action.action === 'practice:reset') ?? false;
      if (practice !== (root.dataset.practice === 'true')) controlDisclosure.open = false;
      root.dataset.practice = String(practice);controlSummary.textContent = practice ? 'Practice settings and controls' : 'Controls';
      root.dataset.paused = String(presentation.actions?.some(action => action.action === 'pause') === true);
      controlReference.render(presentation.hint ?? '', root.dataset.paused === 'true' && !!presentation.hint);
      if (presentation.layout) root.dataset.stage = presentation.layout;else delete root.dataset.stage;
      parent.dataset.fightPhase = presentation.layout ?? '';
      if (presentation.layout === 'fight') {
        if (buttons.parentElement !== controlDisclosure || (practice ? buttons.nextElementSibling !== hint : hint.nextElementSibling !== buttons)) controlDisclosure.append(...(practice ? [buttons, hint] : [hint, buttons]));
        if (controlDisclosure.parentElement !== bottom) bottom.append(controlDisclosure);
      } else if (buttons.parentElement === controlDisclosure) { bottom.append(hint, buttons);controlDisclosure.remove(); }
      root.dataset.overlay = String(Boolean(presentation.overlay));heading.hidden = Boolean(presentation.overlay) || !(presentation.title || presentation.objective || presentation.status || presentation.metrics?.length);layout();title.textContent = presentation.title;objective.textContent = presentation.objective ?? '';objective.hidden = !presentation.objective;
      status.textContent = presentation.status ?? '';status.hidden = !presentation.status;hint.textContent = presentation.hint ?? '';hint.hidden = root.dataset.paused === 'true' || !presentation.hint || (Boolean(presentation.overlay) && presentation.layout !== 'menu');
      metrics.replaceChildren(...(presentation.metrics ?? []).map(item => {
        const span = document.createElement('span');span.textContent = `${item.label}: ${item.value}`;
        if (item.current !== undefined && item.max !== undefined) { const meter = document.createElement('meter');meter.min = 0;meter.max = item.max;meter.value = item.current;meter.setAttribute('aria-label', item.label);meter.setAttribute('aria-valuetext', item.value);span.append(meter); }
        return span;
      }));
      overlay.hidden = !presentation.overlay;overlayTitle.textContent = presentation.overlay?.title ?? '';overlayBody.textContent = presentation.overlay?.body ?? '';overlayBody.hidden = !presentation.overlay?.body;
      if (presentation.layout === 'menu' && presentation.overlay?.title === 'Touch of Death') {
        const top = document.createElement('span'), bottom = document.createElement('span');
        top.className = bottom.className = 'hf3d-wordmark-line';top.textContent = 'Touch of ';bottom.textContent = 'Death';overlayTitle.replaceChildren(top, bottom);
        const lines = (presentation.overlay.body ?? '').split('\n'), context = document.createElement('strong');
        if (menuComposition) lines.splice(1, lines.length, menuComposition.supportCopy);
        context.className = 'hf3d-menu-context';context.textContent = lines.shift() ?? '';overlayBody.replaceChildren(context, document.createTextNode('\n' + lines.join('\n')));
      }
      const orderedActions = [...(presentation.actions ?? [])].sort((a, b) => Number(['match:replay', 'match:rematch'].includes(b.action)) - Number(['match:replay', 'match:rematch'].includes(a.action)));
      const nextActions = JSON.stringify(orderedActions);
      if (nextActions !== actionSignature) {
        actionSignature = nextActions;
        const focused = document.activeElement instanceof HTMLButtonElement ? document.activeElement.dataset.gameplayAction : undefined;
        const retained = new Set((presentation.actions ?? []).map(item => item.action));
        for (const child of [...buttons.children]) if (child instanceof HTMLElement && !retained.has(child.dataset.gameplayAction ?? '')) { heldActions.delete(child.dataset.gameplayAction ?? '');ranges.delete(child.dataset.gameplayAction ?? '');child.remove(); }
        for (const [index, item] of orderedActions.entries()) {
          const prior = [...buttons.children].find(child => child instanceof HTMLElement && child.dataset.gameplayAction === item.action);
          if (prior && (prior instanceof HTMLButtonElement) === Boolean(item.range)) { prior.remove();ranges.delete(item.action);heldActions.delete(item.action); }
          if (item.range) {
            let range = ranges.get(item.action);
            if (!range) { range = createGameplayRange({ item, actions, onInteract: options.onInteract });ranges.set(item.action, range); }
            range.render(item);
            if (buttons.children[index] !== range.element) buttons.insertBefore(range.element, buttons.children[index] ?? null);
            continue;
          }
          const existing = [...buttons.children].find(child => child instanceof HTMLButtonElement && child.dataset.gameplayAction === item.action);
          if (existing instanceof HTMLButtonElement) {
            existing.textContent = item.label;existing.setAttribute('aria-label', item.label);existing.disabled = item.disabled === true;
            if (existing.disabled) { heldActions.delete(item.action);existing.setAttribute('aria-pressed', 'false'); }
            if (buttons.children[index] !== existing) buttons.insertBefore(existing, buttons.children[index] ?? null);
            continue;
          }
          const button = document.createElement('button');button.type = 'button';button.textContent = item.label;button.setAttribute('aria-label', item.label);button.disabled = item.disabled === true;button.dataset.gameplayAction = item.action;
          if (item.held) {
            button.dataset.held = 'true';button.setAttribute('aria-pressed', 'false');
            const press = () => { if (button.disabled) return;heldActions.add(item.action);button.setAttribute('aria-pressed', 'true');options.onInteract(); };
            const release = () => { heldActions.delete(item.action);button.setAttribute('aria-pressed', 'false'); };
            button.addEventListener('pointerdown', event => { if (event.button !== 0) return;event.preventDefault();button.focus();button.setPointerCapture(event.pointerId);press(); });
            for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) button.addEventListener(event, release);
            button.addEventListener('keydown', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault();press(); } });
            button.addEventListener('keyup', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault();release(); } });
          } else button.addEventListener('click', () => { actions.add(item.action);options.onInteract(); });
          buttons.insertBefore(button, buttons.children[index] ?? null);
        }
        if (focused) for (const child of buttons.children) if (child instanceof HTMLButtonElement && child.dataset.gameplayAction === focused) child.focus({ preventScroll: true });
      }
      practicePages.render(practice);
      menuDock.render(dockActive);
      renderMenus(presentation);
    },
    dispose() { contextMenu?.dispose();navigation?.dispose();composition?.dispose();controlReference.dispose();practicePages.dispose();menuDock.dispose();clearTimeout(returnFocus);observer.disconnect();window.removeEventListener('blur', releaseHeld);reticle.remove();root.remove();parent.style.position = priorPosition;if (options.constrainHost) { parent.style.gridTemplateRows = priorRows;options.canvas.style.minHeight = priorMinHeight; }actions.clear();heldActions.clear(); },
  };
}
