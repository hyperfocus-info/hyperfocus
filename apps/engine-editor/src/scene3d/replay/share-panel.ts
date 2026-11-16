import type { ReplayArchive } from './controller.ts';

/** Sharing is an explicit file upload; recipient playback uses the ordinary replay validator. */
export function createReplaySharePanel(options: { canvas: HTMLCanvasElement; create(archive: ReplayArchive): Promise<string>;
  download(archive: ReplayArchive): Promise<void>; prepare?(): Promise<void>; open(file: File): Promise<void>; cancelOpen(): void; interact(): void }) {
  const host = document.createElement('section');host.className = 'tod-replay-share';
  host.innerHTML = `<dialog aria-labelledby="tod-share-title"><p class="tod-share-eyebrow">Keep the exchange</p><h2 id="tod-share-title">Give them the controls.</h2>
    <p data-share-description>A replay link opens just before the decisive exchange. Your friend can watch, then take over either fighter and try another answer.</p>
    <p data-share-privacy>Creating a link uploads this replay with fighter names and wardrobe choices. Anyone with the link can open it; links expire 7 days after creation. Uploaded pictures are excluded.</p>
    <div class="tod-share-actions"><button type="button" data-share-create>Create replay link</button><button type="button" data-share-save>Download replay file</button><button type="button" data-share-watch hidden>Watch shared exchange</button></div>
    <label data-share-link-label hidden>Replay link<input data-share-link readonly></label><button type="button" data-share-copy hidden>Copy link</button>
    <p data-share-status role="status" aria-live="polite"></p><button type="button" data-share-close>Back</button></dialog>`;
  const style = document.createElement('style');style.textContent = `
    .tod-replay-share dialog{box-sizing:border-box;max-width:min(560px,calc(100vw - 32px));max-height:88dvh;overflow:auto;padding:clamp(22px,4vw,36px);background:var(--game-panel,#151a1e);color:var(--game-text,#f4eee4);border:1px solid var(--game-border,#505453);border-radius:12px;font:14px/1.5 var(--game-font,system-ui)}
    .tod-replay-share dialog::backdrop{background:#05090dd9}.tod-replay-share h2{font-size:30px;line-height:1.1;margin:8px 0 18px}.tod-share-eyebrow{text-transform:uppercase;letter-spacing:.13em;color:var(--game-accent,#e5bd83);font-size:11px}.tod-replay-share p{max-width:46ch}.tod-replay-share [data-share-privacy]{color:var(--game-muted,#b3b7b7);font-size:12px}
    .tod-share-actions{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0 12px}.tod-replay-share button{min-height:44px;padding:10px 15px;border:1px solid var(--game-border,#6b6e68);border-radius:5px;background:#252d30;color:inherit;font:inherit;cursor:pointer}.tod-replay-share [data-share-create],.tod-replay-share [data-share-watch]{background:var(--game-accent,#e5bd83);color:#1a1d20;border-color:transparent;font-weight:650}.tod-replay-share button:disabled{opacity:.5;cursor:wait}.tod-replay-share :focus-visible{outline:2px solid #f7cd7d;outline-offset:3px}
    .tod-replay-share input{box-sizing:border-box;display:block;width:100%;min-height:44px;background:#0c1115;color:inherit;border:1px solid #626966;border-radius:5px;padding:9px;margin:5px 0 10px;font:inherit}.tod-replay-share [hidden]{display:none!important}.tod-replay-share [data-share-status]{min-height:1.5em;color:var(--game-accent,#e5bd83)}
  `;
  host.append(style);options.canvas.parentElement?.append(host);
  const find = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  const dialog = find<HTMLDialogElement>('dialog'), status = find('[data-share-status]'), field = find<HTMLInputElement>('[data-share-link]');
  const create = find<HTMLButtonElement>('[data-share-create]'), save = find<HTMLButtonElement>('[data-share-save]'), watch = find<HTMLButtonElement>('[data-share-watch]');
  let archive: ReplayArchive | undefined, busy = false, disposed = false, generation = 0, returnFocus: HTMLElement | null = null;
  function dismiss() { generation++;dialog.close();(returnFocus?.isConnected ? returnFocus : options.canvas).focus({ preventScroll: true }); }
  async function run(action: () => Promise<void>) {
    if (busy || disposed) return;busy = true;const attempt = ++generation;create.disabled = save.disabled = watch.disabled = true;options.interact();
    try { await action(); } catch (cause) { if (!disposed && attempt === generation) status.textContent = cause instanceof Error ? cause.message : 'Could not open this exchange. Try again.'; }
    finally { busy = false;if (!disposed) create.disabled = save.disabled = watch.disabled = false; }
  }
  create.onclick = () => void run(async () => {
    if (!archive) return;const attempt = generation;status.textContent = 'Creating your replay link…';const link = await options.create(archive);
    if (disposed || attempt !== generation) return;field.value = link;find('[data-share-link-label]').hidden = false;find('[data-share-copy]').hidden = false;
    status.textContent = 'Link ready. Copy it to share the exchange.';field.focus();field.select();
  });
  save.onclick = () => void run(async () => { if (!archive) return;const attempt = generation;await options.download(archive);if (!disposed && attempt === generation) status.textContent = 'Replay download started.'; });
  find('[data-share-copy]').onclick = () => void run(async () => {
    try { await navigator.clipboard.writeText(field.value);status.textContent = 'Replay link copied.'; }
    catch { field.focus();field.select();status.textContent = 'Select the link and copy it with your device’s copy command.'; }
  });
  function cancel() { if (busy && !watch.hidden) options.cancelOpen();dismiss(); }
  find('[data-share-close]').onclick = cancel;dialog.addEventListener('cancel', event => { event.preventDefault();cancel(); });
  dialog.addEventListener('keydown', event => event.stopPropagation());
  const id = new URLSearchParams(location.hash.slice(1)).get('replay');
  if (id) {
    create.hidden = save.hidden = find('[data-share-privacy]').hidden = true;watch.hidden = false;
    find('#tod-share-title').textContent = 'Someone saved you a moment.';
    find('[data-share-description]').textContent = 'Watch this shared exchange, then take over either fighter. This replay needs the same game version.';
    watch.onclick = () => void run(async () => {
      const attempt = generation;status.textContent = 'Opening the shared exchange…';
      const response = await fetch(`/tod-replay-share?id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw Error((await response.text()).slice(0, 200));
      const blob = await response.blob();if (blob.size > 524288) throw Error('This shared replay exceeds the link size limit.');
      if (disposed || attempt !== generation) return;await options.prepare?.();
      if (disposed || attempt !== generation) return;await options.open(new File([blob], 'shared-exchange.pb'));
      if (!disposed && attempt === generation) { history.replaceState(null, '', location.pathname + location.search);dismiss(); }
    });
    dialog.showModal();watch.focus();
  }
  return {
    show(value: ReplayArchive) {
      if (disposed || busy) return;options.interact();returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      archive = structuredClone(value);field.value = '';status.textContent = '';generation++;
      find('#tod-share-title').textContent = 'Give them the controls.';create.hidden = save.hidden = find('[data-share-privacy]').hidden = false;watch.hidden = true;
      find('[data-share-description]').textContent = 'A replay link opens just before the decisive exchange. Your friend can watch, then take over either fighter and try another answer.';
      find('[data-share-link-label]').hidden = find('[data-share-copy]').hidden = true;dialog.showModal();create.focus();
    },
    dispose() { disposed = true;generation++;dialog.close();host.remove(); },
  };
}
