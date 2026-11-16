import { drawUploadRaster } from './browser.ts';
import { readModerationCommand, type ModerationCommand, type ModerationResponse, type UploadReportMetadata } from './moderation-protocol.ts';
import type { UploadMetadata } from './protocol.ts';

/** Human decisions use displayed revisions; previewing and report resolution never approve images. */
export function createModerationPanel(options: { host: HTMLElement; request(command: ModerationCommand): Promise<ModerationResponse>; draw?: typeof drawUploadRaster }) {
  const section = document.createElement('section');
  section.innerHTML = `<nav aria-label="Moderation queues"><button type="button" data-moderation-images aria-pressed="true">Pictures</button><button type="button" data-moderation-reports-tab aria-pressed="false">Reports</button></nav>
    <section data-moderation-image-section><h2>Picture review</h2><button type="button" data-moderation-owners>Load picture owners</button><button type="button" data-moderation-owners-next disabled>Next owners</button><label>Owner<select data-moderation-owner></select></label><button type="button" data-moderation-load-owner>Load owner</button><p data-moderation-owner-revision></p><label>Picture<select data-moderation-upload></select></label><p data-moderation-picture-detail></p><button type="button" data-moderation-preview>Preview selected picture</button><canvas data-moderation-canvas hidden aria-label="Selected picture preview"></canvas><label>Decision reason (required for rejection)<input data-moderation-reason maxlength="512" autocomplete="off"></label><button type="button" data-moderation-approve>Approve picture</button><button type="button" data-moderation-reject>Reject picture</button><p>Approval requires previewing this picture at the displayed revision. Rejection removes access to its pixels. Refresh after a revision conflict.</p></section>
    <section data-moderation-report-section hidden><h2>Image reports</h2><button type="button" data-moderation-reporters>Load reporters</button><button type="button" data-moderation-reporters-next disabled>Next reporters</button><label>Reporter<select data-moderation-reporter></select></label><button type="button" data-moderation-load-reports>Load reports</button><p data-moderation-report-revision></p><label>Report<select data-moderation-report></select></label><p data-moderation-report-detail></p><button type="button" data-moderation-report-image>Review reported picture</button><label>Resolution reason<input data-moderation-resolution maxlength="512" autocomplete="off"></label><button type="button" data-moderation-reviewed>Mark reviewed</button><button type="button" data-moderation-dismissed>Dismiss report</button><p>Resolving a report records your decision. It does not approve or reject the picture; review that separately.</p></section>
    <p data-moderation-status role="status" aria-live="polite">Load a queue to begin. Images are only downloaded when you choose Preview.</p><p data-moderation-error role="alert"></p><button type="button" data-moderation-retry hidden>Retry failed action</button>`;
  options.host.append(section);
  const find = <T extends HTMLElement>(key: string) => section.querySelector<T>(`[data-moderation-${key}]`)!;
  const owner = find<HTMLSelectElement>('owner'), upload = find<HTMLSelectElement>('upload'), reporter = find<HTMLSelectElement>('reporter'), report = find<HTMLSelectElement>('report');
  const canvas = find<HTMLCanvasElement>('canvas'), reason = find<HTMLInputElement>('reason'), resolution = find<HTMLInputElement>('resolution');
  let busy = false, disposed = false, generation = 0, selection = 0, mode: 'images' | 'reports' = 'images';
  let ownerId = '', ownerRevision = 0, reporterId = '', reportRevision = 0, ownerCursor = '', reporterCursor = '', previewKey = '';
  let uploads: UploadMetadata[] = [], reports: UploadReportMetadata[] = [], failed: ModerationCommand | undefined;
  const imageKey = () => `${ownerId}:${ownerRevision}:${upload.value}`;
  function clearPreview() { selection++;previewKey = '';canvas.hidden = true;canvas.width = 1;canvas.height = 1; }
  function controls() {
    for (const button of section.querySelectorAll<HTMLButtonElement>('button')) button.disabled = busy;
    for (const select of [owner, upload, reporter, report]) select.disabled = busy;
    find<HTMLButtonElement>('owners-next').disabled ||= !ownerCursor;find<HTMLButtonElement>('reporters-next').disabled ||= !reporterCursor;
    find<HTMLButtonElement>('load-owner').disabled ||= !owner.value;find<HTMLButtonElement>('load-reports').disabled ||= !reporter.value;
    find<HTMLButtonElement>('preview').disabled ||= !upload.value || uploads.find(item => item.id === upload.value)?.status === 'rejected';
    find<HTMLButtonElement>('approve').disabled ||= !upload.value || previewKey !== imageKey();find<HTMLButtonElement>('reject').disabled ||= !upload.value;
    for (const name of ['reviewed', 'dismissed', 'report-image']) find<HTMLButtonElement>(name).disabled ||= !report.value;
    find('retry').hidden = !failed;
  }
  function choices(select: HTMLSelectElement, items: readonly { id: string; label: string }[]) { const previous = select.value;select.replaceChildren(...items.map(item => { const option = document.createElement('option');option.value = item.id;option.textContent = item.label;option.title = item.id;return option; }));select.value = items.some(item => item.id === previous) ? previous : items[0]?.id ?? ''; }
  function detail() {
    const item = uploads.find(item => item.id === upload.value);find('picture-detail').textContent = item ? `${item.status} · ${item.width} × ${item.height}${item.reason ? ` · ${item.reason}` : ''}` : 'No pictures loaded.';
    const chosen = reports.find(item => item.id === report.value);find('report-detail').textContent = chosen ? `Owner: ${chosen.ownerId} · Picture: ${chosen.uploadId} · Reason: ${chosen.reason} · Status: ${chosen.status}${chosen.resolution ? ` · Resolution: ${chosen.resolution}` : ''}${chosen.reviewerId ? ` · Reviewer: ${chosen.reviewerId}` : ''}` : 'No reports loaded.';
    controls();
  }
  function tab(next: typeof mode) { mode = next;clearPreview();find('image-section').hidden = mode !== 'images';find('report-section').hidden = mode !== 'reports';find('images').setAttribute('aria-pressed', String(mode === 'images'));find('reports-tab').setAttribute('aria-pressed', String(mode === 'reports'));controls(); }
  async function run(raw: ModerationCommand): Promise<boolean> {
    if (busy || disposed) return false;let command: ModerationCommand;
    try { command = readModerationCommand(raw); } catch (cause) { find('error').textContent = cause instanceof Error ? cause.message : 'Check the decision fields.';return false; }
    busy = true;failed = undefined;find('error').textContent = '';find('status').textContent = 'Waiting for the host…';controls();const attempt = generation, selected = selection;
    try {
      const result = await options.request(command);if (disposed || attempt !== generation) return false;
      if (result.requestId !== command.requestId) throw new Error('The host returned a different request. Retry this action.');if (result.error) throw new Error(result.error);
      if (command.type === 'moderation-owners') { clearPreview();ownerId = '';uploads = [];choices(upload, []);find('owner-revision').textContent = '';ownerCursor = result.nextCursor;choices(owner, result.owners.map(id => ({ id, label: id }))); }
      else if (command.type === 'moderation-reporters') { clearPreview();reporterId = '';reports = [];choices(report, []);find('report-revision').textContent = '';reporterCursor = result.nextCursor;choices(reporter, result.reporters.map(id => ({ id, label: id }))); }
      else if (command.type === 'moderation-owner' || command.type === 'moderation-review' || command.type === 'moderation-preview') {
        if (result.ownerId !== command.ownerId) throw new Error('The host returned a different owner. Refresh the owner.');
        if (selected !== selection) return false;
        if (command.type === 'moderation-preview' && (selected !== selection || command.uploadId !== upload.value || command.ownerId !== ownerId)) return false;
        clearPreview();ownerId = result.ownerId;ownerRevision = result.revision;uploads = result.uploads;
        if (![...owner.options].some(option => option.value === ownerId)) { const option = document.createElement('option');option.value = ownerId;option.textContent = ownerId;option.title = ownerId;owner.append(option); }owner.value = ownerId;
        choices(upload, uploads.map(item => ({ id: item.id, label: `${item.id} · ${item.status}` })));find('owner-revision').textContent = `Owner: ${ownerId} · Revision ${ownerRevision}`;
        if (command.type === 'moderation-preview') {
          if (!result.raster || result.uploadId !== command.uploadId) throw new Error('This picture is no longer available. Refresh the owner.');
          upload.value = command.uploadId;(options.draw ?? drawUploadRaster)({ canvas, raster: result.raster });canvas.hidden = false;previewKey = imageKey();
        }
      } else if (command.type === 'moderation-reports' || command.type === 'moderation-resolve') {
        if (result.reporterId !== command.reporterId) throw new Error('The host returned a different reporter. Refresh the reports.');
        reporterId = result.reporterId;reportRevision = result.revision;reports = result.reports;choices(report, reports.map(item => ({ id: item.id, label: `${item.id} · ${item.status}` })));find('report-revision').textContent = `Reporter: ${reporterId} · Revision ${reportRevision}`;
      }
      detail();find('status').textContent = command.type === 'moderation-review' ? 'Picture decision saved.' : command.type === 'moderation-resolve' ? 'Report decision saved. Picture approval is unchanged.' : 'Loaded. Select the item you want to review.';return true;
    } catch (cause) { if (!disposed && attempt === generation) { failed = command;find('error').textContent = cause instanceof Error ? cause.message : 'The action failed. Retry or refresh.'; }return false; }
    finally { if (!disposed && attempt === generation) { busy = false;controls(); } }
  }
  const id = () => crypto.randomUUID();
  find('images').addEventListener('click', () => tab('images'));find('reports-tab').addEventListener('click', () => tab('reports'));
  find('owners').addEventListener('click', () => { void run({ type: 'moderation-owners', requestId: id(), cursor: '' }); });find('owners-next').addEventListener('click', () => { void run({ type: 'moderation-owners', requestId: id(), cursor: ownerCursor }); });
  find('reporters').addEventListener('click', () => { void run({ type: 'moderation-reporters', requestId: id(), cursor: '' }); });find('reporters-next').addEventListener('click', () => { void run({ type: 'moderation-reporters', requestId: id(), cursor: reporterCursor }); });
  find('load-owner').addEventListener('click', () => { clearPreview();void run({ type: 'moderation-owner', requestId: id(), ownerId: owner.value }); });
  find('load-reports').addEventListener('click', () => { clearPreview();void run({ type: 'moderation-reports', requestId: id(), reporterId: reporter.value }); });
  find('preview').addEventListener('click', () => { void run({ type: 'moderation-preview', requestId: id(), ownerId, uploadId: upload.value }); });
  for (const status of ['approved', 'rejected'] as const) find(status === 'approved' ? 'approve' : 'reject').addEventListener('click', () => { if (status === 'approved' && previewKey !== imageKey()) return;void run({ type: 'moderation-review', requestId: id(), ownerId, uploadId: upload.value, expectedRevision: ownerRevision, status, reason: reason.value }); });
  for (const status of ['reviewed', 'dismissed'] as const) find(status).addEventListener('click', () => { void run({ type: 'moderation-resolve', requestId: id(), reporterId, reportId: report.value, expectedRevision: reportRevision, status, resolution: resolution.value }); });
  find('report-image').addEventListener('click', () => { const selected = reports.find(item => item.id === report.value);if (!selected) return;tab('images');void run({ type: 'moderation-owner', requestId: id(), ownerId: selected.ownerId }).then(success => { if (success && !disposed) { upload.value = selected.uploadId;detail(); } }); });
  for (const select of [owner, upload, reporter, report]) select.addEventListener('change', () => { clearPreview();if (select === owner) { ownerId = '';uploads = [];choices(upload, []); }if (select === reporter) { reporterId = '';reports = [];choices(report, []); }failed = undefined;detail(); });
  find('retry').addEventListener('click', () => { if (failed) void run(failed); });controls();
  return { loadOwners: () => run({ type: 'moderation-owners', requestId: id(), cursor: '' }), get focused() { return section.contains(document.activeElement); }, dispose() { disposed = true;generation++;clearPreview();section.remove(); } };
}
