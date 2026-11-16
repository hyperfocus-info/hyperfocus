import { createGameSelect } from '@hyperfocus/ui/game-menu';
import { imageReportReasons, readUploadResponse, type UploadCommand, type UploadResponse } from '@hyperfocus/touch-of-death/uploads/protocol';

/** Reports current opponent equipment without fetching or displaying pixels. */
export function createLiveImageReport(options: {
  request(command: UploadCommand): Promise<UploadResponse>; onInteract(): void; canvas: HTMLElement;
  textureSlots?: readonly { id: string; label: string }[];
}) {
  const element = document.createElement('section');element.className = 'hf-live-image-report';element.hidden = true;
  element.innerHTML = '<button type="button" data-image-report-open>Report opponent image</button><div data-image-report-body hidden><p>The fight continues while this form is open.</p><label>Equipped image<button type="button" data-image-report-image></button></label><label>Reason<button type="button" data-image-report-reason></button></label><button type="button" data-image-report-send>Send report</button><button type="button" data-image-report-refresh>Refresh images</button><button type="button" data-image-report-close>Close</button><p role="status" aria-live="polite"></p></div>';
  const find = <T extends HTMLElement>(name: string) => element.querySelector<T>(`[data-image-report-${name}]`)!;
  const body = find('body'), image = createGameSelect({ element: find<HTMLButtonElement>('image'), ariaLabel: 'Equipped image', options: [] }), reason = createGameSelect({ element: find<HTMLButtonElement>('reason'), ariaLabel: 'Image report reason', options: imageReportReasons.map(value => ({ value, label: value[0]!.toUpperCase() + value.slice(1) })) }), send = find<HTMLButtonElement>('send'), status = element.querySelector<HTMLElement>('[role=status]')!;
  const style = document.createElement('style');style.textContent = '.hf-live-image-report{max-width:100%}.hf-live-image-report [data-image-report-body]{max-width:340px;max-height:45vh;overflow:auto}.hf-live-image-report label{display:flex;flex-wrap:wrap;gap:6px}.hf-live-image-report select{min-width:0;max-width:100%}.hf-live-image-report button{min-height:44px;white-space:normal}.hf-live-image-report p{font-size:12px;white-space:normal}';element.append(style);
  let identity = '', ownerId = '', epoch = 0, busy = false, blocked = false, retry: Extract<UploadCommand, { type: 'upload-report' }> | undefined;
  function controls() { send.disabled = busy || !image.value || blocked;image.disabled = reason.disabled = busy;find<HTMLButtonElement>('refresh').disabled = busy; }
  function reset() { const focused = element.contains(document.activeElement);epoch++;busy = false;retry = undefined;send.textContent = 'Send report';image.setOptions([]);status.textContent = '';body.hidden = true;controls();if (focused) options.canvas.focus({ preventScroll: true }); }
  async function refresh() {
    const token = ++epoch;busy = true;retry = undefined;send.textContent = 'Send report';image.setOptions([]);status.textContent = 'Loading equipped image details...';controls();
    try {
      if (blocked) throw new Error('Images are blocked. New reports require access to the image; no report was sent.');
      const command: UploadCommand = { type: 'upload-list', requestId: crypto.randomUUID(), ownerId };
      const result = readUploadResponse(await options.request(command));if (token !== epoch) return;
      if (result.error) throw new Error(result.error);if (result.ownerId !== ownerId || result.requestId !== command.requestId) throw new Error('Image owner changed. Refresh and try again.');
      const entries = Object.entries(result.equipment ?? {}), ids = [...new Set(entries.map(([, id]) => id))];
      image.setOptions(ids.map(id => {
        const item = result.uploads.find(value => value.id === id && value.status !== 'rejected');if (!item) throw new Error('Equipped image is unavailable.');
        return { value: id, label: `${entries.filter(([, value]) => value === id).map(([slot]) => slot === 'profile-emblem' ? 'Profile emblem' : options.textureSlots?.find(value => value.id === slot)?.label ?? 'Clothing print').join(', ')}: ${item.status === 'pending' ? 'shared, unreviewed' : 'reviewed'}` };
      }));
      status.textContent = ids.length ? 'Choose the image and a reason.' : 'No equipped images are available to report.';
    } catch (cause) { if (token === epoch) { image.setOptions([]);status.textContent = cause instanceof Error ? cause.message : 'Could not load image details.'; } }
    finally { if (token === epoch) { busy = false;controls(); } }
  }
  find('open').addEventListener('click', () => { if (!identity) return;options.onInteract();body.hidden = false;void refresh(); });
  find('refresh').addEventListener('click', () => { options.onInteract();void refresh(); });
  find('close').addEventListener('click', () => { options.onInteract();reset();options.canvas.focus({ preventScroll: true }); });
  for (const select of [image, reason]) select.element.addEventListener('change', () => { retry = undefined;send.textContent = 'Send report';status.textContent = ''; });
  send.addEventListener('click', () => {
    if (!identity || busy || blocked || !image.value) return;const selectedReason = imageReportReasons.find(value => value === reason.value);if (!selectedReason) return;
    options.onInteract();const token = epoch, command = retry ?? { type: 'upload-report', requestId: crypto.randomUUID(), ownerId, uploadId: image.value, reason: selectedReason };
    retry = command;busy = true;status.textContent = 'Saving report...';controls();
    void Promise.resolve().then(() => options.request(command)).then(raw => {
      if (token !== epoch) return;const result = readUploadResponse(raw);if (result.requestId !== command.requestId || result.ownerId !== command.ownerId) throw new Error('Report receipt does not match.');if (result.error) throw new Error(result.error);
      retry = undefined;image.setOptions([]);status.textContent = 'Report saved on this host. It has not been reviewed.';
    }).catch(cause => { if (token === epoch) { status.textContent = cause instanceof Error ? cause.message : 'Report failed. Try again.';send.textContent = 'Retry report'; } }).finally(() => { if (token === epoch) { busy = false;controls(); } });
  });
  return { element,
    render(input: { identity: string; ownerId: string; blocked: boolean }) {
      if (identity !== input.identity || ownerId !== input.ownerId || blocked !== input.blocked) reset();identity = input.identity;ownerId = input.ownerId;blocked = input.blocked;element.hidden = !identity || !ownerId;controls();
    },
    invalidate(changedOwner: string) { if (changedOwner === ownerId) reset(); },
    get focused() { return image.focused || reason.focused || element.contains(document.activeElement); },
    dispose() { identity = '';reset();image.dispose();reason.dispose();element.remove(); },
  };
}
