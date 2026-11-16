import { validAiReceipt } from '../src/telemetry/ingestion.ts';

/** Optional reviewed evidence manifest, never available through a public-bound host. */
export async function createLocalAiReceiptHandler(options: { path?: string; port: number; publicBinding?: boolean }) {
  let receipts: unknown[] = [];
  if (options.path && !options.publicBinding) {
    const file = Bun.file(options.path);
    if (file.size > 65536) throw Error('Local AI receipt manifest exceeds 64 KiB.');
    const value: unknown = await file.json();
    const rows = Array.isArray(value) ? value : value && typeof value === 'object' && 'receipts' in value ? value.receipts : undefined;
    if (!Array.isArray(rows) || rows.length > 64 || !rows.every(validAiReceipt)) throw Error('Local AI receipt manifest is invalid.');
    receipts = rows;
  }
  const origin = `http://127.0.0.1:${options.port}`, host = new URL(origin).host;
  return (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname !== '/tod-ai-ingestion-receipts') return;
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (!options.path || options.publicBinding) return new Response('Not found', { status: 404, headers });
    if (url.origin !== origin || request.headers.has('host') && request.headers.get('host') !== host
      || request.headers.has('origin') && request.headers.get('origin') !== origin
      || request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin') return new Response('Forbidden', { status: 403, headers });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });
    if (url.search) return new Response('Not found', { status: 404, headers });
    return Response.json({ receipts }, { headers });
  };
}
