import { createGuestCredentials, type HostedDemo } from './discovery.ts';
import { createRecoveryFile, downloadRecoveryFile, readRecoveryFile, requestRecovery, type RecoveryFile } from './recovery.ts';

/** Account credentials belong to this host session, never the authored project. */
export function createRecoveryPanel(options: { parent: HTMLElement; changed(): void; download?: typeof downloadRecoveryFile }) {
  const root = document.createElement('details');root.hidden = true;root.dataset.guestRecovery = '';
  root.innerHTML = `<summary>Keep or restore your fighter</summary>
    <p>A recovery file keeps access to this host's fighter, rating and shared pictures. Keep it private: anyone with the file can use your account.</p>
    <button type="button" data-recovery-save>Save recovery key</button>
    <div data-recovery-pending hidden><p>Download the file, keep it somewhere safe, then activate it. Activation replaces any older key.</p>
      <button type="button" data-recovery-download>Download key file</button>
      <button type="button" data-recovery-confirm disabled>I saved the file — activate key</button>
      <button type="button" data-recovery-cancel>Cancel key setup</button></div>
    <label>Recovery key file<input type="file" accept=".json,application/json" data-recovery-file></label>
    <p>Restoring signs out this fighter's other sessions, including active fights. This browser switches to the restored fighter. Its current guest is not merged.</p>
    <button type="button" data-recovery-restore disabled>Restore this fighter</button>
    <p role="status" data-recovery-status></p>`;
  options.parent.append(root);
  const button = (name: string) => root.querySelector<HTMLButtonElement>(`[data-recovery-${name}]`)!;
  const input = root.querySelector<HTMLInputElement>('[data-recovery-file]')!;
  const status = root.querySelector<HTMLElement>('[data-recovery-status]')!;
  const pendingBox = root.querySelector<HTMLElement>('[data-recovery-pending]')!;
  let host: HostedDemo | undefined, pending: RecoveryFile | undefined, imported: RecoveryFile | undefined;
  let controller: AbortController | undefined, epoch = 0, busy = false, downloaded = false, disposed = false;
  function sync() {
    button('save').disabled = busy || !!pending;input.disabled = busy || !!pending;
    button('download').disabled = busy;button('confirm').disabled = busy || !downloaded;
    button('restore').disabled = busy || !imported || !!pending;pendingBox.hidden = !pending;
    options.changed();
  }
  function cancel() {
    epoch++;controller?.abort();controller = undefined;busy = false;
    pending = undefined;imported = undefined;downloaded = false;input.value = '';status.textContent = '';sync();
  }
  async function run(operation: (signal: AbortSignal, current: HostedDemo) => Promise<void>) {
    if (!host || busy || disposed) return;
    busy = true;const turn = ++epoch;controller = new AbortController();sync();status.textContent = 'Working…';
    try { await operation(controller.signal, host); }
    catch (error) { if (!disposed && turn === epoch) status.textContent = error instanceof Error ? error.message : 'Could not finish. Keep your recovery file and retry.'; }
    finally { if (!disposed && turn === epoch) { busy = false;controller = undefined;sync(); } }
  }
  button('save').addEventListener('click', () => { void run(async (signal, current) => {
    await createGuestCredentials({ host: current, signal })();
    const file = createRecoveryFile(current.guestSessionPath);
    await requestRecovery({ host: current, operation: 'prepare', key: file.key, signal });signal.throwIfAborted();
    pending = file;downloaded = false;status.textContent = 'Key prepared. Download and activate it before leaving.';
  }); });
  button('download').addEventListener('click', () => {
    if (!pending || busy) return;
    try { (options.download ?? downloadRecoveryFile)(pending);downloaded = true;status.textContent = 'Check that the file was saved, then activate the key.'; }
    catch { status.textContent = 'Download failed. Try Download key file again.'; }
    sync();
  });
  button('confirm').addEventListener('click', () => { if (!pending || !downloaded) return;const key = pending.key;void run(async (signal, current) => {
    await requestRecovery({ host: current, operation: 'confirm', key, signal });signal.throwIfAborted();
    pending = undefined;downloaded = false;status.textContent = 'Recovery key active. Keep the file private. Older recovery keys no longer work.';
  }); });
  button('cancel').addEventListener('click', () => { cancel();status.textContent = 'Setup closed. If activation was already sent, keep the downloaded file; it may be active.'; });
  input.addEventListener('change', () => { const file = input.files?.[0];imported = undefined;if (!file) { sync();return; }void run(async (signal, current) => {
    if (file.size > 2048) throw new Error('Recovery file is too large.');
    const text = await file.text();signal.throwIfAborted();
    imported = readRecoveryFile({ text, origin: current.guestSessionPath });status.textContent = 'Key file ready. Restore only if you want to switch this browser to that fighter.';
  }); });
  button('restore').addEventListener('click', () => { if (!imported) return;const key = imported.key;void run(async (signal, current) => {
    await requestRecovery({ host: current, operation: 'restore', key, signal });signal.throwIfAborted();
    imported = undefined;input.value = '';status.textContent = 'Fighter restored. Join a room to load the saved profile and rating. Keep your recovery file for next time.';
  }); });
  return {
    get busy() { return busy; },
    setHost(next: HostedDemo | undefined) { if (next !== host) { cancel();status.textContent = '';host = next; }root.hidden = !next?.recoveryPath; },
    cancel,
    dispose() { disposed = true;cancel();root.remove(); },
  };
}
