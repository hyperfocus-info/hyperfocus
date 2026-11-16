import { applyLocalAiReceipts } from './ai-history/local-receipts.ts';
import { aiContextLines, aiEvidenceStatus, validAiReceipt, type AiIngestionReceipt, type AiMatchContext } from '@hyperfocus/touch-of-death/telemetry/ingestion';
import { createAiObservationArchive, readAiObservationReport } from './ai-history/archive.ts';
import { summarizeAiHistory } from './ai-history/summary.ts';
import { createAiObservationDatabase, aiDatabaseRetention } from './ai-history/database.ts';
import { createAiInsightsDialog } from './ai-history/insights.ts';

/** Bounded device-local observation history; no automatic uploads or policy changes. */
export function createAiReportExport(options: { host: HTMLElement; read: () => unknown; readContext?: () => AiMatchContext | undefined; contentIdentity: string; storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> }) {
  let storage = options.storage;
  if (!storage) try { storage = localStorage; } catch { /* Export remains available when storage is denied. */ }
  const archive = createAiObservationArchive({ identity: options.contentIdentity, storage, session: crypto.randomUUID() });
  const database = typeof indexedDB === 'undefined' ? undefined : createAiObservationDatabase({ factory: indexedDB });
  void database?.save(archive.read());
  const button = document.createElement('button');button.type = 'button';button.dataset.aiReportOpen = '';
  // This action is reachable only through the pause menu's proxy. Do not use
  // `hidden`: the dock interprets that as an unavailable action and hides its proxy.
  button.style.display = 'none';button.tabIndex = -1;button.setAttribute('aria-hidden', 'true');
  button.textContent = 'Export AI observations';button.title = 'Download observed AI inputs and outcomes for review. Does not change AI behavior.';
  const clear = document.createElement('button');clear.type = 'button';clear.dataset.aiHistoryClear = '';clear.textContent = 'Clear saved AI history';
  clear.style.display = 'none';clear.tabIndex = -1;clear.setAttribute('aria-hidden', 'true');
  options.host.append(button, clear);
  let signature = '', confirmClear = false;
  let cleared = false, lastMatch: number | undefined;
  let context: AiMatchContext | undefined;
  const excludedSegments = new Set<string>();
  function refresh() { button.title = database?.status ?? archive.status;clear.title = button.title;button.textContent = archive.failed || database?.failed ? 'Export AI observations · local save unavailable' : 'Export AI observations'; }
  function save(value: unknown) { const report = readAiObservationReport(value);context = options.readContext?.() ?? report?.context;archive.save(report && excludedSegments.size ? { ...report, segments: report.segments.filter(segment => !excludedSegments.has(JSON.stringify(segment))) } : report, context);void database?.save(archive.read()).then(refresh);refresh(); }
  clear.onclick = () => {
    if (!confirmClear) { confirmClear = true;clear.textContent = 'Confirm clear saved AI history';return; }
    archive.clear();cleared = true;confirmClear = false;clear.textContent = archive.failed ? 'History deletion failed · see browser storage settings' : 'Saved AI history cleared';refresh();
    void database?.clear().then(() => { if (database.failed) clear.textContent = 'Database deletion failed · see browser storage settings';refresh(); });
  };
  button.onclick = () => {
    const report = options.read();
    save(report);
    if (database) { void database.query().then(history => download(report, history)).catch(() => download(report, archive.read()));return; }
    download(report, archive.read());
  };
  async function download(report: unknown, history: ReturnType<typeof archive.read>) {
    if (!report && !history.length) { button.textContent = 'No AI observations yet';return; }
    const evidence = await Promise.all(history.map(aiEvidenceStatus));
    const blob = new Blob([JSON.stringify({ contentIdentity: options.contentIdentity, report, history: evidence, receipts: evidence.flatMap(entry => entry.receipt ? [entry.receipt] : []), summary: summarizeAiHistory(history), storageStatus: database?.status ?? archive.status, retention: aiDatabaseRetention,
      analysisGuide: 'Compare only identical content identities. Counts describe observed events, not win rates or proof that an input caused success. Live summaries exclude restored/rehearsal segments. Review raw choices and outcomes before proposing changes. Importing and exporting observations does not change AI policy.' }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');link.href = url;link.download = 'touch-of-death-ai-observations.json';
    document.body.append(link);link.click();link.remove();setTimeout(() => URL.revokeObjectURL(url), 1000);
    refresh();
  }
  async function ingest(receipts: readonly AiIngestionReceipt[]) {
    const valid = receipts.slice(0, 64).filter(validAiReceipt);
    const accepted = database ? await database.ingest(valid) : await archive.ingest(valid);
    if (database) await archive.ingest(valid);refresh();return accepted;
  }
  if (typeof location !== 'undefined') void applyLocalAiReceipts({ href: location.href, fetch: globalThis.fetch.bind(globalThis), ingest });
  const receiptListener = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (!Array.isArray(detail) || detail.length > 64) return;
    void ingest(detail).then(accepted => options.host.dispatchEvent(new CustomEvent('touch-of-death:ai-ingestion-result', { detail: { accepted }, bubbles: true })));
  };
  options.host.addEventListener('touch-of-death:ai-ingestion', receiptListener);
  const insights = createAiInsightsDialog({ host: options.host, read: options.read, exportReport: () => button.click(), ingest, readStatus: async () => {
    save(options.read());
    const history = database ? await database.query().catch(() => archive.read()) : archive.read();
    const evidence = await Promise.all(history.map(aiEvidenceStatus));
    return [...aiContextLines(context), `${evidence.filter(entry => entry.ingestionStatus === 'ingested').length} ingested; ${evidence.filter(entry => entry.ingestionStatus === 'pending').length} pending sessions across retained builds.`,
      ...evidence.map(entry => `${entry.session}: ${entry.ingestionStatus}${entry.receipt ? `; analysis ${entry.receipt.analysisId}` : ''}.`), 'Exporting does not mark observations as ingested. New evidence requires another review.'];
  } });
  refresh();
  return {
    ingest,
    observe(input: { phase?: string; round?: number; match?: number; excluded?: boolean }) {
      if (input.excluded) return;
      const next = `${input.phase}:${input.round}:${input.match}`;
      if (next !== signature) {
        signature = next;const report = options.read();
        if (input.phase === 'intro' && (cleared || lastMatch !== undefined && lastMatch !== input.match)) {
          excludedSegments.clear();for (const segment of readAiObservationReport(report)?.segments ?? []) excludedSegments.add(JSON.stringify(segment));
          archive.resume(crypto.randomUUID());database?.resume();cleared = false;clear.textContent = 'Clear saved AI history';
        }
        lastMatch = input.match;save(report);
      }
    },
    dispose() { save(options.read());void database?.close();insights.dispose();options.host.removeEventListener('touch-of-death:ai-ingestion', receiptListener);button.remove();clear.remove(); },
  };
}
