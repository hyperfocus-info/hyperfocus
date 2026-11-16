import { validAiReceipt, type AiIngestionReceipt } from '@hyperfocus/touch-of-death/telemetry/ingestion';
import { readAiObservationReport } from './archive.ts';

/** Literal observation counts, not inferred causal success or win rates. */
export function aiInsightLines(value: unknown) {
  const report = readAiObservationReport(value);
  if (!report) return ['No AI observations yet. Play a match or watch Theater.'];
  const segments = [...report.segments, report].filter(segment => segment.source === 'live');
  const worked = segments.flatMap(segment => segment.insights?.worked ?? []);
  const struggled = segments.flatMap(segment => segment.insights?.struggled ?? []);
  const droughts = segments.flatMap(segment => segment.insights?.attackDroughts ?? []);
  return [
    'Connected attacks',
    ...worked.map(row => `${row.moveId}: ${row.hits} contacts, ${row.damage} damage`),
    ...(worked.length ? [] : ['No damaging contacts recorded.']),
    'Misses and defended attacks',
    ...struggled.map(row => `${row.moveId}: ${row.whiffs} misses, ${row.blocked} blocks, ${row.parried} parries`),
    ...(struggled.length ? [] : ['No resolved misses or defended attacks recorded.']),
    'Three seconds without a new attack',
    ...droughts.map(row => `${row.fighter}: ${(row.frames / 60).toFixed(1)}s${row.open ? ' (ongoing)' : ''}; ${Object.entries(row.reasons).sort((a, b) => b[1] - a[1]).map(([reason, frames]) => `${reason.replaceAll('-', ' ')} ${(frames / 60).toFixed(1)}s`).join(', ')}`),
    ...(droughts.length ? [] : ['No three-second attack gaps recorded.']),
    'These are observed states and contacts, not proof of why a tactic succeeded. Export includes bounded raw records and previous rounds.',
  ];
}

export function createAiInsightsDialog(options: { host: HTMLElement; read: () => unknown; exportReport: () => void; readStatus?: () => Promise<string[]>; ingest?: (receipts: readonly AiIngestionReceipt[]) => Promise<number> }) {
  const open = document.createElement('button');open.type = 'button';open.textContent = 'AI insights';open.dataset.aiInsightsOpen = '';
  open.style.display = 'none';open.tabIndex = -1;open.setAttribute('aria-hidden', 'true');
  const dialog = document.createElement('dialog'), title = document.createElement('h2'), body = document.createElement('div');
  title.textContent = 'AI insights';dialog.setAttribute('aria-label', 'AI insights');
  dialog.style.cssText = 'box-sizing:border-box;width:min(720px,calc(100vw - 32px));max-width:none;max-height:90vh;overflow:auto;overflow-wrap:anywhere;background:#141a19;color:#eeeade;border:1px solid #6b7065;padding:clamp(16px,3vw,24px);font:14px/1.5 Arial,Helvetica,sans-serif';
  body.style.cssText = 'height:clamp(70px,calc(90vh - 310px),320px);overflow:auto;padding-right:8px';
  const download = document.createElement('button'), close = document.createElement('button');
  download.type = close.type = 'button';download.textContent = 'Export observations';close.textContent = 'Back';close.dataset.menuBack = '';
  download.onclick = options.exportReport;close.onclick = () => dialog.close();
  const previous = document.createElement('button'), next = document.createElement('button');previous.type = next.type = 'button';previous.textContent = 'Previous page';next.textContent = 'Next page';
  let page = 0, pages: string[][] = [], lines: string[] = [];
  function paragraph(line: string) { const p = document.createElement('p');p.textContent = line;return p; }
  function render() {
    title.textContent = `AI insights · ${page + 1} / ${pages.length}`;body.replaceChildren(...(pages[page] ?? []).map(paragraph));body.scrollTop = 0;
    previous.setAttribute('aria-disabled', String(page === 0));next.setAttribute('aria-disabled', String(page >= pages.length - 1));
  }
  function paginate() {
    pages = [];let chunk: string[] = [];body.replaceChildren();
    for (const line of lines) {
      const p = paragraph(line);body.append(p);
      if (chunk.length && (chunk.length === 6 || body.scrollHeight > body.clientHeight + 1)) { pages.push(chunk);chunk = [];body.replaceChildren(p); }
      chunk.push(line);
    }
    if (chunk.length) pages.push(chunk);page = Math.min(page, Math.max(0, pages.length - 1));render();
  }
  previous.onclick = () => { if (page > 0) { page--;render(); } };next.onclick = () => { if (page < pages.length - 1) { page++;render(); } };
  const footer = document.createElement('nav');footer.className = 'hf3d-menu-dock';footer.setAttribute('aria-label', 'AI insight actions');footer.style.marginTop = '16px';footer.append(previous, next, download, close);
  if (options.ingest) {
    const importReceipt = document.createElement('button'), file = document.createElement('input');
    importReceipt.type = 'button';importReceipt.textContent = 'Import review receipt';file.type = 'file';file.accept = '.json,application/json';file.hidden = true;
    importReceipt.onclick = () => file.click();
    file.onchange = async () => {
      try {
        const selected = file.files?.[0];if (!selected) return;
        if (selected.size > 65536) throw Error('Receipt file is too large.');
        const parsed: unknown = JSON.parse(await selected.text());
        const receipts = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && 'receipts' in parsed ? parsed.receipts : undefined;
        if (!Array.isArray(receipts) || receipts.length > 64 || !receipts.every(validAiReceipt)) throw Error('Invalid review receipt.');
        const accepted = await options.ingest!(receipts);importReceipt.textContent = `${accepted} exact reports marked ingested`;
        lines = [...(await options.readStatus?.() ?? []), ...aiInsightLines(options.read())].flatMap(line => line.match(/.{1,110}(?:\s|$)|\S{1,110}/g)?.map(part => part.trim()) ?? [line]);page = 0;paginate();
      } catch { importReceipt.textContent = 'Receipt could not be imported ? try again'; }
      finally { file.value = ''; }
    };
    footer.insertBefore(importReceipt, close);dialog.append(file);
  }
  dialog.append(title, body, footer);options.host.append(open, dialog);
  let generation = 0;
  open.onclick = () => { const current = ++generation;lines = aiInsightLines(options.read()).flatMap(line => line.match(/.{1,110}(?:\s|$)|\S{1,110}/g)?.map(part => part.trim()) ?? [line]);page = 0;dialog.showModal();paginate();next.focus();
    void options.readStatus?.().then(status => { if (current !== generation || !dialog.open) return;lines = [...status.flatMap(line => line.match(/.{1,110}(?:\s|$)|\S{1,110}/g)?.map(part => part.trim()) ?? [line]), ...lines];paginate(); }).catch(() => {});
  };
  const resize = () => { if (dialog.open) paginate(); };window.addEventListener('resize', resize);
  return { dispose() { window.removeEventListener('resize', resize);open.remove();dialog.remove(); } };
}
