import { createGameSelect } from '@hyperfocus/ui/game-menu';
import { prepareUploadRaster, drawUploadRaster } from '@hyperfocus/touch-of-death/uploads/browser';
import type { UploadRaster } from '@hyperfocus/touch-of-death/uploads/raster';
import { imageReportReasons, type UploadCommand, type UploadMetadata, type UploadResponse } from '@hyperfocus/touch-of-death/uploads/protocol';
import type { PublicProfile } from '@hyperfocus/touch-of-death/appearance/profile';
import { roomProfileLabel } from '../network/profile-label.ts';

/** Uploaded pictures belong to the account host, never the authored scene or replay. */
export function createRoomUploadsPanel(options: {
  host: HTMLElement; request(command: UploadCommand): Promise<UploadResponse>; onInteract(): void;
  prepare?: typeof prepareUploadRaster; draw?: typeof drawUploadRaster;
  textureSlots?: readonly { id: string; label: string }[];
}) {
  const section = document.createElement('section');section.className = 'hf-uploads';
  section.innerHTML = `<h3>Uploaded pictures</h3><p>Choose a PNG or JPEG under 2 MiB. Pictures are resized to 128 pixels. Shared pictures are visible immediately and have not been reviewed. You can hide or report images.</p><label><input type="checkbox" data-upload-hide> Hide uploaded images</label><label>Choose image<input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" data-upload-file></label><canvas data-upload-preview hidden aria-label="Local image preview"></canvas><div class="hf-network-buttons"><button type="button" data-upload-submit>Share image</button><button type="button" data-upload-cancel>Cancel preview</button><button type="button" data-upload-list>Refresh my uploads</button></div><ul data-upload-own></ul><label>Room member<button type="button" data-upload-person></button></label><button type="button" data-upload-gallery>View shared pictures</button><ul data-upload-gallery-list></ul><canvas data-upload-view hidden aria-label="Selected uploaded picture"></canvas><p data-upload-status role="status" aria-live="polite"></p><button type="button" data-upload-retry hidden>Retry failed action</button>`;
  const style = document.createElement('style');style.textContent = '.hf-uploads{border-top:1px solid #526676;margin-top:16px;padding-top:8px}.hf-uploads canvas{max-width:128px;max-height:128px;background:#263442;border:1px solid #526676}.hf-uploads ul{padding:0;list-style:none}.hf-uploads li{overflow-wrap:anywhere;padding:6px 0}.hf-uploads input[type=file],.hf-uploads select{max-width:100%;box-sizing:border-box}.hf-uploads button{min-height:44px}.hf-uploads label:has(input[type=checkbox]){display:flex;flex-direction:row;align-items:center;gap:8px;min-height:44px}.hf-uploads input[type=checkbox]{width:20px;min-width:20px;height:20px;min-height:20px;margin:0;accent-color:#6adbdc}';section.append(style);options.host.append(section);
  const find = <T extends HTMLElement>(key: string) => section.querySelector<T>(`[data-upload-${key}]`)!;
  const file = find<HTMLInputElement>('file'), hide = find<HTMLInputElement>('hide'), person = createGameSelect({ element: find<HTMLButtonElement>('person'), ariaLabel: 'Room member', options: [] });
  hide.parentElement!.append(' for this session');
  const preview = find<HTMLCanvasElement>('preview'), viewed = find<HTMLCanvasElement>('view');
  const reportLabel = document.createElement('label'), reportButton = document.createElement('button');reportButton.type = 'button';reportButton.dataset.uploadReason = '';
  reportLabel.textContent = 'Image report reason';reportLabel.append(reportButton);
  const reportReason = createGameSelect({ element: reportButton, ariaLabel: 'Image report reason', options: imageReportReasons.map(value => ({ value, label: value[0]!.toUpperCase() + value.slice(1) })) });
  find('gallery-list').before(reportLabel);
  const equipLabel = document.createElement('label'), equipButton = document.createElement('button'), equippedList = document.createElement('ul'), equipHint = document.createElement('p');
  equipButton.type = 'button';equipLabel.textContent = 'Picture slot';equipButton.dataset.uploadSlot = '';equippedList.dataset.uploadEquipment = '';equipLabel.append(equipButton);
  const equipSlot = createGameSelect({ element: equipButton, ariaLabel: 'Picture slot', options: (options.textureSlots ?? []).map(slot => ({ value: slot.id, label: slot.label })) });
  equipLabel.hidden = equipHint.hidden = !options.textureSlots?.length;find('own').before(equipLabel, equipHint);find('own').after(equippedList);
  const prepare = options.prepare ?? prepareUploadRaster, draw = options.draw ?? drawUploadRaster;
  let active = false, local = '', generation = 0, viewGeneration = 0, decoding: AbortController | undefined, draft: UploadRaster | undefined;
  let busy = false, revision: number | undefined, own: UploadMetadata[] = [], gallery: UploadMetadata[] = [], galleryOwner = '', viewedOwner = '';
  let failed: UploadCommand | undefined, peopleKey = '', blocked = new Set<string>(), localBlocks = new Set<string>();
  let equipment: Record<string, string> = {}, canEquip = false, identity = '', emblemEnabled = false;
  const clearCanvas = (canvas: HTMLCanvasElement) => { canvas.hidden = true;canvas.width = 1;canvas.height = 1; };
  function controls() {
    file.disabled = busy || hide.checked;find<HTMLButtonElement>('submit').disabled = busy || !draft || hide.checked || own.length >= 4;
    find<HTMLButtonElement>('cancel').disabled = !draft && !decoding;find<HTMLButtonElement>('list').disabled = busy;
    find<HTMLButtonElement>('gallery').disabled = busy || hide.checked || !person.value;
    find('retry').hidden = !failed;find<HTMLButtonElement>('retry').disabled = busy || hide.checked;
    reportReason.disabled = busy;
    equipSlot.disabled = busy || !canEquip;
    for (const button of section.querySelectorAll<HTMLButtonElement>('[data-upload-read], [data-upload-remove], [data-upload-report]')) button.disabled = busy || hide.checked && button.hasAttribute('data-upload-read');
    for (const button of section.querySelectorAll<HTMLButtonElement>('[data-upload-equip], [data-upload-unequip]')) button.disabled = busy || !canEquip || revision === undefined;
  }
  const slots = () => [...(options.textureSlots ?? []), ...(emblemEnabled ? [{ id: 'profile-emblem', label: 'Profile emblem' }] : [])];
  function refreshSlots() {
    equipSlot.setOptions(slots().map(slot => ({ value: slot.id, label: slot.label })));
    equipLabel.hidden = equipHint.hidden = !slots().length;
  }
  function equipmentRows() {
    equippedList.replaceChildren(...slots().map(slot => {
      const row = document.createElement('li'), label = document.createElement('span');label.textContent = `${slot.label}: ${equipment[slot.id] ? 'equipped' : 'no print'}. `;row.append(label);
      if (equipment[slot.id]) { const remove = document.createElement('button');remove.type = 'button';remove.dataset.uploadUnequip = slot.id;remove.textContent = `Clear ${slot.label}`;remove.addEventListener('click', () => { options.onInteract();if (revision !== undefined) void run({ type: 'upload-equip', requestId: crypto.randomUUID(), expectedRevision: revision, slotId: slot.id, uploadId: '' }); });row.append(remove); }
      return row;
    }));controls();
  }
  function rows(items: UploadMetadata[], ownerId: string, target: HTMLElement, editable: boolean) {
    target.replaceChildren(...items.map(item => {
      const row = document.createElement('li'), label = document.createElement('span');label.textContent = `${item.status === 'pending' ? 'Shared (unreviewed)' : item.status === 'approved' ? 'Reviewed' : 'Rejected'} · ${item.width} × ${item.height}${item.reason ? ` · ${item.reason}` : ''}`;row.append(label);row.title = item.id;
      if (item.status !== 'rejected') { const view = document.createElement('button');view.type = 'button';view.dataset.uploadRead = item.id;view.textContent = 'Preview';view.addEventListener('click', () => { options.onInteract();void run({ type: 'upload-read', requestId: crypto.randomUUID(), ownerId, uploadId: item.id }); });row.append(view); }
      if (editable) { const remove = document.createElement('button');remove.type = 'button';remove.dataset.uploadRemove = item.id;remove.textContent = 'Remove';remove.addEventListener('click', () => { options.onInteract();if (revision !== undefined) void run({ type: 'upload-remove', requestId: crypto.randomUUID(), expectedRevision: revision, uploadId: item.id }); });row.append(remove); }
      else {
        const report = document.createElement('button');report.type = 'button';report.dataset.uploadReport = item.id;report.textContent = 'Report image';
        report.addEventListener('click', () => { options.onInteract();const reason = imageReportReasons.find(value => value === reportReason.value);if (reason) void run({ type: 'upload-report', requestId: crypto.randomUUID(), ownerId, uploadId: item.id, reason }); });row.append(report);
      }
      if (editable && item.status !== 'rejected' && slots().length) {
        const equip = document.createElement('button');equip.type = 'button';equip.dataset.uploadEquip = item.id;equip.textContent = 'Wear in selected slot';
        equip.addEventListener('click', () => { options.onInteract();if (revision !== undefined && canEquip) void run({ type: 'upload-equip', requestId: crypto.randomUUID(), expectedRevision: revision, slotId: equipSlot.value, uploadId: item.id }); });row.append(equip);
      }
      return row;
    }));controls();
  }
  async function run(command: UploadCommand): Promise<boolean> {
    if (!active || busy) return false;
    const token = generation, viewToken = viewGeneration;busy = true;failed = undefined;find('status').textContent = 'Waiting for the host…';controls();
    try {
      const response = await options.request(command);if (!active || token !== generation) return false;
      if ((command.type === 'upload-read' || command.type === 'upload-list') && viewToken !== viewGeneration) return false;
      if (response.error) throw new Error(response.error);
      if (command.type === 'upload-report') { clearCanvas(viewed);find('status').textContent = 'Image report saved on this host. It has not been reviewed. Use Block to stop seeing this person’s content.';return true; }
      const foreign = response.ownerId !== local;
      if (foreign && (hide.checked || blocked.has(response.ownerId) || localBlocks.has(response.ownerId) || response.ownerId !== person.value)) return false;
      if (foreign && response.uploads.some(item => item.status === 'rejected')) throw new Error('The host returned a removed picture.');
      if (!foreign) { emblemEnabled = response.emblemEnabled === true;refreshSlots();revision = response.revision;own = response.uploads;equipment = response.equipment ?? {};rows(own, local, find('own'), true);equipmentRows(); }
      else { gallery = response.uploads;galleryOwner = response.ownerId;rows(gallery, galleryOwner, find('gallery-list'), false); }
      if (response.raster && !hide.checked) { draw({ canvas: viewed, raster: response.raster });viewed.hidden = false;viewedOwner = response.ownerId; }
      if (command.type === 'upload-submit') { draft = undefined;file.value = '';clearCanvas(preview); }
      if (command.type === 'upload-remove') clearCanvas(viewed);
      find('status').textContent = command.type === 'upload-submit' ? 'Shared with the room. This picture has not been reviewed.' : command.type === 'upload-remove' ? 'Picture removed.' : response.uploads.length ? 'Pictures loaded. Choose Preview to view one.' : 'No pictures are available.';
      if (command.type === 'upload-equip') find('status').textContent = command.slotId === 'profile-emblem' ? command.uploadId ? 'Profile emblem saved on this host.' : 'Profile emblem removed.' : command.uploadId ? 'Print saved on this host. It uses your top color and appears in this room’s fights.' : 'Print removed from this slot.';
      return true;
    } catch (cause) { if (active && token === generation) { failed = command;find('status').textContent = cause instanceof Error ? cause.message : 'This action failed. Retry, or refresh your uploads.'; }return false; }
    finally { if (token === generation) { busy = false;controls(); } }
  }
  function cancelDraft() { decoding?.abort();decoding = undefined;draft = undefined;if (failed?.type === 'upload-submit') failed = undefined;file.value = '';clearCanvas(preview);controls(); }
  file.addEventListener('change', () => {
    options.onInteract();const selected = file.files?.[0];cancelDraft();
    if (!selected || hide.checked) return;
    const abort = new AbortController();decoding = abort;find('status').textContent = 'Preparing a local preview…';controls();
    void prepare({ file: selected, signal: abort.signal }).then(raster => {
      if (decoding !== abort || abort.signal.aborted || !active || hide.checked) return;
      draft = raster;draw({ canvas: preview, raster });preview.hidden = false;find('status').textContent = 'Local preview only. Share image when ready.';
    }).catch(cause => { if (decoding === abort && !abort.signal.aborted) find('status').textContent = cause instanceof Error ? cause.message : 'Could not prepare this image.'; }).finally(() => { if (decoding === abort) { decoding = undefined;controls(); } });
  });
  find('cancel').addEventListener('click', () => { options.onInteract();cancelDraft();find('status').textContent = busy ? 'Local preview cleared. An action already sent to the host may still complete.' : 'Local preview cancelled.'; });
  find('list').addEventListener('click', () => { options.onInteract();void run({ type: 'upload-list', requestId: crypto.randomUUID(), ownerId: '' }); });
  find('submit').addEventListener('click', () => { options.onInteract();void (async () => { if (revision === undefined && !await run({ type: 'upload-list', requestId: crypto.randomUUID(), ownerId: '' })) return;if (draft && revision !== undefined) await run({ type: 'upload-submit', requestId: crypto.randomUUID(), expectedRevision: revision, raster: draft }); })(); });
  find('retry').addEventListener('click', () => { options.onInteract();if (failed) void run(failed); });
  find('gallery').addEventListener('click', () => { options.onInteract();clearCanvas(viewed);void run({ type: 'upload-list', requestId: crypto.randomUUID(), ownerId: person.value }); });
  person.element.addEventListener('change', () => { viewGeneration++;clearCanvas(viewed);gallery = [];galleryOwner = '';find('gallery-list').replaceChildren();controls(); });
  hide.addEventListener('change', () => { options.onInteract();viewGeneration++;if (hide.checked) { cancelDraft();clearCanvas(viewed);gallery = [];find('gallery-list').replaceChildren(); }controls(); });
  return {
    render(input: { active: boolean; identity?: string; localUserId: string; members: readonly { userId: string }[]; visible?: boolean; blocked?: readonly string[]; profiles?: readonly PublicProfile[]; canEquip?: boolean }) {
      if ((!input.active && active) || local !== input.localUserId || identity !== (input.identity ?? '')) { generation++;cancelDraft();clearCanvas(viewed);own = [];gallery = [];revision = undefined;emblemEnabled = false;refreshSlots();failed = undefined;busy = false;localBlocks.clear();find('own').replaceChildren();find('gallery-list').replaceChildren(); }
      identity = input.identity ?? '';active = input.active;local = input.localUserId;section.hidden = !active || input.visible === false;blocked = new Set(input.blocked ?? []);canEquip = input.canEquip ?? false;
      equipHint.textContent = canEquip ? 'Wear a shared picture on clothing or as a profile emblem. Clothing color tints prints; emblems keep their colors.' : 'Change prints between fights, before joining a queue.';
      if (revision === undefined) { equipment = {};equippedList.replaceChildren(); }
      if (viewedOwner !== local && (blocked.has(viewedOwner) || localBlocks.has(viewedOwner) || !input.members.some(member => member.userId === viewedOwner))) clearCanvas(viewed);
      if (blocked.has(galleryOwner) || localBlocks.has(galleryOwner) || galleryOwner && !input.members.some(member => member.userId === galleryOwner)) { viewGeneration++;gallery = [];galleryOwner = '';find('gallery-list').replaceChildren(); }
      const members = input.members.filter(member => member.userId !== local && !blocked.has(member.userId) && !localBlocks.has(member.userId));
      const key = JSON.stringify([members, input.profiles]);if (peopleKey !== key) { peopleKey = key;person.setOptions(members.map(member => ({ value: member.userId, label: roomProfileLabel(member.userId, input.profiles), description: member.userId }))); }
      controls();
    },
    mount(host: HTMLElement) { if (section.parentElement !== host) host.append(section); },
    setHidden(value: boolean) { if (hide.checked !== value) { hide.checked = value;hide.dispatchEvent(new Event('change')); } },
    block(userId: string, enabled: boolean) { viewGeneration++;enabled ? localBlocks.add(userId) : localBlocks.delete(userId);if (enabled) { if (viewedOwner === userId) clearCanvas(viewed);if (galleryOwner === userId) find('gallery-list').replaceChildren(); } },
    invalidate(ownerId: string) {
      viewGeneration++;if (viewedOwner === ownerId) clearCanvas(viewed);
      if (galleryOwner === ownerId) { gallery = [];find('gallery-list').replaceChildren(); }
      if (local === ownerId) { own = [];revision = undefined;find('own').replaceChildren(); }
      if (local === ownerId) { equipment = {};equippedList.replaceChildren(); }
      find('status').textContent = 'Pictures changed or are no longer available. Refresh to view the current list.';controls();
    },
    get focused() { return person.focused || reportReason.focused || equipSlot.focused || section.contains(document.activeElement); },
    get visibility() { return { hidden: hide.checked, blocked: [...new Set([...blocked, ...localBlocks])] }; },
    dispose() { active = false;generation++;cancelDraft();clearCanvas(viewed);person.dispose();reportReason.dispose();equipSlot.dispose();section.remove(); },
  };
}
