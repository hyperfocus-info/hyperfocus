import { validateTutorialDefinition, validateTutorialFeedback, validateTutorialTiming, type TutorialDefinition, type TutorialFeedback, type TutorialTiming } from './session';
import { tutorialStyles } from './styles';

/** A single objective, visible input/timing, observed progress and actionable feedback. */
export function createTutorialCoach(options: { parent: HTMLElement; watch(): void; retry(): void; back(): void; next?(): void; hints?: boolean; hintsChanged?(visible: boolean): void }) {
  const element = document.createElement('aside');element.className = 'hf-tutorial';element.hidden = true;element.setAttribute('aria-label', 'Tutorial');
  element.innerHTML = `<header><p data-tutorial-eyebrow></p><h2></h2><p data-tutorial-objective></p></header>
    <ol aria-label="Lesson progress"></ol><section data-tutorial-current><h3></h3><p data-tutorial-input></p><p data-tutorial-when></p><p data-tutorial-success></p></section>
    <section data-tutorial-timing><p></p><div class="hf-tutorial-track" role="meter"><span></span><i></i></div><strong></strong></section>
    <section data-tutorial-feedback role="status" aria-live="polite" aria-atomic="true"><strong></strong><p></p></section>
    <p data-tutorial-reward role="status" aria-live="polite" hidden></p>
    <footer><button type="button" data-tutorial-watch>Watch example</button><button type="button" data-tutorial-hints aria-pressed="true">Button hints: On</button><button type="button" data-tutorial-retry>Retry</button><button type="button" data-tutorial-next>Continue</button><button type="button" data-tutorial-back data-menu-back>Back to practice</button></footer>`;
  const style = document.createElement('style');style.textContent = tutorialStyles;element.append(style);options.parent.append(element);
  const find = <T extends HTMLElement>(selector: string) => element.querySelector<T>(selector)!;
  const watch = find<HTMLButtonElement>('[data-tutorial-watch]'), hints = find<HTMLButtonElement>('[data-tutorial-hints]'), retry = find<HTMLButtonElement>('[data-tutorial-retry]'), next = find<HTMLButtonElement>('[data-tutorial-next]'), back = find<HTMLButtonElement>('[data-tutorial-back]');
  watch.onclick = options.watch;retry.onclick = options.retry;next.onclick = () => options.next?.();back.onclick = options.back;
  let definitionId = '', steps: HTMLElement[] = [], expanded = false, hintsVisible = options.hints ?? true;
  const showHints = () => { element.dataset.hints = String(hintsVisible);hints.setAttribute('aria-pressed', String(hintsVisible));hints.textContent = `Button hints: ${hintsVisible ? 'On' : 'Off'}`; };
  hints.onclick = () => { hintsVisible = !hintsVisible;showHints();options.hintsChanged?.(hintsVisible); };showHints();
  const text = (node: HTMLElement, value: string) => { if (node.textContent !== value) node.textContent = value; };
  element.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault();options.back(); }
    if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault();
    const targets = [watch, hints, retry, next, back].filter(button => !button.hidden && !button.disabled);
    const index = targets.findIndex(button => button === document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(event.key)) {
      event.preventDefault();targets[(index + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : targets.length - 1)) % targets.length]?.focus();
    }
    if (expanded && event.key === 'Tab' && (event.shiftKey ? index === 0 : index === targets.length - 1)) { event.preventDefault();targets[event.shiftKey ? targets.length - 1 : 0]?.focus(); }
  });
  return {
    element,
    open() { expanded = true;element.hidden = false;element.dataset.expanded = 'true';back.hidden = false;const target = watch.hidden ? back : watch.disabled ? retry : watch;target.focus();target.scrollIntoView?.({ block: 'nearest' }); },
    close() { expanded = false;element.dataset.expanded = 'false';delete element.dataset.completionPrompt; },
    get expanded() { return expanded; },
    get hintsVisible() { return hintsVisible; },
    focusCompletion() { if (!next.hidden && !next.disabled) { element.dataset.completionPrompt = 'true';next.focus({ preventScroll: true });next.scrollIntoView?.({ block: 'nearest' }); } },
    get focused() { return expanded || element.contains(document.activeElement); },
    render(input: { definition: TutorialDefinition; completed: readonly string[]; complete: boolean; feedback?: TutorialFeedback; timing?: TutorialTiming; watching?: boolean; paused?: boolean; watchFinished?: boolean; demonstrationInput?: string; playbackLabel?: string; returnLabel?: string; nextLabel?: string; continueLabel?: string; watchLabel?: string; retryLabel?: string; reward?: string; automaticRetry?: boolean; completionChoices?: boolean; context?: string; demonstration?: { unavailable: string } }) {
      validateTutorialDefinition(input.definition);
      if (input.feedback) validateTutorialFeedback(input.feedback);
      if (input.timing) validateTutorialTiming(input.timing);
      const ids = input.definition.steps.map(step => step.id);
      if (input.completed.some(id => !ids.includes(id)) || input.complete && (input.watching || ids.some(id => !input.completed.includes(id)))) throw Error('Tutorial completion requires observed player steps; demonstrations cannot complete an attempt.');
      if (input.demonstration && !input.demonstration.unavailable.trim()) throw Error('An unavailable demonstration needs an explanation.');
      const { definition } = input;element.hidden = false;element.dataset.lesson = definition.id;element.dataset.watching = String(!!input.watching);element.dataset.complete = String(input.complete);
      if (!input.complete) delete element.dataset.completionPrompt;
      text(find('[data-tutorial-eyebrow]'), input.watching ? ['Watch', input.playbackLabel, 'Example only'].filter(Boolean).join(' • ') : input.context ?? 'Tutorial');text(find('h2'), definition.title);text(find('[data-tutorial-objective]'), definition.objective);
      if (definitionId !== definition.id) {
        definitionId = definition.id;steps = definition.steps.map(step => { const li = document.createElement('li');li.textContent = step.label;return li; });find('ol').replaceChildren(...steps);
      }
      const incomplete = definition.steps.findIndex(step => !input.completed.includes(step.id)), current = incomplete < 0 ? definition.steps.length - 1 : incomplete;
      steps.forEach((node, index) => { const done = input.completed.includes(definition.steps[index]!.id);node.dataset.complete = String(done);node.setAttribute('aria-label', `${index + 1}. ${definition.steps[index]!.instruction}${done ? ': complete' : index === current ? ': current' : ''}`);if (!done && index === current) node.setAttribute('aria-current', 'step');else node.removeAttribute('aria-current'); });
      const step = definition.steps[current]!;text(find('[data-tutorial-current] h3'), input.complete ? definition.completion : step.instruction);
      text(find('[data-tutorial-input]'), input.watching && input.demonstrationInput ? input.demonstrationInput : step.input);text(find('[data-tutorial-when]'), step.timing);text(find('[data-tutorial-success]'), `Success: ${step.success}`);
      find('[data-tutorial-input]').hidden = find('[data-tutorial-when]').hidden = find('[data-tutorial-success]').hidden = input.complete;
      const timing = input.timing;find('[data-tutorial-timing]').hidden = !timing || input.complete;
      if (timing) {
        const total = timing.total, value = Math.max(0, Math.min(total, timing.value)), meter = find('[role=meter]');
        find('[data-tutorial-timing]').dataset.window = !timing.window ? 'cue' : timing.value < timing.window.start ? 'waiting' : timing.value > timing.window.end ? 'closed' : 'open';
        text(find('[data-tutorial-timing] p'), timing.label);text(find('[data-tutorial-timing] strong'), timing.cue);
        meter.setAttribute('aria-label', timing.label);meter.setAttribute('aria-valuemin', '0');meter.setAttribute('aria-valuemax', String(total));meter.setAttribute('aria-valuenow', String(value));meter.setAttribute('aria-valuetext', timing.cue);
        find('[role=meter] i').style.left = `${value / total * 100}%`;
        const window = timing.window;find('[role=meter] span').hidden = !window;
        if (window) {
          const start = Math.max(0, Math.min(total, window.start)), end = Math.max(start, Math.min(total, window.end));
          Object.assign(find('[role=meter] span').style, { left: `${start / total * 100}%`, width: `${(end - start) / total * 100}%` });
        }
      }
      const message = input.watching ? input.feedback?.message ?? (input.paused ? 'Example paused' : 'Watch the inputs and timing') : input.complete ? definition.completion : input.feedback?.message ?? (input.demonstration ? 'Example unavailable' : '');
      const correction = input.watching ? input.feedback?.correction ?? 'The example does not count toward your progress. Return to your attempt when ready.' : input.complete ? input.nextLabel ?? 'Complete. Retry to practice again, or continue.' : input.feedback?.correction ?? input.demonstration?.unavailable ?? '';
      find('[data-tutorial-feedback]').hidden = !message;text(find('[data-tutorial-feedback] strong'), message);text(find('[data-tutorial-feedback] p'), correction);
      find('[data-tutorial-reward]').hidden = !input.reward;text(find('[data-tutorial-reward]'), input.reward ?? '');
      watch.textContent = input.watching ? input.paused ? 'Resume example' : 'Pause example' : input.watchLabel ?? 'Watch example';watch.disabled = !!input.demonstration;
      const moveFocus = input.watchFinished && document.activeElement === watch;watch.hidden = !!input.watchFinished || !!input.completionChoices && input.complete;hints.hidden = !!input.completionChoices && input.complete;
      watch.title = input.demonstration?.unavailable ?? '';retry.textContent = input.watching ? 'Replay example' : input.complete ? input.retryLabel ?? 'Retry' : 'Retry';next.hidden = !options.next || !input.complete || !!input.watching;
      retry.hidden = !!input.automaticRetry && !expanded && !input.watching && !input.complete;next.textContent = input.continueLabel ?? 'Continue';
      back.hidden = !expanded && !input.watching;back.textContent = input.watching ? 'Try it yourself' : input.returnLabel ?? 'Return to task';
      back.dataset.primary = String(!!input.watchFinished);if (moveFocus) back.focus();
    },
    dispose() { element.remove(); },
  };
}
