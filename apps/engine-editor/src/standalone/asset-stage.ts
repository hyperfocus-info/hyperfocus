import { attachGameModal } from '@hyperfocus/ui/game-menu';
import { gameMenuStyles } from '../scene3d/game-menu/theme.ts';

/** The simulation retains the initiating input while required feature media loads.
 * A failed attempt stays on the menu and can retry without reloading the project. */
export function createPlayableAssetStage(options: { host: HTMLElement; prepare?: () => Promise<void>; onCancel(): void; slowAfterMs?: number }) {
  let ready = !options.prepare, operation: Promise<void> | undefined, disposed = false;
  let generation = 0, cancelPending: (() => void) | undefined;
  let continuePending: (() => void) | undefined, slow = false, slowTimer: ReturnType<typeof setTimeout> | undefined;
  let failure: unknown;
  let dialog: HTMLDialogElement | undefined, status: HTMLParagraphElement | undefined, retry: HTMLButtonElement | undefined;
  let continueButton: HTMLButtonElement | undefined;
  let modal: ReturnType<typeof attachGameModal> | undefined;
  function present() {
    if (!dialog) {
      dialog = document.createElement('dialog');dialog.className = 'hf-asset-stage';
      dialog.setAttribute('aria-label', 'Preparing play');
      const style = document.createElement('style');style.textContent = gameMenuStyles + '.hf-asset-stage{width:min(32rem,calc(100vw - 2rem))}';
      const title = document.createElement('h2');title.textContent = 'Preparing play';
      status = document.createElement('p');status.setAttribute('role', 'status');status.setAttribute('aria-live', 'polite');
      retry = document.createElement('button');retry.type = 'button';retry.textContent = 'Retry loading';
      retry.className = 'hf-game-action';retry.dataset.priority = 'primary';
      retry.onclick = () => { failure = undefined;void prepare().catch(() => undefined); };
      continueButton = document.createElement('button');continueButton.type = 'button';continueButton.className = 'hf-game-action';
      continueButton.textContent = 'Continue with available sound';continueButton.hidden = true;
      continueButton.onclick = () => continuePending?.();
      const back = document.createElement('button');back.type = 'button';back.textContent = 'Back to menu';back.className = 'hf-game-action';
      function cancel() { generation++;clearTimeout(slowTimer);cancelPending?.();continuePending = undefined;failure = undefined;operation = undefined;modal?.close();options.onCancel(); }
      back.onclick = cancel;
      modal = attachGameModal({ dialog, onRequestClose: cancel });
      dialog.append(style, title, status, retry, continueButton, back);options.host.append(dialog);
    }
    status!.textContent = failure ? 'Required fight audio could not load. Check your connection and retry.' : slow ? 'Sound is taking longer than expected. You can continue now; sounds become available as they finish loading.' : 'Preparing fight audio…';
    retry!.hidden = !failure;
    continueButton!.hidden = !slow || !!failure;
    if (!dialog.open) modal!.open(failure ? retry : dialog.querySelector<HTMLButtonElement>('button:last-child')!);
    if (failure) retry!.focus();
  }
  function prepare(): Promise<void> {
    if (disposed) return Promise.reject(Error('Asset stage has been disposed.'));
    if (ready) return Promise.resolve();
    if (failure) { present();return Promise.reject(failure); }
    if (!operation) {
      slow = false;
      present();
      const request = ++generation;
      const cancelled = new Promise<never>((_, reject) => { cancelPending = () => reject(Error('Fight loading was cancelled.')); });
      const continued = new Promise<void>(resolve => { continuePending = resolve; });
      slowTimer = setTimeout(() => { if (!disposed && request === generation && !ready && !failure) { slow = true;present(); } }, options.slowAfterMs ?? 8000);
      operation = Promise.race([Promise.resolve().then(options.prepare), cancelled, continued]).then(() => {
        if (disposed || request !== generation) throw Error('Asset stage is no longer active.');ready = true;modal?.close();
      }).catch(cause => { if (!disposed && request === generation) { failure = cause;present(); }throw cause; })
        .finally(() => { if (request === generation) { clearTimeout(slowTimer);operation = undefined;cancelPending = undefined;continuePending = undefined; } });
    }
    return operation;
  }
  return { prepare, ready: () => ready,
    request() { if (!ready && !failure && !disposed) void prepare().catch(() => undefined); },
    requireReady() { if (!ready) { this.request();throw Error('Wait for fight audio to finish loading, then retry this action.'); } },
    dispose() { disposed = true;generation++;clearTimeout(slowTimer);cancelPending?.();continuePending = undefined;modal?.dispose();dialog?.remove(); },
  };
}
